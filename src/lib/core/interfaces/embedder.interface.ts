import { EmbeddingResult, EmbeddingOptions } from '../types/embedding.types';

export interface Embedder {
  /**
   * Generate embedding for a single text
   */
  embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]>;

  /**
   * Get embedding dimensions
   */
  getDimensions(): number;

  /**
   * Embedder name
   */
  getName(): string;
}
