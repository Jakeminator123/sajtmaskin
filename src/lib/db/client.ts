import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { resolveConfiguredDbEnv } from "./env";

const MISSING_DB_MESSAGE =
  "Missing database connection string. Set POSTGRES_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING).";

function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export"
  );
}

function resolveDbConnectionString(): string | null {
  const connectionString =
    resolveConfiguredDbEnv(process.env, {
      warnOnUninterpolated: process.env.NODE_ENV === "development",
    })?.connectionString || null;
  if (!connectionString) {
    if (process.env.NODE_ENV === "production" && !isBuildPhase()) {
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

const VERIFYING_SSL_MODES = new Set(["verify-ca", "verify-full"]);
const NON_VERIFYING_SSL_MODES = new Set(["allow", "prefer", "require", "no-verify"]);

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  normalized = normalized.toLowerCase();
  if (!normalized) return undefined;

  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  console.warn(
    `[db/client] Ignoring invalid DB_SSL_REJECT_UNAUTHORIZED="${value}". ` +
      `Use true/false (or 1/0).`,
  );
  return undefined;
}

function getSslMode(connStr: string): string | null {
  try {
    const url = new URL(connStr);
    const mode = url.searchParams.get("sslmode");
    return mode?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function resolvePoolSslConfig(connStr: string): false | { rejectUnauthorized: boolean } {
  const configuredRejectUnauthorized = parseBooleanEnv(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
  );
  const sslMode = getSslMode(connStr);

  if (sslMode === "disable") {
    return false;
  }

  // Preserve sslmode semantics if no explicit env override is set.
  const rejectUnauthorized =
    configuredRejectUnauthorized ??
    (sslMode && NON_VERIFYING_SSL_MODES.has(sslMode)
      ? false
      : sslMode && VERIFYING_SSL_MODES.has(sslMode)
        ? true
        : true);

  if (
    configuredRejectUnauthorized === undefined &&
    sslMode &&
    NON_VERIFYING_SSL_MODES.has(sslMode)
  ) {
    console.warn(
      `[db/client] sslmode=${sslMode} detected; using TLS without certificate verification. ` +
        "Set DB_SSL_REJECT_UNAUTHORIZED=true to enforce strict TLS.",
    );
  }

  return { rejectUnauthorized };
}

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
      ssl: resolvePoolSslConfig(connectionString),
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
