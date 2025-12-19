// RETRIEVAL PIPELINE
//
// Steps after Weaviate search:
// 1. CANDIDATE CUT → Keep top N + within delta of best score
// 2. MMR DIVERSITY → Reduce redundant chunks (λ=0.6)
// 3. SOURCE BOOST → Favor documents with multiple matching chunks
// 4. EXPAND → Walk prev/next chain for complete context

import { weaviateClient } from "./weaviate-client";
import { RetrievalHit } from "@/lib/core/types";
import { configService } from "./config";
import { debug } from "@/lib/utils/debug";

// Re-export for backward compatibility
export type { RetrievalHit } from "@/lib/core/types";

export interface RetrievalConfig {
  // A2: Similarity threshold
  minSimilarityThreshold: number;

  // A3: Over-fetch + rerank
  targetChunks: number;
  overFetchMultiplier: number;

  // A6: Source aggregation
  enableSourceBoost: boolean;
  maxSourceBoost: number;
  boostPerMatch: number;

  // Context expansion
  enableExpansion: boolean;
  expansionBudgetChars: number;
  expansionMaxSteps: number;
  expansionScoreThreshold: number;

  // Search params
  alpha: number;
  autocutSensitivity: number;
}

export interface SourceAggregation {
  sourceName: string;
  chunks: RetrievalHit[];
  avgScore: number;
  matchCount: number;
  boostedScore: number;
}

export interface PipelineResult {
  results: RetrievalHit[];
  stats: {
    initialCount: number;
    afterThreshold: number;
    afterRerank: number;
    afterExpansion: number;
    sourcesFound: number;
  };
}

// DEFAULT CONFIG (from centralized configService)

function getDefaultRetrievalConfig(): RetrievalConfig {
  const retrieval = configService.getRetrievalConfig();
  const expansion = configService.getExpansionConfig();

  return {
    minSimilarityThreshold: retrieval.minSimilarityThreshold,
    targetChunks: retrieval.targetChunks,
    overFetchMultiplier: retrieval.overFetchMultiplier,
    enableSourceBoost: retrieval.enableSourceBoost,
    maxSourceBoost: retrieval.maxSourceBoost,
    boostPerMatch: retrieval.boostPerMatch,
    enableExpansion: expansion.enabled,
    expansionBudgetChars: expansion.budgetChars,
    expansionMaxSteps: expansion.maxSteps,
    expansionScoreThreshold: expansion.scoreThreshold,
    alpha: retrieval.alpha,
    autocutSensitivity: retrieval.autocutSensitivity,
  };
}

// Lazy-loaded default (for backward compatibility)
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = getDefaultRetrievalConfig();


// A2: CANDIDATE BUDGET + RELATIVE CUT
//
// Instead of absolute threshold (unstable across queries), use:
// 1. Fixed candidate budget (topN)
// 2. Relative cut (keep anything within delta of top1 score)

export interface CandidateCutConfig {
  topN: number;           // Keep at least top N results
  deltaToTop1: number;    // Keep any chunk within this delta of top1 score
}

const DEFAULT_CUT_CONFIG: CandidateCutConfig = {
  topN: 30,  // Keep ~30 for MMR to filter down to 15
  deltaToTop1: 0.08,
};

/**
 * Filter results using candidate budget + relative cut.
 * More stable than absolute threshold.
 */
export function filterByCandidateBudget(
  results: RetrievalHit[],
  config: Partial<CandidateCutConfig> = {}
): RetrievalHit[] {
  if (results.length === 0) return results;

  const { topN, deltaToTop1 } = { ...DEFAULT_CUT_CONFIG, ...config };

  // Sort by score descending
  const sorted = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const top1Score = sorted[0]?.score ?? 0;
  const cutoffScore = top1Score - deltaToTop1;

  // Keep: top N OR within delta of top1
  const filtered = sorted.filter((r, i) => {
    const score = r.score ?? 0;
    return i < topN || score >= cutoffScore;
  });

  const removed = results.length - filtered.length;
  if (removed > 0) {
    console.log(`[A2:CandidateCut] Kept ${filtered.length}/${results.length} (topN=${topN}, delta=${deltaToTop1}, cutoff=${cutoffScore.toFixed(3)})`);
  }

  return filtered;
}

// MMR: MAXIMAL MARGINAL RELEVANCE
// Reduces redundancy by penalizing chunks similar to already-selected ones
// Formula: MMR(i) = λ * relevance(i) - (1-λ) * max_similarity_to_selected

export interface MMRConfig {
  enabled: boolean;
  lambda: number;     // 0-1: higher = more relevance, lower = more diversity
  targetK: number;    // Number of diverse results to select
}

/**
 * Simple text similarity using Jaccard coefficient on word sets.
 * Fast, no model needed - good enough for diversity detection.
 */
function textSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Apply Maximal Marginal Relevance to reduce redundancy.
 * Iteratively selects chunks that balance relevance with diversity.
 */
export function applyMMR(
  results: RetrievalHit[],
  config?: Partial<MMRConfig>
): RetrievalHit[] {
  const mmrConfig = configService.getMMRConfig();
  const cfg = { ...mmrConfig, ...config };

  debug.mmr.log(`Starting MMR: ${results.length} candidates, targetK=${cfg.targetK}, λ=${cfg.lambda}`);

  if (!cfg.enabled) {
    debug.mmr.log("MMR disabled, returning all results");
    return results;
  }

  if (results.length <= cfg.targetK) {
    debug.mmr.log(`Only ${results.length} results, no filtering needed`);
    return results;
  }

  const selected: RetrievalHit[] = [];
  const candidates = [...results];
  const selectedTexts: string[] = [];

  while (selected.length < cfg.targetK && candidates.length > 0) {
    let bestIdx = 0;
    let bestMMRScore = -Infinity;
    let bestMaxSim = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const relevance = candidate.score ?? 0;
      const candidateText = String(candidate.properties.text || '');

      // Max similarity to any already-selected chunk
      const maxSim = selectedTexts.length === 0
        ? 0
        : Math.max(...selectedTexts.map(t => textSimilarity(t, candidateText)));

      // MMR score: balance relevance vs diversity
      const mmrScore = cfg.lambda * relevance - (1 - cfg.lambda) * maxSim;

      if (mmrScore > bestMMRScore) {
        bestMMRScore = mmrScore;
        bestMaxSim = maxSim;
        bestIdx = i;
      }
    }

    // Select the best candidate
    const chosen = candidates.splice(bestIdx, 1)[0];
    selected.push(chosen);
    selectedTexts.push(String(chosen.properties.text || ''));

    // Debug: show each selection
    const chunkId = `${chosen.properties.sourceName}:${chosen.properties.chunkIndex}`;
    const textPreview = String(chosen.properties.text || '').slice(0, 50).replace(/\n/g, ' ');
    debug.mmr.log(`#${selected.length} Selected: ${chunkId}`, {
      relevance: (chosen.score ?? 0).toFixed(3),
      maxSimilarity: bestMaxSim.toFixed(3),
      mmrScore: bestMMRScore.toFixed(3),
      preview: textPreview + '...'
    });
  }

  // Summary log (always shown)
  console.log(`[MMR] Selected ${selected.length}/${results.length} diverse chunks (λ=${cfg.lambda})`);

  // Debug: show removed chunks (high similarity)
  const removedCount = results.length - selected.length;
  if (removedCount > 0) {
    debug.mmr.log(`Removed ${removedCount} redundant chunks`);
  }

  return selected;
}

// STEP 5: CONTEXT EXPANSION
//
// WHY: Chunking splits information across boundaries.
// HOW: Walk prev/next chain from high-scoring chunks until budget hit.
// RESULT: Complete context without arbitrary fixed windows.

export interface ExpansionConfig {
  budgetChars: number;      // Stop when total text exceeds this
  maxSteps: number;         // Max iterations to prevent runaway
  scoreThreshold: number;   // Only expand chunks scoring >= this (normalized 0-1)
  maxChunksPerStep: number; // Limit fetches per iteration
}

// DEFAULT_EXPANSION now reads from centralized configService
function getDefaultExpansionConfig(): ExpansionConfig {
  const cfg = configService.getExpansionConfig();
  return {
    budgetChars: cfg.budgetChars,
    maxSteps: cfg.maxSteps,
    scoreThreshold: cfg.scoreThreshold,
    maxChunksPerStep: cfg.maxChunksPerStep,
  };
}

function chunkId(r: { properties: Record<string, unknown> }): string {
  return `${r.properties.sourceName}-${r.properties.chunkIndex}`;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export async function expandContext(
  results: RetrievalHit[],
  config: Partial<ExpansionConfig> = {},
  /** When true (failure-expansion), use all results as seeds regardless of score */
  forceExpandAll: boolean = false
): Promise<RetrievalHit[]> {
  if (results.length === 0) return results;

  const cfg = { ...getDefaultExpansionConfig(), ...config };
  const expanded = [...results];
  const seen = new Set(results.map(r => chunkId(r)));

  // Normalize scores to 0-1 for threshold comparison
  const scores = results.map(r => r.score ?? 0);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 1;
  const normalize = (s: number) => (s - minScore) / range;

  // Seed selection: if forceExpandAll (failure-expansion), use all results as seeds
  // Otherwise, only expand from chunks above threshold
  const seeds = forceExpandAll
    ? results
    : results.filter(r => normalize(r.score ?? 0) >= cfg.scoreThreshold);

  if (seeds.length === 0) {
    console.log(`[Expand] No chunks above threshold ${cfg.scoreThreshold}`);
    return results;
  }

  // Track frontier (chunks whose neighbors we haven't fetched yet)
  let frontier = new Set(seeds.map(r => chunkId(r)));

  for (let step = 0; step < cfg.maxSteps; step++) {
    // Collect neighbors from frontier
    const toFetch: Array<{ source: string; index: number }> = [];

    for (const chunk of expanded) {
      if (!frontier.has(chunkId(chunk))) continue;

      const source = String(chunk.properties.sourceName);

      // Type-safe index parsing (handles string or number from ingestion)
      const currentIdx = Number(chunk.properties.chunkIndex);
      const prevIdx = chunk.properties.prevChunkIndex == null ? null : Number(chunk.properties.prevChunkIndex);
      const nextIdx = chunk.properties.nextChunkIndex == null ? null : Number(chunk.properties.nextChunkIndex);

      // Skip if current index is invalid
      if (!Number.isInteger(currentIdx)) continue;

      // GUARD: Adjacency sanity check - only walk if truly adjacent (diff === 1)
      // Prevents walking across section gaps or corrupted index data
      if (prevIdx != null && Number.isInteger(prevIdx) && prevIdx >= 0 && !seen.has(`${source}-${prevIdx}`)) {
        const isAdjacent = Math.abs(prevIdx - currentIdx) === 1;
        if (isAdjacent) {
          toFetch.push({ source, index: prevIdx });
        }
      }
      if (nextIdx != null && Number.isInteger(nextIdx) && nextIdx >= 0 && !seen.has(`${source}-${nextIdx}`)) {
        const isAdjacent = Math.abs(nextIdx - currentIdx) === 1;
        if (isAdjacent) {
          toFetch.push({ source, index: nextIdx });
        }
      }
    }

    if (toFetch.length === 0) break;

    // Fetch in batches by source
    const limited = toFetch.slice(0, cfg.maxChunksPerStep);
    const bySource = groupBy(limited, f => f.source);
    const newFrontier = new Set<string>();

    for (const [source, items] of Object.entries(bySource)) {
      const ids = items.map(i => i.index);
      const chunks = await weaviateClient.getChunksByIds(source, ids);

      for (const chunk of chunks) {
        const id = chunkId(chunk);
        if (!seen.has(id)) {
          // Give expansion chunks a small score instead of 0
          // This marks them as "supporting context" not "irrelevant"
          const expansionScore = configService.getExpansionConfig().expansionScore;
          expanded.push({ ...chunk, score: expansionScore, _isWindowExpansion: true });
          seen.add(id);
          newFrontier.add(id);
        }
      }
    }

    frontier = newFrontier;
    console.log(`[Expand] Step ${step + 1}: +${newFrontier.size} chunks`);

    // Budget check
    const totalChars = expanded.reduce((sum, r) =>
      sum + String(r.properties.text || '').length, 0);

    if (totalChars >= cfg.budgetChars) {
      console.log(`[Expand] Budget hit (${totalChars}/${cfg.budgetChars})`);
      break;
    }
  }

  // Sort by document, then position
  return expanded.sort((a, b) => {
    const srcCmp = String(a.properties.sourceName).localeCompare(String(b.properties.sourceName));
    return srcCmp || (a.properties.chunkIndex as number) - (b.properties.chunkIndex as number);
  });
}

// A6: SOURCE AGGREGATION BOOST

/**
 * Aggregate chunks by source document.
 */
export function aggregateBySource(results: RetrievalHit[]): SourceAggregation[] {
  const sourceMap = new Map<string, RetrievalHit[]>();

  for (const result of results) {
    const sourceName = String(result.properties.sourceName || 'unknown');
    if (!sourceMap.has(sourceName)) {
      sourceMap.set(sourceName, []);
    }
    sourceMap.get(sourceName)!.push(result);
  }

  const aggregations: SourceAggregation[] = [];

  for (const [sourceName, chunks] of sourceMap) {
    const scores = chunks.map(c => c._finalScore ?? c.score ?? 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const matchCount = chunks.length;

    aggregations.push({
      sourceName,
      chunks,
      avgScore,
      matchCount,
      boostedScore: avgScore, // Will be calculated in applySourceBoost
    });
  }

  return aggregations;
}

/**
 * Apply source-level boost to results.
 * Sources with more matching chunks get higher priority.
 *
 * Formula: score * (1 + min(maxBoost, matches * boostPerMatch))
 */
export function applySourceBoost(
  results: RetrievalHit[],
  config: Pick<RetrievalConfig, 'maxSourceBoost' | 'boostPerMatch'>
): RetrievalHit[] {
  if (results.length === 0) return results;

  const aggregations = aggregateBySource(results);

  // Calculate boosted scores
  for (const agg of aggregations) {
    const boost = 1 + Math.min(config.maxSourceBoost, agg.matchCount * config.boostPerMatch);
    agg.boostedScore = agg.avgScore * boost;
  }

  // Sort by boosted score
  aggregations.sort((a, b) => b.boostedScore - a.boostedScore);

  console.log(`[A6:SourceBoost] ${aggregations.length} sources:`);
  for (const agg of aggregations.slice(0, 3)) {
    const boostPct = ((agg.boostedScore / agg.avgScore - 1) * 100).toFixed(0);
    console.log(`  - "${agg.sourceName}": ${agg.matchCount} chunks, +${boostPct}% boost`);
  }

  // Flatten back, maintaining source order
  const reordered: RetrievalHit[] = [];
  for (const agg of aggregations) {
    // Sort chunks within source by score
    const sortedChunks = agg.chunks.sort((a, b) =>
      (b._finalScore ?? b.score ?? 0) - (a._finalScore ?? a.score ?? 0)
    );

    // Add source boost info to each chunk
    for (const chunk of sortedChunks) {
      reordered.push({
        ...chunk,
        _sourceBoost: agg.boostedScore,
      });
    }
  }

  return reordered;
}

// RETRIEVAL PIPELINE CLASS

export class RetrievalPipeline {
  private config: RetrievalConfig;

  constructor(config: Partial<RetrievalConfig> = {}) {
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  }

  /**
   * Execute the full retrieval pipeline.
   *
   * Flow:
   * 1. Fetch candidates (with autocut or limit)
   * 2. Filter by threshold
   * 3. Apply source boost
   * 4. Expand context (walk adjacent chunks)
   */
  async execute(
    query: string,
    embedding: number[]
  ): Promise<PipelineResult> {
    const fetchCount = this.config.targetChunks * this.config.overFetchMultiplier;

    // Step 1: Fetch candidates from BOTH collections (Documents 512d + DocumentsQnA 1024d)
    // embedding should be full 1024d - searchHybridBoth truncates for regular collection
    let results = await weaviateClient.searchHybridBoth(
      query,
      embedding,
      fetchCount,
      this.config.alpha
    );

    const initialCount = results.length;
    console.log(`[A1:Search] Fetched ${initialCount} candidates (both collections)`);

    // Step 2: Candidate budget + relative cut (replaces absolute threshold)
    // topN=30 keeps ~30 candidates for MMR to filter down to 15
    results = filterByCandidateBudget(results);
    const afterThreshold = results.length;

    // Step 3: MMR diversity - reduce redundant chunks before reranking
    results = applyMMR(results);
    const afterMMR = results.length;

    // Apply source boost
    if (this.config.enableSourceBoost) {
      results = applySourceBoost(results, this.config);
    }

    // NOTE: Expansion moved to AFTER reranker in route.ts
    // Only expand if reranker returns <2 entailments, then rerank again
    const afterExpansion = results.length;

    // Count unique sources
    const sourcesFound = new Set(
      results.map(r => String(r.properties.sourceName))
    ).size;

    return {
      results,
      stats: {
        initialCount,
        afterThreshold,
        afterRerank: afterMMR,  // MMR replaces rerank at this stage
        afterExpansion,
        sourcesFound,
      },
    };
  }

  /**
   * Update config at runtime.
   */
  updateConfig(config: Partial<RetrievalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current config.
   */
  getConfig(): RetrievalConfig {
    return { ...this.config };
  }
}

// SINGLETON INSTANCE

export const retrievalPipeline = new RetrievalPipeline();
