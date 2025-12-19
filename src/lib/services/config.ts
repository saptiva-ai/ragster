/**
 * Centralized configuration service.
 * Eliminates scattered process.env calls and validates required variables.
 */

/**
 * Extract database name from MongoDB URI.
 * Works with both local and cloud URIs, replica sets, and multi-host formats.
 * Uses regex for robustness (URL API fails on some MongoDB URI formats).
 */
function getDbNameFromUri(uri: string): string | null {
  try {
    // Regex handles: mongodb://, mongodb+srv://, multi-host, query params
    const m = uri.match(/^mongodb(\+srv)?:\/\/[^/]+\/([^?\s]+)(\?.*)?$/i);
    if (!m) return null;

    const rawPath = m[2].replace(/\/+$/, ""); // strip trailing "/"
    const firstSeg = rawPath.split("/")[0];   // handle "db/subcollection" edge case
    const name = decodeURIComponent(firstSeg || "");

    return name || null;
  } catch {
    return null;
  }
}

export interface AppConfig {
  weaviate: {
    host: string;
    apiKey: string;
    port: number;
    scheme: 'http' | 'https';
    isCloud: boolean;
    collectionName: string;
    qnaCollectionName: string;
  };
  embedding: {
    apiUrl: string;
    apiKey: string;
    model: string;
    dimensions: number;
    qnaDimensions: number;
  };
  llm: {
    apiUrl: string;
    apiKey: string;
    model: string;
  };
  chunking: {
    defaultChunkSize: number;
    defaultOverlap: number;
  };
  mongodb: {
    uri: string;
    dbName: string;
  };
  retrieval: {
    // Similarity threshold
    minSimilarityThreshold: number;
    // Over-fetch + rerank
    targetChunks: number;
    overFetchMultiplier: number;
    // Source aggregation boost
    enableSourceBoost: boolean;
    maxSourceBoost: number;
    boostPerMatch: number;
    // Search params
    alpha: number;
    autocutSensitivity: number;
  };
  expansion: {
    enabled: boolean;
    budgetChars: number;
    maxSteps: number;
    scoreThreshold: number;
    maxChunksPerStep: number;
    expansionScore: number;  // Score given to expanded chunks
  };
  llmFilter: {
    enabled: boolean;
    batchSize: number;
    maxCharsPerChunk: number;
    targetChunks: number;
    temperature: number;
    // Reranker settings (moved from chunk-filter.ts)
    minEntailmentRelevance: number;
    minCoverageForRerank: number;
    retrievalTrustThreshold: number;
    topNSafetyNet: number;
  };
  context: {
    // Context limits for buildContext (moved from route.ts)
    maxContextChars: number;
    maxChunksTotal: number;
    maxChunksPerSource: number;
    maxCharsPerChunk: number;
  };
  query: {
    // Query processing settings
    maxWordsForAmbiguous: number;  // Short queries (1-2 words) use previous question
  };
  mmr: {
    // Maximal Marginal Relevance - diversity optimization
    enabled: boolean;
    lambda: number;     // 0-1: higher = more relevance, lower = more diversity
    targetK: number;    // Number of diverse results to select
  };
}

class ConfigService {
  private static instance: ConfigService;
  private config: AppConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  getConfig(): AppConfig {
    if (!this.config) {
      this.config = this.loadConfig();
    }
    return this.config;
  }

  private loadConfig(): AppConfig {
    // Skip validation during build time - will fail at runtime if missing
    // This allows Next.js to build without requiring env vars
    const isCloud = process.env.WEAVIATE_CLOUD === 'true';
    const apiKey = process.env.SAPTIVA_API_KEY || '';

    return {
      weaviate: {
        host: process.env.WEAVIATE_HOST || 'localhost',
        apiKey: process.env.WEAVIATE_API_KEY || '',
        port: parseInt(process.env.WEAVIATE_PORT || '8080'),
        scheme: (process.env.WEAVIATE_SCHEME || 'http') as 'http' | 'https',
        isCloud,
        collectionName: process.env.WEAVIATE_COLLECTION_NAME || 'Documents',
        qnaCollectionName: process.env.WEAVIATE_QNA_COLLECTION_NAME || 'DocumentsQnA',
      },
      embedding: {
        apiUrl: process.env.EMBEDDING_API_URL || 'https://api.saptiva.com/api/embed',
        apiKey,
        model: process.env.EMBEDDING_MODEL || 'Saptiva Embed',
        dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '512'),
        qnaDimensions: parseInt(process.env.EMBEDDING_QNA_DIMENSIONS || '1024'),
      },
      llm: {
        apiUrl: process.env.LLM_API_URL || process.env.SAPTIVA_API_BASE_URL || 'https://api.saptiva.com',
        apiKey,
        model: process.env.LLM_MODEL || 'DeepSeek-R1',
      },
      chunking: {
        defaultChunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
        defaultOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
      },
      mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        dbName: process.env.MONGODB_DB_NAME || getDbNameFromUri(process.env.MONGODB_URI || '') || 'ragster',
      },
      // ============================================
      // RETRIEVAL PIPELINE CONFIG (single source of truth)
      // ============================================
      retrieval: {
        minSimilarityThreshold: 0.3,
        targetChunks: 20,  // fetches 60 (20×3) - more candidates for MMR to filter
        overFetchMultiplier: 3,
        enableSourceBoost: true,
        maxSourceBoost: 0.2,
        boostPerMatch: 0.05,
        alpha: 0.5,
        autocutSensitivity: 1,
      },
      expansion: {
        enabled: true,
        budgetChars: 4000,
        maxSteps: 2,
        scoreThreshold: 0.5,
        maxChunksPerStep: 4,
        expansionScore: 0.1,  // Score for expanded chunks (not 0!)
      },
      llmFilter: {
        enabled: true,  // Semantic relevance filter - LLM judges if chunks answer the question
        batchSize: 25,  // Process all chunks in 1 batch (we get ~20 from candidate budget)
        maxCharsPerChunk: 600,  // Reduced to fit more chunks in single batch
        targetChunks: 8,
        temperature: 0.1,
        // Reranker settings (moved from chunk-filter.ts)
        minEntailmentRelevance: 7,  // Minimum relevance score for ENTAILMENT
        minCoverageForRerank: 0.6,  // Minimum coverage ratio for reranking
        retrievalTrustThreshold: 0.8,  // Trust high-scoring retrieval even if reranker says NEUTRAL
        topNSafetyNet: 3,  // Always keep top N by retrieval score regardless of reranker
      },
      // ============================================
      // CONTEXT BUILDING CONFIG (moved from route.ts)
      // Saptiva model: 8192 tokens max (~6000 chars)
      // Reserve: ~500 tokens system prompt, ~200 user formatting, ~1500 response
      // ============================================
      context: {
        maxContextChars: 5000,
        maxChunksTotal: 8,
        maxChunksPerSource: 3,
        maxCharsPerChunk: 1000,
      },
      query: {
        maxWordsForAmbiguous: 2,
      },
      // MMR CONFIG - Maximal Marginal Relevance
      // Reduces redundancy by penalizing similar chunks
      mmr: {
        enabled: true,
        lambda: 0.6,    // 60% relevance, 40% diversity
        targetK: 15,    // Select 15 diverse candidates for reranker (50% reduction)
      },
    };
  }

  /**
   * Get a specific config section
   */
  getWeaviateConfig() {
    return this.getConfig().weaviate;
  }

  getEmbeddingConfig() {
    return this.getConfig().embedding;
  }

  getLLMConfig() {
    return this.getConfig().llm;
  }

  getChunkingConfig() {
    return this.getConfig().chunking;
  }

  getMongoDBConfig() {
    return this.getConfig().mongodb;
  }

  getRetrievalConfig() {
    return this.getConfig().retrieval;
  }

  getExpansionConfig() {
    return this.getConfig().expansion;
  }

  getLLMFilterConfig() {
    return this.getConfig().llmFilter;
  }

  getContextConfig() {
    return this.getConfig().context;
  }

  getQueryConfig() {
    return this.getConfig().query;
  }

  getMMRConfig() {
    return this.getConfig().mmr;
  }
}

// Export singleton instance
export const configService = ConfigService.getInstance();

// Also export the class for testing purposes
export { ConfigService };
