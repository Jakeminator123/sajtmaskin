function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/**
 * Shared own-engine defaults.
 *
 * These centralize generation budgets and timeouts so the builder UI, stream
 * routes, eval runner, and autofix pipeline do not drift apart.
 *
 * AI SDK docs support `maxOutputTokens` per generation and recommend explicit
 * budgets for long-running tasks. The defaults here favor page/site creation
 * over terse edits while remaining configurable per environment.
 */
export const ENGINE_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS",
  32_768,
  4_096,
  65_536,
);

export const AUTOFIX_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS",
  12_288,
  2_048,
  32_768,
);

export const ENGINE_ROUTE_MAX_DURATION_SECONDS = readIntEnv(
  "SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS",
  800,
  60,
  800,
);

export const ASSIST_ROUTE_MAX_DURATION_SECONDS = readIntEnv(
  "SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS",
  600,
  60,
  800,
);

export const STREAM_SAFETY_TIMEOUT_DEFAULT_MS = readIntEnv(
  "SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS",
  12 * 60 * 1000,
  60_000,
  15 * 60 * 1000,
);
