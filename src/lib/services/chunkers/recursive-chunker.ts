import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { TextChunker } from '@/lib/core/interfaces';
import { Chunk, ChunkOptions } from '@/lib/core/types';

/**
 * Recursive character text chunker.
 * Uses LangChain's RecursiveCharacterTextSplitter for intelligent text splitting.
 *
 * Use for: OCR PDFs, images, unreliable text sources
 * Rationale: OCR output often lacks reliable sentence delimiters. Size-based chunking ensures consistent context windows.
 */

export class RecursiveChunker implements TextChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize = 1000, chunkOverlap = 150) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  async chunk(text: string, options?: ChunkOptions): Promise<Chunk[]> {
    const chunkSize = options?.chunkSize || this.chunkSize;
    const chunkOverlap = options?.chunkOverlap || this.chunkOverlap;
    const separators = options?.separators || ['\n\n', '\n', '. ', ', ', ' ', ''];

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators,
    });

    const splitTexts = await splitter.splitText(text.trim());

    // Track position for startPosition/endPosition
    let position = 0;

    return splitTexts.map((content, index) => {
      // Calculate content without overlap (for sequential chunk optimization)
      const overlapChars = index > 0 ? Math.min(chunkOverlap, content.length) : 0;
      const contentWithoutOverlap = content.slice(overlapChars);

      const chunk: Chunk = {
        id: `chunk-${index + 1}`,
        content,
        contentWithoutOverlap: contentWithoutOverlap || content,
        index: index + 1,
        startPosition: position,
        endPosition: position + content.length,
      };

      // Move position forward (accounting for overlap)
      // Guard against negative drift if chunk is shorter than overlap
      position += Math.max(0, content.length - chunkOverlap);

      return chunk;
    });
  }

  getDefaultChunkSize(): number {
    return this.chunkSize;
  }

  getDefaultOverlap(): number {
    return this.chunkOverlap;
  }

  getName(): string {
    return 'RecursiveChunker';
  }
}

/**
 * Create a RecursiveChunker with OCR-optimized defaults.
 */
export function createRecursiveChunker(
  chunkSize = 1000,
  chunkOverlap = 150
): RecursiveChunker {
  return new RecursiveChunker(chunkSize, chunkOverlap);
}
