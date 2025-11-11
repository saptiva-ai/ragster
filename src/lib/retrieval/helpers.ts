/**
 * Helper utilities for RAG retrieval processing
 * Includes text normalization, header extraction, and similarity metrics
 */

/**
 * Normalizes text by:
 * - Converting to lowercase
 * - Removing accents (NFD normalization)
 * - Keeping only letters, numbers, spaces, and # symbols
 *
 * @param s - Input string to normalize
 * @returns Normalized string
 */
export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^\p{L}\p{N}\s#]/gu, " "); // Keep only letters, numbers, spaces, #
}

/**
 * Extracts the first header from a text chunk
 * Supports:
 * - Markdown headers (# Header, ## Header, etc.)
 * - Underlined headers (Header\n===)
 *
 * @param text - Text to extract header from
 * @returns Normalized header text, or empty string if no header found
 */
export function extractHeader(text: string): string {
  // Match markdown headers (# Header) or underlined headers (Header\n===)
  const match = text.match(/^#{1,6}\s+.*$|^.*\n=+$/m);
  return normalizeText(match?.[0] || "");
}

/**
 * Extracts unique query terms from normalized text
 * Filters out terms shorter than 3 characters
 *
 * @param normalizedQuery - Pre-normalized query text
 * @returns Array of unique query terms
 */
export function extractQueryTerms(normalizedQuery: string): string[] {
  return Array.from(
    new Set(
      normalizedQuery.split(/\s+/).filter((w) => w.length > 2)
    )
  );
}

/**
 * Computes Jaccard similarity between two texts
 * Jaccard = |intersection| / |union|
 *
 * @param a - First text (should be normalized)
 * @param b - Second text (should be normalized)
 * @returns Jaccard similarity score (0-1)
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));

  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = setA.size + setB.size - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Counts how many query terms appear in the target text
 *
 * @param queryTerms - Array of query terms to look for
 * @param targetText - Normalized text to search in
 * @returns Count of query terms found
 */
export function countTermMatches(
  queryTerms: string[],
  targetText: string
): number {
  let count = 0;
  queryTerms.forEach((term) => {
    if (targetText.includes(term)) {
      count += 1;
    }
  });
  return count;
}
