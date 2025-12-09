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
    const total = texts.length;
    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    const BATCH_SIZE = 10; // Process 10 texts in parallel
    const DELAY_BETWEEN_BATCHES = 100; // 100ms delay between batches

    console.log(`[Embedder] Starting batch: ${total} texts (parallel batches of ${BATCH_SIZE})`);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const batchPromises = batch.map(text => this.embed(text, options));

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Log progress
        const completed = Math.min(i + BATCH_SIZE, total);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const percent = Math.round((completed / total) * 100);
        console.log(`[Embedder] Progress: ${completed}/${total} (${percent}%) - ${elapsed}s elapsed`);

        // Small delay between batches to avoid overwhelming the API
        if (i + BATCH_SIZE < texts.length) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      } catch (error) {
        console.error(`[Embedder] ❌ Failed at batch starting ${i + 1}:`, error instanceof Error ? error.message : error);
        throw error;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Embedder] ✅ Complete: ${total} embeddings in ${totalTime}s`);

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
