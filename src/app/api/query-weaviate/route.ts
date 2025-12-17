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
  classifyQuestion,
  QuestionType,
} from "@/lib/services/evidence-checker";

import {
  filterChunksWithLLM,
  toRetrievalHits,
} from "@/lib/services/chunk-filter";

import { RAGLogger } from "@/lib/services/rag-logger";

/** Short queries (1-2 words) likely mean "continue" - use previous question for search */
const MAX_WORDS_FOR_AMBIGUOUS = 2;

// STEP 1: CLASSIFY QUESTION → Determines alpha for hybrid search
//
// WHY: Different question types need different search strategies
// - NUMERIC ("¿cuántos?"): alpha=0.35 → 65% keyword (BM25) to find exact numbers
// - LIST ("¿cuáles son?"): alpha=0.50 → balanced
// - GENERAL (semantic): alpha=0.75 → 75% vector for meaning
//
// PROBLEM SOLVED: Pure vector search misses exact matches like "Total: 108"

function getAlphaForQuery(query: string): number {
  const questionType = classifyQuestion(query);

  switch (questionType) {
    case QuestionType.NUMERIC:
      return 0.35;  // 65% BM25 - finds exact numbers
    case QuestionType.LIST:
      return 0.5;   // Balanced
    case QuestionType.ORDERED_SEQUENCE:
      return 0.4;   // 60% BM25 - finds exact sections
    case QuestionType.REGLA_GENERAL:
    default:
      break;
  }

  // Fallback heuristics for general questions
  const hasDigits = /\d/.test(query);
  const hasQuotes = /["']/.test(query);
  const isShort = query.split(/\s+/).length <= 3;
  const hasCode = /[A-Z]{2,}-?\d+/.test(query);

  if (hasCode || hasDigits || hasQuotes) return 0.5;
  if (isShort) return 0.6;
  return 0.75;  // Default: semantic
}

// Context limits for buildContext
// Saptiva model: 8192 tokens max (~6000 chars)
// Reserve: ~500 tokens system prompt, ~200 user formatting, ~1500 response
const CONTEXT_LIMITS = {
  MAX_CONTEXT_CHARS: 5000,
  MAX_CHUNKS_TOTAL: 8,
  MAX_CHUNKS_PER_SOURCE: 6,
  MAX_CHARS_PER_CHUNK: 1000,
};

// Estimate tokens (Spanish: ~1 token per 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}


// STEP 2: HYBRID SEARCH → Weaviate search with dynamic alpha
//
// WHY: Pure vector search misses exact matches. Pure keyword misses semantics.
// HOW: Combines BM25 (keyword) + vector (semantic) with alpha weighting
// PROBLEM SOLVED: "artículo 45" returns article 45, not just any article

async function searchWithPipeline(queryText: string): Promise<{
  results: RetrievalHit[];
  embedding: number[];
  stats: { initialCount: number; afterThreshold: number; afterRerank: number; afterExpansion: number; sourcesFound: number };
}> {
  const embedder = getSaptivaEmbedder();
  const embeddingResult = await rateLimiter.execute(() => embedder.embed(queryText));

  const alpha = getAlphaForQuery(queryText);
  const questionType = classifyQuestion(queryText);

  // Fetch more chunks for "total" queries (summaries are often at end)
  const isTotalQuery = /total|subtotal|suma|cantidad|cuantos|cuántos|count|amount/i.test(queryText);
  const targetChunks = isTotalQuery ? 20 : 12;

  // Disable autocut for NUMERIC/LIST (it drops low-scoring but necessary totals)
  const useAutocut = questionType === QuestionType.REGLA_GENERAL;

  const pipeline = new RetrievalPipeline({
    ...DEFAULT_RETRIEVAL_CONFIG,
    alpha,
    targetChunks,
    overFetchMultiplier: alpha <= 0.55 ? 4 : 3,
  });

  if (process.env.DEBUG_RAG === 'true') {
    console.log(`[DEBUG] Pipeline: alpha=${alpha} target=${targetChunks} type=${questionType} autocut=${useAutocut}`);
  }

  const { results, stats } = await pipeline.execute(queryText, embeddingResult.embedding, useAutocut);

  return { results, embedding: embeddingResult.embedding, stats };
}

/** Fallback search if pipeline fails */
async function searchInWeaviateFallback(queryText: string): Promise<RetrievalHit[]> {
  const embedder = getSaptivaEmbedder();
  const embeddingResult = await embedder.embed(queryText);

  const alpha = getAlphaForQuery(queryText);
  const limit = alpha <= 0.55 ? 40 : 25;
  const fields = 'text sourceName chunkIndex totalChunks contentWithoutOverlap';

  try {
    const results = await weaviateClient.searchHybrid(queryText, embeddingResult.embedding, limit, alpha, fields);
    if (!results || results.length === 0) {
      return await weaviateClient.searchByVector(embeddingResult.embedding, limit, fields);
    }
    return results;
  } catch (error) {
    if (process.env.DEBUG_RAG === 'true') console.warn(`[DEBUG] Fallback search failed:`, error);
    return await weaviateClient.searchByVector(embeddingResult.embedding, limit, fields);
  }
}

// STEP 6: BUILD CONTEXT → Apply limits before sending to LLM
//
// WHY: LLM has token limits. Too many chunks = truncation or confusion.
// LIMITS: 12 chunks, 12K chars, 8 per source, 1.5K per chunk
// PROBLEM SOLVED: Context explosion, "lost in the middle" problem

function buildContext(results: Array<{ properties: Record<string, unknown>; score?: number; _finalScore?: number }>): {
  context: string;
  usedChunks: number;
  totalChunks: number;
  totalChars: number;
  sources: string[];
} {
  const { MAX_CONTEXT_CHARS, MAX_CHUNKS_TOTAL, MAX_CHUNKS_PER_SOURCE, MAX_CHARS_PER_CHUNK } = CONTEXT_LIMITS;

  if (results.length === 0) {
    return { context: "", usedChunks: 0, totalChunks: 0, totalChars: 0, sources: [] };
  }

  const uniqueSourcesInResults = new Set(results.map(r => String(r.properties?.sourceName || "Documento"))).size;
  const shouldUseDiversity = uniqueSourcesInResults > 1;

  const isDebugMode = process.env.DEBUG_RAG === 'true';

  const contextParts: string[] = [];
  const sourceCount: Map<string, number> = new Map();
  const usedSources: Set<string> = new Set();
  let currentChars = 0;
  let usedChunks = 0;
  let prevSource: string | null = null;
  let prevChunkIndex: number | null = null;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const remainingCandidates = results.length - i;

    if (usedChunks >= MAX_CHUNKS_TOTAL) {
      if (isDebugMode) console.log(`[DEBUG] Context: Hard stop at ${MAX_CHUNKS_TOTAL} chunks`);
      break;
    }

    const props = result.properties;
    const text = typeof props.text === "string" ? props.text : "";
    const sourceName = typeof props.sourceName === "string" ? props.sourceName : "Documento";
    const chunkIndex = typeof props.chunkIndex === "number" ? props.chunkIndex : 0;
    const contentWithoutOverlap = typeof props.contentWithoutOverlap === "string" ? props.contentWithoutOverlap : null;

    const sourceChunks = sourceCount.get(sourceName) || 0;
    const chunksStillNeeded = MAX_CHUNKS_TOTAL - usedChunks;
    const hasEnoughCandidates = remainingCandidates > chunksStillNeeded * 2;

    if (shouldUseDiversity && sourceChunks >= MAX_CHUNKS_PER_SOURCE && hasEnoughCandidates) {
      continue;
    }

    let chunkText = text;
    const isSequential = prevSource === sourceName && prevChunkIndex !== null && chunkIndex === prevChunkIndex + 1;

    if (isSequential && contentWithoutOverlap) {
      chunkText = contentWithoutOverlap;
    }

    if (chunkText.length > MAX_CHARS_PER_CHUNK) {
      chunkText = chunkText.slice(0, MAX_CHARS_PER_CHUNK) + "...";
    }

    // Format like Verba: Document + Chunk ID + Score + Content
    const score = result.score ?? result._finalScore ?? 0;
    const relevancy = score > 0.7 ? "Alta" : score > 0.4 ? "Media" : "Baja";
    const sectionContent = `[Documento: ${sourceName} | Fragmento ${chunkIndex} | Relevancia: ${relevancy}]\n${chunkText}`;
    const separator = usedChunks > 0 ? "\n\n---\n\n" : "";
    const sectionWithSeparator = separator + sectionContent;

    if (currentChars + sectionWithSeparator.length > MAX_CONTEXT_CHARS) {
      break;
    }

    contextParts.push(sectionWithSeparator);
    currentChars += sectionWithSeparator.length;
    usedChunks++;

    sourceCount.set(sourceName, sourceChunks + 1);
    usedSources.add(sourceName);
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
  };
}

// STEP 7: BUILD MESSAGES → System + User prompts for LLM

function buildSystemMessage(systemPrompt: string, contactName?: string): string {
  const ragInstructions = `Eres un narrador fiel del documento. Solo describes lo que el documento establece.

TRES TIPOS DE RESPUESTA:
1. VALOR EXPLÍCITO → El documento dice un valor concreto → Responde con ese valor
2. REGLA/ESTRUCTURA → El documento tiene reglas, condiciones, fórmulas o tablas → Explica la regla exacta
3. AUSENTE → No hay NADA sobre el tema → "Esta información no se encuentra en los documentos"

Una respuesta es AUSENTE solo si NO existe ninguna evidencia relevante en ningún fragmento. Si la evidencia existe de forma distribuida (tablas, reglas, notas), trátala como REGLA/ESTRUCTURA.

CLAVE: Si el documento contiene reglas, condiciones, fórmulas, tablas o múltiples valores relacionados con la pregunta, NO respondas "no se encuentra". Describe exactamente la regla o estructura que aparece.

PROHIBIDO:
- Convertir reglas o fórmulas en valores únicos
- Elegir un valor "representativo" cuando hay varios
- Omitir condiciones o excepciones
- Simplificar relaciones entre variables

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

// MAIN HANDLER: POST /api/query-weaviate
//
// FLOW:
// 1. CLASSIFY  → Determine question type + alpha
// 2. SEARCH    → Hybrid search (Weaviate)
// 3. THRESHOLD → Remove chunks scoring < 0.3
// 4. FILTER    → LLM asks "is this chunk relevant?" (2nd Saptiva call)
// 5. EXPAND    → Fetch adjacent chunks for high-scoring results
// 6. CONTEXT   → Apply limits (12 chunks, 12K chars)
// 7. GATE      → Check evidence level (EMPTY → reject without LLM)
// 8. GENERATE  → LLM generates answer (main Saptiva call)
// 9. RESPOND   → Return JSON response

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const guardrailsTriggered: string[] = [];
  const log = new RAGLogger();

  try {
    // Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message_id, query, systemPrompt, modelId, temperature, contacts = [] } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Fix UTF-8 encoding issues (Spanish characters)
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

    // Start structured trace
    log.startTrace(cleanQuery);

    // Save to MongoDB
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

    // Get conversation history
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

    // Short queries (1-2 words) are likely "continue" responses - use previous question for search
    const wordCount = cleanQuery.trim().split(/\s+/).length;
    const isShortQuery = wordCount <= MAX_WORDS_FOR_AMBIGUOUS;
    const searchQuery = isShortQuery && previousQuestion ? previousQuestion : cleanQuery;

    const isDebug = process.env.DEBUG_RAG === 'true' || process.env.NODE_ENV !== 'production';

    // STEP 2: HYBRID SEARCH

    let results: RetrievalHit[] = [];
    let pipelineStats = { initialCount: 0, afterThreshold: 0, afterRerank: 0, afterExpansion: 0, sourcesFound: 0 };

    if (!(isShortQuery && !previousQuestion)) {
      try {
        const pipelineResult = await searchWithPipeline(searchQuery);
        results = pipelineResult.results;
        pipelineStats = pipelineResult.stats;
        log.retrieve(pipelineStats.afterRerank, pipelineStats.sourcesFound);
        log.debugChunks('RETRIEVE', 'Retrieved chunks', results);
      } catch {
        log.warn('RETRIEVE', { decision: 'fallback search' });
        const fallbackResults = await searchInWeaviateFallback(searchQuery);
        results = fallbackResults;
        pipelineStats.initialCount = fallbackResults.length;
        pipelineStats.afterRerank = fallbackResults.length;
      }
    }

    // STEP 4: LLM FILTER (2nd Saptiva call)
    // Asks LLM: "Does this chunk contain evidence for the question?"
    // Removes noise BEFORE it reaches the generation context

    const filterResult = await filterChunksWithLLM(cleanQuery, results);
    log.filter(filterResult.stats.inputCount, filterResult.stats.outputCount, filterResult.stats.filterTimeMs > 0);

    // CRITICAL: If LLM filter says "0 relevant", respect that decision
    // This is the semantic judge - if it says no chunks answer the question, abstain
    // DO NOT fallback to top-K (that causes hallucinations)
    if (filterResult.filteredChunks.length === 0 && results.length > 0) {
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
        debug: isDebug ? {
          pipeline: {
            initialCount: pipelineStats.initialCount,
            afterThreshold: pipelineStats.afterThreshold,
            afterRerank: pipelineStats.afterRerank,
            afterLLMFilter: 0,
            llmFilterTimeMs: filterResult.stats.filterTimeMs,
            llmFilterVerdict: 'NO_ENTAILMENT',
          },
          guardrailsTriggered: ['llm_filter_abstain'],
        } : undefined,
      });
    }

    const filteredResults = toRetrievalHits(filterResult.filteredChunks);

    // STEP 5: EXPAND CONTEXT (walk adjacent chunks)

    const shouldSkipExpansion = filterResult.filteredChunks.length > 0 && filterResult.filteredChunks.length <= 8;
    let finalResults = filteredResults;

    const resultsBeforeExpansion = finalResults.length;
    if (!shouldSkipExpansion) {
      finalResults = await expandContext(finalResults);
    }
    const expandedCount = finalResults.length - resultsBeforeExpansion;
    const budgetUsed = finalResults.reduce((sum, r) => sum + String(r.properties.text || '').length, 0);
    log.expand(resultsBeforeExpansion, expandedCount, budgetUsed, 4000);
    log.debugChunks('CONTEXT', 'Final chunks for context', finalResults);

    // STEP 6: BUILD CONTEXT

    const { context, usedChunks, totalChunks, sources } = buildContext(finalResults);
    const contextTokens = estimateTokens(context);

    // Count retrieved vs expanded chunks
    const retrievedCount = finalResults.filter(r => !r._isWindowExpansion).length;
    const expandedInContext = usedChunks - Math.min(usedChunks, retrievedCount);
    log.context(usedChunks, contextTokens, retrievedCount, expandedInContext);

    // STEP 7: ZERO-CHUNKS CHECK (only rejection case)
    // If no chunks at all, reject without LLM call
    // Otherwise, let LLM decide what it can/can't answer

    if (usedChunks === 0) {
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
      });
    }

    log.evidence(usedChunks > 0 ? 'AVAILABLE' : 'EMPTY');

    // STEP 8: LLM GENERATION (main Saptiva call)
    // LLM decides: full answer, partial answer, or "no info found"

    const systemMessage = buildSystemMessage(systemPrompt, contactName);
    const userMessage = buildUserMessage(context, usedChunks, history, previousQuestion, cleanQuery);

    const genStart = Date.now();
    const modelService = ModelFactory.getModelService();
    const answer = await modelService.generateText(message_id, systemMessage, userMessage, modelId, 0.1, 1500);
    const genLatency = Date.now() - genStart;

    log.generate(modelId || 'default', genLatency);

    // STEP 9: RESPONSE

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

    if (isDebug) {
      response.debug = {
        pipeline: {
          initialCount: pipelineStats.initialCount,
          afterThreshold: pipelineStats.afterThreshold,
          afterRerank: pipelineStats.afterRerank,
          afterLLMFilter: filterResult.stats.outputCount,
          afterWindow: finalResults.length,
          sourcesFound: pipelineStats.sourcesFound,
          llmFilterTimeMs: filterResult.stats.filterTimeMs,
        },
        top5: finalResults.slice(0, 5).map((r) => ({
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
