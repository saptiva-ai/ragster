// RETRIEVAL TYPES
//
// Type hierarchy for search results through the RAG pipeline:
// 1. WeaviateSearchResult - raw result from Weaviate
// 2. RetrievalHit - after pipeline processing (with boosts/scores)

/** Raw result from Weaviate search (before pipeline processing) */
export interface WeaviateSearchResult {
  properties: Record<string, unknown>;
  score?: number;
  explainScore?: string;
}

/** Result after retrieval pipeline processing (with boost scores) */
export interface RetrievalHit extends WeaviateSearchResult {
  /** Lexical boost from keyword matches */
  _boost?: number;
  /** Combined score after reranking */
  _finalScore?: number;
  /** Boost from source aggregation (documents with multiple matching chunks) */
  _sourceBoost?: number;
  /** Boost for aggregate/total queries */
  _aggregateBoost?: number;
  /** True if chunk was fetched via window expansion (not original search) */
  _isWindowExpansion?: boolean;
}

/** Result from getChunksByIds (minimal, no scores) */
export interface ChunkResult {
  properties: Record<string, unknown>;
}

/** Result from getAllObjects (includes Weaviate ID) */
export interface StoredObject {
  id: string;
  properties: Record<string, unknown>;
}
