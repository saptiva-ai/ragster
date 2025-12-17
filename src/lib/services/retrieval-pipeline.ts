// RETRIEVAL PIPELINE
//
// Steps after Weaviate search:
// 1. THRESHOLD → Remove chunks scoring < 0.3 (noise)
// 2. SOURCE BOOST → Favor documents with multiple matching chunks
// 3. EXPAND → Walk prev/next chain for complete context

import { weaviateClient } from "./weaviate-client";
import { RetrievalHit } from "@/lib/core/types";
import { configService } from "./config";

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


// A2: SIMILARITY THRESHOLD FILTER

/**
 * Filter results below similarity threshold.
 * Removes low-quality results before they pollute context.
 */
export function filterByThreshold(
  results: RetrievalHit[],
  threshold: number
): RetrievalHit[] {
  const filtered = results.filter(r => (r.score ?? 0) >= threshold);

  const removed = results.length - filtered.length;
  if (removed > 0) {
    console.log(`[A2:Threshold] Filtered ${removed} results below ${threshold}`);
  }

  return filtered;
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
  config: Partial<ExpansionConfig> = {}
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

  // Only expand from chunks above threshold
  const seeds = results.filter(r => normalize(r.score ?? 0) >= cfg.scoreThreshold);

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
      const prev = chunk.properties.prevChunkIndex as number | undefined;
      const next = chunk.properties.nextChunkIndex as number | undefined;

      if (prev != null && prev >= 0 && !seen.has(`${source}-${prev}`)) {
        toFetch.push({ source, index: prev });
      }
      if (next != null && next >= 0 && !seen.has(`${source}-${next}`)) {
        toFetch.push({ source, index: next });
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
    embedding: number[],
    useAutocut: boolean = true
  ): Promise<PipelineResult> {
    const fetchCount = this.config.targetChunks * this.config.overFetchMultiplier;

    // Step 1: Fetch candidates
    let results: RetrievalHit[];

    if (useAutocut) {
      results = await weaviateClient.searchHybridAutocut(
        query,
        embedding,
        this.config.autocutSensitivity,
        this.config.alpha
      );

      // If autocut returned too few, supplement with regular search
      if (results.length < fetchCount) {
        const supplemental = await weaviateClient.searchHybrid(
          query,
          embedding,
          fetchCount,
          this.config.alpha
        );

        // Merge, avoiding duplicates
        const existingIds = new Set(
          results.map(r => `${r.properties.sourceName}-${r.properties.chunkIndex}`)
        );

        for (const r of supplemental) {
          const id = `${r.properties.sourceName}-${r.properties.chunkIndex}`;
          if (!existingIds.has(id)) {
            results.push(r);
            existingIds.add(id);
          }
        }
      }
    } else {
      results = await weaviateClient.searchHybrid(
        query,
        embedding,
        fetchCount,
        this.config.alpha
      );
    }

    const initialCount = results.length;
    console.log(`[A1:Search] Fetched ${initialCount} candidates`);

    // Step 2: Filter by threshold (A2)
    results = filterByThreshold(results, this.config.minSimilarityThreshold);
    const afterThreshold = results.length;
    const afterRerank = afterThreshold;

    // Apply source boost
    if (this.config.enableSourceBoost) {
      results = applySourceBoost(results, this.config);
    }

    // Step 6: Expand context (walk adjacent chunks)
    let afterExpansion = results.length;
    if (this.config.enableExpansion) {
      results = await expandContext(results, {
        budgetChars: this.config.expansionBudgetChars,
        maxSteps: this.config.expansionMaxSteps,
        scoreThreshold: this.config.expansionScoreThreshold,
      });
      afterExpansion = results.length;
      console.log(`[Expand] Final: ${afterExpansion} chunks`);
    }

    // Count unique sources
    const sourcesFound = new Set(
      results.map(r => String(r.properties.sourceName))
    ).size;

    return {
      results,
      stats: {
        initialCount,
        afterThreshold,
        afterRerank,
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
