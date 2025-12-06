import { QueueJob } from '../types/queue.types';

/**
 * Generic job queue interface.
 */
export interface JobQueue<T> {
  /**
   * Add a job to the queue.
   * @returns Job ID for status tracking.
   */
  add(payload: T): string;

  /**
   * Get job status by ID.
   */
  getStatus(id: string): QueueJob | null;

  /**
   * Get queue size.
   */
  size(): number;
}
