import axios from 'axios';
import { Embedder } from '@/lib/core/interfaces';
import { EmbeddingResult, EmbeddingOptions } from '@/lib/core/types';
import { configService } from '../config';

// Max characters for embedding - Saptiva API limit
const MAX_EMBED_CHARS = 8000;

/**
 * Saptiva API embedder implementation.
 * Uses MRL (Matryoshka Representation Learning) truncation:
 * - Regular chunks: 512d (faster search, less storage)
 * - QnA chunks: 1024d (full precision)
 */
export class SaptivaEmbedder implements Embedder {
  private config = configService.getEmbeddingConfig();

  /**
   * Get embedding truncated to configured dimensions (512d for regular chunks).
   * Uses MRL - first N dimensions preserve semantic meaning.
   */
  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const fullEmbedding = await this.embedFullInternal(text, options);
    // MRL truncation: slice to configured dimensions
    return {
      embedding: fullEmbedding.slice(0, this.config.dimensions),
    };
  }

  /**
   * Get full embedding without truncation (1024d for QnA chunks).
   */
  async embedFull(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const fullEmbedding = await this.embedFullInternal(text, options);
    return {
      embedding: fullEmbedding,
    };
  }

  /**
   * Internal: fetch full embedding from API.
   */
  private async embedFullInternal(text: string, options?: EmbeddingOptions): Promise<number[]> {
    // Truncate if too long for API
    let processedText = text;
    if (text.length > MAX_EMBED_CHARS) {
      console.warn(`[Embedder] Text too long (${text.length} chars), truncating to ${MAX_EMBED_CHARS}`);
      processedText = text.slice(0, MAX_EMBED_CHARS);
    }

    try {
      const response = await axios.post(
        this.config.apiUrl,
        {
          model: options?.model || this.config.model,
          prompt: processedText,
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

      return response.data.embeddings;
    } catch (error) {
      // Log details for debugging 500 errors
      const textPreview = processedText.length > 200 ? processedText.slice(0, 200) + '...' : processedText;
      console.error(`[Embedder] ❌ API Error:`, {
        status: (error as {response?: {status?: number}}).response?.status,
        statusText: (error as {response?: {statusText?: string}}).response?.statusText,
        responseData: (error as {response?: {data?: unknown}}).response?.data,
        originalLength: text.length,
        sentLength: processedText.length,
        textPreview,
      });
      throw error;
    }
  }

  async embedBatch(
    texts: string[],
    options?: EmbeddingOptions,
    onProgress?: (completed: number, total: number) => void
  ): Promise<EmbeddingResult[]> {
    const total = texts.length;
    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES = 100;

    console.log(`[Embedder] Starting batch: ${total} texts (parallel batches of ${BATCH_SIZE})`);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(text => this.embed(text, options));

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        const completed = Math.min(i + BATCH_SIZE, total);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const percent = Math.round((completed / total) * 100);
        console.log(`[Embedder] Progress: ${completed}/${total} (${percent}%) - ${elapsed}s elapsed`);

        // Report progress to callback
        if (onProgress) {
          onProgress(completed, total);
        }

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

  /**
   * Batch embed with full dimensions (for QnA).
   */
  async embedBatchFull(
    texts: string[],
    options?: EmbeddingOptions,
    onProgress?: (completed: number, total: number) => void
  ): Promise<EmbeddingResult[]> {
    const total = texts.length;
    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES = 100;

    console.log(`[Embedder] Starting QnA batch: ${total} texts (full ${this.config.qnaDimensions}d)`);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(text => this.embedFull(text, options));

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        const completed = Math.min(i + BATCH_SIZE, total);
        if (onProgress) {
          onProgress(completed, total);
        }

        if (i + BATCH_SIZE < texts.length) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      } catch (error) {
        console.error(`[Embedder] ❌ Failed QnA batch at ${i + 1}:`, error instanceof Error ? error.message : error);
        throw error;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Embedder] ✅ QnA batch complete: ${total} embeddings in ${totalTime}s`);

    return results;
  }

  getDimensions(): number {
    return this.config.dimensions;
  }

  getQnADimensions(): number {
    return this.config.qnaDimensions;
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
