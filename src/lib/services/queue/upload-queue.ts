import { JobQueue } from '@/lib/core/interfaces';
import { QueueJob, UploadJobPayload } from '@/lib/core/types';
import { readerFactory } from '../readers/reader-factory';
import { OcrPdfReader } from '../readers/ocr-pdf-reader';
import { ImageReader } from '../readers/image-reader';
import { QnAChunker } from '../chunkers/qna-chunker';
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

    // Select reader based on file type
    const isPdf = fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const isImage = fileType.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(fileName);
    let readerName: string;

    if (isPdf && useOcr) {
      readerName = 'OcrPdfReader';
    } else if (isPdf) {
      readerName = 'FastPdfReader';
    } else if (isImage) {
      // Images always use OCR (ImageReader uses Saptiva OCR)
      readerName = 'ImageReader';
    } else {
      // For other files (DOCX, TXT, etc.), use auto-detection
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
    } else if (readerName === 'ImageReader') {
      // Image reader uses OCR automatically
      const imageReader = new ImageReader();
      console.log(`[Queue] ${job.id}: Processing image with OCR...`);
      extracted = await imageReader.extractFromBuffer(fileBuffer, {
        filename: fileName,
        fileType: fileType,
        fileSize: fileSize,
      });
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

    // 2. Chunking - use Q&A-aware chunker (auto-detects FAQ format)
    job.stage = 'chunking';
    job.progress = 35;
    this.jobs.set(job.id, job);

    // QnAChunker: Detects FAQ-style documents and keeps Q+A pairs as atomic units
    // Falls back to RecursiveChunker for non-Q&A content
    //
    // Config: 1200 chars per chunk, 150 char overlap (for non-Q&A content)
    // Q&A pairs: Each Q+A becomes one chunk (may exceed 1200 chars, that's OK)
    // If filename contains "QNA", force QnA mode
    const chunker = new QnAChunker(1200, 150);
    const chunks = await chunker.chunk(extracted.content, { filename: fileName });
    const chunkerName = chunker.getName();

    console.log(`[Queue] ${job.id}: Chunking with ${chunkerName}...`);

    // Check if no content was extracted
    if (chunks.length === 0) {
      const isUsingOcr = readerName === 'OcrPdfReader' || readerName === 'ImageReader';
      if (isUsingOcr) {
        throw new Error(
          `No se pudo extraer contenido del documento "${fileName}" incluso usando OCR. ` +
          `El archivo puede estar dañado o no contener texto legible.`
        );
      } else {
        throw new Error(
          `No se pudo extraer contenido del documento "${fileName}". ` +
          `El archivo puede ser un PDF escaneado (imagen). ` +
          `Intente subir el archivo nuevamente con la opción OCR activada.`
        );
      }
    }

    job.progress = 50;
    this.jobs.set(job.id, job);

    // 4. Split chunks into QnA and regular
    const qnaChunks: Array<{ chunk: typeof chunks[0]; index: number }> = [];
    const regularChunks: Array<{ chunk: typeof chunks[0]; index: number }> = [];

    chunks.forEach((chunk, index) => {
      if (chunk.metadata?.isQAPair) {
        qnaChunks.push({ chunk, index });
      } else {
        regularChunks.push({ chunk, index });
      }
    });

    console.log(`[Queue] ${job.id}: Split ${chunks.length} chunks → ${regularChunks.length} regular (1024d), ${qnaChunks.length} QnA (1024d)`);

    // 5. Generate embeddings (different dimensions for each type)
    job.stage = 'embedding';
    job.progress = 55;
    job.embeddingProgress = 0;
    job.embeddingTotal = chunks.length;
    this.jobs.set(job.id, job);

    const embedder = new SaptivaEmbedder();
    const allEmbeddings: Array<{ embedding: number[] }> = new Array(chunks.length);

    // Embed regular chunks (1024d)
    if (regularChunks.length > 0) {
      const regularEmbeddings = await embedder.embedBatch(
        regularChunks.map(c => c.chunk.content),
        undefined,
        (completed) => {
          job.embeddingProgress = completed;
          job.progress = 55 + Math.round((completed / chunks.length) * 15);
          this.jobs.set(job.id, job);
        }
      );
      regularChunks.forEach((item, i) => {
        allEmbeddings[item.index] = regularEmbeddings[i];
      });
    }

    // Embed QnA chunks (1024d - full precision)
    if (qnaChunks.length > 0) {
      const qnaEmbeddings = await embedder.embedBatchFull(
        qnaChunks.map(c => c.chunk.content),
        undefined,
        (completed) => {
          job.embeddingProgress = regularChunks.length + completed;
          job.progress = 70 + Math.round((completed / chunks.length) * 10);
          this.jobs.set(job.id, job);
        }
      );
      qnaChunks.forEach((item, i) => {
        allEmbeddings[item.index] = qnaEmbeddings[i];
      });
    }

    job.progress = 80;
    this.jobs.set(job.id, job);

    // 6. Save to Weaviate (both collections)
    job.stage = 'saving';
    job.progress = 82;
    this.jobs.set(job.id, job);

    await weaviateClient.ensureBothCollectionsExist();

    // Delete existing chunks with same sourceName from BOTH collections
    const [deletedRegular, deletedQnA] = await Promise.all([
      weaviateClient.deleteByFilter('sourceName', fileName),
      weaviateClient.deleteByFilterQnA('sourceName', fileName),
    ]);
    if (deletedRegular + deletedQnA > 0) {
      console.log(`[Queue] ${job.id}: Replaced existing "${fileName}" (${deletedRegular} regular + ${deletedQnA} QnA deleted)`);
    }

    job.progress = 85;
    this.jobs.set(job.id, job);

    // Build objects for each collection
    const buildObject = (chunk: typeof chunks[0], index: number) => ({
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
        language: 'es',
        startPosition: chunk.startPosition ?? 0,
        endPosition: chunk.endPosition ?? chunk.content.length,
        contentWithoutOverlap: chunk.contentWithoutOverlap ?? chunk.content,
        chunkerUsed: chunkerName,
        isQAPair: chunk.metadata?.isQAPair ?? false,
        questionText: chunk.metadata?.questionText ?? null,
      },
      vector: allEmbeddings[index].embedding,
    });

    const regularObjects = regularChunks.map(item => buildObject(item.chunk, item.index));
    const qnaObjects = qnaChunks.map(item => buildObject(item.chunk, item.index));

    // Insert into respective collections
    await Promise.all([
      regularObjects.length > 0 ? weaviateClient.insertBatch(regularObjects) : Promise.resolve(),
      qnaObjects.length > 0 ? weaviateClient.insertBatchQnA(qnaObjects) : Promise.resolve(),
    ]);

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
          chunkerUsed: chunkerName,
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
