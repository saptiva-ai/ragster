/**
 * Job status for queue processing.
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Processing stage for user feedback.
 */
export type ProcessingStage = 'queued' | 'extracting' | 'chunking' | 'embedding' | 'saving' | 'done';

/**
 * Queue job with status tracking.
 */
export interface QueueJob {
  id: string;
  status: JobStatus;
  progress?: number;
  stage?: ProcessingStage;
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  // OCR-specific progress info
  ocrPage?: number;
  ocrTotalPages?: number;
  // Embedding progress info
  embeddingProgress?: number;
  embeddingTotal?: number;
}

/**
 * Upload job payload for document processing.
 */
export interface UploadJobPayload {
  fileBuffer: Buffer;
  fileName: string;
  fileType: string;
  fileSize: number;
  userId: string;
  namespace: string;
  useOcr?: boolean; // If true, use OCR reader; if false, use fast reader
}
