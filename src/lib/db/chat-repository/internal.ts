// Shared internal helpers for the chat-repository modules. NOT part of the
// public repository surface — import via ../chat-repository-pg instead.
import { db } from "../client";
import { engineVersions } from "../schema";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Version } from "./types";

export function uuid(): string {
  return crypto.randomUUID();
}

export function toRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[snakeKey] = val instanceof Date ? val.toISOString() : val;
  }
  return out;
}

export async function loadVersionById(
  executor: Pick<typeof db, "select">,
  versionId: string,
): Promise<Version> {
  const rows = await executor
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  return toRow(rows[0]) as unknown as Version;
}

export async function getStoredVersion(versionId: string): Promise<Version> {
  return loadVersionById(db, versionId);
}

/**
 * Postgres `lock_not_available` (55P03) — raised when a transaction-local
 * `lock_timeout` expires while waiting for a row lock. Used to translate
 * contention into a graceful no-op instead of an unhandled 500.
 */
export function isLockTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "55P03") return true;
  const cause = (err as { cause?: unknown }).cause;
  return cause != null && cause !== err && isLockTimeoutError(cause);
}

/**
 * Transaction-local lock budget for the lease/watchdog `FOR UPDATE` paths.
 * Prod-observed (2026-07-02/03): without this, a contended `SELECT … FOR
 * UPDATE` blocks until the global `statement_timeout` (57014) and surfaces as
 * quality-gate/preview 500s. 5s is generous for the short lease transactions —
 * a wait longer than that means another job actively owns the row.
 */
export const LEASE_LOCK_TIMEOUT_MS = 5_000;

/**
 * Build the WHERE for a server-owned version mutation. When `runId` is provided
 * the UPDATE is conditioned (atomically) on this run still holding the active,
 * unexpired lease — so a run whose lease was taken over no-ops instead of
 * clobbering. When `runId` is omitted, behaviour is unchanged (finalize /
 * createAndPromote paths own the row inline, before any background job).
 */
export function versionWriteWhere(versionId: string, runId?: string): SQL | undefined {
  const byId = eq(engineVersions.id, versionId);
  if (!runId) return byId;
  return and(
    byId,
    sql`EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.run_id = ${runId} AND j.status = 'running' AND j.lease_expires_at > now())`,
  );
}
