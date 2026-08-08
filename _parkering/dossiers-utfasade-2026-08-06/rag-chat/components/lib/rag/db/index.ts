import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as typeof globalThis & {
  __ragPgPool?: Pool;
  __ragDrizzleDb?: Db;
};

/**
 * Decide the pg SSL option from the connection string. Mirrors the shared DB
 * dossier contract: honor an explicit `sslmode` (`disable` turns SSL off for a
 * local/Docker Postgres without TLS), default OFF for loopback hosts and ON
 * elsewhere. When on, `rejectUnauthorized: false` keeps hosted providers with
 * self-signed chains (Supabase/Neon/RDS) working out of the box.
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
 * globalThis so dev hot-reload does not leak connections. Callers must check
 * `isRagConfigured()` from `@/lib/rag/config` first.
 */
export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'RAG database is not configured (missing DATABASE_URL). Check isRagConfigured() before calling getPool().',
    );
  }
  if (!globalForDb.__ragPgPool) {
    globalForDb.__ragPgPool = new Pool({
      connectionString,
      ssl: resolvePgSsl(connectionString),
    });
  }
  return globalForDb.__ragPgPool;
}

/** Lazy shared Drizzle client. Same configuration contract as {@link getPool}. */
export function getDb(): Db {
  if (!globalForDb.__ragDrizzleDb) {
    globalForDb.__ragDrizzleDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__ragDrizzleDb;
}
