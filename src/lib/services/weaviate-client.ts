import weaviate, { WeaviateClient, FusionType } from "weaviate-ts-client";
import { configService } from "./config";
import { WeaviateSearchResult, ChunkResult, StoredObject } from "@/lib/core/types";

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
  fields: string = "text sourceName chunkIndex totalChunks prevChunkIndex nextChunkIndex"
): Promise<WeaviateSearchResult[]> {
  const client = getClient();
  const className = COLLECTION_NAME;

  const result = await client.graphql
    .get()
    .withClassName(className)
    .withFields(`${fields} _additional { distance }`)
    .withNearVector({ vector })
    .withLimit(limit)
    .do();

  const objects = result?.data?.Get?.[className] ?? [];

  return objects.map((obj: Record<string, unknown>) => ({
    properties: obj,
    // Convert distance to score (distance 0 = score 1, distance 1 = score 0)
    // Clamp to avoid negative scores if distance > 1
    score: Math.max(0, 1 - ((obj._additional as { distance?: number })?.distance ?? 1)),
  }));
}

// HYBRID SEARCH → Combines BM25 (keyword) + Vector (semantic)
// alpha=0.75 → 75% vector, 25% BM25 (default for semantic queries)
// alpha=0.35 → 35% vector, 65% BM25 (for numeric/exact queries)
// PROBLEM SOLVED: Pure vector misses exact matches, pure BM25 misses meaning
async function searchHybrid(
  query: string,
  vector: number[],
  limit: number = 25,
  alpha: number = 0.75,
  fields: string = "text sourceName chunkIndex totalChunks contentWithoutOverlap prevChunkIndex nextChunkIndex"
): Promise<WeaviateSearchResult[]> {
  const client = getClient();
  const className = COLLECTION_NAME;

  // Include explainScore for debugging (only logged when DEBUG_RAG=true)
  // Also request distance as fallback if score is missing
  const result = await client.graphql
    .get()
    .withClassName(className)
    .withFields(`${fields} _additional { score explainScore distance }`)
    .withHybrid({
      query,
      vector,
      alpha,
      fusionType: FusionType.relativeScoreFusion,
    })
    .withLimit(limit)
    .do();

  const objects = result?.data?.Get?.[className] ?? [];

  return objects.map((obj: Record<string, unknown>) => {
    // Normalize score to number (Weaviate sometimes returns string)
    const additional = obj._additional as Record<string, unknown> | undefined;
    const rawScore = additional?.score;
    const scoreNum = rawScore != null ? Number(rawScore) : undefined;

    // Fallback: use distance if score is missing
    const rawDistance = additional?.distance;
    const distNum = rawDistance != null ? Number(rawDistance) : undefined;

    // If score is missing/invalid but distance exists, synthesize a score
    // Use typeof checks to satisfy TypeScript narrowing
    const fallbackScore =
      typeof scoreNum === "number" && Number.isFinite(scoreNum)
        ? scoreNum
        : typeof distNum === "number" && Number.isFinite(distNum)
          ? Math.max(0, 1 - distNum)
          : undefined;

    // Debug: log raw _additional to see what Weaviate returns
    if (process.env.DEBUG_RAG === 'true' && additional) {
      console.log(`[Weaviate] _additional raw:`, JSON.stringify(additional));
    }

    // Remove _additional from properties to avoid duplication
    const { _additional, ...cleanProps } = obj;
    void _additional; // silence ESLint unused var warning

    return {
      properties: cleanProps,
      score: fallbackScore,
      explainScore: additional?.explainScore as string | undefined,
    };
  });
}

/**
 * Hybrid search with Weaviate's autoLimit (dynamic autocut).
 * Autocut automatically decides how many results based on score drops.
 * This prevents arbitrary hard limits and uses more of the context budget.
 *
 * @param query - The search query text (for BM25)
 * @param vector - The query embedding (for vector search)
 * @param autoLimit - Autocut sensitivity: 1=aggressive, 2=balanced, 3=lenient
 * @param alpha - Balance between vector (1.0) and BM25 (0.0). Default 0.5 (balanced)
 * @param fields - Fields to return
 */
async function searchHybridAutocut(
  query: string,
  vector: number[],
  autoLimit: number = 2,
  alpha: number = 0.5,
  fields: string = "text sourceName chunkIndex totalChunks contentWithoutOverlap prevChunkIndex nextChunkIndex"
): Promise<WeaviateSearchResult[]> {
  const client = getClient();
  const className = COLLECTION_NAME;

  const result = await client.graphql
    .get()
    .withClassName(className)
    .withFields(`${fields} _additional { score explainScore distance }`)
    .withHybrid({
      query,
      vector,
      alpha,
      fusionType: FusionType.relativeScoreFusion,
    })
    .withAutocut(autoLimit)
    .do();

  const objects = result?.data?.Get?.[className] ?? [];
  console.log(`[Autocut] Returned ${objects.length} results (sensitivity=${autoLimit}, alpha=${alpha})`);

  return objects.map((obj: Record<string, unknown>) => {
    const additional = obj._additional as Record<string, unknown> | undefined;
    const rawScore = additional?.score;
    const scoreNum = rawScore != null ? Number(rawScore) : undefined;

    const rawDistance = additional?.distance;
    const distNum = rawDistance != null ? Number(rawDistance) : undefined;

    const fallbackScore =
      typeof scoreNum === "number" && Number.isFinite(scoreNum)
        ? scoreNum
        : typeof distNum === "number" && Number.isFinite(distNum)
          ? Math.max(0, 1 - distNum)
          : undefined;

    const { _additional, ...cleanProps } = obj;
    void _additional;

    return {
      properties: cleanProps,
      score: fallbackScore,
      explainScore: additional?.explainScore as string | undefined,
    };
  });
}

/**
 * Get all objects from the shared collection.
 */
async function getAllObjects(
  limit: number = 10000
): Promise<StoredObject[]> {
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
 * Get specific chunks by sourceName and chunk IDs.
 * Used for fetching adjacent chunks in the window technique.
 */
async function getChunksByIds(
  sourceName: string,
  chunkIds: number[],
  fields: string = "text sourceName chunkIndex totalChunks contentWithoutOverlap prevChunkIndex nextChunkIndex"
): Promise<ChunkResult[]> {
  const client = getClient();
  const className = COLLECTION_NAME;

  if (chunkIds.length === 0) return [];

  // Fetch chunks one query per ID (safest for Weaviate v2.x compatibility)
  const results: Array<{ properties: Record<string, unknown> }> = [];

  for (const chunkId of chunkIds) {
    const result = await client.graphql
      .get()
      .withClassName(className)
      .withFields(fields)
      .withWhere({
        operator: "And",
        operands: [
          { path: ["sourceName"], operator: "Equal", valueText: sourceName },
          { path: ["chunkIndex"], operator: "Equal", valueInt: chunkId },
        ],
      })
      .withLimit(1)
      .do();

    const objects = result?.data?.Get?.[className] ?? [];
    if (objects.length > 0) {
      results.push({ properties: objects[0] });
    }
  }

  // Sort by chunkIndex to maintain order
  return results.sort((a, b) =>
    (a.properties.chunkIndex as number) - (b.properties.chunkIndex as number)
  );
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
  searchHybrid,
  searchHybridAutocut,
  getChunksByIds,
  getAllObjects,
  updateObject,
  deleteObject,
  deleteByFilter,
  deleteCollection,
};
