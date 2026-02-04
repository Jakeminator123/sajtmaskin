import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const DB_ENV_VARS = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
] as const;

function sanitizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const stripped = trimmed.slice(1, -1).trim();
    return stripped || undefined;
  }
  return trimmed;
}

function normalizeEnvUrl(value: string | undefined, varName?: string): string | undefined {
  const sanitized = sanitizeEnvValue(value);
  if (!sanitized) return undefined;

  if (/^\$\{[A-Z0-9_]+\}$/.test(sanitized) || /^\$[A-Z0-9_]+$/.test(sanitized)) {
    if (varName && process.env.NODE_ENV === "development") {
      console.warn(
        `[db/client] ${varName} contains uninterpolated variable reference "${sanitized}". ` +
          "This is ignored. Set the actual connection string directly or use POSTGRES_URL instead.",
      );
    }
    return undefined;
  }

  return sanitized;
}

const MISSING_DB_MESSAGE =
  "Missing database connection string. Set POSTGRES_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING / DATABASE_URL).";

function resolveDbConnectionString(): string | null {
  const connectionString =
    DB_ENV_VARS.map((name) => normalizeEnvUrl(process.env[name], name)).find(Boolean) || null;
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(MISSING_DB_MESSAGE);
    }

    if (process.env.NODE_ENV === "development") {
      console.warn(`[db/client] ${MISSING_DB_MESSAGE} Database features are disabled.`);
    }

    return null;
  }

  return connectionString;
}

const connectionString = resolveDbConnectionString();
export const dbConfigured = Boolean(connectionString);

// Clean connection string for Supabase pooler compatibility
function cleanConnectionString(connStr: string): string {
  try {
    const url = new URL(connStr);
    // Remove sslmode from search params - we handle it via ssl option
    url.searchParams.delete("sslmode");
    url.searchParams.delete("supa");
    return url.toString();
  } catch {
    return connStr;
  }
}

const pool = connectionString
  ? new Pool({
      connectionString: cleanConnectionString(connectionString),
      ssl: {
        rejectUnauthorized: false,
      },
      // Connection pool configuration for better reliability
      max: 10, // Maximum number of connections
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 10000, // Timeout for acquiring a connection
    })
  : null;

// Log pool errors for debugging (they don't throw by default)
if (pool) {
  pool.on("error", (err) => {
    console.error("[db/client] Unexpected pool error:", err.message);
  });
}

export const db = connectionString
  ? drizzle(pool as Pool, { schema })
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(MISSING_DB_MESSAGE);
        },
      },
    ) as ReturnType<typeof drizzle>);

export { schema };
export { pool };
