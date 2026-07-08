import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { resolveConfiguredDbEnv } from "./env";

const MISSING_DB_MESSAGE =
  "Missing database connection string. Set POSTGRES_URL, POSTGRES_URL_NON_POOLING, STORAGE_POSTGRES_URL, or STORAGE_POSTGRES_URL_NON_POOLING.";

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
    if (!isBuildPhase()) {
      throw new Error(MISSING_DB_MESSAGE);
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

/**
 * Detect connection strings that route through pgbouncer / Supabase pooler.
 * These poolers cap *concurrent sessions* aggressively (Supabase default
 * is ~15 per project on free, ~60 on pro). When this app is serverless,
 * each cold-start instance creates its own pg.Pool, so a `max: 10` setting
 * across N concurrent functions can blow past the pooler limit and surface
 * as `EMAXCONNSESSION: max clients reached` mid-stream — see SAJ-7 / B1.
 *
 * Pgbouncer in transaction mode also forbids long-lived sessions: short
 * idle timeouts + small per-instance pool make a much better citizen.
 */
function looksPooled(connStr: string): boolean {
  try {
    const url = new URL(connStr);
    if (url.searchParams.get("pgbouncer") === "true") return true;
    // Supabase pooler hostname pattern + standard pgbouncer ports
    if (url.hostname.includes("pooler.")) return true;
    if (url.port === "6543" || url.port === "5433") return true;
    return false;
  } catch {
    return false;
  }
}

function parsePositiveIntEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function resolvePoolMax(connStr: string): number {
  const fromEnv = parsePositiveIntEnv(process.env.POSTGRES_POOL_MAX);
  if (fromEnv !== undefined) return fromEnv;
  // Conservative default for pooled connections (Supabase pgbouncer cap),
  // larger when talking to direct Postgres so single-VM workloads can still
  // burst. Both can be overridden via POSTGRES_POOL_MAX.
  return looksPooled(connStr) ? 3 : 10;
}

function resolveIdleTimeoutMs(connStr: string): number {
  const fromEnv = parsePositiveIntEnv(process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS);
  if (fromEnv !== undefined) return fromEnv;
  // Pgbouncer in transaction mode dislikes long-lived sessions; close idle
  // connections quickly so they return to the pooler. Direct Postgres can
  // afford to keep them around longer.
  return looksPooled(connStr) ? 5_000 : 30_000;
}

/**
 * HMR-survivable pool cache.
 *
 * Next.js dev re-evaluates this module on every Fast Refresh, which would
 * otherwise create a fresh `new Pool(...)` per rebuild and leak sessions
 * against Supabase pgbouncer (free tier cap ~15). After 5–10 HMR cycles
 * the pooler smashes with `EMAXCONNSESSION` and every subsequent API call
 * returns 500 — UI surfaces it as "Chat not found" / "Försök reparera sidan".
 *
 * Stash the pool on `globalThis` so it survives HMR. Same pattern as the
 * Prisma client recommendation. Production cold-starts hit `undefined` and
 * create the pool exactly once per instance — unchanged from before.
 *
 * Diagnosed 2026-04-23 via SAJ-7 / B1 handoff during master-post-cleanup
 * smoke. Earlier prod-path fix lived in commit 3a4decf0 but did not cover
 * the dev HMR path.
 */
type GlobalWithPool = typeof globalThis & {
  __sajtmaskinPgPool__?: Pool | null;
};
const globalForPool = globalThis as GlobalWithPool;

const pool = (globalForPool.__sajtmaskinPgPool__ ??= connectionString
  ? new Pool({
      connectionString: cleanConnectionString(connectionString),
      ssl: resolvePoolSslConfig(connectionString),
      max: resolvePoolMax(connectionString),
      idleTimeoutMillis: resolveIdleTimeoutMs(connectionString),
      connectionTimeoutMillis: 10000,
    })
  : null);

// Log pool errors for debugging (they don't throw by default).
// Tag EMAXCONNSESSION specifically so a regression of SAJ-7 (B1) is easy
// to spot in Fly logs and a future operator can raise POSTGRES_POOL_MAX
// or move to direct connection without spelunking.
if (pool) {
  pool.on("error", (err) => {
    const msg = err.message ?? String(err);
    if (msg.includes("EMAXCONNSESSION") || msg.includes("max clients")) {
      console.error(
        "[db/client] Pooler capacity exhausted (EMAXCONNSESSION). " +
          "Lower POSTGRES_POOL_MAX or move to direct Postgres for this instance. " +
          "See SAJ-7 / handoff B1.",
        msg,
      );
    } else {
      console.error("[db/client] Unexpected pool error:", msg);
    }
  });

  // Defense-in-depth: ensure every connection uses UTC as the session timezone
  // so that TIMESTAMP WITHOUT TIME ZONE columns and NOW() casts always return
  // UTC — regardless of how the Postgres server's TimeZone GUC is configured.
  // This prevents the 2 h drift seen in prod (confirmed 2026-07-08) where
  // DEFAULT NOW() on a TIMESTAMP (no tz) column stored Swedish local time.
  pool.on("connect", (client) => {
    client.query("SET TIME ZONE 'UTC'").catch((err: unknown) => {
      console.error("[db/client] Failed to SET TIME ZONE UTC on new connection:", err);
    });
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
