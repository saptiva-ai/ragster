import { Chunk } from './chunk.types';

export interface DocumentMetadata {
  filename: string;
  fileType: string;
  fileSize: number;
  uploadDate: string;
  userId: string;
  namespace: string;
  language?: string;
  pageCount?: number; // For PDFs
}

export interface ExtractedDocument {
  content: string;
  metadata: DocumentMetadata;
}

export interface ProcessedDocument {
  filename: string;
  content: string;
  chunks: Chunk[];
  embeddings: number[][];
  metadata: DocumentMetadata;
}
