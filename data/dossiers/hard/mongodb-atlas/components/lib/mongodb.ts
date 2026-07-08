import { MongoClient, MongoClientOptions } from "mongodb";

const options: MongoClientOptions = {};

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * True when a REAL MongoDB Atlas connection string is configured. Server code
 * MUST branch on this before touching the database: when it returns false,
 * render static fallback content (`seedData` from `@/lib/seed-data`) with a
 * discreet `<DbConfigNotice />` instead of querying — never crash the page and
 * never surface raw connection errors to visitors.
 *
 * Preview stubs (connection strings containing `preview` or `placeholder`,
 * like the tier-3 stub pointing at the fake `placeholder.mongodb.net` host)
 * count as NOT configured — querying them yields timeouts/500s instead of the
 * promised seed-fallback path.
 */
export function isDbConfigured(): boolean {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return false;
  return !/preview|placeholder/i.test(uri);
}

let productionClientPromise: Promise<MongoClient> | null = null;

/**
 * Start a connection and drop the cached slot if it REJECTS. Without this, a
 * single transient Atlas/network failure on the first request would pin a
 * rejected promise in the cache and break every later DB call until a process
 * restart. On rejection the slot is cleared so the next call retries a fresh
 * connect; the returned promise still rejects for the current caller.
 */
function createClientPromise(uri: string, clearSlot: () => void): Promise<MongoClient> {
  const promise = new MongoClient(uri, options).connect();
  promise.catch(() => {
    clearSlot();
  });
  return promise;
}

/**
 * Lazy shared connection promise. Never constructed at module import time so
 * builds and unrelated routes keep working when MONGODB_URI is absent.
 * Development caches on `global._mongoClientPromise` so hot reload does not
 * open a new connection per module reload; production caches in module scope.
 * Concurrent requests share the same pending connection promise; a rejected
 * connect is evicted so the next request can retry (see createClientPromise).
 */
export function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Database is not configured (missing MONGODB_URI). Check isDbConfigured() before connecting.",
    );
  }
  if (process.env.NODE_ENV === "development") {
    global._mongoClientPromise ??= createClientPromise(uri, () => {
      global._mongoClientPromise = undefined;
    });
    return global._mongoClientPromise;
  }
  productionClientPromise ??= createClientPromise(uri, () => {
    productionClientPromise = null;
  });
  return productionClientPromise;
}

export async function getMongoDb(dbName?: string) {
  const connectedClient = await getMongoClientPromise();
  return dbName ? connectedClient.db(dbName) : connectedClient.db();
}
