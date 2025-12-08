import { JobQueue } from '@/lib/core/interfaces';
import { QueueJob, UploadJobPayload } from '@/lib/core/types';
import { OcrPdfReader } from '../readers/ocr-pdf-reader';
import { SentenceChunker } from '../chunkers/sentence-chunker';
import { SaptivaEmbedder } from '../embedders/saptiva-embedder';
import { getLanguageDetector } from '../nlp/language-detector';
import { weaviateClient } from '../weaviate-client';
import { connectToDatabase } from '@/lib/mongodb/client';

/**
 * Background queue for OCR upload processing.
 * Processes jobs one at a time without blocking the API.
 */
class UploadQueue implements JobQueue<UploadJobPayload> {
  private jobs: Map<string, QueueJob> = new Map();
  private payloads: Map<string, UploadJobPayload> = new Map();
  private queue: string[] = [];
  private processing: boolean = false;

  /**
   * Add a job to the queue.
   */
  add(payload: UploadJobPayload): string {
    const id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job: QueueJob = {
      id,
      status: 'pending',
      createdAt: new Date(),
    };

    this.jobs.set(id, job);
    this.payloads.set(id, payload);
    this.queue.push(id);

    console.log(`[Queue] Added job ${id} for ${payload.fileName}`);

    // Start processing if not already running
    this.startProcessing();

    return id;
  }

  /**
   * Get job status by ID.
   */
  getStatus(id: string): QueueJob | null {
    return this.jobs.get(id) || null;
  }

  /**
   * Get queue size.
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Start background processing loop.
   */
  private startProcessing(): void {
    if (this.processing) return;
    this.processing = true;
    this.processNext();
  }

  /**
   * Process next job in queue.
   */
  private processNext(): void {
    const jobId = this.queue.shift();

    if (!jobId) {
      this.processing = false;
      return;
    }

    const job = this.jobs.get(jobId);
    const payload = this.payloads.get(jobId);

    if (!job || !payload) {
      this.processNext();
      return;
    }

    // Update status to processing
    job.status = 'processing';
    this.jobs.set(jobId, job);

    console.log(`[Queue] Processing job ${jobId}`);

    // Process in next tick to not block
    setImmediate(async () => {
      try {
        await this.processJob(job, payload);
        job.status = 'completed';
        job.completedAt = new Date();
        console.log(`[Queue] Job ${jobId} completed`);
      } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = new Date();
        console.error(`[Queue] Job ${jobId} failed:`, error);
      }

      this.jobs.set(jobId, job);
      this.payloads.delete(jobId); // Clean up payload

      // Continue processing
      setImmediate(() => this.processNext());
    });
  }

  /**
   * Process a single job (OCR pipeline).
   */
  private async processJob(job: QueueJob, payload: UploadJobPayload): Promise<void> {
    const { fileBuffer, fileName, fileType, fileSize, userId, namespace } = payload;

    // 1. OCR extraction (pass Buffer directly - no wasteful conversions)
    const reader = new OcrPdfReader();
    const extracted = await reader.extractFromBuffer(fileBuffer, {
      filename: fileName,
      fileType: fileType,
      fileSize: fileSize,
    });
    job.progress = 30;
    this.jobs.set(job.id, job);

    // 2. Language detection
    const languageDetector = getLanguageDetector();
    const langResult = await languageDetector.detect(extracted.content);
    job.progress = 40;
    this.jobs.set(job.id, job);

    // 3. Chunking
    const chunker = new SentenceChunker(5, 1);
    const chunks = await chunker.chunk(extracted.content, {});
    job.progress = 50;
    this.jobs.set(job.id, job);

    // 4. Embeddings
    const embedder = new SaptivaEmbedder();
    const embeddings = await embedder.embedBatch(chunks.map(c => c.content));
    job.progress = 80;
    this.jobs.set(job.id, job);

    // 5. Insert into Weaviate (shared collection)
    await weaviateClient.ensureCollectionExists();

    const objects = chunks.map((chunk, index) => ({
      properties: {
        text: chunk.content,
        chunkIndex: index + 1,
        totalChunks: chunks.length,
        prevChunkIndex: index > 0 ? index : null,
        nextChunkIndex: index < chunks.length - 1 ? index + 2 : null,
        sourceName: fileName,
        sourceType: fileType,
        sourceSize: fileSize.toString(),
        uploadDate: new Date().toISOString(),
        sourceNamespace: namespace,
        userId,
        language: langResult.language,
        startPosition: chunk.startPosition ?? 0,
        endPosition: chunk.endPosition ?? chunk.content.length,
        contentWithoutOverlap: chunk.contentWithoutOverlap ?? chunk.content,
        chunkerUsed: 'SentenceChunker',
      },
      vector: embeddings[index].embedding,
    }));

    await weaviateClient.insertBatch(objects);
    job.progress = 90;
    this.jobs.set(job.id, job);

    // 6. Update MongoDB
    const { db } = await connectToDatabase();
    await db.collection('file').updateOne(
      { filename: fileName, userId },
      {
        $set: {
          chunks: chunks.length,
          vectorsUploaded: chunks.length,
          status: 2,
          language: langResult.language,
          chunkerUsed: 'SentenceChunker',
        },
      }
    );

    job.progress = 100;
    job.result = { chunks: chunks.length, language: langResult.language };
  }
}

// Singleton instance
export const uploadQueue = new UploadQueue();
