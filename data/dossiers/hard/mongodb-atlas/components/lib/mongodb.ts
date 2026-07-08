import { MongoClient, MongoClientOptions } from "mongodb";

const options: MongoClientOptions = {};

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * True when a MongoDB Atlas connection string is configured. Server code MUST
 * branch on this before touching the database: when it returns false, render
 * static fallback content (`seedData` from `@/lib/seed-data`) with a discreet
 * `<DbConfigNotice />` instead of querying — never crash the page and never
 * surface raw connection errors to visitors.
 */
export function isDbConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim().length > 0);
}

let productionClientPromise: Promise<MongoClient> | null = null;

/**
 * Lazy shared connection promise. Never constructed at module import time so
 * builds and unrelated routes keep working when MONGODB_URI is absent.
 * Development caches on `global._mongoClientPromise` so hot reload does not
 * open a new connection per module reload; production caches in module scope.
 * Concurrent requests share the same pending connection promise.
 */
export function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Database is not configured (missing MONGODB_URI). Check isDbConfigured() before connecting.",
    );
  }
  if (process.env.NODE_ENV === "development") {
    global._mongoClientPromise ??= new MongoClient(uri, options).connect();
    return global._mongoClientPromise;
  }
  productionClientPromise ??= new MongoClient(uri, options).connect();
  return productionClientPromise;
}

export async function getMongoDb(dbName?: string) {
  const connectedClient = await getMongoClientPromise();
  return dbName ? connectedClient.db(dbName) : connectedClient.db();
}
