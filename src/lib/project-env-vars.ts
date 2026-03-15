import { getProjectData, saveProjectData } from "@/lib/db/services";
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

export function readProjectEnvVarsFromMeta(meta: unknown): ProjectEnvVarItem[] {
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
    if (shouldEncrypt && !hasEnvVarEncryptionKey()) {
      throw new Error(
        "ENV_VAR_ENCRYPTION_KEY must be configured before saving sensitive project env vars.",
      );
    }
    byKey.set(key, {
      id: previous?.id ?? crypto.randomUUID(),
      key,
      value: shouldEncrypt ? encryptValue(item.value) : item.value,
      sensitive: shouldEncrypt,
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
        acc[item.key] = decrypted;
      }
    }
    return acc;
  }, {});
}
