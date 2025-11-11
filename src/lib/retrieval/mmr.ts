/**
 * Maximal Marginal Relevance (MMR) for diverse chunk selection
 * Reduces redundancy by balancing relevance and diversity
 */

import { jaccardSimilarity } from "./helpers";

/**
 * Candidate chunk for MMR selection
 */
export interface MMRCandidate {
  /** Unique identifier for the chunk */
  id: string;
  /** Chunk text content (should be normalized for comparison) */
  normalizedText: string;
  /** Relevance score from fusion reranking */
  score: number;
  /** Original chunk data to return */
  originalData: any;
}

/**
 * Selects diverse chunks using Maximal Marginal Relevance
 *
 * Algorithm:
 * 1. Start with empty selection
 * 2. For each remaining slot:
 *    - For each candidate:
 *      - MMR = λ * relevance - (1-λ) * max_similarity_to_selected
 *    - Pick candidate with highest MMR score
 * 3. Return top-N diverse chunks
 *
 * @param candidates - Array of scored candidates
 * @param topK - Number of diverse chunks to select
 * @param lambda - Diversity parameter (0-1)
 *                 0 = maximum diversity (ignore relevance)
 *                 1 = maximum relevance (ignore diversity)
 *                 0.7 = 70% relevance, 30% diversity (recommended)
 * @returns Selected diverse chunks with their original data
 */
export function selectDiverseChunks(
  candidates: MMRCandidate[],
  topK: number = 5,
  lambda: number = 0.7
): any[] {
  if (candidates.length === 0) {
    return [];
  }

  // Ensure we don't try to select more than available
  const n = Math.min(topK, candidates.length);

  const picked: MMRCandidate[] = [];
  const pool = [...candidates]; // Clone to avoid mutating input

  while (picked.length < n && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];

      // Calculate maximum similarity to already-picked chunks
      const maxSimilarity =
        picked.length === 0
          ? 0
          : Math.max(
              ...picked.map((p) =>
                jaccardSimilarity(candidate.normalizedText, p.normalizedText)
              )
            );

      // MMR score: balance between relevance and novelty
      const mmrScore = lambda * candidate.score - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    // Add best candidate to picked and remove from pool
    picked.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }

  // Return original data from selected chunks
  return picked.map((p) => p.originalData);
}

/**
 * Convenience function to create MMR candidates from chunk objects
 *
 * @param chunks - Array of chunk objects with text, score, and other data
 * @param normalizedTextField - Name of the field containing normalized text
 * @param scoreField - Name of the field containing the relevance score
 * @param idField - Name of the field containing the unique ID
 * @returns Array of MMRCandidate objects
 */
export function prepareCandidates(
  chunks: any[],
  normalizedTextField: string = "normalizedText",
  scoreField: string = "score",
  idField: string = "id"
): MMRCandidate[] {
  return chunks.map((chunk, index) => ({
    id: chunk[idField] || `chunk-${index}`,
    normalizedText: chunk[normalizedTextField] || "",
    score: chunk[scoreField] || 0,
    originalData: chunk,
  }));
}
