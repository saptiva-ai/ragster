// Unified MongoDB client - all paths go through connectToDatabase() resolver
import type { MongoClient } from "mongodb";
import { connectToDatabase } from "./mongodb/client";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Single client promise for HMR (dev) and singleton (prod)
// Uses connectToDatabase() which handles DB name resolution (Ragster vs ragster)
const clientPromise =
  globalThis._mongoClientPromise ??
  (globalThis._mongoClientPromise = connectToDatabase().then(({ client }) => client));

export default clientPromise;
