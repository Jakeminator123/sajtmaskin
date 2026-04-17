import 'server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const globalForDb = globalThis as typeof globalThis & {
  __pgPool?: Pool;
};

const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
