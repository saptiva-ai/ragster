import { MongoClient, Db } from 'mongodb';
import { configService } from '../services/config';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

// Collections you KNOW should exist in a real Ragster DB
const KNOWN_COLLECTIONS = ["users", "files", "messages", "settings", "configs"];

/**
 * Check if a DB has real data using findOne() probe.
 * More robust than listCollections() - works with limited Atlas roles.
 * Returns: true (has data), false (empty), null (can't verify - no permissions)
 */
async function dbLooksReal(db: Db): Promise<boolean | null> {
  try {
    for (const name of KNOWN_COLLECTIONS) {
      const doc = await db.collection(name).findOne({}, { projection: { _id: 1 } });
      if (doc) return true;
    }
    return false; // no docs in known collections
  } catch {
    // If findOne fails (permissions/errors), return unknown
    console.warn(`[Mongo] Cannot probe db="${db.databaseName}". Using safe fallback.`);
    return null;
  }
}

async function findCaseVariants(client: MongoClient, canonicalLower: string): Promise<string[]> {
  try {
    const admin = client.db("admin").admin();
    const { databases } = await admin.listDatabases({ nameOnly: true });
    return databases
      .map((d: { name: string }) => d.name)
      .filter((name: string) => name.toLowerCase() === canonicalLower);
  } catch {
    // If no permissions for listDatabases, don't guess
    return [];
  }
}

async function resolveDbName(client: MongoClient, configuredName?: string): Promise<string> {
  const orig = String(configuredName || "ragster").trim();
  const canonical = orig.toLowerCase();

  // Build heuristic candidates (works even without listDatabases permission)
  const heuristicVariants = [
    orig,
    canonical,
    orig.charAt(0).toUpperCase() + orig.slice(1).toLowerCase(), // "Ragster"
    orig.toUpperCase(), // "RAGSTER"
  ];

  // Find all case variants that exist on the server (e.g., "Ragster", "ragster")
  const serverVariants = await findCaseVariants(client, canonical);
  const candidates = Array.from(new Set([...heuristicVariants, ...serverVariants]));

  const checks = await Promise.all(candidates.map(async (name) => ({
    name,
    hasData: await dbLooksReal(client.db(name)), // true | false | null
  })));

  const withData = checks.filter(c => c.hasData === true).map(c => c.name);
  const anyUnknown = checks.some(c => c.hasData === null);

  // One variant has data: use it
  if (withData.length === 1) return withData[0];

  // Can't verify any DB: use configured name (DON'T create new DB blindly)
  if (withData.length === 0 && anyUnknown) {
    console.log(`[Mongo] Cannot verify DBs, using configured="${orig}"`);
    return orig;
  }

  // No data anywhere AND we could verify: safe to create canonical lowercase
  if (withData.length === 0) return canonical;

  // Multiple variants have data: don't auto-switch (risk of mixing)
  console.warn(`[Mongo] Multiple DB variants have data: ${withData.join(", ")}. Using configured="${orig}".`);
  return orig;
}

export async function connectToDatabase(): Promise<{ client: MongoClient, db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const mongoConfig = configService.getMongoDBConfig();

  if (!mongoConfig.uri) {
    throw new Error('MongoDB URI no configurado. Por favor, configura MONGODB_URI en tu .env');
  }

  const client = new MongoClient(mongoConfig.uri);

  try {
    await client.connect();
    const configuredDbName = String(mongoConfig.dbName || "ragster").trim();
    const dbName = await resolveDbName(client, configuredDbName);
    const db = client.db(dbName);
    console.log(`[Mongo] Using dbName="${dbName}" (configured="${configuredDbName}")`);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    throw error;
  }
}
