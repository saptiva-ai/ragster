/**
 * Sentence-based chunker.
 * Groups sentences into chunks, respecting sentence boundaries.
 */

import { TextChunker } from '@/lib/core/interfaces';
import { Chunk, ChunkOptions } from '@/lib/core/types';
import { getSentenceSplitter } from '../nlp/sentence-splitter';

export interface SentenceChunkOptions extends ChunkOptions {
  sentencesPerChunk?: number;
  overlapSentences?: number;
}

export class SentenceChunker implements TextChunker {
  private sentencesPerChunk: number;
  private overlapSentences: number;

  constructor(sentencesPerChunk = 5, overlapSentences = 1) {
    this.sentencesPerChunk = sentencesPerChunk;
    this.overlapSentences = overlapSentences;
  }

  async chunk(text: string, options?: SentenceChunkOptions): Promise<Chunk[]> {
    const splitter = getSentenceSplitter();
    const sentences = await splitter.split(text);

    if (sentences.length === 0) {
      return [];
    }

    const units = options?.sentencesPerChunk || this.sentencesPerChunk;
    let overlap = options?.overlapSentences || this.overlapSentences;

    // If only one sentence or units covers all, return single chunk
    if (units >= sentences.length || units === 0) {
      return [{
        id: 'chunk-1',
        content: text,
        contentWithoutOverlap: text,
        index: 1,
        startPosition: 0,
        endPosition: text.length,
      }];
    }

    // Ensure overlap is less than units
    if (overlap >= units) {
      overlap = units - 1;
    }

    const chunks: Chunk[] = [];
    let i = 0;

    while (i < sentences.length) {
      const startIdx = i;
      const endIdx = Math.min(i + units, sentences.length);
      // nonOverlapEnd marks where the non-overlapping content ends (overlap begins after this)
      const nonOverlapEnd = Math.max(startIdx, endIdx - overlap);

      // Get sentences for this chunk
      const chunkSentences = sentences.slice(startIdx, endIdx);
      const withoutOverlapSentences = sentences.slice(startIdx, nonOverlapEnd);

      // Build content
      const content = chunkSentences.map(s => s.text).join(' ');
      const contentWithoutOverlap = withoutOverlapSentences.length > 0
        ? withoutOverlapSentences.map(s => s.text).join(' ')
        : content;

      // Get positions from original text
      const startPosition = chunkSentences[0].start;
      const endPosition = chunkSentences[chunkSentences.length - 1].end;

      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        content,
        contentWithoutOverlap,
        index: chunks.length + 1,
        startPosition,
        endPosition,
      });

      // Exit if we've processed all sentences
      if (endIdx >= sentences.length) break;

      // Move forward, considering overlap
      i += units - overlap;
    }

    return chunks;
  }

  getDefaultChunkSize(): number {
    return this.sentencesPerChunk;
  }

  getDefaultOverlap(): number {
    return this.overlapSentences;
  }

  getName(): string {
    return 'SentenceChunker';
  }
}

/**
 * Create a new SentenceChunker instance.
 * Unlike singleton patterns, this creates a fresh instance each time,
 * which is appropriate for lightweight utility classes.
 */
export function createSentenceChunker(
  sentencesPerChunk = 5,
  overlapSentences = 1
): SentenceChunker {
  return new SentenceChunker(sentencesPerChunk, overlapSentences);
}
