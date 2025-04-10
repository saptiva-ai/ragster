import { MongoClient, Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient, db: Db }> {
  // If already connected, return the cached connection
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Get MongoDB connection string from environment variables
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'ragster';

  if (!uri) {
    throw new Error('MongoDB URI no configurado. Por favor, configura MONGODB_URI en tu .env');
  }

  // Create a new MongoClient
  const client = new MongoClient(uri);
  
  try {
    // Connect to the MongoDB server
    await client.connect();
    console.log('Conexión a MongoDB establecida correctamente');
    
    const db = client.db(dbName);
    
    // Cache the client and db connections
    cachedClient = client;
    cachedDb = db;
    
    return { client, db };
  } catch (error) {
    console.error('Error conectando a MongoDB:', error);
    throw error;
  }
} 