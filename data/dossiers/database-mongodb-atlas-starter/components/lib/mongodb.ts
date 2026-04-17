import { MongoClient, MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const options: MongoClientOptions = {};

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const client = new MongoClient(uri, options);

export const mongoClientPromise =
  process.env.NODE_ENV === "development"
    ? (global._mongoClientPromise ??= client.connect())
    : client.connect();

export async function getMongoDb(dbName?: string) {
  const connectedClient = await mongoClientPromise;
  return dbName ? connectedClient.db(dbName) : connectedClient.db();
}
