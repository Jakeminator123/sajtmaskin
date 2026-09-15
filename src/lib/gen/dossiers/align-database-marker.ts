/**
 * SM-030: a tool-only F3 round can persist `mongodb` in the continuation
 * marker after F2 already saved a database dossier (`postgres-drizzle`).
 * Approval, readiness and the prompt then union both identities.
 *
 * Align the marker's database provider to the selected dossier. Keep
 * dossierless Mongo when no database dossier is selected.
 */
import { readF3ApprovedFromSnapshot, readMutedDossierIdsFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import type { CodeFile } from "@/lib/gen/parser";
import { resolvePendingIntegrationDossiers } from "./pending-integrations";
import { getDossierById, resolveDossierProvider } from "./registry";
import type { DossierEntry } from "./types";

function normalizeProviderKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function dedupeProviders(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    const key = normalizeProviderKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function readSelectedDossierIds(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const value = (snapshot as Record<string, unknown>).selectedDossierIds;
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeProviderKey(entry))
    .filter((entry) => entry.length > 0);
}

function snapshotRecord(snapshot: unknown): Record<string, unknown> | null {
  return snapshot && typeof snapshot === "object"
    ? (snapshot as Record<string, unknown>)
    : null;
}

/**
 * Explicit saved/pending database dossier, if any. Capability-default
 * pending (`mutedCapabilities: ["database"]` → postgres-drizzle) counts as
 * selected. Empty input keeps dossierless Mongo.
 */
export function resolveSelectedDatabaseDossier(params: {
  snapshot?: unknown;
  extraDossierIds?: readonly string[] | null;
  versionFiles?: readonly Pick<CodeFile, "path">[] | null;
}): DossierEntry | null {
  const ids = new Set<string>([
    ...readMutedDossierIdsFromSnapshot(snapshotRecord(params.snapshot)),
    ...readSelectedDossierIds(params.snapshot),
    ...dedupeProviders(params.extraDossierIds ?? []),
  ]);
  for (const id of ids) {
    const entry = getDossierById(id);
    if (entry?.capability === "database") return entry;
  }
  const pending = resolvePendingIntegrationDossiers({
    snapshot: snapshotRecord(params.snapshot),
    versionFiles: (params.versionFiles ?? []) as CodeFile[],
  });
  return pending.find((selected) => selected.entry.capability === "database")?.entry ?? null;
}

function isDatabaseIdentityProvider(raw: string): boolean {
  const key = normalizeProviderKey(raw);
  if (!key) return false;
  if (key === "mongodb" || key === "mongodb-atlas") return true;
  const exact = getDossierById(key);
  if (exact?.capability === "database") return true;
  return resolveDossierProvider(key).capabilities.includes("database");
}

const DROPPED_MONGO_ENV_KEYS = new Set(["mongodb_uri"]);

export function alignDatabaseMarker(params: {
  suggestedProviders: readonly string[];
  requestedEnvKeys?: readonly string[];
  snapshot?: unknown;
  extraDossierIds?: readonly string[] | null;
  versionFiles?: readonly Pick<CodeFile, "path">[] | null;
}): { suggestedProviders: string[]; requestedEnvKeys: string[] } {
  const suggestedProviders = dedupeProviders(params.suggestedProviders);
  const requestedEnvKeys = dedupeProviders(params.requestedEnvKeys ?? []);
  const selected = resolveSelectedDatabaseDossier(params);
  if (!selected) {
    return { suggestedProviders, requestedEnvKeys };
  }

  const selectedKeys = new Set(
    [selected.id, ...(selected.providers ?? [])].map(normalizeProviderKey),
  );
  const replacement = (selected.providers?.[0] ?? selected.id).trim();
  let droppedConflictingDatabase = false;
  const aligned: string[] = [];
  for (const provider of suggestedProviders) {
    const key = normalizeProviderKey(provider);
    if (!isDatabaseIdentityProvider(provider)) {
      aligned.push(provider);
      continue;
    }
    if (selectedKeys.has(key)) {
      aligned.push(provider);
      continue;
    }
    droppedConflictingDatabase = true;
  }
  if (
    droppedConflictingDatabase &&
    replacement &&
    !aligned.some((provider) => selectedKeys.has(normalizeProviderKey(provider)))
  ) {
    aligned.unshift(replacement);
  }

  const alignedEnvKeys = droppedConflictingDatabase
    ? requestedEnvKeys.filter((key) => !DROPPED_MONGO_ENV_KEYS.has(normalizeProviderKey(key)))
    : requestedEnvKeys;

  return {
    suggestedProviders: aligned,
    requestedEnvKeys: alignedEnvKeys,
  };
}

/** Marker-or-persisted providers, then SM-030 database alignment. */
export function resolveEffectiveF3ApprovedProviders(params: {
  markerSuggestedProviders: readonly string[];
  snapshot?: unknown;
  extraDossierIds?: readonly string[] | null;
  versionFiles?: readonly Pick<CodeFile, "path">[] | null;
}): string[] {
  const persisted = readF3ApprovedFromSnapshot(snapshotRecord(params.snapshot));
  const raw =
    params.markerSuggestedProviders.length > 0
      ? params.markerSuggestedProviders
      : persisted.providers;
  return alignDatabaseMarker({
    suggestedProviders: raw,
    snapshot: params.snapshot,
    extraDossierIds: params.extraDossierIds,
    versionFiles: params.versionFiles,
  }).suggestedProviders;
}
