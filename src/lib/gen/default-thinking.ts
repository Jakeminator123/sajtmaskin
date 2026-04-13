import { getServerEnv } from "@/lib/env";
import { isAffirmativeEnvValue } from "@/lib/env-affirmative";

/**
 * Canonical own-engine thinking default.
 * Prefer SAJTMASKIN_DEFAULT_THINKING, but keep the older alias as a fallback
 * while existing environments are migrated.
 */
export function getDefaultThinkingEnabled(): boolean {
  const env = getServerEnv();

  if (typeof env.SAJTMASKIN_DEFAULT_THINKING === "string") {
    return isAffirmativeEnvValue(env.SAJTMASKIN_DEFAULT_THINKING);
  }

  return isAffirmativeEnvValue(env.SAJTMASKIN_SHOW_THINKING);
}
