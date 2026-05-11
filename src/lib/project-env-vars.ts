import { getProjectData, saveProjectData } from "@/lib/db/services/projects";
import {
  DecryptionError,
  decryptValue,
  encryptValue,
  hasEnvVarEncryptionKey,
} from "@/lib/crypto/env-var-cipher";

export type ProjectEnvVarItem = {
  id: string;
  key: string;
  value?: string | null;
  sensitive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type StoredProjectEnvVarItem = {
  id: string;
  key: string;
  value?: string | null;
  sensitive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type UpsertProjectEnvVarInput = {
  key: string;
  value: string;
  sensitive?: boolean;
};

const META_ENV_VARS_KEY = "projectEnvVars";
const MASKED_ENV_VALUE = "********";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEnvKey(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeStoredProjectEnvVarItem(value: unknown): StoredProjectEnvVarItem | null {
  const obj = asRecord(value);
  if (!obj) return null;
  const key = typeof obj.key === "string" ? normalizeEnvKey(obj.key) : "";
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return null;
  const id =
    typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id.trim() : `legacy:${key}`;
  const createdAt =
    typeof obj.createdAt === "string" && obj.createdAt.trim().length > 0 ? obj.createdAt : null;
  const updatedAt =
    typeof obj.updatedAt === "string" && obj.updatedAt.trim().length > 0 ? obj.updatedAt : null;
  const rawValue = typeof obj.value === "string" ? obj.value : null;
  return {
    id,
    key,
    value: rawValue,
    sensitive: typeof obj.sensitive === "boolean" ? obj.sensitive : true,
    createdAt,
    updatedAt,
  };
}

function sortStoredEnvVars(items: StoredProjectEnvVarItem[]): StoredProjectEnvVarItem[] {
  return [...items].sort((a, b) => a.key.localeCompare(b.key));
}

function safeDecrypt(value: string, key: string): string | null {
  try {
    return decryptValue(value);
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.error(`[project-env-vars] Failed to decrypt env var "${key}": ${err.message}`);
      return null;
    }
    throw err;
  }
}

const SUSPICIOUS_LITERAL_NEWLINE_RE = /\\n/g;
const SUSPICIOUS_DOUBLE_BACKSLASH_RUN_RE = /\\{4,}/g;

/**
 * Detect (and warn about) common ingest-side corruption in stored env
 * values. The classic case is a value created via `vercel env add … |`
 * piped through PowerShell, which silently substitutes literal `\n`
 * sequences for newlines (documented in `.cursor/rules/platform-quirks.mdc`).
 *
 * We do NOT mutate the value here — secrets like base64-encoded private
 * keys can legitimately contain `\n`, and silently rewriting them would
 * be far worse than the cosmetic warning. The point is to make the
 * leakage observable so the operator can fix it at the source.
 *
 * Returns the value unchanged. Side effect: logs a warning the first
 * time a key with suspicious content is seen per process.
 */
const _warnedKeys = new Set<string>();
function warnIfSuspiciousEnvValue(key: string, value: string): void {
  if (_warnedKeys.has(key)) return;
  let issue: string | null = null;
  // Heuristic: a single isolated `\n` is fine (private keys etc.); 3+
  // is the same threshold the system-prompt assert uses for "this is
  // probably JSON-encoded leakage, not legit content".
  const literalNewlineCount = (value.match(SUSPICIOUS_LITERAL_NEWLINE_RE) ?? []).length;
  if (literalNewlineCount >= 3) {
    issue = `value contains ${literalNewlineCount} literal "\\n" sequences — likely PowerShell pipe to \`vercel env\` substituted newlines for the literal sequence.`;
  } else if (SUSPICIOUS_DOUBLE_BACKSLASH_RUN_RE.test(value)) {
    issue = `value contains a run of 4+ backslashes — likely escape inflation from a previous round-trip.`;
  }
  if (!issue) return;
  _warnedKeys.add(key);
  console.warn(
    `[project-env-vars] Suspicious env value for "${key}": ${issue} ` +
      `Inspect via \`vercel env pull --environment=preview\` and re-set the key from a temp file (see \`.cursor/rules/platform-quirks.mdc\`).`,
  );
}

function toDisplayProjectEnvVarItem(item: StoredProjectEnvVarItem): ProjectEnvVarItem {
  const hasValue = typeof item.value === "string" && item.value.length > 0;
  return {
    id: item.id,
    key: item.key,
    value: item.sensitive
      ? hasValue
        ? MASKED_ENV_VALUE
        : null
      : hasValue
        ? safeDecrypt(item.value!, item.key)
        : null,
    sensitive: item.sensitive,
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
  };
}

function readStoredProjectEnvVarsFromMeta(meta: unknown): StoredProjectEnvVarItem[] {
  const obj = asRecord(meta);
  const raw = Array.isArray(obj?.[META_ENV_VARS_KEY]) ? obj[META_ENV_VARS_KEY] : [];
  return sortStoredEnvVars(
    raw
      .map((item) => normalizeStoredProjectEnvVarItem(item))
      .filter((item): item is StoredProjectEnvVarItem => Boolean(item)),
  );
}

function readProjectEnvVarsFromMeta(meta: unknown): ProjectEnvVarItem[] {
  return readStoredProjectEnvVarsFromMeta(meta).map((item) => toDisplayProjectEnvVarItem(item));
}

function mergeStoredProjectEnvVarsIntoMeta(
  meta: unknown,
  envVars: StoredProjectEnvVarItem[],
): Record<string, unknown> {
  const existing = asRecord(meta) ?? {};
  return {
    ...existing,
    [META_ENV_VARS_KEY]: sortStoredEnvVars(envVars),
  };
}

export async function getStoredProjectEnvVars(projectId: string): Promise<ProjectEnvVarItem[]> {
  const projectData = await getProjectData(projectId);
  return readProjectEnvVarsFromMeta(projectData?.meta ?? null);
}

export async function upsertStoredProjectEnvVars(
  projectId: string,
  vars: UpsertProjectEnvVarInput[],
): Promise<ProjectEnvVarItem[]> {
  const projectData = await getProjectData(projectId);
  const existingMeta = projectData?.meta ?? null;
  const existing = readStoredProjectEnvVarsFromMeta(existingMeta);
  const byKey = new Map(existing.map((item) => [item.key, item]));
  const now = new Date().toISOString();

  vars.forEach((item) => {
    const key = normalizeEnvKey(item.key);
    const previous = byKey.get(key);
    const shouldEncrypt = item.sensitive ?? previous?.sensitive ?? true;
    const canEncrypt = shouldEncrypt && hasEnvVarEncryptionKey();
    if (shouldEncrypt && !canEncrypt) {
      throw new Error(
        `Cannot store sensitive env var "${key}" — ENV_VAR_ENCRYPTION_KEY is not configured.`,
      );
    }
    byKey.set(key, {
      id: previous?.id ?? crypto.randomUUID(),
      key,
      value: canEncrypt ? encryptValue(item.value) : item.value,
      sensitive: canEncrypt,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
  });

  const nextEnvVars = sortStoredEnvVars(Array.from(byKey.values()));
  await saveProjectData({
    project_id: projectId,
    meta: mergeStoredProjectEnvVarsIntoMeta(existingMeta, nextEnvVars),
  });
  return nextEnvVars.map((item) => toDisplayProjectEnvVarItem(item));
}

export async function deleteStoredProjectEnvVars(
  projectId: string,
  payload: { ids?: string[]; keys?: string[] },
): Promise<ProjectEnvVarItem[]> {
  const projectData = await getProjectData(projectId);
  const existingMeta = projectData?.meta ?? null;
  const existing = readStoredProjectEnvVarsFromMeta(existingMeta);
  const idSet = new Set((payload.ids ?? []).map((id) => id.trim()).filter(Boolean));
  const keySet = new Set((payload.keys ?? []).map((key) => normalizeEnvKey(key)).filter(Boolean));
  const nextEnvVars = existing.filter((item) => !idSet.has(item.id) && !keySet.has(item.key));

  await saveProjectData({
    project_id: projectId,
    meta: mergeStoredProjectEnvVarsIntoMeta(existingMeta, nextEnvVars),
  });
  return nextEnvVars.map((item) => toDisplayProjectEnvVarItem(item));
}

export async function getStoredProjectEnvVarMap(projectId: string): Promise<Record<string, string>> {
  const projectData = await getProjectData(projectId);
  const items = readStoredProjectEnvVarsFromMeta(projectData?.meta ?? null);
  return items.reduce<Record<string, string>>((acc, item) => {
    if (typeof item.value === "string" && item.value.length > 0) {
      const decrypted = safeDecrypt(item.value, item.key);
      if (decrypted !== null) {
        // Surface PowerShell-pipe / escape-inflation leakage at ingest
        // so we don't silently propagate `\n` into preview env files
        // and waste a debug session jagging "varför ser det konstigt ut".
        warnIfSuspiciousEnvValue(item.key, decrypted);
        acc[item.key] = decrypted;
      }
    }
    return acc;
  }, {});
}

export async function readAllowPlaceholdersInF3(
  projectId: string | null | undefined,
): Promise<boolean> {
  if (!projectId) return false;
  try {
    const data = await getProjectData(projectId);
    const meta = asRecord(data?.meta);
    return meta?.allowPlaceholdersInF3 === true;
  } catch {
    return false;
  }
}
