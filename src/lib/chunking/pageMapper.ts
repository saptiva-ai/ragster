// PDF page anchoring via character offsets.
// Call this during PDF parsing to collect [{page, start, end}].
// Then, when chunking, map chunk text span to dominant page.

export interface PageSpan {
  page: number;      // 1-based page number
  start: number;     // global char offset (inclusive)
  end: number;       // global char offset (exclusive)
}

export function mapChunkToPage(
  chunkStartOffset: number,
  chunkEndOffset: number,
  spans: PageSpan[]
): number | undefined {
  let bestPage: number | undefined;
  let bestOverlap = 0;
  for (const s of spans) {
    const overlap = overlapLen([chunkStartOffset, chunkEndOffset], [s.start, s.end]);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestPage = s.page;
    }
  }
  return bestPage;
}

function overlapLen(a: [number, number], b: [number, number]) {
  const start = Math.max(a[0], b[0]);
  const end = Math.min(a[1], b[1]);
  return Math.max(0, end - start);
}
