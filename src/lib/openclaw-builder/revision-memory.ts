/**
 * In-memory, revision-bound summary store for OpenClaw Builder.
 * Not a source of truth and not canonical project state. No persistence,
 * env, fs, or fetch. One entry per tenant+chat; stale version/revision
 * reads miss rather than return leftover summaries.
 */

export const DEFAULT_MAX_ENTRIES = 32;
export const DEFAULT_MAX_SUMMARY_CHARS = 2000;

export type MemoryScope = {
  tenantId: string;
  chatId: string;
  versionId: string;
  filesRevision: string;
};

export type MemoryEntry = {
  summary: string;
  updatedAtMs: number;
};

export type RevisionMemoryPutResult =
  | { ok: true }
  | { ok: false; code: "invalid_scope" | "invalid_summary" | "capacity" };

type StoredEntry = MemoryEntry & {
  versionId: string;
  filesRevision: string;
};

type InvalidateScope = Pick<MemoryScope, "tenantId" | "chatId"> &
  Partial<Pick<MemoryScope, "versionId" | "filesRevision">>;

const SECRET_RE = /bearer|sk-|BEGIN PRIVATE KEY/i;

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseScope(scope: MemoryScope | null | undefined): {
  tenantId: string;
  chatId: string;
  versionId: string;
  filesRevision: string;
} | null {
  if (scope == null || typeof scope !== "object") return null;
  const tenantId = normalizeId(scope.tenantId);
  const chatId = normalizeId(scope.chatId);
  const versionId = normalizeId(scope.versionId);
  const filesRevision = normalizeId(scope.filesRevision);
  if (!tenantId || !chatId || !versionId || !filesRevision) return null;
  return { tenantId, chatId, versionId, filesRevision };
}

function hasIllegalControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 9 || code === 10) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function normalizeSummary(summary: unknown, maxSummaryChars: number): string | null {
  if (typeof summary !== "string") return null;
  const trimmed = summary.trim();
  if (trimmed.length === 0 || trimmed.length > maxSummaryChars) return null;
  if (hasIllegalControlChars(trimmed)) return null;
  if (SECRET_RE.test(trimmed)) return null;
  return trimmed;
}

function boundInt(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function resolveUpdatedAtMs(nowMs: number | undefined): number {
  if (typeof nowMs === "number" && Number.isFinite(nowMs)) return nowMs;
  return Date.now();
}

export function createRevisionMemory(options?: {
  maxEntries?: number;
  maxSummaryChars?: number;
}): {
  get(scope: MemoryScope): MemoryEntry | null;
  put(
    scope: MemoryScope,
    summary: string,
    nowMs?: number,
  ): RevisionMemoryPutResult;
  invalidate(scope: InvalidateScope): number;
} {
  const maxEntries = boundInt(options?.maxEntries, DEFAULT_MAX_ENTRIES);
  const maxSummaryChars = boundInt(options?.maxSummaryChars, DEFAULT_MAX_SUMMARY_CHARS);
  const tenants = new Map<string, Map<string, StoredEntry>>();

  function entryCount(): number {
    let count = 0;
    for (const chats of tenants.values()) count += chats.size;
    return count;
  }

  function publicEntry(stored: StoredEntry): MemoryEntry {
    return { summary: stored.summary, updatedAtMs: stored.updatedAtMs };
  }

  return {
    get(scope) {
      const parsed = parseScope(scope);
      if (!parsed) return null;
      const stored = tenants.get(parsed.tenantId)?.get(parsed.chatId);
      if (!stored) return null;
      if (
        stored.versionId !== parsed.versionId ||
        stored.filesRevision !== parsed.filesRevision
      ) {
        return null;
      }
      return publicEntry(stored);
    },

    put(scope, summary, nowMs) {
      const parsed = parseScope(scope);
      if (!parsed) return { ok: false, code: "invalid_scope" };

      const clean = normalizeSummary(summary, maxSummaryChars);
      if (clean == null) return { ok: false, code: "invalid_summary" };

      const chats = tenants.get(parsed.tenantId);
      const existing = chats?.get(parsed.chatId);
      if (!existing && entryCount() >= maxEntries) {
        return { ok: false, code: "capacity" };
      }

      const next: StoredEntry = {
        summary: clean,
        updatedAtMs: resolveUpdatedAtMs(nowMs),
        versionId: parsed.versionId,
        filesRevision: parsed.filesRevision,
      };

      if (chats) {
        chats.set(parsed.chatId, next);
      } else {
        tenants.set(parsed.tenantId, new Map([[parsed.chatId, next]]));
      }
      return { ok: true };
    },

    invalidate(scope) {
      const tenantId = normalizeId(scope?.tenantId);
      const chatId = normalizeId(scope?.chatId);
      if (!tenantId || !chatId) return 0;

      const chats = tenants.get(tenantId);
      const stored = chats?.get(chatId);
      if (!stored || !chats) return 0;

      const versionId = normalizeId(scope.versionId);
      const filesRevision = normalizeId(scope.filesRevision);
      if (versionId != null && stored.versionId !== versionId) return 0;
      if (filesRevision != null && stored.filesRevision !== filesRevision) {
        return 0;
      }

      chats.delete(chatId);
      if (chats.size === 0) tenants.delete(tenantId);
      return 1;
    },
  };
}
