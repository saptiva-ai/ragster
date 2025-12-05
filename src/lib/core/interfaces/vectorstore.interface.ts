import { ChunkWithEmbedding } from '../types/chunk.types';
import { DocumentMetadata } from '../types/document.types';

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStore {
  /**
   * Insert chunks with embeddings
   */
  insert(chunks: ChunkWithEmbedding[], metadata: DocumentMetadata): Promise<void>;

  /**
   * Search for similar chunks
   */
  search(queryEmbedding: number[], limit: number, filters?: Record<string, unknown>): Promise<SearchResult[]>;

  /**
   * Delete document and its chunks
   */
  delete(documentId: string): Promise<void>;

  /**
   * List all documents
   */
  listDocuments(userId?: string): Promise<DocumentMetadata[]>;

  /**
   * Store name
   */
  getName(): string;
}
