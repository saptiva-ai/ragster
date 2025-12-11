import {MongoClient, ServerApiVersion} from "mongodb";

const uri = process.env.MONGODB_URI || 'mongodb://mongo:27017/ragster';
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

let clientPromise: Promise<MongoClient>;

// Solo conectar si tenemos URI (evita errores durante build)
if (uri) {
  let client: MongoClient;

  if (process.env.NODE_ENV === "development") {
    // En desarrollo, usamos una variable global para preservar la conexión entre recargas de HMR
    const globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    // En producción, es mejor no usar una variable global
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
} else {
  // Fail fast: reject immediately if MONGODB_URI is missing at runtime
  clientPromise = Promise.reject(
    new Error("MONGODB_URI is not defined. Please set it in your .env file.")
  );
}

export default clientPromise;
