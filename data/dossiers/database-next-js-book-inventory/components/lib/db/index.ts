import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const databaseUrl = process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error('Missing POSTGRES_URL environment variable');
}

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });
