import axios from 'axios';
import { Embedder } from '@/lib/core/interfaces';
import { EmbeddingResult, EmbeddingOptions } from '@/lib/core/types';
import { configService } from '../config';

/**
 * Saptiva API embedder implementation.
 * Generates embeddings using the Saptiva embedding API.
 */
export class SaptivaEmbedder implements Embedder {
  private config = configService.getEmbeddingConfig();

  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const response = await axios.post(
      this.config.apiUrl,
      {
        model: options?.model || this.config.model,
        prompt: text,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        timeout: 30000,
      }
    );

    if (!response.data?.embeddings || !Array.isArray(response.data.embeddings)) {
      throw new Error('Invalid embedding response format');
    }

    return {
      embedding: response.data.embeddings,
    };
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    // Process sequentially with delay to avoid rate limiting
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i++) {
      if (i > 0) {
        // 500ms delay between requests to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const result = await this.embed(texts[i], options);
      results.push(result);
    }

    return results;
  }

  getDimensions(): number {
    return this.config.dimensions;
  }

  getName(): string {
    return 'SaptivaEmbedder';
  }
}

// Singleton instance
let embedderInstance: SaptivaEmbedder | null = null;

export function getSaptivaEmbedder(): SaptivaEmbedder {
  if (!embedderInstance) {
    embedderInstance = new SaptivaEmbedder();
  }
  return embedderInstance;
}
