import weaviate, { WeaviateClient } from 'weaviate-ts-client';

/**
 * Singleton service for Weaviate client connection (v2 API).
 * Supports per-user collections for data isolation.
 */
class WeaviateClientService {
  private static instance: WeaviateClientService;
  private client: WeaviateClient;

  private constructor() {
    // Initialize v2 client
    this.client = weaviate.client({
      scheme: process.env.WEAVIATE_SCHEME || 'http',
      host: process.env.WEAVIATE_HOST || 'localhost:8080',
    });
    console.log(`[Weaviate] Connected to ${process.env.WEAVIATE_HOST || 'localhost:8080'}`);
  }

  static getInstance(): WeaviateClientService {
    if (!WeaviateClientService.instance) {
      WeaviateClientService.instance = new WeaviateClientService();
    }
    return WeaviateClientService.instance;
  }

  /**
   * Get the raw Weaviate client for direct API access.
   */
  getClient(): WeaviateClient {
    return this.client;
  }

  /**
   * Generate a collection name for a specific user.
   * Sanitizes the userId to be a valid Weaviate class name.
   */
  getUserCollectionName(userId: string): string {
    // Weaviate class names must start with uppercase and be alphanumeric
    const sanitizedId = userId.replace(/[^a-zA-Z0-9]/g, '');
    return `Documents${sanitizedId}`;
  }

  /**
   * Ensure a user's collection exists in Weaviate.
   * Creates it if it doesn't exist.
   */
  async ensureUserCollectionExists(userId: string): Promise<string> {
    const className = this.getUserCollectionName(userId);

    const schema = await this.client.schema.getter().do();
    const exists = schema.classes?.some((c) => c.class === className);

    if (!exists) {
      console.log(`[Weaviate] Creating class ${className}...`);

      await this.client.schema
        .classCreator()
        .withClass({
          class: className,
          properties: [
            { name: 'text', dataType: ['text'] },
            { name: 'sourceName', dataType: ['text'] },
            { name: 'sourceType', dataType: ['text'] },
            { name: 'sourceSize', dataType: ['text'] },
            { name: 'uploadDate', dataType: ['text'] },
            { name: 'chunkIndex', dataType: ['int'] },
            { name: 'totalChunks', dataType: ['int'] },
            { name: 'sourceNamespace', dataType: ['text'] },
            { name: 'prevChunkIndex', dataType: ['int'] },
            { name: 'nextChunkIndex', dataType: ['int'] },
            { name: 'userId', dataType: ['text'] },
          ],
        })
        .do();

      console.log(`[Weaviate] Class ${className} created.`);
    }

    return className;
  }

  /**
   * Insert a single object into a user's collection.
   */
  async insertObject(
    userId: string,
    properties: Record<string, unknown>,
    vector: number[]
  ): Promise<string | undefined> {
    const className = this.getUserCollectionName(userId);

    const result = await this.client.data
      .creator()
      .withClassName(className)
      .withProperties(properties)
      .withVector(vector)
      .do();

    return result?.id;
  }

  /**
   * Insert multiple objects into a user's collection (batch).
   */
  async insertBatch(
    userId: string,
    objects: Array<{ properties: Record<string, unknown>; vector: number[] }>
  ): Promise<void> {
    const className = this.getUserCollectionName(userId);
    const batcher = this.client.batch.objectsBatcher();

    for (const obj of objects) {
      batcher.withObject({
        class: className,
        properties: obj.properties,
        vector: obj.vector,
      });
    }

    await batcher.do();
  }

  /**
   * Search for similar vectors in a user's collection.
   */
  async searchByVector(
    userId: string,
    vector: number[],
    limit: number = 10,
    fields: string = 'text sourceName chunkIndex totalChunks'
  ): Promise<Array<{ properties: Record<string, unknown> }>> {
    const className = this.getUserCollectionName(userId);

    const result = await this.client.graphql
      .get()
      .withClassName(className)
      .withFields(fields)
      .withNearVector({ vector })
      .withLimit(limit)
      .do();

    const objects = result?.data?.Get?.[className] ?? [];

    return objects.map((obj: Record<string, unknown>) => ({
      properties: obj,
    }));
  }

  /**
   * Get all objects from a user's collection.
   */
  async getAllObjects(
    userId: string,
    limit: number = 10000
  ): Promise<Array<{ id: string; properties: Record<string, unknown> }>> {
    const className = this.getUserCollectionName(userId);

    const result = await this.client.data
      .getter()
      .withClassName(className)
      .withLimit(limit)
      .do();

    return (result?.objects ?? []).map((obj) => ({
      id: obj.id!,
      properties: obj.properties as Record<string, unknown>,
    }));
  }

  /**
   * Update an object in a user's collection.
   */
  async updateObject(
    userId: string,
    id: string,
    properties: Record<string, unknown>,
    vector: number[]
  ): Promise<void> {
    const className = this.getUserCollectionName(userId);

    await this.client.data
      .updater()
      .withClassName(className)
      .withId(id)
      .withProperties(properties)
      .withVector(vector)
      .do();
  }

  /**
   * Delete an object by ID from a user's collection.
   */
  async deleteObject(userId: string, id: string): Promise<void> {
    const className = this.getUserCollectionName(userId);

    await this.client.data
      .deleter()
      .withClassName(className)
      .withId(id)
      .do();
  }

  /**
   * Delete multiple objects by filter from a user's collection.
   */
  async deleteByFilter(
    userId: string,
    filterPath: string,
    filterValue: string
  ): Promise<void> {
    const className = this.getUserCollectionName(userId);

    await this.client.batch
      .objectsBatchDeleter()
      .withClassName(className)
      .withWhere({
        path: [filterPath],
        operator: 'Equal',
        valueText: filterValue,
      })
      .do();
  }

  /**
   * Delete a user's entire collection.
   */
  async deleteUserCollection(userId: string): Promise<void> {
    const className = this.getUserCollectionName(userId);

    try {
      await this.client.schema.classDeleter().withClassName(className).do();
      console.log(`[Weaviate] Class ${className} deleted.`);
    } catch (error) {
      console.error(`[Weaviate] Error deleting class ${className}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const weaviateClient = WeaviateClientService.getInstance();

// Also export the class for testing purposes
export { WeaviateClientService };
