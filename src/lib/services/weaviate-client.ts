import weaviate, { WeaviateClient } from "weaviate-ts-client";
import { configService } from "./config";

/**
 * Shared collection name for all documents.
 * All users share a single document pool.
 * Configurable via WEAVIATE_COLLECTION_NAME env var.
 */
const COLLECTION_NAME = configService.getWeaviateConfig().collectionName;

/**
 * Global reference for Weaviate client to survive Next.js hot reloads.
 * In development, Next.js clears the module cache on hot reloads,
 * but native connections may stay open causing "Too many connections" errors.
 */
const globalForWeaviate = global as unknown as {
  weaviateClient: WeaviateClient;
  connectionVerified: boolean;
};

/**
 * Get or create the Weaviate client instance.
 * Uses global storage in development to survive hot reloads.
 * Supports both local (Docker) and cloud (WCS) modes.
 */
function getClient(): WeaviateClient {
  if (globalForWeaviate.weaviateClient) {
    return globalForWeaviate.weaviateClient;
  }

  const config = configService.getWeaviateConfig();
  let client: WeaviateClient;

  if (config.isCloud) {
    // ===== CLOUD MODE =====
    // Weaviate Cloud Services (WCS)
    console.log(`[Weaviate] ☁️  Connecting to Cloud: ${config.host}`);

    client = weaviate.client({
      scheme: "https",
      host: config.host,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
  } else {
    // ===== LOCAL MODE =====
    // Docker or local Weaviate instance
    const hostUrl = config.port ? `${config.host}:${config.port}` : config.host;
    console.log(
      `[Weaviate] 🏠 Connecting to Local: ${config.scheme}://${hostUrl}`
    );

    client = weaviate.client({
      scheme: config.scheme,
      host: hostUrl,
    });
  }

  // Only store in global in development to survive hot reloads
  if (process.env.NODE_ENV !== "production") {
    globalForWeaviate.weaviateClient = client;
  }

  return client;
}

/**
 * Verify connection to Weaviate (async health check).
 * Call this at app startup to fail fast if Weaviate is unreachable.
 * This is optional - getClient() will still work without calling this.
 */
async function verifyConnection(): Promise<boolean> {
  if (globalForWeaviate.connectionVerified) {
    return true;
  }

  const client = getClient();
  const config = configService.getWeaviateConfig();

  try {
    await client.misc.readyChecker().do();
    console.log(`[Weaviate] ✅ Connection verified - Weaviate is ready`);
    globalForWeaviate.connectionVerified = true;
    return true;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Weaviate] ❌ Connection Failed:`, errorMessage);

    // Provide helpful error messages
    if (config.isCloud) {
      console.error(
        `   Possible causes:\n` +
          `   - WCS cluster might be sleeping (sandbox tier)\n` +
          `   - Invalid WEAVIATE_HOST: ${config.host}\n` +
          `   - Invalid WEAVIATE_API_KEY\n` +
          `   - Network connectivity issues`
      );
    } else {
      console.error(
        `   Possible causes:\n` +
          `   - Weaviate container not running (try: docker-compose up -d)\n` +
          `   - Wrong WEAVIATE_HOST: ${config.host}:${config.port}\n` +
          `   - Weaviate still starting up`
      );
    }

    return false;
  }
}

/**
 * Get the shared collection name.
 * @deprecated userId parameter is ignored - all users share one collection
 */
function getCollectionName(): string {
  return COLLECTION_NAME;
}

/**
 * Ensure the shared Documents collection exists in Weaviate.
 * Creates it if it doesn't exist.
 */
async function ensureCollectionExists(): Promise<string> {
  const client = getClient();
  const className = COLLECTION_NAME;

  const schema = await client.schema.getter().do();
  const exists = schema.classes?.some((c) => c.class === className);

  if (!exists) {
    console.log(`[Weaviate] Creating class ${className}...`);

    await client.schema
      .classCreator()
      .withClass({
        class: className,
        properties: [
          { name: "text", dataType: ["text"] },
          { name: "sourceName", dataType: ["text"] },
          { name: "sourceType", dataType: ["text"] },
          { name: "sourceSize", dataType: ["text"] },
          { name: "uploadDate", dataType: ["text"] },
          { name: "chunkIndex", dataType: ["int"] },
          { name: "totalChunks", dataType: ["int"] },
          { name: "sourceNamespace", dataType: ["text"] },
          { name: "prevChunkIndex", dataType: ["int"] },
          { name: "nextChunkIndex", dataType: ["int"] },
          { name: "userId", dataType: ["text"] },
          // Fields for sentence chunker
          { name: "language", dataType: ["text"] },
          { name: "startPosition", dataType: ["int"] },
          { name: "endPosition", dataType: ["int"] },
          { name: "contentWithoutOverlap", dataType: ["text"] },
          { name: "chunkerUsed", dataType: ["text"] },
        ],
      })
      .do();

    console.log(`[Weaviate] Class ${className} created.`);
  }

  return className;
}

/**
 * Insert a single object into the shared collection.
 */
async function insertObject(
  properties: Record<string, unknown>,
  vector: number[]
): Promise<string | undefined> {
  const client = getClient();
  const className = COLLECTION_NAME;

  const result = await client.data
    .creator()
    .withClassName(className)
    .withProperties(properties)
    .withVector(vector)
    .do();

  return result?.id;
}

/**
 * Insert multiple objects into the shared collection (batch).
 */
async function insertBatch(
  objects: Array<{ properties: Record<string, unknown>; vector: number[] }>
): Promise<void> {
  const client = getClient();
  const className = COLLECTION_NAME;
  const batcher = client.batch.objectsBatcher();

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
 * Search for similar vectors in the shared collection.
 */
async function searchByVector(
  vector: number[],
  limit: number = 10,
  fields: string = "text sourceName chunkIndex totalChunks"
): Promise<Array<{ properties: Record<string, unknown> }>> {
  const client = getClient();
  const className = COLLECTION_NAME;

  const result = await client.graphql
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
 * Get all objects from the shared collection.
 */
async function getAllObjects(
  limit: number = 10000
): Promise<Array<{ id: string; properties: Record<string, unknown> }>> {
  const client = getClient();
  const className = COLLECTION_NAME;

  const result = await client.data
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
 * Update an object in the shared collection.
 */
async function updateObject(
  id: string,
  properties: Record<string, unknown>,
  vector: number[]
): Promise<void> {
  const client = getClient();
  const className = COLLECTION_NAME;

  await client.data
    .updater()
    .withClassName(className)
    .withId(id)
    .withProperties(properties)
    .withVector(vector)
    .do();
}

/**
 * Delete an object by ID from the shared collection.
 */
async function deleteObject(id: string): Promise<void> {
  const client = getClient();
  const className = COLLECTION_NAME;

  await client.data.deleter().withClassName(className).withId(id).do();
}

/**
 * Delete multiple objects by filter from the shared collection.
 * Returns the number of objects deleted.
 */
async function deleteByFilter(
  filterPath: string,
  filterValue: string
): Promise<number> {
  const client = getClient();
  const className = COLLECTION_NAME;

  try {
    const result = await client.batch
      .objectsBatchDeleter()
      .withClassName(className)
      .withWhere({
        path: [filterPath],
        operator: "Equal",
        valueText: filterValue,
      })
      .do();

    const deletedCount = result?.results?.successful ?? 0;
    console.log(
      `[Weaviate] Deleted ${deletedCount} objects where ${filterPath}="${filterValue}"`
    );

    // Verify deletion by checking if any objects still exist with this filter
    const remaining = await client.graphql
      .get()
      .withClassName(className)
      .withFields("_additional { id }")
      .withWhere({
        path: [filterPath],
        operator: "Equal",
        valueText: filterValue,
      })
      .withLimit(1)
      .do();

    const remainingCount = remaining?.data?.Get?.[className]?.length ?? 0;
    if (remainingCount > 0) {
      console.warn(
        `[Weaviate] WARNING: ${remainingCount} objects still exist after deletion!`
      );
    }

    return deletedCount;
  } catch (error) {
    console.error(`[Weaviate] Error deleting by filter:`, error);
    throw error;
  }
}

/**
 * Delete the entire shared collection.
 * WARNING: This deletes ALL documents for ALL users!
 */
async function deleteCollection(): Promise<void> {
  const client = getClient();
  const className = COLLECTION_NAME;

  try {
    await client.schema.classDeleter().withClassName(className).do();
    console.log(`[Weaviate] Class ${className} deleted.`);
  } catch (error) {
    console.error(`[Weaviate] Error deleting class ${className}:`, error);
    throw error;
  }
}

/**
 * Weaviate client service object.
 * All users share a single Documents collection.
 * Supports both local (Docker) and cloud (WCS) modes via WEAVIATE_CLOUD env var.
 */
export const weaviateClient = {
  getClient,
  verifyConnection,
  getCollectionName,
  ensureCollectionExists,
  insertObject,
  insertBatch,
  searchByVector,
  getAllObjects,
  updateObject,
  deleteObject,
  deleteByFilter,
  deleteCollection,
};
