import { JobQueue } from '@/lib/core/interfaces';
import { QueueJob, UploadJobPayload } from '@/lib/core/types';
import { readerFactory } from '../readers/reader-factory';
import { OcrPdfReader } from '../readers/ocr-pdf-reader';
import { SentenceChunker } from '../chunkers/sentence-chunker';
import { SaptivaEmbedder } from '../embedders/saptiva-embedder';
import { weaviateClient } from '../weaviate-client';
import { connectToDatabase } from '@/lib/mongodb/client';

/**
 * Background queue for document upload processing.
 * Processes jobs one at a time without blocking the API.
 * Handles all document types (PDF, DOCX, TXT, etc.) with progress tracking.
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
   * Process a single job (document processing pipeline).
   */
  private async processJob(job: QueueJob, payload: UploadJobPayload): Promise<void> {
    const { fileBuffer, fileName, fileType, fileSize, userId, namespace, useOcr } = payload;

    // 1. Extract text using appropriate reader
    job.stage = 'extracting';
    job.progress = 10;
    this.jobs.set(job.id, job);

    // Select reader: OCR for PDFs when useOcr=true, otherwise auto-detect
    const isPdf = fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    let readerName: string;

    if (isPdf && useOcr) {
      readerName = 'OcrPdfReader';
    } else if (isPdf) {
      readerName = 'FastPdfReader';
    } else {
      // For non-PDFs, use auto-detection (will be handled by creating a File object)
      readerName = 'auto';
    }

    console.log(`[Queue] ${job.id}: Extracting text using ${readerName}...`);

    let extracted: { content: string };

    // Convert Buffer to Uint8Array for File constructor compatibility
    const uint8Array = new Uint8Array(fileBuffer);

    if (readerName === 'auto') {
      // Create a File-like object for the reader factory
      const file = new File([uint8Array], fileName, { type: fileType });
      const reader = readerFactory.getReader(file);
      extracted = await reader.extract(file);
    } else if (readerName === 'OcrPdfReader') {
      // OCR reader with progress callback
      const ocrReader = new OcrPdfReader();
      extracted = await ocrReader.extractFromBuffer(
        fileBuffer,
        { filename: fileName, fileType: fileType, fileSize: fileSize },
        (currentPage, totalPages, percent) => {
          // Update job progress during OCR
          job.progress = percent;
          job.ocrPage = currentPage;
          job.ocrTotalPages = totalPages;
          this.jobs.set(job.id, job);
        }
      );
    } else {
      const reader = readerFactory.getReaderByName(readerName);
      // Use extractFromBuffer if available, otherwise create File
      if ('extractFromBuffer' in reader && typeof reader.extractFromBuffer === 'function') {
        extracted = await reader.extractFromBuffer(fileBuffer, {
          filename: fileName,
          fileType: fileType,
          fileSize: fileSize,
        });
      } else {
        const file = new File([uint8Array], fileName, { type: fileType });
        extracted = await reader.extract(file);
      }
    }

    job.progress = 30;
    this.jobs.set(job.id, job);

    // 2. Chunking
    job.stage = 'chunking';
    job.progress = 35;
    this.jobs.set(job.id, job);
    console.log(`[Queue] ${job.id}: Chunking text...`);

    // Use 15 sentences per chunk (approx ~1000 chars like old version) to reduce API calls
    const chunker = new SentenceChunker(15, 2);
    const chunks = await chunker.chunk(extracted.content, {});
    job.progress = 50;
    this.jobs.set(job.id, job);

    // 4. Embeddings
    job.stage = 'embedding';
    job.progress = 55;
    this.jobs.set(job.id, job);
    console.log(`[Queue] ${job.id}: Generating embeddings for ${chunks.length} chunks...`);

    const embedder = new SaptivaEmbedder();
    const embeddings = await embedder.embedBatch(chunks.map(c => c.content));
    job.progress = 80;
    this.jobs.set(job.id, job);

    // 5. Save to Weaviate (shared collection)
    job.stage = 'saving';
    job.progress = 82;
    this.jobs.set(job.id, job);

    await weaviateClient.ensureCollectionExists();

    // Delete existing chunks with same sourceName (replace behavior)
    const deletedCount = await weaviateClient.deleteByFilter('sourceName', fileName);
    if (deletedCount > 0) {
      console.log(`[Queue] ${job.id}: Replaced existing document "${fileName}" (${deletedCount} chunks deleted)`);
    } else {
      console.log(`[Queue] ${job.id}: Saving new document "${fileName}"...`);
    }

    job.progress = 85;
    this.jobs.set(job.id, job);

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
        language: 'es', // Default to Spanish
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
          language: 'es',
          chunkerUsed: 'SentenceChunker',
        },
      }
    );

    job.stage = 'done';
    job.progress = 100;
    job.result = { chunks: chunks.length };
  }
}

// Singleton instance
export const uploadQueue = new UploadQueue();
