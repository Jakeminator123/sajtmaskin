import { neon } from '@neondatabase/serverless';

/**
 * True when a Neon Postgres connection string is configured. Server code MUST
 * branch on this before touching the database: when it returns false, render
 * static fallback content (`seedData` from `@/lib/seed-data`) with a discreet
 * `<DbConfigNotice />` instead of querying — never crash the page and never
 * surface raw connection errors to visitors.
 */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

type NeonSql = ReturnType<typeof neon>;

let cachedSql: NeonSql | null = null;

/**
 * Lazy shared Neon SQL client. Never constructed at module import time so
 * builds and unrelated routes keep working when DATABASE_URL is absent.
 * Query with the tagged template form so values are parameterized safely.
 */
export function getSql(): NeonSql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'Database is not configured (missing DATABASE_URL). Check isDbConfigured() before calling getSql().',
    );
  }
  cachedSql ??= neon(databaseUrl);
  return cachedSql;
}
