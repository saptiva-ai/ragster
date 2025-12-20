import { TextChunker } from '@/lib/core/interfaces';
import { Chunk, ChunkOptions } from '@/lib/core/types';
import { RecursiveChunker } from './recursive-chunker';

/**
 * Q&A-Aware Chunker
 *
 * Detects FAQ-style documents and keeps Q+A pairs as atomic units.
 * Falls back to RecursiveChunker for non-Q&A content.
 *
 * Benefits:
 * - BM25 matches question → gets full answer in same chunk
 * - No need for context expansion on FAQ docs
 * - Direct retrieval instead of hoping adjacent chunks have the answer
 */

export interface QAPair {
  question: string;
  answer: string;
  startPos: number;
  endPos: number;
}

export interface QADetectionResult {
  isQA: boolean;
  pairs: QAPair[];
  coverage: number;
  nonQAContent: string;  // Content outside Q&A pairs
}

// Minimum coverage to treat document as Q&A format
const QA_COVERAGE_THRESHOLD = 0.6;  // 60% of doc must be Q&A pairs

// Minimum Q&A pairs to trigger Q&A mode
const MIN_QA_PAIRS = 3;

// Max characters per Q&A answer - skip oversized pairs but keep valid ones
const MAX_ANSWER_CHARS = 3000;

/**
 * Detect Q&A structure in text.
 *
 * Patterns supported:
 * - ¿Pregunta? Respuesta (Spanish)
 * - Question? Answer (English)
 * - Answers can include bullet lists (●, •, -, *)
 */
export function detectQAStructure(text: string): QADetectionResult {
  const pairs: QAPair[] = [];
  const matchedRanges: Array<{ start: number; end: number }> = [];

  // Pattern: ¿Question? followed by answer (may include bullets)
  // Capture question with ¿...? and everything until next ¿ or end
  const spanishQAPattern = /(?<question>¿[^?]+\?)\s*\n?(?<answer>(?:(?!¿)[^\n]|\n(?!¿))+)/g;

  // Pattern: Question? followed by answer (English style, must start with capital)
  const englishQAPattern = /(?<question>[A-Z][^?]*\?)\s*\n?(?<answer>(?:(?![A-Z][^?]*\?)[^\n]|\n(?![A-Z][^?]*\?))+)/g;

  // Try Spanish pattern first (priority for your docs)
  let match: RegExpExecArray | null;
  spanishQAPattern.lastIndex = 0;

  while ((match = spanishQAPattern.exec(text)) !== null) {
    const question = match.groups?.question?.trim();
    const answer = match.groups?.answer?.trim();

    if (question && answer && answer.length > 20) {  // Answer must be substantive
      // Clean up answer: remove trailing whitespace
      const cleanAnswer = answer
        .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines
        .trim();

      // Skip if answer is too long (not a real FAQ - probably grabbed entire doc)
      if (cleanAnswer.length > MAX_ANSWER_CHARS) {
        console.warn(`[QnAChunker] Skipping Q&A pair - answer too long (${cleanAnswer.length} chars)`);
        continue;
      }

      pairs.push({
        question,
        answer: cleanAnswer,
        startPos: match.index,
        endPos: match.index + match[0].length,
      });

      matchedRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // If no Spanish Q&A found, try English pattern
  if (pairs.length < MIN_QA_PAIRS) {
    englishQAPattern.lastIndex = 0;

    while ((match = englishQAPattern.exec(text)) !== null) {
      const question = match.groups?.question?.trim();
      const answer = match.groups?.answer?.trim();

      if (question && answer && answer.length > 20) {
        const matchIndex = match.index;
        const matchLength = match[0].length;

        // Check if this range already matched by Spanish pattern
        const alreadyMatched = matchedRanges.some(r =>
          matchIndex >= r.start && matchIndex < r.end
        );

        if (!alreadyMatched) {
          const cleanAnswer = answer
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          // Skip if answer is too long (not a real FAQ)
          if (cleanAnswer.length > MAX_ANSWER_CHARS) {
            console.warn(`[QnAChunker] Skipping Q&A pair - answer too long (${cleanAnswer.length} chars)`);
            continue;
          }

          pairs.push({
            question,
            answer: cleanAnswer,
            startPos: matchIndex,
            endPos: matchIndex + matchLength,
          });

          matchedRanges.push({
            start: matchIndex,
            end: matchIndex + matchLength,
          });
        }
      }
    }
  }

  // Sort pairs by position
  pairs.sort((a, b) => a.startPos - b.startPos);

  // Calculate coverage
  const qaChars = pairs.reduce((sum, p) => sum + p.question.length + p.answer.length, 0);
  const coverage = text.length > 0 ? qaChars / text.length : 0;

  // Extract non-Q&A content (for hybrid chunking)
  let nonQAContent = '';
  let lastEnd = 0;

  for (const range of matchedRanges.sort((a, b) => a.start - b.start)) {
    if (range.start > lastEnd) {
      nonQAContent += text.slice(lastEnd, range.start);
    }
    lastEnd = Math.max(lastEnd, range.end);
  }
  if (lastEnd < text.length) {
    nonQAContent += text.slice(lastEnd);
  }

  // Determine if document should be treated as Q&A
  const isQA = pairs.length >= MIN_QA_PAIRS && coverage >= QA_COVERAGE_THRESHOLD;

  return {
    isQA,
    pairs,
    coverage,
    nonQAContent: nonQAContent.trim(),
  };
}

/**
 * Q&A-Aware Chunker
 *
 * When document is detected as FAQ format (>40% Q&A pairs, 3+ pairs):
 * - Each Q+A pair becomes one chunk
 * - Non-Q&A content is chunked normally
 *
 * Otherwise: Falls back to RecursiveChunker
 */
export class QnAChunker implements TextChunker {
  private chunkSize: number;
  private chunkOverlap: number;
  private fallback: RecursiveChunker;

  constructor(chunkSize = 1200, chunkOverlap = 150) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.fallback = new RecursiveChunker(chunkSize, chunkOverlap);
  }

  async chunk(text: string, options?: ChunkOptions): Promise<Chunk[]> {
    const detection = detectQAStructure(text);

    // Force QnA mode if filename contains "QNA" (case insensitive)
    const filename = options?.filename || '';
    const forceQnA = /qna/i.test(filename);

    // Use QnA mode if: forced by filename OR meets coverage threshold
    const useQnAMode = forceQnA || detection.isQA;

    if (!useQnAMode || detection.pairs.length === 0) {
      // Not Q&A format → use standard chunker
      console.log(`[QnAChunker] Not FAQ format (${detection.pairs.length} pairs, ${(detection.coverage * 100).toFixed(0)}% coverage) → using RecursiveChunker`);
      return this.fallback.chunk(text, options);
    }

    const reason = forceQnA ? 'filename contains QNA' : `${(detection.coverage * 100).toFixed(0)}% coverage`;
    console.log(`[QnAChunker] Detected FAQ: ${detection.pairs.length} Q&A pairs (${reason})`);

    const chunks: Chunk[] = [];
    let chunkIndex = 1;

    // Create chunks for Q&A pairs
    for (const pair of detection.pairs) {
      const content = `${pair.question}\n${pair.answer}`;

      chunks.push({
        id: `qa-${chunkIndex}`,
        content,
        contentWithoutOverlap: content,  // No overlap for Q&A chunks
        index: chunkIndex,
        startPosition: pair.startPos,
        endPosition: pair.endPos,
        metadata: {
          isQAPair: true,
          questionText: pair.question,
        },
      });

      chunkIndex++;
    }

    // If there's significant non-Q&A content, chunk it too
    if (detection.nonQAContent.length > 200) {
      console.log(`[QnAChunker] Also chunking ${detection.nonQAContent.length} chars of non-Q&A content`);

      const nonQAChunks = await this.fallback.chunk(detection.nonQAContent, options);

      for (const chunk of nonQAChunks) {
        chunks.push({
          ...chunk,
          id: `content-${chunkIndex}`,
          index: chunkIndex,
          metadata: {
            isQAPair: false,
          },
        });
        chunkIndex++;
      }
    }

    console.log(`[QnAChunker] Created ${chunks.length} chunks (${detection.pairs.length} Q&A + ${chunks.length - detection.pairs.length} regular)`);

    return chunks;
  }

  getDefaultChunkSize(): number {
    return this.chunkSize;
  }

  getDefaultOverlap(): number {
    return this.chunkOverlap;
  }

  getName(): string {
    return 'QnAChunker';
  }
}

/**
 * Create a QnAChunker with custom settings
 */
export function createQnAChunker(
  chunkSize = 1200,
  chunkOverlap = 150
): QnAChunker {
  return new QnAChunker(chunkSize, chunkOverlap);
}
