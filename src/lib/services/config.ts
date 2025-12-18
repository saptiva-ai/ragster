/**
 * Centralized configuration service.
 * Eliminates scattered process.env calls and validates required variables.
 */

/**
 * Extract database name from MongoDB URI.
 * Works with both local and cloud URIs.
 * Uses native URL API for safer parsing.
 */
function getDbNameFromUri(uri: string): string | null {
  try {
    // Replace mongodb+srv:// with https:// for URL parsing compatibility
    const normalizedUri = uri.replace(/^mongodb(\+srv)?:\/\//, 'https://');
    const url = new URL(normalizedUri);
    // pathname is "/dbname", remove the leading slash
    const dbName = url.pathname.substring(1);
    return dbName || null;
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
  };
  embedding: {
    apiUrl: string;
    apiKey: string;
    model: string;
    dimensions: number;
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
      },
      embedding: {
        apiUrl: process.env.EMBEDDING_API_URL || 'https://api.saptiva.com/api/embed',
        apiKey,
        model: process.env.EMBEDDING_MODEL || 'Saptiva Embed',
        dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'),
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
        targetChunks: 10,
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
        batchSize: 10,
        maxCharsPerChunk: 800,
        targetChunks: 8,
        temperature: 0.1,
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
}

// Export singleton instance
export const configService = ConfigService.getInstance();

// Also export the class for testing purposes
export { ConfigService };
