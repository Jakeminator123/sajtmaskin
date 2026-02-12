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
