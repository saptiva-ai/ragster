import { MongoClient, Db } from 'mongodb';
import { configService } from '../services/config';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

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
    const db = client.db(mongoConfig.dbName);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    throw error;
  }
}
