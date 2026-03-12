import { getProjectData, saveProjectData } from "@/lib/db/services";
import { encryptValue, decryptValue } from "@/lib/crypto/env-var-cipher";

export type ProjectEnvVarItem = {
  id: string;
  key: string;
  value?: string | null;
  sensitive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type UpsertProjectEnvVarInput = {
  key: string;
  value: string;
  sensitive?: boolean;
};

const META_ENV_VARS_KEY = "projectEnvVars";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEnvKey(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeProjectEnvVarItem(value: unknown): ProjectEnvVarItem | null {
  const obj = asRecord(value);
  if (!obj) return null;
  const key = typeof obj.key === "string" ? normalizeEnvKey(obj.key) : "";
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return null;
  const id =
    typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id.trim() : crypto.randomUUID();
  const createdAt =
    typeof obj.createdAt === "string" && obj.createdAt.trim().length > 0 ? obj.createdAt : null;
  const updatedAt =
    typeof obj.updatedAt === "string" && obj.updatedAt.trim().length > 0 ? obj.updatedAt : null;
  const rawValue = typeof obj.value === "string" ? obj.value : null;
  return {
    id,
    key,
    value: rawValue ? decryptValue(rawValue) : null,
    sensitive: typeof obj.sensitive === "boolean" ? obj.sensitive : true,
    createdAt,
    updatedAt,
  };
}

function sortEnvVars(items: ProjectEnvVarItem[]): ProjectEnvVarItem[] {
  return [...items].sort((a, b) => a.key.localeCompare(b.key));
}

export function readProjectEnvVarsFromMeta(meta: unknown): ProjectEnvVarItem[] {
  const obj = asRecord(meta);
  const raw = Array.isArray(obj?.[META_ENV_VARS_KEY]) ? obj[META_ENV_VARS_KEY] : [];
  return sortEnvVars(
    raw
      .map((item) => normalizeProjectEnvVarItem(item))
      .filter((item): item is ProjectEnvVarItem => Boolean(item)),
  );
}

export function mergeProjectEnvVarsIntoMeta(
  meta: unknown,
  envVars: ProjectEnvVarItem[],
): Record<string, unknown> {
  const existing = asRecord(meta) ?? {};
  return {
    ...existing,
    [META_ENV_VARS_KEY]: sortEnvVars(envVars),
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
  const existing = readProjectEnvVarsFromMeta(existingMeta);
  const byKey = new Map(existing.map((item) => [item.key, item]));
  const now = new Date().toISOString();

  vars.forEach((item) => {
    const key = normalizeEnvKey(item.key);
    const previous = byKey.get(key);
    const shouldEncrypt = item.sensitive ?? previous?.sensitive ?? true;
    byKey.set(key, {
      id: previous?.id ?? crypto.randomUUID(),
      key,
      value: shouldEncrypt ? encryptValue(item.value) : item.value,
      sensitive: shouldEncrypt,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
  });

  const nextEnvVars = sortEnvVars(Array.from(byKey.values()));
  await saveProjectData({
    project_id: projectId,
    meta: mergeProjectEnvVarsIntoMeta(existingMeta, nextEnvVars),
  });
  return nextEnvVars;
}

export async function deleteStoredProjectEnvVars(
  projectId: string,
  payload: { ids?: string[]; keys?: string[] },
): Promise<ProjectEnvVarItem[]> {
  const projectData = await getProjectData(projectId);
  const existingMeta = projectData?.meta ?? null;
  const existing = readProjectEnvVarsFromMeta(existingMeta);
  const idSet = new Set((payload.ids ?? []).map((id) => id.trim()).filter(Boolean));
  const keySet = new Set((payload.keys ?? []).map((key) => normalizeEnvKey(key)).filter(Boolean));
  const nextEnvVars = existing.filter((item) => !idSet.has(item.id) && !keySet.has(item.key));

  await saveProjectData({
    project_id: projectId,
    meta: mergeProjectEnvVarsIntoMeta(existingMeta, nextEnvVars),
  });
  return nextEnvVars;
}

export async function getStoredProjectEnvVarMap(projectId: string): Promise<Record<string, string>> {
  const items = await getStoredProjectEnvVars(projectId);
  return items.reduce<Record<string, string>>((acc, item) => {
    if (typeof item.value === "string" && item.value.length > 0) {
      acc[item.key] = item.value;
    }
    return acc;
  }, {});
}
