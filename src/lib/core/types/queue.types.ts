/**
 * Job status for queue processing.
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Queue job with status tracking.
 */
export interface QueueJob {
  id: string;
  status: JobStatus;
  progress?: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Upload job payload for OCR processing.
 */
export interface UploadJobPayload {
  fileBuffer: Buffer;
  fileName: string;
  fileType: string;
  fileSize: number;
  userId: string;
  namespace: string;
}
