import { getStoredProjectEnvVarMap } from "@/lib/projects/project-env-vars";

/**
 * Project-scoped `configured` signal for hard dossiers (fix-isconfigured).
 *
 * Always returns a set — never `undefined` — because `isConfigured`
 * (`src/lib/gen/dossiers/select.ts`) falls back to the platform `process.env`
 * when the caller omits the set, which would mark a dossier "configured" from
 * Sajtmaskin's own keys instead of the user project's.
 *
 * `getStoredProjectEnvVarMap` only returns keys with a real (non-empty,
 * decryptable) value, and a read failure degrades to "nothing configured"
 * rather than to the process.env fallback.
 */
export async function resolveConfiguredEnvKeys(
  projectId?: string | null,
): Promise<Set<string>> {
  const normalized = typeof projectId === "string" ? projectId.trim() : "";
  if (!normalized) return new Set<string>();
  const stored = await getStoredProjectEnvVarMap(normalized).catch(
    () => ({}) as Record<string, string>,
  );
  return new Set(Object.keys(stored));
}
