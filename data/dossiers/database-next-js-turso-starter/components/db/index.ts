import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error("Missing TURSO_DATABASE_URL environment variable");
}

if (!authToken) {
  throw new Error("Missing TURSO_AUTH_TOKEN environment variable");
}

const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client);
