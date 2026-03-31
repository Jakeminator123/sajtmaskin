import { existsSync, readFileSync } from "fs";

const CONNECTION_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
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
    };
  } catch {
    return null;
  }
}

function sameTarget(left, right) {
  return !!left && !!right && left.host === right.host && left.port === right.port && left.database === right.database;
}

export function summarizeTarget(target) {
  if (!target) return "unknown";
  return `${target.host}:${target.port}/${target.database}`;
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
  return inspectExplicitDbTargets(
    env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL,
    readConnectionStringFromEnvFile(".env.vercel.production.pulled"),
  );
}

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
