import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const client = postgres(process.env.POSTGRES_URL!, {
  prepare: false,
});

export const db = drizzle(client);
