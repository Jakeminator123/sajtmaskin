import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * True when a PostgreSQL connection string is configured. Server code MUST
 * branch on this before touching the database: when it returns false, render
 * static fallback content (`seedData` from `@/lib/db/seed-data`) with a
 * discreet `<DbConfigNotice />` instead of querying — never crash the page
 * and never surface raw connection errors to visitors.
 */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as typeof globalThis & {
  __pgPool?: Pool;
  __drizzleDb?: Db;
};

/**
 * Decide the pg SSL option from the connection string.
 *
 * - Honor an explicit `sslmode` in the URL: `disable` turns SSL off (the
 *   standard way to run a local/Docker Postgres that has no TLS), any other
 *   value keeps it on. This is the escape hatch for non-localhost local hosts
 *   (e.g. `127.0.0.1`, a Docker service name) where the previous
 *   `includes('localhost')` substring check wrongly forced TLS.
 * - Otherwise default OFF for loopback hosts and ON elsewhere.
 * - When on, `rejectUnauthorized: false` keeps hosted providers with
 *   self-signed chains (Supabase/Neon/RDS) working out of the box; set
 *   `sslmode=verify-full` + a CA if you need strict verification.
 */
function resolvePgSsl(connectionString: string): false | { rejectUnauthorized: boolean } {
  let url: URL | null = null;
  try {
    url = new URL(connectionString);
  } catch {
    url = null;
  }
  const sslmode = url?.searchParams.get('sslmode');
  if (sslmode === 'disable') return false;
  const host = (url?.hostname ?? '').replace(/^\[|\]$/g, '');
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!sslmode && isLoopback) return false;
  return { rejectUnauthorized: false };
}

/**
 * Lazy singleton Pool. Never constructed at module import time so builds and
 * unrelated routes keep working when DATABASE_URL is absent. Cached on
 * globalThis so dev hot-reload does not leak connections.
 */
export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Database is not configured (missing DATABASE_URL). Check isDbConfigured() before calling getPool().',
    );
  }
  if (!globalForDb.__pgPool) {
    globalForDb.__pgPool = new Pool({
      connectionString,
      ssl: resolvePgSsl(connectionString),
    });
  }
  return globalForDb.__pgPool;
}

/** Lazy shared Drizzle client. Same configuration contract as {@link getPool}. */
export function getDb(): Db {
  if (!globalForDb.__drizzleDb) {
    globalForDb.__drizzleDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__drizzleDb;
}
