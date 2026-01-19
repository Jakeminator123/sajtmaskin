import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

function normalizeEnvUrl(value: string | undefined, varName?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed) || /^\$[A-Z0-9_]+$/.test(trimmed)) {
    if (varName && process.env.NODE_ENV === 'development') {
      console.warn(
        `[db/client] ${varName} contains uninterpolated variable reference "${trimmed}". ` +
          'This is ignored. Set the actual connection string directly or use POSTGRES_URL instead.'
      );
    }
    return undefined;
  }

  return trimmed;
}

function resolveDbConnectionString(): string {
  const postgresUrl = normalizeEnvUrl(process.env.POSTGRES_URL, 'POSTGRES_URL');
  const nonPoolingUrl = normalizeEnvUrl(
    process.env.POSTGRES_URL_NON_POOLING,
    'POSTGRES_URL_NON_POOLING'
  );
  const databaseUrl = normalizeEnvUrl(process.env.DATABASE_URL, 'DATABASE_URL');

  const connectionString = postgresUrl || nonPoolingUrl || databaseUrl;
  if (!connectionString) {
    throw new Error(
      'Missing database connection string. Set POSTGRES_URL (preferred), POSTGRES_URL_NON_POOLING, or DATABASE_URL.'
    );
  }

  return connectionString;
}

const pool = new Pool({
  connectionString: resolveDbConnectionString(),
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, { schema });

export { schema };
export { pool };
