// LLM CHUNK RERANKER (2nd Saptiva call)
//
// WHY: Top-K search returns noise that dilutes context.
// HOW: Ask LLM to score each chunk's relevance + require evidence quote.
// RULE: ENTAILMENT requires literal evidence from chunk. Hard cap output.
//
// Position: Search → CandidateBudget → [RERANKER] → Expand (if needed) → Generate
// PROBLEM SOLVED: "15 entailment → keep 15" becomes "15 entailment → keep best 6-8"

import { ModelFactory } from './modelFactory';
import { rateLimiter } from './rate-limiter';
import { RetrievalHit } from '@/lib/core/types';
import { configService } from './config';
import { detectListStructure } from './evidence-checker';
import { normalizeForMatch } from '@/lib/utils/normalize';

interface ChunkForFilter {
  _absId: number;
  text: string;
  sourceName: string;
  chunkIndex: number;
  properties: Record<string, unknown>;
  score?: number;
  _finalScore?: number;
  _boost?: number;
  _sourceBoost?: number;
  _isWindowExpansion?: boolean;
}

interface FilterResult {
  filteredChunks: ChunkForFilter[];
  stats: {
    inputCount: number;
    outputCount: number;
    filterTimeMs: number;
    batchCount: number;
    /** Chunks classified as ENTAILMENT (with evidence) - after validation */
    entailmentCount: number;
    /** Raw entailments from LLM before validation/downgrade */
    entailmentRaw: number;
    /** NEUTRAL chunks that were kept as fallback */
    neutralKept: number;
    /** Whether fallback to retrieval scores was used */
    usedFallback: boolean;
  };
}

type NLILabel = "ENTAILMENT" | "NEUTRAL" | "CONTRADICTION";

interface NLIDecision {
  id: number;           // _absId
  label: NLILabel;
  relevance: number;    // 0..10
  evidence: string;     // short quote from chunk
}

function getFilterConfig() {
  const cfg = configService.getLLMFilterConfig();
  return {
    BATCH_SIZE: cfg.batchSize,
    MAX_CHARS_PER_CHUNK: cfg.maxCharsPerChunk,
    TARGET_CHUNKS: cfg.targetChunks,  // Now used as hard cap
    TEMPERATURE: cfg.temperature,
    ENABLED: cfg.enabled,
    // Reranker settings - now centralized in config.ts
    MIN_ENTAILMENT_RELEVANCE: cfg.minEntailmentRelevance,
    MIN_COVERAGE_FOR_RERANK: cfg.minCoverageForRerank,
    RETRIEVAL_TRUST_THRESHOLD: cfg.retrievalTrustThreshold,
    TOP_N_SAFETY_NET: cfg.topNSafetyNet,
  };
}

// Prompt V2: Relevance + Evidence (tightened to reduce evidence_mismatch)
function buildFilterPromptV2(query: string, chunks: ChunkForFilter[]): string {
  const maxChars = getFilterConfig().MAX_CHARS_PER_CHUNK;

  const chunkList = chunks.map(c => {
    // Use windowed truncation to center around query matches (prevents false NEUTRAL)
    const truncated = excerptForRerank(c.text, query, maxChars);
    return [
      `[ID ${c._absId}]`,
      `FRAGMENTO_INICIO`,
      truncated,
      `FRAGMENTO_FIN`,
    ].join("\n");
  }).join('\n\n---\n\n');

  // Use real chunk IDs for example (not +1 which may not exist)
  const exampleId = chunks[0]?._absId ?? 0;
  const exampleId2 = chunks[1]?._absId ?? exampleId;

  return `Evalúa cada fragmento para responder la PREGUNTA.

PREGUNTA: "${query}"

Devuelve SOLO JSON válido con un objeto "results" (sin texto extra).
Para cada fragmento debes devolver:
- id: el número EXACTO que aparece en [ID ...]
- label: "ENTAILMENT" | "NEUTRAL" | "CONTRADICTION"
- relevance: entero 0-10
- evidence: CITA LITERAL EXACTA que RESPONDE DIRECTAMENTE la pregunta.

DEFINICIÓN DE LABELS:
- ENTAILMENT: El fragmento contiene una RESPUESTA DIRECTA a la pregunta. Puedes citar texto que responde exactamente lo que se pregunta.
- NEUTRAL: El fragmento trata un tema RELACIONADO pero NO responde directamente la pregunta.
- CONTRADICTION: El fragmento contradice o niega lo que se pregunta.

REGLA CLAVE: "Relacionado" ≠ "Responde"
- Si la pregunta es "¿Para qué fines se usan los datos personales?" y el fragmento habla de "fines estadísticos de operaciones", eso es NEUTRAL (tema relacionado, no respuesta directa).
- ENTAILMENT requiere que el fragmento diga EXPLÍCITAMENTE la respuesta (ej: "Los datos personales se utilizarán para: [lista de fines]").

REGLAS DE EVIDENCE:
1) El campo "id" DEBE ser exactamente el número que aparece en [ID ...].
2) "evidence" debe ser una SUBCADENA EXACTA del texto entre FRAGMENTO_INICIO y FRAGMENTO_FIN.
3) La cita debe RESPONDER DIRECTAMENTE la pregunta, no solo mencionar el tema.
4) NO uses "..." ni añadas/elimines signos, acentos, letras o palabras.
5) Usa 6 a 25 palabras CONTIGUAS del fragmento (un solo tramo).
6) Si NO puedes citar texto que RESPONDA DIRECTAMENTE la pregunta:
   label DEBE ser NEUTRAL (aunque el tema sea relacionado).

FRAGMENTOS:
${chunkList}

JSON:
{
  "results": [
    {"id": ${exampleId}, "label": "ENTAILMENT", "relevance": 9, "evidence": "cita que responde directamente" },
    {"id": ${exampleId2}, "label": "NEUTRAL", "relevance": 4, "evidence": "" }
  ]
}`;
}

// Parser V2: Returns NLIDecision[]
function parseFilterResponseV2(response: string): NLIDecision[] {
  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    const arr = parsed?.results;
    if (!Array.isArray(arr)) return [];

    const out: NLIDecision[] = [];
    for (const r of arr) {
      if (typeof r?.id !== "number") continue;

      const label = String(r?.label ?? "").toUpperCase();
      const normalized: NLILabel =
        label === "ENTAILMENT" ? "ENTAILMENT" :
        label === "NEUTRAL" ? "NEUTRAL" : "CONTRADICTION";

      let rel = Number(r?.relevance);
      if (!Number.isFinite(rel)) rel = 0;
      rel = Math.max(0, Math.min(10, Math.round(rel)));

      const evidence = typeof r?.evidence === "string" ? r.evidence.trim() : "";

      out.push({ id: r.id, label: normalized, relevance: rel, evidence });
    }
    return out;
  } catch {
    console.warn("[ChunkFilter] Failed to parse LLM response (v2)");
    return [];
  }
}

/**
 * Extract sanitized tokens from query for excerpt matching.
 * Strips punctuation like ¿ ? , . : so "¿Con qué...?" matches "con que".
 */
function tokensForExcerpt(query: string): string[] {
  // Use same normalization as evidence matching, then strip punctuation
  const q = normalizeForMatch(query)
    .replace(/[^\p{L}\p{N}\s-]/gu, " "); // strip punctuation like ¿ ? , . :
  return q
    .split(/\s+/)
    .filter(t => t.length >= 4)
    .slice(0, 8);
}

/**
 * Windowed truncation: centers excerpt around query keyword matches.
 * Prevents false NEUTRAL when evidence is after naive head truncation.
 */
function excerptForRerank(text: string, query: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Extract sanitized tokens from query
  const qTokens = tokensForExcerpt(query);

  if (qTokens.length === 0) {
    // No significant tokens, fall back to head truncation
    return text.slice(0, maxChars);
  }

  // Normalize text for matching (same way we normalize evidence)
  const normalizedText = normalizeForMatch(text);

  // Find first occurrence of any query token in normalized text
  let best = -1;
  for (const t of qTokens) {
    const i = normalizedText.indexOf(t);
    if (i >= 0 && (best === -1 || i < best)) best = i;
  }

  // If no match found, fall back to head truncation
  if (best === -1) {
    return text.slice(0, maxChars);
  }

  // Map position from normalized back to original (approximate)
  // Since normalization mostly preserves length ratio, use proportional mapping
  const ratio = text.length / Math.max(1, normalizedText.length);
  const approxStart = Math.floor(best * ratio);

  // Center window around the match (20% before, 80% after)
  const start = Math.max(0, approxStart - Math.floor(maxChars * 0.2));
  return text.slice(start, start + maxChars);
}

type DowngradeReason = "no_evidence" | "evidence_mismatch" | "evidence_is_question" | "low_relevance" | null;

// TOPIC CONSTRAINTS: REMOVED - citation validation is the only guardrail needed.
// Topic-based gating was too brittle and blocked valid answers.

// Rerank + Select: evidence gate + hard cap + neutral fallback
function rerankAndSelect(
  taggedChunks: ChunkForFilter[],
  decisions: NLIDecision[],
  query: string
): { kept: ChunkForFilter[]; entailmentCount: number; entailmentRaw: number; neutralKept: number } {
  const { TARGET_CHUNKS: K, MIN_ENTAILMENT_RELEVANCE, RETRIEVAL_TRUST_THRESHOLD, TOP_N_SAFETY_NET } = getFilterConfig();

  const decisionById = new Map<number, NLIDecision>();
  for (const d of decisions) decisionById.set(d.id, d);

  const scored = taggedChunks.map((c) => {
    const d = decisionById.get(c._absId);

    const rawLabel = (d?.label ?? "NEUTRAL") as NLILabel;
    const relevance = Number.isFinite(d?.relevance)
      ? Math.max(0, Math.min(10, Math.round(d!.relevance)))
      : 0;
    const evidence = (d?.evidence ?? "").trim();

    const hasEvidence = evidence.length > 0;
    const evidenceOk = hasEvidence &&
      normalizeForMatch(c.text).includes(normalizeForMatch(evidence));

    // Check if evidence is just the question (not an answer)
    const evNorm = normalizeForMatch(evidence);
    const qNorm = normalizeForMatch(query);
    const evidenceLooksLikeQuestion =
      evidence.includes("?") ||
      (evNorm.length > 0 && (evNorm === qNorm || qNorm.includes(evNorm)));
    const evidenceAnswerOk = !evidenceLooksLikeQuestion;

    // ENTAILMENT requires: evidence exists, matches chunk, isn't just the question, relevance >= threshold
    // No topic constraints - citation validation is the only guardrail
    const strongEntailment =
      rawLabel === "ENTAILMENT" && evidenceOk && evidenceAnswerOk && relevance >= MIN_ENTAILMENT_RELEVANCE;

    const label: NLILabel = strongEntailment
      ? "ENTAILMENT"
      : rawLabel === "CONTRADICTION"
      ? "CONTRADICTION"
      : "NEUTRAL";

    // Track why LLM entailments got downgraded
    const downgradeReason: DowngradeReason =
      rawLabel !== "ENTAILMENT" || label !== "NEUTRAL"
        ? null
        : !hasEvidence
        ? "no_evidence"
        : !evidenceOk
        ? "evidence_mismatch"
        : !evidenceAnswerOk
        ? "evidence_is_question"
        : relevance < MIN_ENTAILMENT_RELEVANCE
        ? "low_relevance"
        : null;

    return {
      chunk: c,
      rawLabel,
      label,
      relevance,
      retrievalScore: c.score ?? 0,
      evidence,
      evidenceOk,
      downgradeReason,
    };
  });

  // Log entailment stats (always show raw vs strong)
  const rawEnt = scored.filter(x => x.rawLabel === "ENTAILMENT").length;
  const strongEnt = scored.filter(x => x.label === "ENTAILMENT").length;
  const downgraded = scored.filter(x => x.rawLabel === "ENTAILMENT" && x.label === "NEUTRAL");

  const reasonCounts = downgraded.reduce<Record<string, number>>((acc, x) => {
    const r = x.downgradeReason ?? "unknown";
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `[Rerank] entailment_raw=${rawEnt} entailment_strong=${strongEnt} ` +
    `downgraded=${downgraded.length}` +
    (downgraded.length ? ` reasons=${JSON.stringify(reasonCounts)}` : "")
  );

  if (process.env.DEBUG_RAG === "true" && downgraded.length > 0) {
    downgraded.slice(0, 5).forEach(x => {
      const normEv = normalizeForMatch(x.evidence).slice(0, 60);
      console.log(
        `  - [${x.chunk._absId}] ${x.chunk.sourceName}:${x.chunk.chunkIndex} ` +
        `reason=${x.downgradeReason} rel=${x.relevance} ` +
        `ev="${x.evidence.slice(0, 40)}" norm="${normEv}"`
      );
    });
  }

  const candidates = scored.filter(x => x.label !== "CONTRADICTION");
  const entailments = candidates.filter(x => x.label === "ENTAILMENT");

  // When no entailments, fall back to retrievalScore (not LLM relevance which is noisy)
  if (entailments.length === 0) {
    const byRetrieval = [...candidates].sort((a, b) =>
      (b.retrievalScore - a.retrievalScore) || (a.chunk._absId - b.chunk._absId)
    );
    const kept = byRetrieval.slice(0, K).map(x => x.chunk);

    if (process.env.DEBUG_RAG === 'true') {
      console.log(`[Rerank] No entailments, falling back to retrieval scores`);
    }

    return { kept, entailmentCount: 0, entailmentRaw: rawEnt, neutralKept: kept.length };
  }

  // Calculate direct-answer boost: chunks with explicit answer patterns get priority
  const directAnswerPatterns = [
    /los\s+datos\s+(personales\s+)?se\s+utilizar[aá]n\s+para/i,
    /los\s+requisitos\s+(son|para)/i,
    /se\s+requiere[n]?\s*:/i,
    /para\s+(ello|esto)\s+se\s+necesita/i,
    /documentos?\s+necesarios?/i,
  ];

  const getDirectAnswerBoost = (text: string): number => {
    return directAnswerPatterns.some(p => p.test(text)) ? 1 : 0;
  };

  // Sort entailments by: direct-answer boost, LLM relevance, retrieval score
  entailments.sort((a, b) => {
    const boostA = getDirectAnswerBoost(a.chunk.text);
    const boostB = getDirectAnswerBoost(b.chunk.text);
    return (boostB - boostA) ||
      (b.relevance - a.relevance) ||
      (b.retrievalScore - a.retrievalScore) ||
      (a.chunk._absId - b.chunk._absId);
  });

  const kept: ChunkForFilter[] = [];
  kept.push(...entailments.slice(0, K).map(x => x.chunk));

  let neutralKept = 0;

  // ========== FIX: Keep NEUTRAL chunks that look like list continuation ==========
  // Keep based on: same sourceName, adjacency by chunkIndex, detectListStructure(text) (structure only)
  // No domain-specific patterns (like EC codes) - purely structural detection

  const neutrals = candidates.filter(x => x.label === "NEUTRAL");
  const entailmentChunks = entailments.map(x => x.chunk);

  // Build a set of (sourceName, chunkIndex) for entailments to check adjacency
  const entailmentKeys = new Set(
    entailmentChunks.map(c => `${c.sourceName}::${c.chunkIndex}`)
  );

  // Check if a chunk is adjacent to any entailment (same source, chunkIndex within ±2)
  const isAdjacentToEntailment = (sourceName: string, chunkIndex: number): boolean => {
    for (let delta = -2; delta <= 2; delta++) {
      if (delta === 0) continue;
      if (entailmentKeys.has(`${sourceName}::${chunkIndex + delta}`)) return true;
    }
    return false;
  };

  // Separate list-continuation neutrals from regular neutrals
  // Must have: same sourceName + adjacent chunkIndex to entailment + list structure
  const listContinuationNeutrals = neutrals.filter(x => {
    const text = x.chunk.text;
    const listInfo = detectListStructure(text);
    const hasListStructure = listInfo.isList && listInfo.itemCount >= 2;

    // Must be adjacent to entailment AND have list structure
    const adjacent = isAdjacentToEntailment(x.chunk.sourceName, x.chunk.chunkIndex);
    return adjacent && hasListStructure;
  });

  // If we have entailments, still add list-continuation neutrals (they complete the list)
  if (entailments.length > 0 && listContinuationNeutrals.length > 0) {
    // Sort by retrieval score and add up to remaining budget
    const sorted = listContinuationNeutrals.sort((a, b) => b.retrievalScore - a.retrievalScore);
    const remaining = K - kept.length;
    const toAdd = sorted.slice(0, remaining);
    kept.push(...toAdd.map(x => x.chunk));
    neutralKept = toAdd.length;

    if (toAdd.length > 0) {
      console.log(`[Rerank] Added ${toAdd.length} list-continuation NEUTRALs (have ${entailments.length} ENTAILMENTs)`);
    }
  }

  // ========== FIX: Override NEUTRAL if retrieval score is very high (0.7+) ==========
  // This catches high-confidence answers the reranker incorrectly marked as NEUTRAL
  const highScoreNeutrals = neutrals.filter(x =>
    x.retrievalScore >= RETRIEVAL_TRUST_THRESHOLD &&
    !kept.some(k => k._absId === x.chunk._absId) // Not already kept
  );

  if (highScoreNeutrals.length > 0) {
    const sorted = highScoreNeutrals.sort((a, b) => b.retrievalScore - a.retrievalScore);
    const remaining = K - kept.length;
    const toAdd = sorted.slice(0, remaining);
    kept.push(...toAdd.map(x => x.chunk));
    neutralKept += toAdd.length;

    if (toAdd.length > 0) {
      console.log(`[Rerank] Guardrail: Added ${toAdd.length} high-retrieval NEUTRALs (score >= ${RETRIEVAL_TRUST_THRESHOLD})`);
      if (process.env.DEBUG_RAG === 'true') {
        toAdd.forEach(x => {
          console.log(`  - [${x.chunk._absId}] ${x.chunk.sourceName}:${x.chunk.chunkIndex} retrieval=${x.retrievalScore.toFixed(3)}`);
        });
      }
    }
  }

  // Fallback: if 0 entailments, add regular neutrals by retrieval score
  if (entailments.length === 0) {
    const sortedNeutrals = neutrals.sort((a, b) => b.retrievalScore - a.retrievalScore);
    const remaining = K - kept.length;
    const toAdd = sortedNeutrals.slice(0, remaining);
    kept.push(...toAdd.map(x => x.chunk));
    neutralKept += toAdd.length;
  }

  // ========== SAFETY NET: Always keep top N by retrieval score ==========
  // Even if reranker mislabeled everything, we won't drop the answer
  const topByRetrieval = [...candidates]
    .sort((a, b) => b.retrievalScore - a.retrievalScore)
    .slice(0, TOP_N_SAFETY_NET);

  let safetyNetAdded = 0;
  for (const x of topByRetrieval) {
    if (!kept.some(k => k._absId === x.chunk._absId) && kept.length < K) {
      kept.push(x.chunk);
      safetyNetAdded++;
    }
  }

  if (safetyNetAdded > 0) {
    console.log(`[Rerank] Safety net: Added ${safetyNetAdded} top-retrieval chunks`);
  }

  // Debug: show final selection with full details for kept entailments
  if (process.env.DEBUG_RAG === 'true') {
    console.log(`[Rerank] Final selection (${kept.length} chunks):`);
    kept.forEach((c, i) => {
      const s = scored.find(x => x.chunk._absId === c._absId);
      if (s?.label === "ENTAILMENT") {
        // Show why this entailment was kept (for debugging false positives)
        const ev = (s.evidence ?? "").replace(/\s+/g, " ").slice(0, 80);
        console.log(
          `  ${i + 1}. [${c._absId}] ENTAILMENT rel=${s.relevance} | ${c.sourceName}:${c.chunkIndex}\n` +
          `      evidenceOk=${s.evidenceOk ?? false}\n` +
          `      ev="${ev}"`
        );
      } else {
        console.log(`  ${i + 1}. [${c._absId}] ${s?.label ?? 'UNKNOWN'} rel=${s?.relevance ?? 0} | ${c.sourceName}:${c.chunkIndex}`);
      }
    });
  }

  // entailmentCount must match what we actually kept (not total found)
  const keptEntailments = Math.min(entailments.length, K);

  return {
    kept: kept.slice(0, K),
    entailmentCount: keptEntailments,
    entailmentRaw: rawEnt,
    neutralKept,
  };
}

// Filter batch: returns NLIDecision[]
async function filterBatch(
  query: string,
  batch: ChunkForFilter[],
  modelService: ReturnType<typeof ModelFactory.getModelService>
): Promise<NLIDecision[]> {
  const prompt = buildFilterPromptV2(query, batch);

  try {
    const response = await rateLimiter.execute(() =>
      modelService.generateText(
        "chunk-filter",
        "You are a relevance reranker. Respond only with valid JSON.",
        prompt,
        undefined,
        getFilterConfig().TEMPERATURE
      )
    );

    const decisions = parseFilterResponseV2(response);

    // If parse returns nothing, treat as failure for this batch
    if (!decisions.length) {
      console.warn(`[ChunkFilter] Batch returned 0 decisions`);
      return [];
    }

    return decisions;
  } catch (error) {
    console.warn("[ChunkFilter] Batch filter failed:", error);
    // SAFE fallback: return empty -> caller will fallback to retrieval scores
    return [];
  }
}

// Main export
export async function filterChunksWithLLM(
  query: string,
  chunks: Array<{ properties: Record<string, unknown>; score?: number; _finalScore?: number; _boost?: number; _sourceBoost?: number; _isWindowExpansion?: boolean }>
): Promise<FilterResult> {
  const startTime = Date.now();
  const { TARGET_CHUNKS: K, ENABLED, BATCH_SIZE, MIN_COVERAGE_FOR_RERANK } = getFilterConfig();

  // If disabled, return all chunks (up to K)
  if (!ENABLED) {
    const passthrough = chunks.slice(0, K).map((c, i) => ({
      _absId: i,
      text: String(c.properties.text || ''),
      sourceName: String(c.properties.sourceName || ''),
      chunkIndex: Number(c.properties.chunkIndex || 0),
      properties: c.properties,
      score: c.score,
      _finalScore: c._finalScore,
      _boost: c._boost,
      _sourceBoost: c._sourceBoost,
      _isWindowExpansion: c._isWindowExpansion,
    }));
    return {
      filteredChunks: passthrough,
      stats: {
        inputCount: chunks.length,
        outputCount: passthrough.length,
        filterTimeMs: 0,
        batchCount: 0,
        entailmentCount: passthrough.length,
        entailmentRaw: passthrough.length,
        neutralKept: 0,
        usedFallback: false,
      },
    };
  }

  // Tag chunks with _absId
  const taggedChunks: ChunkForFilter[] = chunks.map((c, i) => ({
    _absId: i,
    text: String(c.properties.text || ''),
    sourceName: String(c.properties.sourceName || ''),
    chunkIndex: Number(c.properties.chunkIndex || 0),
    properties: c.properties,
    score: c.score,
    _finalScore: c._finalScore,
    _boost: c._boost,
    _sourceBoost: c._sourceBoost,
    _isWindowExpansion: c._isWindowExpansion,
  }));

  console.log(`[Reranker] Processing ${taggedChunks.length} chunks...`);

  // Create batches
  const batches: ChunkForFilter[][] = [];
  for (let i = 0; i < taggedChunks.length; i += BATCH_SIZE) {
    batches.push(taggedChunks.slice(i, i + BATCH_SIZE));
  }

  const modelService = ModelFactory.getModelService();

  const MAX_PARALLEL_BATCHES = 3;
  const batchesToProcess = batches.slice(0, MAX_PARALLEL_BATCHES);

  if (batches.length > MAX_PARALLEL_BATCHES) {
    console.log(`[Reranker] Capping batches: ${batches.length} → ${MAX_PARALLEL_BATCHES}`);
  }

  console.log(`[Reranker] Processing ${batchesToProcess.length} batches in parallel...`);

  // Process batches
  const batchPromises = batchesToProcess.map((batch, i) =>
    filterBatch(query, batch, modelService).then(decisions => {
      const entail = decisions.filter(d => d.label === "ENTAILMENT").length;
      const neutral = decisions.filter(d => d.label === "NEUTRAL").length;
      const contra = decisions.filter(d => d.label === "CONTRADICTION").length;
      console.log(`[Reranker] Batch ${i + 1}: ${entail} ENTAILMENT, ${neutral} NEUTRAL, ${contra} CONTRADICTION`);
      return decisions;
    })
  );

  const results = await Promise.all(batchPromises);
  const allDecisions = results.flat();

  // ID VALIDITY CHECK: Filter out invalid/unknown IDs before reranking
  const absIdSet = new Set(taggedChunks.map(c => c._absId));

  // Normalize IDs first
  const normalizedDecisions = allDecisions.map(d => ({
    ...d,
    id: typeof d.id === "string" ? Number.parseInt(d.id, 10) : d.id,
  }));

  // Track issues
  const unknownIds: number[] = [];
  let duplicateCount = 0;

  // Keep BEST duplicate by (label strength, relevance) instead of first
  // ENTAILMENT > NEUTRAL > CONTRADICTION
  const labelRank = (label: NLILabel): number =>
    label === "ENTAILMENT" ? 2 : label === "NEUTRAL" ? 1 : 0;

  const bestById = new Map<number, NLIDecision>();

  for (const d of normalizedDecisions) {
    if (!Number.isInteger(d.id)) continue;

    if (!absIdSet.has(d.id)) {
      unknownIds.push(d.id);
      continue;
    }

    const existing = bestById.get(d.id);
    if (existing) {
      duplicateCount++;
      // Keep better: higher label rank, or same rank with higher relevance
      const existingRank = labelRank(existing.label);
      const newRank = labelRank(d.label);
      if (newRank > existingRank || (newRank === existingRank && d.relevance > existing.relevance)) {
        bestById.set(d.id, d);
      }
    } else {
      bestById.set(d.id, d);
    }
  }

  const decisionsClean = Array.from(bestById.values());

  // Log ID issues for debugging
  if (unknownIds.length > 0 || duplicateCount > 0) {
    console.log(
      `[Reranker] ID issues: unknown=${unknownIds.length} duplicate=${duplicateCount}` +
      (process.env.DEBUG_RAG === "true" ? ` unknownIds=${JSON.stringify(unknownIds.slice(0, 5))}` : "")
    );
  }

  // Detect common "0..N-1 index" failure mode (LLM ignored [ID ...] format)
  if (decisionsClean.length === 0 && allDecisions.length > 0) {
    const smallInts = allDecisions.filter(d => {
      const id = typeof d.id === "string" ? Number.parseInt(d.id, 10) : d.id;
      return Number.isInteger(id) && id >= 0 && id < taggedChunks.length;
    }).length;
    if (smallInts / allDecisions.length > 0.7) {
      console.warn(`[Reranker] Looks like LLM returned 0..N-1 indices, not absIds. Prompt/ID format mismatch.`);
    }
  }

  // Coverage check: protect against batch failures, parse failures, or ID mapping failures
  const coverage = decisionsClean.length / Math.max(1, taggedChunks.length);

  let filteredChunks: ChunkForFilter[];
  let entailmentCount = 0;
  let entailmentRaw = 0;
  let neutralKept = 0;
  let usedFallback = false;

  if (coverage < MIN_COVERAGE_FOR_RERANK) {
    // Fallback: no LLM filtering, just take top-K by retrieval score
    filteredChunks = [...taggedChunks]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, K);

    usedFallback = true;
    entailmentCount = 0;
    entailmentRaw = 0;
    neutralKept = filteredChunks.length;

    console.warn(`[Reranker] Low coverage (${(coverage * 100).toFixed(0)}%). Falling back to top-${K} by retrieval score.`);
  } else {
    // Normal rerank path - use cleaned decisions (validated IDs only)
    const reranked = rerankAndSelect(taggedChunks, decisionsClean, query);
    filteredChunks = reranked.kept;
    entailmentCount = reranked.entailmentCount;
    entailmentRaw = reranked.entailmentRaw;
    neutralKept = reranked.neutralKept;

    console.log(`[Reranker] Selected: ${entailmentCount} ENTAILMENT (raw=${entailmentRaw}) + ${neutralKept} NEUTRAL = ${filteredChunks.length} chunks`);
  }

  const stats = {
    inputCount: taggedChunks.length,
    outputCount: filteredChunks.length,
    filterTimeMs: Date.now() - startTime,
    batchCount: batchesToProcess.length,
    entailmentCount,
    entailmentRaw,
    neutralKept,
    usedFallback,
  };

  console.log(`[Reranker] Result: ${stats.inputCount} → ${stats.outputCount} chunks (${stats.filterTimeMs}ms, fallback=${usedFallback})`);

  return { filteredChunks, stats };
}

export function toRetrievalHits(filteredChunks: ChunkForFilter[]): RetrievalHit[] {
  return filteredChunks.map(c => ({
    properties: c.properties,
    score: c.score,
    _finalScore: c._finalScore,
    _boost: c._boost,
    _sourceBoost: c._sourceBoost,
    _isWindowExpansion: c._isWindowExpansion,
  }));
}
