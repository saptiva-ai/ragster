import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { TextChunker } from '@/lib/core/interfaces';
import { Chunk, ChunkOptions } from '@/lib/core/types';
import { configService } from '../config';

/**
 * Recursive character text chunker.
 * Uses LangChain's RecursiveCharacterTextSplitter for intelligent text splitting.
 */
export class RecursiveChunker implements TextChunker {
  private config = configService.getChunkingConfig();

  async chunk(text: string, options?: ChunkOptions): Promise<Chunk[]> {
    const chunkSize = options?.chunkSize || this.config.defaultChunkSize;
    const chunkOverlap = options?.chunkOverlap || this.config.defaultOverlap;
    const separators = options?.separators || ['\n\n', '\n', ' ', ''];

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators,
    });

    const splitTexts = await splitter.splitText(text.trim());

    return splitTexts.map((content, index) => ({
      id: `chunk-${index + 1}`,
      content,
      index: index + 1,
    }));
  }

  getDefaultChunkSize(): number {
    return this.config.defaultChunkSize;
  }

  getDefaultOverlap(): number {
    return this.config.defaultOverlap;
  }

  getName(): string {
    return 'RecursiveChunker';
  }
}

// Singleton instance
let chunkerInstance: RecursiveChunker | null = null;

export function getRecursiveChunker(): RecursiveChunker {
  if (!chunkerInstance) {
    chunkerInstance = new RecursiveChunker();
  }
  return chunkerInstance;
}
