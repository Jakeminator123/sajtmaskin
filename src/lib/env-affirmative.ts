/**
 * Shared string env parsing for feature flags (server + client bundles).
 * Keep this module free of Zod / server-only imports.
 */

/**
 * Strip surrounding quotes and whitespace that some deploy platforms
 * (Render, CI) inject into env values, e.g. `"sk-..."`.
 */
export function sanitizeEnvString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t || undefined;
}

const AFFIRMATIVE_ENV_VALUES = new Set(["1", "true", "yes", "y", "on"]);

/** True only for explicit affirmative tokens; `n`, `no`, `false`, empty → false. */
export function isAffirmativeEnvValue(value: string | undefined): boolean {
  const normalized = sanitizeEnvString(value)?.toLowerCase();
  return normalized ? AFFIRMATIVE_ENV_VALUES.has(normalized) : false;
}
