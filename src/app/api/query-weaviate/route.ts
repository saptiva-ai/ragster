import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { weaviateClient } from "@/lib/services/weaviate-client";
import { getSaptivaEmbedder } from "@/lib/services/embedders/saptiva-embedder";
import { ModelFactory } from "@/lib/services/modelFactory";

import {
  RetrievalPipeline,
  RetrievalHit,
  DEFAULT_RETRIEVAL_CONFIG,
  expandContext,
} from "@/lib/services/retrieval-pipeline";

import { rateLimiter } from "@/lib/services/rate-limiter";

import {
  classifyAndGetConfig,
  QuestionType,
  detectListStructure,
  detectCountMismatch,
} from "@/lib/services/evidence-checker";

import {
  filterChunksWithLLM,
  toRetrievalHits,
} from "@/lib/services/chunk-filter";

import { RAGLogger } from "@/lib/services/rag-logger";
import { configService } from "@/lib/services/config";
import {
  normForDetect,
  normalizeStrict,
  normalizeLooseDecimalSafe,
} from "@/lib/utils/normalize";
import { debug } from "@/lib/utils/debug";

// ================================
// CONSTANTS (single source of truth for magic numbers)
// ================================

const RAG_CONST = {
  // Hybrid search tuning
  BM25_ALPHA_CAP: 0.35,

  // Citation constraints (shorter = cleaner UX)
  CITATION_MIN_WORDS: 4,
  CITATION_MAX_WORDS: 15,
  CITATION_SPAN_MIN: 6,
  CITATION_SPAN_MAX: 12,

  // Generation
  DEFAULT_TEMPERATURE: 0.1,
  MAX_GENERATION_TOKENS: 1500,

  // Retrieval
  DEFAULT_TARGET_CHUNKS: 12,
  TOTAL_QUERY_TARGET_CHUNKS: 20,
} as const;

// ================================
// CHUNK METADATA (consolidated accessor)
// ================================

type ChunkMeta = {
  sourceName: string;
  chunkIndex: number | null;
  page: number | null;
  textLength: number;
  /** true if we have enough metadata for ordered expansion */
  hasIndexMeta: boolean;
};

/** Small path getter: supports "a.b.c" */
function getPath(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function firstDefined(obj: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const v = getPath(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function toInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown, fallback: string = ""): string {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

/** Consolidated metadata accessor - handles root, properties, and _additional levels */
function readChunkMeta(hit: RetrievalHit | Record<string, unknown>): ChunkMeta {
  const root = hit ?? {};
  const props = (hit as Record<string, unknown>)?.properties ?? {};

  const bag = { ...root, properties: props };

  const sourceName = toStr(
    firstDefined(bag, [
      "sourceName",
      "source",
      "properties.sourceName",
      "properties.source",
      "properties.fileName",
    ]),
    "UNKNOWN"
  );

  const chunkIndex = toInt(
    firstDefined(bag, [
      "chunkIndex",
      "chunk_index",
      "properties.chunkIndex",
      "properties.chunk_index",
    ])
  );

  const page = toInt(
    firstDefined(bag, [
      "page",
      "pageNumber",
      "properties.page",
      "properties.pageNumber",
    ])
  );

  const text = toStr(firstDefined(bag, ["text", "properties.text"]));

  return {
    sourceName,
    chunkIndex,
    page,
    textLength: text.length,
    hasIndexMeta: sourceName !== "UNKNOWN" && chunkIndex !== null,
  };
}

/** Stable key for deduplication */
function stableChunkKey(meta: ChunkMeta): string {
  return `${meta.sourceName}::${meta.chunkIndex ?? "NA"}::${meta.page ?? ""}::${meta.textLength}`;
}

/**
 * Add local neighbors from ALREADY fetched candidates (no extra Weaviate calls).
 * window=2 means +/-2 chunks.
 */
function addLocalNeighbors(selected: RetrievalHit[], candidates: RetrievalHit[], window = 2): RetrievalHit[] {
  const out: RetrievalHit[] = [];
  const seen = new Set<string>();

  // Index candidates by (sourceName -> chunkIndex -> result)
  const byDoc = new Map<string, Map<number, RetrievalHit>>();
  for (const c of candidates) {
    const meta = readChunkMeta(c);
    if (meta.chunkIndex === null) continue;
    if (!byDoc.has(meta.sourceName)) byDoc.set(meta.sourceName, new Map());
    byDoc.get(meta.sourceName)!.set(meta.chunkIndex, c);
  }

  const push = (r: RetrievalHit) => {
    const k = stableChunkKey(readChunkMeta(r));
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  };

  // Always include selected
  for (const r of selected) push(r);

  // Add neighbors around each selected
  for (const r of selected) {
    const meta = readChunkMeta(r);
    if (meta.chunkIndex === null) continue;
    const m = byDoc.get(meta.sourceName);
    if (!m) continue;

    for (let d = -window; d <= window; d++) {
      if (d === 0) continue;
      const neighbor = m.get(meta.chunkIndex + d);
      if (neighbor) push(neighbor);
    }
  }

  // Keep in doc/chunk order
  out.sort((a, b) => {
    const ma = readChunkMeta(a), mb = readChunkMeta(b);
    if (ma.sourceName !== mb.sourceName) return ma.sourceName.localeCompare(mb.sourceName);
    return (ma.chunkIndex ?? 0) - (mb.chunkIndex ?? 0);
  });

  return out;
}

/**
 * ORDERED EXPANSION: Fetch next chunks by chunkIndex (or nextChunkIndex) from Weaviate.
 * Used for list completion - lists continue in adjacent chunks.
 *
 * @param current - Current context chunks
 * @param budgetChars - Max chars to add
 * @param maxSteps - Max chunks to fetch per source
 * @returns Expanded chunks (current + new)
 */
async function orderedExpandByChunkIndex(
  current: RetrievalHit[],
  budgetChars: number,
  maxSteps: number = 4
): Promise<RetrievalHit[]> {
  // Group by sourceName, find max chunkIndex per source
  const maxIndexBySource = new Map<string, { maxIdx: number; totalChunks: number }>();

  for (const r of current) {
    const meta = readChunkMeta(r);
    const total = Number(r.properties?.totalChunks ?? 0);
    if (meta.chunkIndex === null) continue;

    const existing = maxIndexBySource.get(meta.sourceName);
    if (!existing || meta.chunkIndex > existing.maxIdx) {
      maxIndexBySource.set(meta.sourceName, { maxIdx: meta.chunkIndex, totalChunks: total });
    }
  }

  // Calculate what indices to fetch
  const toFetch: Array<{ sourceName: string; chunkIndex: number }> = [];

  for (const [src, info] of maxIndexBySource) {
    for (let step = 1; step <= maxSteps; step++) {
      const nextIdx = info.maxIdx + step;
      // Don't fetch beyond totalChunks if we know it
      if (info.totalChunks > 0 && nextIdx >= info.totalChunks) break;
      toFetch.push({ sourceName: src, chunkIndex: nextIdx });
    }
  }

  if (toFetch.length === 0) {
    return current;
  }

  debug.ordered.log(`Fetching ${toFetch.length} next chunks by index...`);

  // Fetch from Weaviate
  try {
    const fetched = await weaviateClient.getChunksBySourceAndIndex(toFetch);

    if (!fetched || fetched.length === 0) {
      debug.ordered.log("No chunks returned from Weaviate");
      return current;
    }

    // Apply budget limit
    let usedChars = current.reduce((sum, r) => sum + String(r.properties?.text ?? '').length, 0);
    const added: RetrievalHit[] = [];
    const seen = new Set(current.map(r => stableChunkKey(readChunkMeta(r))));

    for (const chunk of fetched) {
      const key = stableChunkKey(readChunkMeta(chunk as RetrievalHit));
      if (seen.has(key)) continue;

      const text = String(chunk.properties?.text ?? '');
      if (usedChars + text.length > budgetChars) break;

      usedChars += text.length;
      added.push({
        ...chunk,
        _isWindowExpansion: true,
      } as RetrievalHit);
      seen.add(key);
    }

    debug.ordered.log(`Added ${added.length} chunks (${usedChars}/${budgetChars} chars)`);

    // Sort by source/index
    const all = [...current, ...added];
    all.sort((a, b) => {
      const ma = readChunkMeta(a), mb = readChunkMeta(b);
      if (ma.sourceName !== mb.sourceName) return ma.sourceName.localeCompare(mb.sourceName);
      return (ma.chunkIndex ?? 0) - (mb.chunkIndex ?? 0);
    });

    return all;
  } catch (error) {
    debug.ordered.warn("Failed:", error);
    return current;
  }
}

/**
 * Removes question words that add noise to BM25 keyword search.
 * Only affects retrieval - LLM still sees the original query.
 * "What is the refund policy?" → "refund policy"
 */
function cleanQueryForSearch(query: string): string {
  const EN_STARTERS = /^(what|who|how|which|where|why|when|is|are|does|do|did|can|could|would|should|will|tell me|please|help|explain|describe|show me|give me|find|get|i need|i want)\s+/gi;
  const ES_STARTERS = /^(qué|quién|cómo|cuál|cuáles|dónde|por qué|cuánto|cuántos|cuánta|cuántas|cuándo|es|son|hay|tiene|tienen|puedo|puede|podría|dime|ayuda|explica|muestra|busca|necesito|quiero)\s+/gi;
  const FILLERS = /\b(the|a|an|el|la|los|las|un|una|unos|unas)\b/gi;

  const cleaned = query
    .replace(EN_STARTERS, '')
    .replace(ES_STARTERS, '')
    .replace(/^[¿?¡!]+/, '')
    .replace(FILLERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Fallback if too aggressive
  return cleaned.length < 3 ? query : cleaned;
}

// ================================
// QUERY CLASSIFICATION (alpha for hybrid search)
// ================================

function getAlphaForQuery(query: string): { alpha: number; type: QuestionType } {
  const { type, config } = classifyAndGetConfig(query);
  let alpha = config.alpha;

  const isShort = query.split(/\s+/).length <= 3;

  // Short queries need MORE BM25 (lower alpha) - they're under-specified
  if (isShort) {
    alpha = Math.min(alpha, RAG_CONST.BM25_ALPHA_CAP);
  }

  // Override for exact match patterns (codes, digits, quotes)
  const hasDigits = /\d/.test(query);
  const hasQuotes = /["']/.test(query);
  const hasCode = /[A-Z]{2,}-?\d+/.test(query);

  if (hasCode || hasDigits || hasQuotes) {
    alpha = Math.min(alpha, RAG_CONST.BM25_ALPHA_CAP);
  }

  return { alpha, type };
}

// Context limits for buildContext - now centralized in config.ts
function getContextLimits() {
  const cfg = configService.getContextConfig();
  return {
    MAX_CONTEXT_CHARS: cfg.maxContextChars,
    MAX_CHUNKS_TOTAL: cfg.maxChunksTotal,
    MAX_CHUNKS_PER_SOURCE: cfg.maxChunksPerSource,
    MAX_CHARS_PER_CHUNK: cfg.maxCharsPerChunk,
  };
}

// Estimate tokens (Spanish: ~1 token per 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ================================
// HYBRID SEARCH (Weaviate)
// ================================

/**
 * @param embedQuery - Full semantic query for vector embedding (preserves meaning)
 * @param bm25Query - Cleaned query for BM25 keyword search (removes noise words)
 */
async function searchWithPipeline(embedQuery: string, bm25Query: string): Promise<{
  results: RetrievalHit[];
  embedding: number[];
  stats: { initialCount: number; afterThreshold: number; afterRerank: number; afterExpansion: number; sourcesFound: number };
}> {
  const embedder = getSaptivaEmbedder();
  // Embed with full 1024d (searchHybridBoth truncates for regular collection)
  const embeddingResult = await rateLimiter.execute(() => embedder.embedFull(embedQuery));

  // Use semantic query for alpha/type classification (now combined)
  const { alpha, type: questionType } = getAlphaForQuery(embedQuery);

  // Fetch more chunks for "total" queries (summaries are often at end)
  const isTotalQuery = /total|subtotal|suma|cantidad|cuantos|cuántos|count|amount/i.test(embedQuery);
  const targetChunks = isTotalQuery ? RAG_CONST.TOTAL_QUERY_TARGET_CHUNKS : RAG_CONST.DEFAULT_TARGET_CHUNKS;

  // Disable autocut for NUMERIC/LIST (it drops low-scoring but necessary totals)
  const useAutocut = questionType === QuestionType.REGLA_GENERAL;

  const pipeline = new RetrievalPipeline({
    ...DEFAULT_RETRIEVAL_CONFIG,
    alpha,
    targetChunks,
    overFetchMultiplier: alpha <= 0.55 ? 4 : 3,
  });

  debug.pipeline.log(`alpha=${alpha} target=${targetChunks} type=${questionType} autocut=${useAutocut}`);

  // Pass BM25 query for keyword search, but use semantic embedding
  const { results, stats } = await pipeline.execute(bm25Query, embeddingResult.embedding);

  return { results, embedding: embeddingResult.embedding, stats };
}

/**
 * Fallback search if pipeline fails
 * @param embedQuery - Full semantic query for vector embedding
 * @param bm25Query - Cleaned query for BM25 keyword search
 */
async function searchInWeaviateFallback(embedQuery: string, bm25Query: string): Promise<RetrievalHit[]> {
  const embedder = getSaptivaEmbedder();
  // Use full 1024d embedding for both collections
  const embeddingResult = await embedder.embedFull(embedQuery);

  const { alpha } = getAlphaForQuery(embedQuery);
  const limit = alpha <= 0.55 ? 40 : 25;
  // Don't request isQAPair/questionText - Documents collection doesn't have these fields
  // QnA collection is handled separately in searchHybridBoth with its own fields
  const fields = 'text sourceName chunkIndex totalChunks contentWithoutOverlap';

  try {
    // Search both collections
    const results = await weaviateClient.searchHybridBoth(bm25Query, embeddingResult.embedding, limit, alpha, fields);
    if (!results || results.length === 0) {
      return await weaviateClient.searchByVector(embeddingResult.embedding, limit, fields);
    }
    return results;
  } catch (error) {
    debug.search.warn("Fallback search failed:", error);
    return await weaviateClient.searchByVector(embeddingResult.embedding, limit, fields);
  }
}

// ================================
// CONTEXT ASSEMBLY
// ================================

function buildContext(results: Array<{ properties: Record<string, unknown>; score?: number; _finalScore?: number }>): {
  context: string;
  usedChunks: number;
  totalChunks: number;
  totalChars: number;
  sources: string[];
  /** Map of sourceKey -> llmText (exactly what LLM saw) for citation validation */
  contextByKey: Map<string, string>;
} {
  const { MAX_CONTEXT_CHARS, MAX_CHUNKS_TOTAL, MAX_CHUNKS_PER_SOURCE, MAX_CHARS_PER_CHUNK } = getContextLimits();

  if (results.length === 0) {
    return { context: "", usedChunks: 0, totalChunks: 0, totalChars: 0, sources: [], contextByKey: new Map() };
  }

  const uniqueSourcesInResults = new Set(results.map(r => String(r.properties?.sourceName || "Documento"))).size;
  const shouldUseDiversity = uniqueSourcesInResults > 1;

  const contextParts: string[] = [];
  const sourceCount: Map<string, number> = new Map();
  const usedSources: Set<string> = new Set();
  const contextByKey: Map<string, string> = new Map();
  let currentChars = 0;
  let usedChunks = 0;
  let prevSource: string | null = null;
  let prevChunkIndex: number | null = null;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const remainingCandidates = results.length - i;

    if (usedChunks >= MAX_CHUNKS_TOTAL) {
      debug.context.log(`Hard stop at ${MAX_CHUNKS_TOTAL} chunks`);
      break;
    }

    const props = result.properties;
    const text = typeof props.text === "string" ? props.text : "";
    const sourceName = typeof props.sourceName === "string" ? props.sourceName : "Documento";
    // Type-safe chunkIndex parsing (handles string or number from Weaviate)
    const chunkIndexNum = Number(props.chunkIndex);
    const chunkIndex = Number.isInteger(chunkIndexNum) ? chunkIndexNum : 0;
    // Use pageNumber if available, otherwise fall back to chunkIndex
    const pageNum = Number(props.pageNumber);
    const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : chunkIndex;
    const contentWithoutOverlap = typeof props.contentWithoutOverlap === "string" ? props.contentWithoutOverlap : null;

    const sourceChunks = sourceCount.get(sourceName) || 0;
    const chunksStillNeeded = MAX_CHUNKS_TOTAL - usedChunks;
    const hasEnoughCandidates = remainingCandidates > chunksStillNeeded * 2;

    if (shouldUseDiversity && sourceChunks >= MAX_CHUNKS_PER_SOURCE && hasEnoughCandidates) {
      continue;
    }

    // Get full text (use contentWithoutOverlap for sequential chunks)
    let fullText = text;
    const isSequential = prevSource === sourceName && prevChunkIndex !== null && chunkIndex === prevChunkIndex + 1;

    if (isSequential && contentWithoutOverlap) {
      fullText = contentWithoutOverlap;
    }

    // llmText = exactly what LLM sees (truncated by budget, NO "..." appended)
    // This is what we validate citations against
    const llmText = fullText.length > MAX_CHARS_PER_CHUNK
      ? fullText.slice(0, MAX_CHARS_PER_CHUNK)
      : fullText;

    // Format with SOURCE prefix so model can cite exactly: SOURCE Página N
    const sourceKey = `Página ${page}`;
    const sectionContent = `SOURCE ${sourceKey}\n${llmText}`;
    const separator = usedChunks > 0 ? "\n\n---\n\n" : ""
    const sectionWithSeparator = separator + sectionContent;

    if (currentChars + sectionWithSeparator.length > MAX_CONTEXT_CHARS) {
      break;
    }

    contextParts.push(sectionWithSeparator);
    currentChars += sectionWithSeparator.length;
    usedChunks++;

    sourceCount.set(sourceName, sourceChunks + 1);
    usedSources.add(sourceName);
    // Store llmText for citation validation (exactly what LLM saw)
    const prevText = contextByKey.get(sourceKey);
    contextByKey.set(sourceKey, prevText ? `${prevText}\n${llmText}` : llmText);
    prevSource = sourceName;
    prevChunkIndex = chunkIndex;
  }

  // Context stats are now logged by the structured logger

  return {
    context: contextParts.join("").trim(),
    usedChunks,
    totalChunks: results.length,
    totalChars: currentChars,
    sources: Array.from(usedSources),
    contextByKey,
  };
}

// ================================
// PROMPT BUILDING
// ================================

function buildSystemMessage(systemPrompt: string, contactName?: string): string {
  const ragInstructions = `Eres un narrador fiel del documento. Solo describes lo que el documento establece.

TRES TIPOS DE RESPUESTA:
1. VALOR EXPLÍCITO → El documento dice un valor concreto → Responde con ese valor
2. REGLA/ESTRUCTURA → El documento tiene reglas, condiciones, fórmulas o tablas → Explica la regla exacta
3. AUSENTE → No hay NADA sobre el tema → "Esta información no se encuentra en los documentos"

Una respuesta es AUSENTE solo si NO existe ninguna evidencia relevante en ningún fragmento. Si la evidencia existe de forma distribuida (tablas, reglas, notas), trátala como REGLA/ESTRUCTURA.

CLAVE: Si el documento contiene reglas, condiciones, fórmulas, tablas o múltiples valores relacionados con la pregunta, NO respondas "no se encuentra". Describe exactamente la regla o estructura que aparece.

PROHIBIDO:
- Inventar items que "suenan razonables" pero no están en el texto
- Inferir finalidades de contexto general (ej: "ecosistema", "estadísticas") sin cita exacta
- Convertir reglas o fórmulas en valores únicos
- Elegir un valor "representativo" cuando hay varios
- Omitir condiciones o excepciones

FORMATO OBLIGATORIO:
1) Responde en UN solo párrafo, SIN viñetas, SIN inferencias.
2) Luego escribe exactamente:

Fuente:
- Página <N> — "<frase clave corta (4-15 palabras)>"

REGLAS DE CITAS:
- Citas CORTAS: máximo 15 palabras. Elige la frase más representativa.
- Las citas deben ser COPIADAS VERBATIM del contexto.
- PROHIBIDO usar "...", "…", o cualquier marcador de truncamiento.
- Solo puedes usar páginas que aparezcan en el contexto como: SOURCE Página <N>
- Si NO puedes respaldar NADA con citas, responde EXACTAMENTE: "No especificado en los documentos proporcionados."

MINIMIZACIÓN:
- MÁXIMO 1 bullet en "Fuente:" (la cita más representativa).
- Para listas: una sola cita corta basta (ej: "AMPI ha desarrollado 13 certificaciones federales").

Responde en español, de forma clara y profesional.`;

  let message = `${systemPrompt}\n\n${ragInstructions}`;

  if (contactName && contactName !== "Chat Interno") {
    message += `\n\nEstás hablando con ${contactName}.`;
  }

  return message;
}

function buildUserMessage(
  context: string,
  usedChunks: number,
  history: string,
  previousQuestion: string,
  query: string
): string {
  const contextHeader = usedChunks > 0
    ? `=== DOCUMENT EXCERPTS (${usedChunks} sections) ===`
    : `=== NO RELEVANT EXCERPTS FOUND ===`;

  let message = `${contextHeader}\n${context || "No information available."}\n\n`;

  if (history) {
    message += `=== CONVERSATION HISTORY ===\n${history}\nPrevious question: "${previousQuestion}"\n\n`;
  }

  message += `=== QUESTION ===\n${query}`;

  return message;
}

// RESPONSE TYPE CLASSIFICATION
//
// Detect whether answer is FULL, PARTIAL, or ABSENT based on content

type ResponseType = "FULL" | "PARTIAL" | "ABSENT";

function classifyResponse(answer: string): ResponseType {
  const a = normForDetect(answer);

  const absentRe = /\bno especificado en los documentos proporcionados\b/;
  const partialRe = /\b(en los documentos proporcionados )?(no se menciona|no se especifica|no se encuentra|no hay informacion|no se indica)\b/;

  if (absentRe.test(a)) {
    const words = a.split(" ").filter(Boolean).length;
    // Short answer with absent phrase = ABSENT
    // Longer answer with absent phrase = PARTIAL (has some content + missing part)
    if (words <= 15) return "ABSENT";
    return "PARTIAL";
  }

  if (partialRe.test(a)) return "PARTIAL";
  return "FULL";
}

// CITATION VALIDATION
//
// WHY: Model may cite sources that don't exist or hallucinate quotes
// HOW: Parse "Fuente:" section, verify each quote exists in context

interface ParsedCitation {
  sourceKey: string;  // "Página N"
  quote: string;      // "literal quote from document"
}

/**
 * Deterministically enforce "1 bullet per page" by stripping extras.
 * No REPAIR needed - just keep the first bullet per page.
 */
function enforceOneBulletPerPage(answer: string): string {
  const matches = Array.from(answer.matchAll(/(?:^|\n)Fuente:\s*/gi));
  if (matches.length === 0) return answer;

  const last = matches[matches.length - 1];
  const idx = last.index!;
  const head = answer.slice(0, idx);
  const tail = answer.slice(idx);

  const lines = tail.split('\n');
  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const l = line.trim();
    const m = l.match(/^-+\s*P[aá]gina\s+(\d+)\s*[—–-]\s*"([^"]+)"\s*$/i);
    if (!m) {
      out.push(line);
      continue;
    }

    const pageKey = `Página ${m[1].trim()}`;
    if (seen.has(pageKey)) continue; // Skip duplicate
    seen.add(pageKey);
    out.push(line);
  }

  return head + out.join('\n');
}

/**
 * Parse citations from model answer.
 * Format: - Página N — "quote"
 * Note: enforceOneBulletPerPage() is called BEFORE this, so no duplicate detection needed.
 */
function parseFuentes(answer: string): ParsedCitation[] {
  // Find the LAST "Fuente:" that starts a line (handles accidental duplicates)
  const matches = Array.from(answer.matchAll(/(?:^|\n)Fuente:\s*/gi));
  if (matches.length === 0) return [];

  const last = matches[matches.length - 1];
  const idx = last.index!;
  const fuenteSection = answer.slice(idx + last[0].length);
  const citations: ParsedCitation[] = [];

  // One citation per line
  const lines = fuenteSection.split(/\r?\n/);

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    // Format: - Página N — "quote"
    const m = l.match(/^-+\s*P[aá]gina\s+(\d+)\s*[—–-]\s*"([^"]+)"\s*$/i);
    if (!m) continue;

    const page = m[1].trim();
    const quote = m[2].trim();
    citations.push({ sourceKey: `Página ${page}`, quote });
  }

  return citations;
}

/**
 * Count words in text (for 6-25 word validation)
 */
function wordCount(s: string): number {
  const t = normalizeStrict(s);
  return t ? t.split(" ").filter(Boolean).length : 0;
}

/**
 * Auto-fixes quotes that are too short or too long
 * by adjusting the window around the matched text in the source chunk.
 */
function autoFixQuoteLength(
  originalQuote: string,
  fullChunkText: string
): string | null {
  const MIN_WORDS = RAG_CONST.CITATION_MIN_WORDS;
  const MAX_WORDS = RAG_CONST.CITATION_MAX_WORDS;

  // Normalize both for matching
  const normalizedQuote = normalizeStrict(originalQuote).toLowerCase();
  const normalizedChunk = normalizeStrict(fullChunkText).toLowerCase();

  // 1. Find the position of the quote in the text
  const matchIndex = normalizedChunk.indexOf(normalizedQuote);

  if (matchIndex === -1) return null; // Can't fix what we can't find

  // 2. Split the full text into words to manipulate the window
  // Using the original text preserves casing/punctuation for the final output
  const allWords = fullChunkText.split(/\s+/).filter(Boolean);

  // Map the character index back to a word index (approximate)
  let currentLength = 0;
  let startWordIndex = 0;

  for (let i = 0; i < allWords.length; i++) {
    // +1 for the space we split on
    if (currentLength + allWords[i].length + 1 > matchIndex) {
      startWordIndex = i;
      break;
    }
    currentLength += allWords[i].length + 1;
  }

  const quoteWordCount = originalQuote.split(/\s+/).filter(Boolean).length;

  // 3. Apply the Fix
  if (quoteWordCount < MIN_WORDS) {
    // FIX: Expand by adding words AFTER the quote until we hit MIN_WORDS
    const fixedSlice = allWords.slice(startWordIndex, startWordIndex + MIN_WORDS);
    if (fixedSlice.length >= MIN_WORDS) {
      return fixedSlice.join(" ");
    }
    // If not enough words after, try expanding backwards
    const startBack = Math.max(0, startWordIndex - (MIN_WORDS - fixedSlice.length));
    const expandedSlice = allWords.slice(startBack, startBack + MIN_WORDS);
    return expandedSlice.length >= MIN_WORDS ? expandedSlice.join(" ") : null;
  }
  else if (quoteWordCount > MAX_WORDS) {
    // FIX: Trim by taking only the first MAX_WORDS
    const fixedSlice = allWords.slice(startWordIndex, startWordIndex + MAX_WORDS);
    return fixedSlice.join(" ");
  }

  return originalQuote; // No fix needed
}

/**
 * Extract the best matching span from chunk text using LLM's hint.
 * Finds the window of 12-20 words that has the most overlap with the hint.
 * This is the fallback that eliminates the repair loop.
 */
function extractBestSpan(hint: string, chunkText: string, minW = RAG_CONST.CITATION_SPAN_MIN, maxW = RAG_CONST.CITATION_SPAN_MAX): string | null {
  const words = (chunkText ?? "").split(/\s+/).filter(Boolean);
  if (words.length < minW) return null;

  const hintNorm = normalizeLooseDecimalSafe(hint).split(/\s+/).filter(Boolean);
  if (hintNorm.length === 0) return null;
  const hintSet = new Set(hintNorm);

  // Normalize each chunk word once (keeps decimals safe)
  const normWords = words.map(w => normalizeLooseDecimalSafe(w));

  let bestScore = -1;
  let bestI = 0;
  let bestL = minW;

  // score = how many words in window appear in hint
  for (let i = 0; i <= words.length - minW; i++) {
    for (let L = minW; L <= maxW && i + L <= words.length; L++) {
      let score = 0;
      for (let j = 0; j < L; j++) {
        if (hintSet.has(normWords[i + j])) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
        bestL = L;
      }
    }
  }

  // If literally no overlap, still return a reasonable span near the top
  const span = words.slice(bestI, bestI + bestL).join(" ").trim();
  return span || null;
}

/**
 * Check if quote exists in chunk text.
 * Pass A: strict literal-ish match (normalizeStrict)
 * Pass B: loose, decimal-safe punctuation-tolerant match (only if strict fails)
 * Ellipsis tolerant in both passes: "..." or "…" treated as wildcard gap.
 */
function quoteExistsInChunk(quote: string, chunkText: string): boolean {
  const rawQuote = (quote ?? "").trim();
  const rawChunk = (chunkText ?? "").trim();
  if (!rawQuote || !rawChunk) return false;

  // Split on ellipsis patterns using RAW quote (more reliable than normalized)
  const rawParts = rawQuote
    .split(/(?:\.\.\.+|…)+/)
    .map(p => p.trim())
    .filter(Boolean);

  const matchWith = (normalizeFn: (s: string) => string): boolean => {
    const c = normalizeFn(rawChunk).toLowerCase();
    if (!c) return false;

    // Exact match on fully normalized quote
    const qFull = normalizeFn(rawQuote).toLowerCase();
    if (qFull && c.includes(qFull)) return true;

    // Ellipsis-tolerant match: require all parts in order
    if (rawParts.length <= 1) return false;

    let idx = 0;
    for (const rp of rawParts) {
      const p = normalizeFn(rp).toLowerCase();
      if (!p) continue;
      const found = c.indexOf(p, idx);
      if (found < 0) return false;
      idx = found + p.length;
    }
    return true;
  };

  // Pass A: strict
  if (matchWith(normalizeStrict)) return true;

  // Pass B: loose fallback (handles "de .", punctuation drift, etc.)
  return matchWith(normalizeLooseDecimalSafe);
}

/**
 * Validate all citations against context.
 * Flow: strict match → loose match → autoFix → bestSpan → only invalid if sourceKey missing
 * This eliminates the repair loop by always producing a valid quote from the chunk.
 */
function validateCitations(
  citations: ParsedCitation[],
  contextByKey: Map<string, string>
): { valid: boolean; invalid: ParsedCitation[]; details: string[]; fixedCitations: ParsedCitation[] } {
  const invalid: ParsedCitation[] = [];
  const details: string[] = [];
  const fixedCitations: ParsedCitation[] = [];

  for (const citation of citations) {
    // Strip trailing dots/spaces/ellipsis before validation
    const cleanQuote = citation.quote.trim().replace(/[.\u2026\s]+$/g, "");

    const llmText = contextByKey.get(citation.sourceKey);

    // ONLY invalid case: source doesn't exist in context
    if (!llmText) {
      invalid.push(citation);
      details.push(`Source ${citation.sourceKey} not in context`);
      fixedCitations.push(citation);
      continue;
    }

    const w = wordCount(cleanQuote);
    const validLength = w >= RAG_CONST.CITATION_MIN_WORDS && w <= RAG_CONST.CITATION_MAX_WORDS;
    const existsInChunk = validLength && quoteExistsInChunk(cleanQuote, llmText);

    // PASS 1: Quote is valid as-is
    if (existsInChunk) {
      fixedCitations.push(citation);
      continue;
    }

    // PASS 2: Try autoFixQuoteLength (handles short/long quotes)
    if (!validLength) {
      const fixedQuote = autoFixQuoteLength(cleanQuote, llmText);
      if (fixedQuote && fixedQuote !== cleanQuote) {
        const fixedWc = wordCount(fixedQuote);
        if (fixedWc >= RAG_CONST.CITATION_MIN_WORDS && fixedWc <= RAG_CONST.CITATION_MAX_WORDS && quoteExistsInChunk(fixedQuote, llmText)) {
          debug.citation.log(`Auto-fixed length: "${cleanQuote.slice(0, 30)}..." (${w}) -> "${fixedQuote.slice(0, 30)}..." (${fixedWc})`);
          fixedCitations.push({ ...citation, quote: fixedQuote });
          continue;
        }
      }
    }

    // PASS 3: extractBestSpan - find best matching 12-20 word span from chunk
    // This is the fallback that eliminates the repair loop
    const bestSpan = extractBestSpan(cleanQuote, llmText);
    if (bestSpan) {
      const spanWc = wordCount(bestSpan);
      if (spanWc >= RAG_CONST.CITATION_MIN_WORDS && spanWc <= RAG_CONST.CITATION_MAX_WORDS) {
        debug.citation.log(`BestSpan fix: "${cleanQuote.slice(0, 30)}..." -> "${bestSpan.slice(0, 40)}..." (${spanWc} words)`);
        fixedCitations.push({ ...citation, quote: bestSpan });
        continue;
      }
    }

    // PASS 4: Last resort - just take first 12-20 words from chunk as citation
    const fallbackWords = llmText.split(/\s+/).filter(Boolean);
    if (fallbackWords.length >= RAG_CONST.CITATION_SPAN_MIN) {
      const fallbackSpan = fallbackWords.slice(0, 15).join(" ");
      debug.citation.log(`Fallback span: "${cleanQuote.slice(0, 30)}..." -> "${fallbackSpan.slice(0, 40)}..."`);
      fixedCitations.push({ ...citation, quote: fallbackSpan });
      continue;
    }

    // Only reach here if chunk is too short to extract any valid span
    invalid.push(citation);
    details.push(`Chunk too short for citation in ${citation.sourceKey}`);
    fixedCitations.push(citation);

    debug.citation.log(`All fixes failed for ${citation.sourceKey}:`);
    debug.citation.log(`  original: "${cleanQuote}" (${w} words)`);
    debug.citation.log(`  chunk length: ${llmText.length} chars, ${fallbackWords.length} words`);
  }

  return {
    valid: invalid.length === 0,
    invalid,
    details,
    fixedCitations,
  };
}

// ================================
// POST /api/query-weaviate
// ================================
//
// PIPELINE STEPS:
//  1. AUTH      → Verify session
//  2. PARSE     → Extract query, normalize UTF-8
//  3. HISTORY   → Load conversation context from MongoDB
//  4. PREPARE   → Build embedQuery + bm25Query (cleaned for keyword search)
//  5. SEARCH    → Hybrid search in Weaviate (vector + BM25)
//  6. FILTER    → LLM judges chunk relevance (removes noise)
//  7. EXPAND    → Add adjacent chunks for lists/context
//  8. CONTEXT   → Apply limits (chunks, chars, per-source)
//  9. GATE      → Reject if zero evidence
// 10. GENERATE  → LLM produces answer with citations
// 11. VALIDATE  → Verify citations exist in context, repair if needed
// 12. RESPOND   → Return JSON response
//

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const guardrailsTriggered: string[] = [];
  const log = new RAGLogger();

  try {
    // [1] AUTH - Verify session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // [2] PARSE - Extract query, normalize UTF-8
    const body = await req.json();
    const { message_id, query, systemPrompt, modelId, temperature, contacts = [] } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }
    const normalizeUtf8 = (text: string): string => {
      try {
        return decodeURIComponent(escape(text));
      } catch {
        return text
          .replace(/┬┐/g, '¿').replace(/├®/g, 'é').replace(/├í/g, 'á')
          .replace(/├│/g, 'ó').replace(/├║/g, 'ú').replace(/├▒/g, 'ñ')
          .replace(/├ü/g, 'Á').replace(/├ë/g, 'É').replace(/├ì/g, 'Í')
          .replace(/├ô/g, 'Ó').replace(/├Ü/g, 'Ú').replace(/├æ/g, 'Ñ')
          .replace(/┬í/g, '¡').normalize('NFC');
      }
    };

    const cleanQuery = normalizeUtf8(query);
    const contactName = contacts?.[0]?.profile?.name || "Chat Interno";

    log.startTrace(cleanQuery);

    // [3] HISTORY - Load conversation context from MongoDB
    const { db } = await connectToDatabase();
    const messagesCollection = db.collection("messages");

    await messagesCollection.insertOne({
      message_id,
      message_role: "user",
      model: modelId,
      message: cleanQuery,
      temperature,
      max_tokens: 1000,
      timestamp: new Date(),
      contact_name: contactName,
    });

    const messages = await messagesCollection.find({ message_id }).sort({ _id: -1 }).limit(5).toArray();

    let previousQuestion = "";
    let history = "";

    if (messages.length > 1) {
      // Find the last USER message (excluding current) - fixes bug where messages[1] could be assistant
      const previousUserMessage = messages
        .slice(1)  // Skip current message (index 0)
        .find(m => m.message_role === "user");

      previousQuestion = previousUserMessage?.message || "";

      messages.reverse();
      history = messages.map((m) => `- Role: ${m.message_role}\n  - Mensaje: ${m.message}`).join("\n");
    }

    // [4] PREPARE - Build embedQuery + bm25Query
    const queryWordCount = cleanQuery.trim().split(/\s+/).length;
    const isShortQuery = queryWordCount <= configService.getQueryConfig().maxWordsForAmbiguous;
    const baseSearchQuery = isShortQuery && previousQuestion ? previousQuestion : cleanQuery;

    // Count words from baseSearchQuery (might be previousQuestion)
    const baseWordCount = baseSearchQuery.trim().split(/\s+/).length;

    // Skip cleaning for literal Q&A questions (ends with ?, 4+ words)
    // Works for both English and Spanish - lets BM25 match exact questions
    const isLiteralQuestion = /\?\s*$/.test(baseSearchQuery.trim()) && baseWordCount >= 4;
    const bm25Query = isLiteralQuestion ? baseSearchQuery : cleanQueryForSearch(baseSearchQuery);

    // embedQuery = full semantic meaning, bm25Query = cleaned for keyword search
    const embedQuery = baseSearchQuery;

    // [5] SEARCH - Hybrid search in Weaviate
    let results: RetrievalHit[] = [];
    let pipelineStats = { initialCount: 0, afterThreshold: 0, afterRerank: 0, afterExpansion: 0, sourcesFound: 0 };

    if (!(isShortQuery && !previousQuestion)) {
      try {
        const pipelineResult = await searchWithPipeline(embedQuery, bm25Query);
        results = pipelineResult.results;
        pipelineStats = pipelineResult.stats;
        log.retrieve(pipelineStats.afterRerank, pipelineStats.sourcesFound);
        log.debugChunks('RETRIEVE', 'Retrieved chunks', results);
      } catch {
        log.warn('RETRIEVE', { decision: 'fallback search' });
        const fallbackResults = await searchInWeaviateFallback(embedQuery, bm25Query);
        results = fallbackResults;
        pipelineStats.initialCount = fallbackResults.length;
        pipelineStats.afterRerank = fallbackResults.length;
      }
    }

    // [6] FILTER - LLM judges chunk relevance
    const filterResult = await filterChunksWithLLM(cleanQuery, results);
    log.filter(filterResult.stats.inputCount, filterResult.stats.outputCount, filterResult.stats.filterTimeMs > 0);

    // CRITICAL: If LLM filter says "0 relevant", respect that decision
    // This is the semantic judge - if it says no chunks answer the question, abstain
    // DO NOT fallback to top-K (that causes hallucinations)
    if (filterResult.filteredChunks.length === 0 && results.length > 0) {
      guardrailsTriggered.push('llm_filter_abstain');
      log.info('FILTER', { decision: 'zero_relevant - LLM judge says no chunks answer the question' });
      log.refuse('llm_filter_zero_relevant');
      log.endTrace();

      return NextResponse.json({
        success: true,
        query: cleanQuery,
        answer: "La documentación analizada no contempla información que responda directamente a esta pregunta.",
        wasRefused: true,
        refusalReason: "llm_filter_zero_relevant",
        sources: [],
        processingTimeMs: Date.now() - startTime,
        debug: debug.isDev ? {
          pipeline: {
            initialCount: pipelineStats.initialCount,
            afterThreshold: pipelineStats.afterThreshold,
            afterRerank: pipelineStats.afterRerank,
            afterLLMFilter: 0,
            llmFilterTimeMs: filterResult.stats.filterTimeMs,
            llmFilterVerdict: 'NO_ENTAILMENT',
          },
          guardrailsTriggered,
        } : undefined,
      });
    }

    const finalResults = toRetrievalHits(filterResult.filteredChunks);
    const finalEntailmentCount = filterResult.stats.entailmentCount;

    // [7] EXPAND - Add adjacent chunks for lists/context
    const expansionCfg = configService.getExpansionConfig();
    const resultsBeforeExpansion = finalResults.length;
    let expandedCount = 0;
    let contextResults = finalResults;
    const MAX_CHUNK = getContextLimits().MAX_CHARS_PER_CHUNK;

    // Detect list structure from PRE-FILTER candidates (top 10-20 by retrieval score)
    // This catches list signals even if filter collapsed to 1 chunk
    const preFilterTop = [...results]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 15);
    const preFilterText = preFilterTop
      .map(r => String(r.properties?.text ?? ''))
      .join('\n');
    const listInfoPreFilter = detectListStructure(preFilterText);
    const listModePreFilter = listInfoPreFilter.isList;

    // ALSO detect list structure from FINAL evidence (post-filter)
    // This catches cases where reranker kept 1 chunk that shows "13 items" with only 6 visible
    const finalEvidenceText = finalResults
      .map(r => String(r.properties?.text ?? ''))
      .map(t => t.length > MAX_CHUNK ? t.slice(0, MAX_CHUNK) : t)
      .join('\n');
    const listInfoFinal = detectListStructure(finalEvidenceText);
    const looksLikeListEvidence = listInfoFinal.isList &&
      (listInfoFinal.patterns.includes('codes') ||
       listInfoFinal.patterns.includes('bullets') ||
       listInfoFinal.patterns.includes('numbered'));

    // Combined: either pre-filter or final evidence shows list structure
    const listMode = listModePreFilter || looksLikeListEvidence;

    // Add local neighbors for list-like content (from already-fetched candidates, 0 calls)
    if (listMode) {
      contextResults = addLocalNeighbors(finalResults, results, 3); // window=3 for better coverage
      debug.list.log(`Content has list structure (preFilter=${listModePreFilter}, finalEvidence=${looksLikeListEvidence}) - added local neighbors`);
    }

    // Check for count mismatch after local neighbor-fill
    const contextText = contextResults
      .map(r => String(r.properties?.text ?? ''))
      .map(t => t.length > MAX_CHUNK ? t.slice(0, MAX_CHUNK) : t)
      .join('\n');
    const mismatch = detectCountMismatch(contextText);

    // Check if any chunk was truncated (might have cut off the "13" count)
    const anyTruncated = contextResults.some(r =>
      String(r.properties?.text ?? '').length > MAX_CHUNK
    );

    // ========== LANE 1: List case - ALWAYS expand when list detected ==========
    // Unconditional expansion for lists - don't wait for mismatch detection
    // Lists often continue in adjacent chunks, and mismatch detection can miss cases
    if (listMode) {
      // Debug logging for list detection
      debug.list.log(`preFilter: items=${listInfoPreFilter.itemCount} patterns=[${listInfoPreFilter.patterns.join(',')}]`);
      debug.list.log(`finalEvidence: items=${listInfoFinal.itemCount} patterns=[${listInfoFinal.patterns.join(',')}]`);
      debug.list.log(`mismatch: declared=${mismatch.declaredTotal} visible=${mismatch.visibleItems} truncated=${anyTruncated}`);

      // GUARDRAIL: Check if we have chunkIndex metadata for ordered expansion
      const hasIndexMetadata = contextResults.some(r => readChunkMeta(r).hasIndexMeta);

      if (!hasIndexMetadata) {
        // Fallback to similarity expand if missing chunkIndex metadata
        debug.expand.log("list-fallback: mismatch but missing chunkIndex metadata; fallback to similarity expand");

        const expandedHits = await expandContext(contextResults, {
          budgetChars: expansionCfg.budgetChars,
          maxSteps: expansionCfg.maxSteps,
          scoreThreshold: expansionCfg.scoreThreshold,
        }, true);

        const similarityAdded = expandedHits.length - contextResults.length;
        if (similarityAdded > 0) {
          contextResults = expandedHits;
          expandedCount += similarityAdded;  // FIX: accumulate, don't overwrite
          debug.expand.log(`similarity: +${similarityAdded} chunks (list-fallback)`);
        }
      } else {
        // Ordered expansion by chunkIndex (preferred for lists)
        debug.expand.log(`ordered: List mismatch (declared=${mismatch.declaredTotal}, visible=${mismatch.visibleItems}), expanding by chunkIndex...`);

        const afterOrdered = await orderedExpandByChunkIndex(
          contextResults,
          expansionCfg.budgetChars,
          4 // max 4 next chunks per source
        );
        const orderedAdded = afterOrdered.length - contextResults.length;

        if (orderedAdded > 0) {
          contextResults = afterOrdered;
          expandedCount += orderedAdded;

          // Re-check mismatch after ordered expansion
          const newContextText = contextResults
            .map(r => String(r.properties?.text ?? ''))
            .map(t => t.length > MAX_CHUNK ? t.slice(0, MAX_CHUNK) : t)
            .join('\n');
          const newMismatch = detectCountMismatch(newContextText);

          // Fallback to similarity if still mismatch
          if (newMismatch.hasMismatch) {
            debug.expand.log(`ordered: Still mismatch (declared=${newMismatch.declaredTotal}, visible=${newMismatch.visibleItems}), trying similarity...`);

            const afterSimilarity = await expandContext(contextResults, {
              budgetChars: expansionCfg.budgetChars,
              maxSteps: expansionCfg.maxSteps,
              scoreThreshold: expansionCfg.scoreThreshold,
            }, true);

            const similarityAdded = afterSimilarity.length - contextResults.length;
            if (similarityAdded > 0) {
              contextResults = afterSimilarity;
              expandedCount += similarityAdded;
              debug.expand.log(`similarity: +${similarityAdded} chunks (fallback)`);
            }
          }
        } else {
          // Ordered expansion returned nothing - fallback to similarity
          debug.expand.log("ordered: No chunks added, trying similarity fallback...");

          const afterSimilarity = await expandContext(contextResults, {
            budgetChars: expansionCfg.budgetChars,
            maxSteps: expansionCfg.maxSteps,
            scoreThreshold: expansionCfg.scoreThreshold,
          }, true);

          const similarityAdded = afterSimilarity.length - contextResults.length;
          if (similarityAdded > 0) {
            contextResults = afterSimilarity;
            expandedCount += similarityAdded;
            debug.expand.log(`similarity: +${similarityAdded} chunks (ordered-fallback)`);
          }
        }
      }
    }
    // ========== LANE 2: Normal case - similarity expand when entailment=0 ==========
    else if (finalEntailmentCount === 0 && finalResults.length > 0) {
      debug.expand.log("Zero entailments, expanding by similarity...");

      const expandedHits = await expandContext(contextResults, {
        budgetChars: expansionCfg.budgetChars,
        maxSteps: expansionCfg.maxSteps,
        scoreThreshold: expansionCfg.scoreThreshold,
      }, true /* forceExpandAll */);

      expandedCount = expandedHits.length - contextResults.length;
      if (expandedCount > 0) {
        contextResults = expandedHits;
        debug.expand.log(`similarity: +${expandedCount} chunks`);
      }
    }

    const budgetUsed = contextResults.reduce((sum, r) => sum + String(r.properties.text || '').length, 0);
    log.expand(resultsBeforeExpansion, expandedCount, budgetUsed, expansionCfg.budgetChars);
    log.debugChunks('CONTEXT', 'Final chunks for context', contextResults);

    // GUARDRAIL: Only refuse if 0 entailments AND no high-confidence neutrals
    // Allow answers when: safety net used, high-retrieval chunks kept, or list context present
    const hasHighConfidenceChunks = filterResult.stats.neutralKept > 0 || filterResult.stats.usedFallback;
    const hasListEvidence = listMode && contextResults.length > 0;
    const topRetrievalScore = contextResults.length > 0
      ? Math.max(...contextResults.map(r => r.score ?? 0))
      : 0;
    const hasHighRetrievalScore = topRetrievalScore >= 0.6;  // Trust retrieval for high scores

    if (finalEntailmentCount === 0 && contextResults.length > 0) {
      // Allow answer if we have confidence indicators
      if (hasHighConfidenceChunks || hasListEvidence || hasHighRetrievalScore) {
        guardrailsTriggered.push('zero_entailment_but_high_confidence');
        debug.context.log(`Zero entailments but proceeding: neutralKept=${filterResult.stats.neutralKept} list=${hasListEvidence} topScore=${topRetrievalScore.toFixed(3)}`);
      } else {
        // Only refuse when truly no confidence
        guardrailsTriggered.push('no_entailments_after_rerank');
        log.refuse('no_entailments_after_rerank');
        log.endTrace();
        return NextResponse.json({
          success: true,
          query: cleanQuery,
          answer: "La documentación analizada no contempla información que responda directamente a esta pregunta.",
          wasRefused: true,
          refusalReason: "no_entailments_after_rerank",
          sources: [],
          processingTimeMs: Date.now() - startTime,
          debug: debug.isDev ? {
            pipeline: {
              initialCount: pipelineStats.initialCount,
              afterLLMFilter: filterResult.stats.outputCount,
              afterExpansion: contextResults.length,
              entailmentCount: finalEntailmentCount,
            },
            guardrailsTriggered,
          } : undefined,
        });
      }
    }

    // [8] CONTEXT - Apply limits (chunks, chars, per-source)
    const { context, usedChunks, totalChunks, sources, contextByKey } = buildContext(contextResults);
    const contextTokens = estimateTokens(context);

    // Count retrieved vs expanded chunks
    const retrievedCount = contextResults.filter(r => !r._isWindowExpansion).length;
    const expandedInContext = usedChunks - Math.min(usedChunks, retrievedCount);
    log.context(usedChunks, contextTokens, retrievedCount, expandedInContext);

    // [9] GATE - Reject if zero evidence
    if (usedChunks === 0) {
      guardrailsTriggered.push('no_chunks');
      log.refuse('no_chunks');
      log.endTrace();
      return NextResponse.json({
        success: true,
        query: cleanQuery,
        answer: "La documentación analizada no contempla información al respecto.",
        wasRefused: true,
        refusalReason: "no_chunks",
        sources: [],
        processingTimeMs: Date.now() - startTime,
        debug: debug.isDev ? { guardrailsTriggered } : undefined,
      });
    }

    log.evidence(usedChunks > 0 ? 'AVAILABLE' : 'EMPTY');

    // [10] GENERATE - LLM produces answer with citations
    const systemMessage = buildSystemMessage(systemPrompt, contactName);
    const userMessage = buildUserMessage(context, usedChunks, history, previousQuestion, cleanQuery);

    const genStart = Date.now();
    const modelService = ModelFactory.getModelService();
    let answer = await modelService.generateText(message_id, systemMessage, userMessage, modelId, 0.1, 1500);
    const genLatency = Date.now() - genStart;

    log.generate(modelId || 'default', genLatency);

    // [11] VALIDATE - Verify citations exist in context
    answer = enforceOneBulletPerPage(answer);

    // Classify response type: FULL, PARTIAL, or ABSENT
    const responseType = classifyResponse(answer);

    // Parse citations from answer and verify quotes exist in context
    let citations = parseFuentes(answer);
    let citationValidation = { valid: true, invalid: [] as ParsedCitation[], details: [] as string[], fixedCitations: [] as ParsedCitation[] };
    let repairAttempted = false;

    // ABSENT responses don't need citations
    const zeroCitationsOk = citations.length === 0 && responseType === "ABSENT";

    // For PARTIAL/FULL: we only need AT LEAST ONE valid citation, not all
    let needsRepair = false;
    if (citations.length === 0 && !zeroCitationsOk) {
      needsRepair = true;
    } else if (citations.length > 0) {
      citationValidation = validateCitations(citations, contextByKey);
      // Count how many citations were successfully fixed/validated
      const validCount = citationValidation.fixedCitations.filter((c, i) =>
        !citationValidation.invalid.some(inv => inv.sourceKey === c.sourceKey && inv.quote === citations[i]?.quote)
      ).length;
      // Need repair only if ZERO valid citations
      needsRepair = validCount === 0;
      debug.citation.log(`Response type: ${responseType}, valid: ${validCount}/${citations.length}`);
    }

    if (needsRepair) {
      // Try ONE repair pass
      repairAttempted = true;

      // Include available pages so model can't invent page numbers
      const availablePages = Array.from(contextByKey.keys()).slice(0, 50).join(", ");

      const repairPrompt = citations.length === 0
        ? `Tu respuesta no incluye la sección "Fuente:" con citas.

Páginas SOURCE disponibles: ${availablePages}

Reescribe tu respuesta con el formato correcto:

Fuente:
- Página <N> — "<cita literal del documento>"

REGLAS:
- MÁXIMO 1 bullet por página.
- Las citas deben ser COPIADAS VERBATIM. PROHIBIDO usar "...", "…", o truncamiento.
- Solo usa las páginas listadas arriba.
Si no puedes citar literalmente, responde: "No especificado en los documentos proporcionados."`
        : `Algunas citas en tu respuesta no coinciden con el texto del documento.

Errores: ${citationValidation.details.join('; ')}

Páginas SOURCE disponibles: ${availablePages}

REGLAS:
- MÁXIMO 1 bullet por página (no repitas la misma página).
- Las citas deben ser COPIADAS VERBATIM del contexto. PROHIBIDO usar "...", "…", o truncamiento.
- Si la cita sería muy larga, elige una subcadena contigua más corta que exista exactamente.
Si no puedes citar literalmente, responde: "No especificado en los documentos proporcionados."`;

      debug.citation.log(`Repair attempt: ${citations.length === 0 ? 'missing format' : 'invalid quotes'}`);
      if (citationValidation.invalid.length > 0) {
        debug.citation.log("Invalid citations:");
        citationValidation.details.forEach(d => debug.citation.log(`  - ${d}`));
        citationValidation.invalid.slice(0, 5).forEach(c => {
          debug.citation.log(`  failing: { sourceKey: "${c.sourceKey}", quote: "${c.quote.slice(0, 60)}..." }`);
        });
      }

      const repairStart = Date.now();
      const repairedAnswer = await modelService.generateText(
        message_id,
        systemMessage,
        `${userMessage}\n\n--- RESPUESTA ANTERIOR ---\n${answer}\n\n--- CORRECCIÓN REQUERIDA ---\n${repairPrompt}`,
        modelId,
        0.0,  // Temperature 0 for deterministic compliance
        1500
      );
      const repairLatency = Date.now() - repairStart;

      debug.citation.log(`Repair took ${repairLatency}ms`);

      // Validate repaired answer (apply same enforceOneBulletPerPage)
      const cleanedRepairedAnswer = enforceOneBulletPerPage(repairedAnswer);
      const repairedCitations = parseFuentes(cleanedRepairedAnswer);

      if (repairedCitations.length > 0) {
        const repairedValidation = validateCitations(repairedCitations, contextByKey);
        if (repairedValidation.valid) {
          // Repair succeeded
          answer = cleanedRepairedAnswer;
          citations = repairedCitations;
          citationValidation = repairedValidation;
          guardrailsTriggered.push('citation_repaired');
          debug.citation.log(`Repair succeeded with ${repairedCitations.length} valid citations`);
        } else {
          // Repair failed - use fallback
          guardrailsTriggered.push('citation_repair_failed');
          answer = "No especificado en los documentos proporcionados.";
          debug.citation.warn("Repair failed, using fallback.");
          repairedValidation.details.forEach(d => debug.citation.warn(`  - ${d}`));
          repairedValidation.invalid.slice(0, 3).forEach(c => {
            debug.citation.warn(`  failing: { sourceKey: "${c.sourceKey}", quote: "${c.quote.slice(0, 60)}..." }`);
          });
        }
      } else {
        // No citations in repair attempt - use fallback
        guardrailsTriggered.push('citation_repair_failed');
        answer = "No especificado en los documentos proporcionados.";
        debug.citation.warn("Repair produced no citations, using fallback");
      }
    } else if (citations.length > 0) {
      debug.citation.log(`All ${citations.length} citations verified`);
    }

    // [12] RESPOND - Return JSON response
    const response: Record<string, unknown> = {
      success: true,
      query: cleanQuery,
      answer,
      modelId,
      provider: "saptiva",
      chunksUsed: usedChunks,
      chunksTotal: totalChunks,
      sources,
      wasRefused: false,
      processingTimeMs: Date.now() - startTime,
    };

    if (debug.isDev) {
      response.debug = {
        pipeline: {
          initialCount: pipelineStats.initialCount,
          afterThreshold: pipelineStats.afterThreshold,
          afterRerank: pipelineStats.afterRerank,
          afterLLMFilter: filterResult.stats.outputCount,
          afterExpand: contextResults.length,
          sourcesFound: pipelineStats.sourcesFound,
          llmFilterTimeMs: filterResult.stats.filterTimeMs,
        },
        citations: {
          count: citations.length,
          valid: citationValidation.valid,
          invalidCount: citationValidation.invalid.length,
          repairAttempted,
          details: citationValidation.details,
        },
        top5: contextResults.slice(0, 5).map((r) => ({
          sourceName: r.properties.sourceName,
          chunkIndex: r.properties.chunkIndex,
          score: r.score,
          boost: r._boost ?? 0,
          finalScore: r._finalScore ?? 0,
          sourceBoost: r._sourceBoost ?? 0,
        })),
        guardrailsTriggered,
      };
    }

    // End trace with summary
    log.endTrace();

    return NextResponse.json(response);

  } catch (error) {
    log.error('RESPOND', { decision: error instanceof Error ? error.message : 'Unknown error' });
    log.endTrace();

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error processing query",
        details: error instanceof Error ? error.stack : undefined,
        processingTimeMs: Date.now() - startTime,
        guardrailsTriggered,
      },
      { status: 500 }
    );
  }
}
