export interface Chunk {
  id: string;
  content: string;
  contentWithoutOverlap?: string;
  index: number;
  startPosition?: number;
  endPosition?: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  filename?: string;  // Used for QnA detection (if contains "QNA", force QnA mode)
}
