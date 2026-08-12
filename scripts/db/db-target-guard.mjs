import { existsSync, readFileSync } from "fs";
import { extractSupabaseProjectRef, loadDbTargets } from "./check-db-env-target.mjs";

const CONNECTION_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_POSTGRES_URL",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
];

export function normalizeEnvUrl(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed)) return undefined;
  if (/^\$[A-Z0-9_]+$/.test(trimmed)) return undefined;
  return trimmed;
}

function stripWrappingQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function readConnectionStringFromEnvFile(filePath) {
  if (!existsSync(filePath)) return undefined;

  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!CONNECTION_KEYS.includes(key)) continue;
    const value = stripWrappingQuotes(line.slice(separator + 1).trim());
    const normalized = normalizeEnvUrl(value);
    if (normalized) return normalized;
  }

  return undefined;
}

function toComparableTarget(urlValue) {
  if (!urlValue) return null;

  try {
    const url = new URL(urlValue);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("supa");

    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || "postgres",
      projectRef: extractSupabaseProjectRef(urlValue)?.ref ?? null,
    };
  } catch {
    return null;
  }
}

function sameTarget(left, right) {
  return !!left && !!right && left.host === right.host && left.port === right.port && left.database === right.database;
}

/**
 * `dev` / `prod` for a target whose Supabase project ref is listed in
 * `config/db-targets.json`, otherwise null.
 *
 * Resolved lazily and defensively: this module is imported by every plain-node
 * DB script, so a missing or malformed targets file must degrade to "no label"
 * rather than throw at import time and take down an unrelated read command.
 *
 * @param {{ projectRef?: string | null } | null} target
 * @returns {"dev" | "prod" | null}
 */
export function resolveDbEnvironmentName(target) {
  if (!target?.projectRef) return null;
  let targets;
  try {
    targets = loadDbTargets();
  } catch {
    return null;
  }
  for (const name of ["dev", "prod"]) {
    if (targets[name]?.projectRef === target.projectRef) return name;
  }
  return null;
}

/**
 * Sanitized one-line target identity, prefixed with the environment when the
 * project ref is a known one.
 *
 * The prefix is the point: `warnIfProdLikeReadTarget` can only ever say "this
 * IS production" (it compares against the pulled prod snapshot), so a command
 * reading the DEV database printed a bare hostname and looked exactly like a
 * successful prod read to anyone who does not know the regions by heart. That
 * is how an operator ends up trusting an answer from the wrong database.
 */
export function summarizeTarget(target) {
  if (!target) return "unknown";
  const identity = `${target.host}:${target.port}/${target.database}`;
  const environment = resolveDbEnvironmentName(target);
  return environment ? `[${environment.toUpperCase()}] ${identity}` : identity;
}

/**
 * Labelled, sanitized identity for a raw connection string — the form a
 * command should print when it announces which database it is about to read.
 *
 * @param {string | undefined} urlValue
 * @returns {string} e.g. `[PROD] aws-1-us-east-1.pooler.supabase.com:6543/postgres`
 */
export function summarizeConnectionString(urlValue) {
  return summarizeTarget(toComparableTarget(normalizeEnvUrl(urlValue)));
}

export function inspectExplicitDbTargets(currentUrl, productionUrl) {
  const current = toComparableTarget(
    normalizeEnvUrl(currentUrl),
  );
  const production = toComparableTarget(normalizeEnvUrl(productionUrl));

  return {
    current,
    production,
    isProdLike: sameTarget(current, production),
  };
}

export function inspectDbTarget(env = process.env) {
  const resolved = resolveConfiguredDbEnv(env);
  return inspectExplicitDbTargets(
    resolved,
    readConnectionStringFromEnvFile(".env.vercel.production.pulled"),
  );
}

function resolveConfiguredDbEnv(env = process.env) {
  for (const key of CONNECTION_KEYS) {
    const value = normalizeEnvUrl(env[key]);
    if (value) return value;
  }
  return undefined;
}

/**
 * The Postgres connection string this process is configured to use, following
 * the same key precedence as the runtime resolver in `src/lib/db/env.ts`.
 * Exported so plain-node scripts share one owner of the key list instead of
 * re-declaring it (a drifting copy is how a script ends up silently checking
 * the wrong database, or skipping because it looked at the wrong var).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined}
 */
export function resolveDbConnectionString(env = process.env) {
  return resolveConfiguredDbEnv(env);
}

/** The env vars consulted by {@link resolveDbConnectionString}, in precedence order. */
export { CONNECTION_KEYS };

export function warnIfProdLikeReadTarget({ commandName = "db:read", env = process.env, logger = console } = {}) {
  const inspection = inspectDbTarget(env);
  if (inspection.isProdLike) {
    logger.warn(
      `[${commandName}] Warning: current DB target ${summarizeTarget(inspection.current)} matches .env.vercel.production.pulled. This command is read-only, but treat the target as production-like.`,
    );
  }
  return inspection;
}

export function assertSafeWriteTarget({
  commandName = "db:write",
  env = process.env,
  logger = console,
  allowEnvVar = "DB_ALLOW_PROD_LIKE_WRITE",
} = {}) {
  const inspection = inspectDbTarget(env);

  if (!inspection.current) {
    throw new Error(`[${commandName}] Missing database connection URL.`);
  }

  // Registry check FIRST, and independent of the pulled snapshot. The snapshot
  // comparison below can only ever answer "is this the same target as a file
  // that happens to exist locally" — no file, no protection, which turned the
  // guard off exactly on the machines least likely to have pulled prod env.
  // `config/db-targets.json` knows prod's Supabase project ref unconditionally,
  // so identity is decided by the registry and the snapshot is only a fallback
  // for targets the registry does not know.
  //
  // This matters more since the schema-sync git hooks: an automatic write path
  // must not depend on a file being present to refuse production.
  if (
    resolveDbEnvironmentName(inspection.current) === "prod" &&
    env[allowEnvVar] !== "1"
  ) {
    throw new Error(
      `[${commandName}] Refusing to run write operation: current DB target ${summarizeTarget(inspection.current)} is the PRODUCTION project in config/db-targets.json. Point your connection at dev, or rerun with ${allowEnvVar}=1 if you have explicitly decided to write to production.`,
    );
  }

  if (!inspection.production) {
    logger.warn(
      `[${commandName}] No .env.vercel.production.pulled found; cannot compare current target to a pulled production snapshot.`,
    );
    return inspection;
  }

  if (inspection.isProdLike && env[allowEnvVar] !== "1") {
    throw new Error(
      `[${commandName}] Refusing to run write operation because current DB target ${summarizeTarget(inspection.current)} matches .env.vercel.production.pulled. Point .env.local at a separate dev/staging database or rerun with ${allowEnvVar}=1 if you have explicitly decided to write to this target.`,
    );
  }

  return inspection;
}
