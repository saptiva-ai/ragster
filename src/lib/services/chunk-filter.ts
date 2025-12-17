// LLM CHUNK FILTER (2nd Saptiva call)
//
// WHY: Top-K search returns noise that dilutes context.
// HOW: Ask LLM "Does this chunk contain evidence for the question?"
// RULE: Only drop if semantically weak AND structurally unimportant.
//
// Position: Search → Threshold → Rerank → [LLM FILTER] → Expand → Generate
// PROBLEM SOLVED: Irrelevant chunks confuse the LLM ("lost in the middle")

import { ModelFactory } from './modelFactory';
import { rateLimiter } from './rate-limiter';
import { RetrievalHit } from '@/lib/core/types';
import { configService } from './config';

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
    /** Chunks classified as ENTAILMENT by NLI */
    entailmentCount: number;
    /** NEUTRAL chunks that were kept to fill quota */
    neutralKept: number;
  };
}


// Config now reads from centralized configService
function getFilterConfig() {
  const cfg = configService.getLLMFilterConfig();
  return {
    BATCH_SIZE: cfg.batchSize,
    MAX_CHARS_PER_CHUNK: cfg.maxCharsPerChunk,
    TARGET_CHUNKS: cfg.targetChunks,
    TEMPERATURE: cfg.temperature,
    ENABLED: cfg.enabled,
  };
}

/**
 * NLI-based chunk filter using Natural Language Inference.
 *
 * For each chunk, classify:
 * - ENTAILMENT: Chunk helps answer the question
 * - NEUTRAL: Related but doesn't directly answer
 * - CONTRADICTION: Not useful for answering
 */
function buildFilterPrompt(query: string, chunks: ChunkForFilter[]): string {
  const chunkList = chunks.map(c => {
    const truncatedText = c.text.length > getFilterConfig().MAX_CHARS_PER_CHUNK
      ? c.text.substring(0, getFilterConfig().MAX_CHARS_PER_CHUNK) + '...'
      : c.text;
    return `[ID ${c._absId}]\n${truncatedText}`;
  }).join('\n\n---\n\n');

  return `Clasifica cada fragmento usando Natural Language Inference (NLI).

PREGUNTA: "${query}"

Para cada fragmento, determina:
- ENTAILMENT: El fragmento contiene información que ayuda a responder la pregunta
- NEUTRAL: El fragmento está relacionado con el tema pero no responde directamente
- CONTRADICTION: El fragmento no es útil para responder esta pregunta

FRAGMENTOS:
${chunkList}

Responde SOLO en JSON:
{
  "classifications": [
    {"id": 0, "label": "ENTAILMENT"},
    {"id": 1, "label": "NEUTRAL"},
    ...
  ]
}`;
}

type NLILabel = 'ENTAILMENT' | 'NEUTRAL' | 'CONTRADICTION';

interface NLIClassification {
  id: number;
  label: NLILabel;
}

interface NLIParseResult {
  entailment: number[];
  neutral: number[];
  contradiction: number[];
}

function parseFilterResponse(response: string): NLIParseResult {
  const result: NLIParseResult = { entailment: [], neutral: [], contradiction: [] };

  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed.classifications)) {
      for (const c of parsed.classifications as NLIClassification[]) {
        if (typeof c.id !== 'number') continue;

        const label = String(c.label).toUpperCase();
        if (label === 'ENTAILMENT') {
          result.entailment.push(c.id);
        } else if (label === 'NEUTRAL') {
          result.neutral.push(c.id);
        } else {
          result.contradiction.push(c.id);
        }
      }
    }

    // Fallback: old format compatibility
    if (Array.isArray(parsed.relevant_ids)) {
      result.entailment = parsed.relevant_ids.filter((id: unknown) => typeof id === 'number');
    }

    return result;
  } catch {
    console.warn('[ChunkFilter] Failed to parse LLM response');
    return result;
  }
}

async function filterBatch(
  query: string,
  batch: ChunkForFilter[],
  modelService: ReturnType<typeof ModelFactory.getModelService>
): Promise<NLIParseResult> {
  const prompt = buildFilterPrompt(query, batch);

  try {
    const response = await rateLimiter.execute(() =>
      modelService.generateText(
        'chunk-filter',
        'You are an NLI classifier. Respond only with valid JSON.',
        prompt,
        undefined,
        getFilterConfig().TEMPERATURE
      )
    );
    return parseFilterResponse(response);
  } catch (error) {
    console.warn('[ChunkFilter] Batch filter failed:', error);
    // On error, treat all as ENTAILMENT (safe fallback)
    return {
      entailment: batch.map(c => c._absId),
      neutral: [],
      contradiction: [],
    };
  }
}

export async function filterChunksWithLLM(
  query: string,
  chunks: Array<{ properties: Record<string, unknown>; score?: number; _finalScore?: number; _boost?: number; _sourceBoost?: number; _isWindowExpansion?: boolean }>
): Promise<FilterResult> {
  const startTime = Date.now();

  if (!getFilterConfig().ENABLED) {
    return {
      filteredChunks: chunks.map((c, i) => ({
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
      })),
      stats: { inputCount: chunks.length, outputCount: chunks.length, filterTimeMs: 0, batchCount: 0, entailmentCount: chunks.length, neutralKept: 0 },
    };
  }

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

  // REMOVED: Skip condition that bypassed semantic filtering for ≤8 chunks
  // Semantic relevance ≠ quantity. Even 1 chunk needs judgment.
  // The filter must ALWAYS run to decide if chunks actually answer the question.

  console.log(`[ChunkFilter] Filtering ${taggedChunks.length} chunks...`);

  const batches: ChunkForFilter[][] = [];
  for (let i = 0; i < taggedChunks.length; i += getFilterConfig().BATCH_SIZE) {
    batches.push(taggedChunks.slice(i, i + getFilterConfig().BATCH_SIZE));
  }

  const modelService = ModelFactory.getModelService();

  // ============================================
  // NLI CLASSIFICATION
  // ============================================
  // ENTAILMENT: definitely keep
  // NEUTRAL: keep if we need more chunks
  // CONTRADICTION: drop

  const entailmentIds = new Set<number>();
  const neutralIds = new Set<number>();

  const MAX_PARALLEL_BATCHES = 3;
  const batchesToProcess = batches.slice(0, MAX_PARALLEL_BATCHES);

  if (batches.length > MAX_PARALLEL_BATCHES) {
    console.log(`[NLI] Capping batches: ${batches.length} → ${MAX_PARALLEL_BATCHES}`);
  }

  console.log(`[NLI] Processing ${batchesToProcess.length} batches in parallel...`);

  const batchPromises = batchesToProcess.map((batch, i) =>
    filterBatch(query, batch, modelService).then(result => {
      console.log(`[NLI] Batch ${i + 1}: ${result.entailment.length} ENTAILMENT, ${result.neutral.length} NEUTRAL, ${result.contradiction.length} CONTRADICTION`);
      return result;
    })
  );

  const results = await Promise.all(batchPromises);

  // Collect all classifications
  for (const result of results) {
    result.entailment.forEach(id => entailmentIds.add(id));
    result.neutral.forEach(id => neutralIds.add(id));
  }

  console.log(`[NLI] Total: ${entailmentIds.size} ENTAILMENT, ${neutralIds.size} NEUTRAL`);

  // Debug: show classification for each chunk
  if (process.env.DEBUG_RAG === 'true') {
    const showFullText = process.env.DEBUG_RAG_FULL === 'true';
    console.log(`[NLI Debug] Classifications:`);
    taggedChunks.forEach(c => {
      const label = entailmentIds.has(c._absId) ? '✅ ENTAILMENT'
                  : neutralIds.has(c._absId) ? '⚪ NEUTRAL'
                  : '❌ CONTRADICTION';
      console.log(`  [${c._absId}] ${label} | ${c.sourceName}:${c.chunkIndex} | chars=${c.text.length}`);
      if (showFullText) {
        console.log(`      TEXT: "${c.text}"`);
        console.log(`      ---`);
      } else {
        const preview = c.text.substring(0, 100).replace(/\n/g, ' ');
        console.log(`      "${preview}..."`);
      }
    });
  }

  // ============================================
  // FILTERING LOGIC
  // ============================================
  // 1. Always keep ENTAILMENT
  // 2. Keep NEUTRAL if we need more chunks (< TARGET_CHUNKS)
  // 3. Drop CONTRADICTION (no structural fallback - trust NLI)

  let neutralKeeps = 0;

  const filteredChunks = taggedChunks.filter(c => {
    // ENTAILMENT → always keep
    if (entailmentIds.has(c._absId)) {
      return true;
    }

    // NEUTRAL → keep if we need more chunks
    if (neutralIds.has(c._absId)) {
      const currentCount = entailmentIds.size + neutralKeeps;
      if (currentCount < getFilterConfig().TARGET_CHUNKS) {
        neutralKeeps++;
        return true;
      }
    }

    // CONTRADICTION → drop (trust NLI)
    return false;
  });

  const stats = {
    inputCount: taggedChunks.length,
    outputCount: filteredChunks.length,
    filterTimeMs: Date.now() - startTime,
    batchCount: batchesToProcess.length,
    entailmentCount: entailmentIds.size,
    neutralKept: neutralKeeps,
  };

  console.log(`[NLI] Result: ${stats.inputCount} → ${stats.outputCount} chunks (${entailmentIds.size} ENTAILMENT + ${neutralKeeps} NEUTRAL, ${stats.filterTimeMs}ms)`);

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
