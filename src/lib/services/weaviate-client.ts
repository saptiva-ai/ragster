import weaviate, { WeaviateClient } from 'weaviate-client';

/**
 * Singleton service for Weaviate client connection.
 * Supports both local (Docker) and cloud deployments.
 */
class WeaviateClientService {
  private static instance: WeaviateClientService;
  private client: WeaviateClient | null = null;

  private constructor() {}

  static getInstance(): WeaviateClientService {
    if (!WeaviateClientService.instance) {
      WeaviateClientService.instance = new WeaviateClientService();
    }
    return WeaviateClientService.instance;
  }

  /**
   * Get the Weaviate client instance.
   * Creates a new connection if one doesn't exist.
   */
  async getClient(): Promise<WeaviateClient> {
    if (!this.client) {
      const isCloud = process.env.WEAVIATE_CLOUD === 'true';

      if (isCloud) {
        // Weaviate Cloud connection
        const host = process.env.WEAVIATE_HOST;
        const apiKey = process.env.WEAVIATE_API_KEY;

        if (!host || !apiKey) {
          throw new Error('WEAVIATE_HOST and WEAVIATE_API_KEY are required for cloud connection');
        }

        console.log('Connecting to Weaviate Cloud...');
        this.client = await weaviate.connectToWeaviateCloud(host, {
          authCredentials: new weaviate.ApiKey(apiKey),
        });
      } else {
        // Local Weaviate connection (Docker)
        const host = process.env.WEAVIATE_HOST || 'localhost';
        const port = parseInt(process.env.WEAVIATE_PORT || '8080');
        const scheme = (process.env.WEAVIATE_SCHEME || 'http') as 'http' | 'https';

        console.log(`Connecting to local Weaviate at ${scheme}://${host}:${port}...`);
        this.client = await weaviate.connectToLocal({
          host,
          port,
          scheme,
        });
      }

      console.log('Weaviate client connected successfully');
    }

    return this.client;
  }

  /**
   * Ensure a collection exists in Weaviate.
   * Creates it if it doesn't exist.
   */
  async ensureCollectionExists(
    collectionName: string,
    properties?: Array<{ name: string; dataType: string }>
  ): Promise<void> {
    const client = await this.getClient();
    const collections = await client.collections.listAll();
    const exists = collections.some((col) => col.name === collectionName);

    if (!exists) {
      console.log(`Collection ${collectionName} does not exist. Creating...`);

      const defaultProperties = [
        { name: 'text', dataType: 'text' as const },
        { name: 'sourceName', dataType: 'text' as const },
        { name: 'sourceType', dataType: 'text' as const },
        { name: 'sourceSize', dataType: 'text' as const },
        { name: 'uploadDate', dataType: 'text' as const },
        { name: 'chunkIndex', dataType: 'int' as const },
        { name: 'totalChunks', dataType: 'int' as const },
        { name: 'sourceNamespace', dataType: 'text' as const },
        { name: 'prevChunkIndex', dataType: 'int' as const },
        { name: 'nextChunkIndex', dataType: 'int' as const },
        { name: 'userId', dataType: 'text' as const },
      ];

      await client.collections.create({
        name: collectionName,
        vectorizers: [],
        properties: properties || defaultProperties,
      });

      // Wait for collection to be available
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log(`Collection ${collectionName} created.`);
    } else {
      console.log(`Collection ${collectionName} already exists.`);
    }
  }

  /**
   * Get a specific collection by name.
   */
  async getCollection(collectionName: string) {
    const client = await this.getClient();
    return client.collections.get(collectionName);
  }

  /**
   * Close the Weaviate connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log('Weaviate client connection closed.');
    }
  }
}

// Export singleton instance
export const weaviateClient = WeaviateClientService.getInstance();

// Also export the class for testing purposes
export { WeaviateClientService };
