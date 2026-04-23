import { getServerEnv } from "@/lib/env";
import { isAffirmativeEnvValue } from "@/lib/env-affirmative";

/**
 * Canonical own-engine thinking default.
 *
 * The legacy `SAJTMASKIN_SHOW_THINKING` alias was removed in omtag-04
 * (2026-04-23) now that all deployed environments pass
 * `SAJTMASKIN_DEFAULT_THINKING` directly.
 */
export function getDefaultThinkingEnabled(): boolean {
  const env = getServerEnv();
  return isAffirmativeEnvValue(env.SAJTMASKIN_DEFAULT_THINKING);
}
