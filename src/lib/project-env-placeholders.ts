import { getServerEnv, isAffirmativeEnvValue } from "@/lib/env";
import { upsertStoredProjectEnvVars } from "@/lib/project-env-vars";

const DEFAULT_PLACEHOLDER_VALUE = "dev-placeholder-not-set";
const PLACEHOLDER_PREFIX = "sajtmaskin-placeholder:";

export function isAutoPlaceholderEnvEnabled(): boolean {
  return isAffirmativeEnvValue(getServerEnv().SAJTMASKIN_AUTO_PLACEHOLDER_ENV);
}

export function getPlaceholderEnvValue(): string {
  const custom = getServerEnv().SAJTMASKIN_PLACEHOLDER_ENV_VALUE?.trim();
  return custom || DEFAULT_PLACEHOLDER_VALUE;
}

/**
 * Returns true when the decrypted runtime value looks like a placeholder
 * inserted by this module (prefixed or equal to the configured value).
 */
export function isPlaceholderValue(decryptedValue: string): boolean {
  if (decryptedValue.startsWith(PLACEHOLDER_PREFIX)) return true;
  if (decryptedValue === DEFAULT_PLACEHOLDER_VALUE) return true;
  const configured = getServerEnv().SAJTMASKIN_PLACEHOLDER_ENV_VALUE?.trim();
  return configured ? decryptedValue === configured : false;
}

/**
 * Insert dev placeholder values for the given missing keys on a project.
 * Only runs when SAJTMASKIN_AUTO_PLACEHOLDER_ENV is affirmative.
 * Skips keys that already have a stored value.
 *
 * Returns the list of keys that were actually inserted.
 */
export async function ensurePlaceholderEnvVars(
  projectId: string,
  missingKeys: string[],
): Promise<string[]> {
  if (!isAutoPlaceholderEnvEnabled()) return [];
  if (missingKeys.length === 0) return [];

  const value = `${PLACEHOLDER_PREFIX}${getPlaceholderEnvValue()}`;
  const vars = missingKeys.map((key) => ({
    key,
    value,
    sensitive: false,
  }));

  await upsertStoredProjectEnvVars(projectId, vars);
  console.info(
    `[env-placeholders] Inserted ${vars.length} placeholder(s) for project ${projectId}: ${missingKeys.join(", ")}`,
  );
  return missingKeys;
}
