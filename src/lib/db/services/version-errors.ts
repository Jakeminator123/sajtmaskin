import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { getScaffoldById } from "@/lib/gen/scaffolds";
import { engineChats, engineVersionErrorLogs } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { VersionErrorLog } from "./shared";
import { appendBugRegisterEntries } from "@/lib/logging/bug-register";

type VersionErrorLogPayload = {
  chatId: string;
  versionId: string;
  v0VersionId?: string | null;
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

type EngineScaffoldContext = {
  scaffoldId: string;
  scaffoldLabel: string | null;
  persistedOn: "engine_chat";
};

function mapLogPayload(payload: VersionErrorLogPayload, now: Date) {
  return {
    id: nanoid(),
    chat_id: payload.chatId,
    version_id: payload.versionId,
    v0_version_id: payload.v0VersionId || null,
    level: payload.level,
    category: payload.category || null,
    message: payload.message,
    meta: payload.meta || null,
    created_at: now,
  };
}

function buildEngineScaffoldContext(scaffoldId: string | null): EngineScaffoldContext | null {
  if (!scaffoldId) return null;
  const manifest = getScaffoldById(scaffoldId);
  return {
    scaffoldId,
    scaffoldLabel: manifest?.label ?? null,
    persistedOn: "engine_chat",
  };
}

function mergeScaffoldContext(
  meta: Record<string, unknown> | null | undefined,
  scaffoldContext: EngineScaffoldContext | null,
) {
  const base =
    meta && typeof meta === "object"
      ? { ...meta }
      : {};
  if (!scaffoldContext) {
    return Object.keys(base).length > 0 ? base : null;
  }

  const existing =
    base.scaffoldContext && typeof base.scaffoldContext === "object"
      ? (base.scaffoldContext as Record<string, unknown>)
      : {};

  return {
    ...base,
    scaffoldContext: {
      ...existing,
      ...scaffoldContext,
    },
  };
}

async function enrichEnginePayloads(
  payloads: VersionErrorLogPayload[],
): Promise<VersionErrorLogPayload[]> {
  const chatIds = Array.from(new Set(payloads.map((payload) => payload.chatId).filter(Boolean)));
  if (chatIds.length === 0) return payloads;

  const rows = await db
    .select({
      id: engineChats.id,
      scaffoldId: engineChats.scaffoldId,
    })
    .from(engineChats)
    .where(inArray(engineChats.id, chatIds));

  const byChatId = new Map(
    rows.map((row) => [row.id, buildEngineScaffoldContext(row.scaffoldId ?? null)]),
  );

  return payloads.map((payload) => ({
    ...payload,
    meta: mergeScaffoldContext(payload.meta, byChatId.get(payload.chatId) ?? null),
  }));
}

export async function createEngineVersionErrorLog(
  payload: VersionErrorLogPayload,
): Promise<VersionErrorLog> {
  assertDbConfigured();
  const now = new Date();
  const [enrichedPayload] = await enrichEnginePayloads([payload]);
  const rows = await db
    .insert(engineVersionErrorLogs)
    .values(mapLogPayload(enrichedPayload, now))
    .returning();
  // Fas 2: mirror bug-level findings to the flat JSONL bug register (best-effort).
  appendBugRegisterEntries([enrichedPayload]);
  return rows[0] as VersionErrorLog;
}

/**
 * Postgres `lock_not_available` (55P03) — raised when a transaction-local
 * `lock_timeout` expires while waiting for a row lock. Mirrors the helper in
 * `chat-repository-pg.ts`; duplicated here to avoid a cross-module import cycle.
 */
function isLockTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "55P03") return true;
  const cause = (err as { cause?: unknown }).cause;
  return cause != null && cause !== err && isLockTimeoutError(cause);
}

export async function createEngineVersionErrorLogs(
  payloads: VersionErrorLogPayload[],
  options?: {
    /**
     * Best-effort mode (prod incident 2026-07-03, chat 3120c05c): inserting an
     * error-log row takes an FK `FOR KEY SHARE` lock on the referenced
     * `engine_versions` row. When a concurrent verify/lease holds `FOR UPDATE`
     * on that row (quality-gate `acquireVersionLease`), the insert blocked until
     * Supabase's global `statement_timeout` (57014) and the whole route 500:ade —
     * even though these findings are pure diagnostics. A transaction-local
     * `lock_timeout` makes the contended insert give up in ~ms (55P03); we then
     * return `[]` so the caller degrades gracefully instead of surfacing a
     * statement-timeout 500. Same medicine as `updateVersionPreviewUrl` (#370).
     */
    lockTimeoutMs?: number;
  },
): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  if (payloads.length === 0) return [];
  const now = new Date();
  const enrichedPayloads = await enrichEnginePayloads(payloads);
  const values = enrichedPayloads.map((payload) => mapLogPayload(payload, now));

  const lockTimeoutMs = options?.lockTimeoutMs;
  let rows: VersionErrorLog[];
  if (typeof lockTimeoutMs === "number" && Number.isFinite(lockTimeoutMs) && lockTimeoutMs > 0) {
    try {
      rows = (await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('lock_timeout', ${String(Math.floor(lockTimeoutMs))}, true)`,
        );
        return await tx.insert(engineVersionErrorLogs).values(values).returning();
      })) as VersionErrorLog[];
    } catch (err) {
      if (isLockTimeoutError(err)) {
        // Row contention on engine_versions — skip the best-effort diagnostics
        // write instead of 500:ing. The caller treats `[]` as "not stored".
        return [];
      }
      throw err;
    }
  } else {
    rows = (await db
      .insert(engineVersionErrorLogs)
      .values(values)
      .returning()) as VersionErrorLog[];
  }
  // Fas 2: mirror bug-level findings to the flat JSONL bug register (best-effort).
  appendBugRegisterEntries(enrichedPayloads);
  return rows;
}

export async function getEngineVersionErrorLogs(versionId: string): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(engineVersionErrorLogs)
    .where(eq(engineVersionErrorLogs.version_id, versionId))
    .orderBy(desc(engineVersionErrorLogs.created_at));
  return rows as VersionErrorLog[];
}

export async function getLatestEngineVersionErrorLogs(
  versionId: string,
  limit = 200,
): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(engineVersionErrorLogs)
    .where(eq(engineVersionErrorLogs.version_id, versionId))
    .orderBy(desc(engineVersionErrorLogs.created_at))
    .limit(limit);
  return rows as VersionErrorLog[];
}

/**
 * Repair-loop hardening — SAJ-25.
 *
 * When a follow-up/repair pass on the SAME `versionId` has no current
 * preflight/syntax blockers, the error-log rows from PREVIOUS passes (rows
 * whose `meta.repairPassIndex < currentRepairPassIndex`) are stale because
 * they describe state that no longer exists. Verifier-only findings from the
 * current pass may still be active, but they must not keep older rows alive.
 *
 * This prune is best-effort:
 *  - only deletes rows with strictly lower `meta.repairPassIndex`
 *  - never throws (callers wrap in try/catch and rely on devLog telemetry)
 *
 * Returns the number of rows deleted so the caller can log
 * `version_error_log_pruned`.
 */
export async function pruneStaleVersionErrorLogs(
  versionId: string,
  currentRepairPassIndex: number,
): Promise<number> {
  assertDbConfigured();
  if (!versionId) return 0;
  if (!Number.isFinite(currentRepairPassIndex) || currentRepairPassIndex <= 0) {
    return 0;
  }
  // Drizzle / pg JSONB comparison: cast `meta->>'repairPassIndex'` to int
  // and compare. Rows that lack the meta key are treated as repairPassIndex
  // 0, which is correct: anything written before the consistentRepairPassIndex
  // feature-flag rolled out predates the current pass.
  const result = await db
    .delete(engineVersionErrorLogs)
    .where(
      and(
        eq(engineVersionErrorLogs.version_id, versionId),
        lt(
          sql`COALESCE((${engineVersionErrorLogs.meta}->>'repairPassIndex')::int, 0)`,
          currentRepairPassIndex,
        ),
      ),
    )
    .returning({ id: engineVersionErrorLogs.id });
  return result.length;
}
