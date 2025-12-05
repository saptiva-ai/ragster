import weaviate, { WeaviateClient } from 'weaviate-client';

/**
 * Singleton service for Weaviate client connection.
 * Supports both local (Docker) and cloud deployments.
 * Supports per-user collections for data isolation.
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
   * Generate a collection name for a specific user.
   * Sanitizes the userId to be a valid Weaviate collection name.
   */
  getUserCollectionName(userId: string): string {
    // Weaviate collection names must start with uppercase and be alphanumeric
    // Replace invalid characters and ensure valid format
    const sanitizedId = userId.replace(/[^a-zA-Z0-9]/g, '');
    return `Documents_${sanitizedId}`;
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
   * Ensure a user's collection exists in Weaviate.
   * Creates it if it doesn't exist.
   */
  async ensureUserCollectionExists(userId: string): Promise<string> {
    const collectionName = this.getUserCollectionName(userId);
    await this.ensureCollectionExists(collectionName);
    return collectionName;
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
   * Get a user's collection.
   */
  async getUserCollection(userId: string) {
    const collectionName = this.getUserCollectionName(userId);
    return this.getCollection(collectionName);
  }

  /**
   * Get a specific collection by name.
   */
  async getCollection(collectionName: string) {
    const client = await this.getClient();
    return client.collections.get(collectionName);
  }

  /**
   * List all collections for a specific user.
   */
  async listUserCollections(userId: string): Promise<string[]> {
    const client = await this.getClient();
    const collections = await client.collections.listAll();
    const userPrefix = `Documents_${userId.replace(/[^a-zA-Z0-9]/g, '')}`;
    return collections
      .filter((col) => col.name.startsWith(userPrefix))
      .map((col) => col.name);
  }

  /**
   * Delete a user's collection.
   */
  async deleteUserCollection(userId: string): Promise<void> {
    const client = await this.getClient();
    const collectionName = this.getUserCollectionName(userId);

    try {
      await client.collections.delete(collectionName);
      console.log(`Collection ${collectionName} deleted.`);
    } catch (error) {
      console.error(`Error deleting collection ${collectionName}:`, error);
      throw error;
    }
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
