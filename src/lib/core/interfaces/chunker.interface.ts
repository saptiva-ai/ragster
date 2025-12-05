import { Chunk, ChunkOptions } from '../types/chunk.types';

export interface TextChunker {
  /**
   * Split text into chunks
   */
  chunk(text: string, options?: ChunkOptions): Promise<Chunk[]>;

  /**
   * Get default chunk size
   */
  getDefaultChunkSize(): number;

  /**
   * Get default overlap
   */
  getDefaultOverlap(): number;

  /**
   * Chunker name
   */
  getName(): string;
}
