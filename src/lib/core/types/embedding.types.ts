export interface EmbeddingResult {
  embedding: number[];
  tokenCount?: number;
}

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
}
