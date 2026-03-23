export const DB_ENV_VARS = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

type ResolveDbEnvOptions = {
  warnOnUninterpolated?: boolean;
};

function sanitizeDbEnvValue(value: string | undefined): string | undefined {
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

function normalizeDbEnvUrl(
  value: string | undefined,
  varName?: string,
  options: ResolveDbEnvOptions = {},
): string | undefined {
  const sanitized = sanitizeDbEnvValue(value);
  if (!sanitized) return undefined;

  const isUninterpolated =
    /^\$\{[A-Z0-9_]+\}$/.test(sanitized) || /^\$[A-Z0-9_]+$/.test(sanitized);
  if (isUninterpolated) {
    if (options.warnOnUninterpolated && varName) {
      console.warn(
        `[db/env] ${varName} contains uninterpolated variable reference "${sanitized}". ` +
          "This is ignored. Set the actual connection string directly or use POSTGRES_URL instead.",
      );
    }
    return undefined;
  }

  return sanitized;
}

export function resolveConfiguredDbEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveDbEnvOptions = {},
): {
  name: (typeof DB_ENV_VARS)[number];
  connectionString: string;
} | null {
  for (const name of DB_ENV_VARS) {
    const value = normalizeDbEnvUrl(env[name], name, options);
    if (value) {
      return { name, connectionString: value };
    }
  }
  return null;
}

/** Prefer direct / session URL for Drizzle CLI and raw SQL migrations (Supabase: port 5432). */
export type MigrationDbEnvName =
  | "POSTGRES_URL_NON_POOLING"
  /** Built from POSTGRES_HOST + POSTGRES_PASSWORD (+ POSTGRES_DATABASE) when Vercel Supabase integration omits a single non-pooling URL */
  | "POSTGRES_HOST_DIRECT"
  | "POSTGRES_URL"
  | "POSTGRES_PRISMA_URL";

/**
 * Vercel "Supabase" integration often sets POSTGRES_HOST=db.<ref>.supabase.co (direct IPv4)
 * plus POSTGRES_PASSWORD, without POSTGRES_URL_NON_POOLING. Migrations should use :5432 to
 * the db host, not the transaction pooler :6543.
 */
function tryMigrationsConnectionFromSplitSupabaseEnv(
  env: NodeJS.ProcessEnv,
): { connectionString: string } | null {
  const host = sanitizeDbEnvValue(env.POSTGRES_HOST);
  const password = sanitizeDbEnvValue(env.POSTGRES_PASSWORD);
  const dbName = sanitizeDbEnvValue(env.POSTGRES_DATABASE) || "postgres";
  if (!host || !password) return null;
  if (!/^db\.[a-z0-9-]+\.supabase\.co$/i.test(host)) return null;

  const user = "postgres";
  const encodedPassword = encodeURIComponent(password);
  const safeDb = encodeURIComponent(dbName);
  const connectionString = `postgres://${user}:${encodedPassword}@${host}:5432/${safeDb}?sslmode=require`;
  return { connectionString };
}

export function resolveMigrationsDbEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveDbEnvOptions = {},
): {
  name: MigrationDbEnvName;
  connectionString: string;
} | null {
  const explicitNonPooling = normalizeDbEnvUrl(
    env.POSTGRES_URL_NON_POOLING,
    "POSTGRES_URL_NON_POOLING",
    options,
  );
  if (explicitNonPooling) {
    return { name: "POSTGRES_URL_NON_POOLING", connectionString: explicitNonPooling };
  }

  const fromSplit = tryMigrationsConnectionFromSplitSupabaseEnv(env);
  if (fromSplit) {
    return { name: "POSTGRES_HOST_DIRECT", connectionString: fromSplit.connectionString };
  }

  for (const name of ["POSTGRES_URL", "POSTGRES_PRISMA_URL"] as const) {
    const value = normalizeDbEnvUrl(env[name], name, options);
    if (value) {
      return { name, connectionString: value };
    }
  }

  return null;
}
