import { MongoClient, Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

function getDbNameFromUri(uri: string): string {
  // Extract DB name from URI path (e.g., mongodb://host/dbname or mongodb+srv://host/dbname)
  const match = uri.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : 'ragster';
}

export async function connectToDatabase(): Promise<{ client: MongoClient, db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MongoDB URI no configurado. Por favor, configura MONGODB_URI en tu .env');
  }

  const dbName = getDbNameFromUri(uri);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    throw error;
  }
}
