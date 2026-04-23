/**
 * OMTAG-06 — Bus-mediated `engine_version_error_logs` writer.
 *
 * Before this module, callers inserted rows into
 * `engine_version_error_logs` directly via `createEngineVersionErrorLogs`.
 * After OMTAG-06 the DB write is a **subscriber** of the event bus:
 * callers emit `version.build.error` events, the subscriber translates
 * them into DB rows via the existing service, and the UI projects
 * status from the same stream.
 *
 * `emitVersionErrorLogs()` is the single entry-point used by migrated
 * writers. It avoids a circular dep on `@/lib/db/services/version-errors`
 * via a lazy import so the bus module stays FS-only at module load.
 */

import { emit, subscribe } from "./event-bus";
import type { EngineEvent } from "./event-bus-types";

export type VersionErrorLogLevel = "info" | "warning" | "error";

/**
 * Payload mirrors `VersionErrorLogPayload` from
 * `@/lib/db/services/version-errors` (kept type-compatible without
 * importing it so this module can be consumed in server-only and
 * test contexts without pulling drizzle in).
 */
export interface BusVersionErrorLogPayload {
  chatId: string;
  versionId: string;
  v0VersionId?: string | null;
  level: VersionErrorLogLevel;
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
  /**
   * Optional run scoping — defaults to the bus's `DEFAULT_RUN_ID`
   * unless the caller knows it's mid-repair.
   */
  runId?: string;
}

let dbSubscriberInstalled = false;

/**
 * Lazily install the DB sink subscriber. Separate from
 * `installDefaultSubscribers` because it imports the DB layer, which
 * isn't desirable from unit tests that don't need Postgres.
 */
export function installDbErrorLogSubscriber(): void {
  if (dbSubscriberInstalled) return;
  dbSubscriberInstalled = true;

  subscribe((event: EngineEvent) => {
    if (event.t !== "version.build.error") return;
    const payload = extractPayloadFromEvent(event);
    if (!payload) return;

    void (async () => {
      try {
        const { createEngineVersionErrorLogs } = await import(
          "@/lib/db/services/version-errors"
        );
        await createEngineVersionErrorLogs([payload]);
      } catch (err) {
        console.warn(
          "[event-bus] DB error-log sink failed:",
          err instanceof Error ? err.message : err,
        );
      }
    })();
  });
}

/**
 * Emit one or more `version.build.error` events and let the DB
 * subscriber persist rows. Returns the emitted events so callers can
 * correlate (e.g. attach repair pass meta later).
 */
export function emitVersionErrorLogs(
  payloads: BusVersionErrorLogPayload[],
): EngineEvent[] {
  const out: EngineEvent[] = [];
  for (const payload of payloads) {
    const event = emit({
      t: "version.build.error",
      versionId: payload.versionId,
      chatId: payload.chatId,
      runId: payload.runId,
      error: {
        stage: toStage(payload.category, payload.meta),
        message: payload.message,
        failureCode: null,
      },
      category: payload.category ?? undefined,
      level: payload.level,
      meta: normalizeMeta(payload),
    });
    out.push(event);
  }
  return out;
}

function toStage(
  category: string | null | undefined,
  meta: Record<string, unknown> | null | undefined,
): string {
  if (category && category.trim()) return category.trim();
  const metaStage = meta && typeof meta.stage === "string" ? meta.stage : null;
  return metaStage ?? "engine_version_error_logs";
}

function normalizeMeta(payload: BusVersionErrorLogPayload): Record<string, unknown> | null {
  const base = payload.meta && typeof payload.meta === "object" ? { ...payload.meta } : {};
  // Preserve the full DB payload shape inside `meta` so the subscriber
  // can reconstruct the DB row 1:1 without losing v0VersionId, level,
  // or category detail.
  base.__dbPayload = {
    v0VersionId: payload.v0VersionId ?? null,
    level: payload.level,
    category: payload.category ?? null,
    message: payload.message,
  };
  return base;
}

function extractPayloadFromEvent(
  event: Extract<EngineEvent, { t: "version.build.error" }>,
): BusVersionErrorLogPayload | null {
  if (!event.chatId) return null;
  const meta = event.meta && typeof event.meta === "object" ? { ...event.meta } : {};
  const dbPayload =
    meta.__dbPayload && typeof meta.__dbPayload === "object"
      ? (meta.__dbPayload as Record<string, unknown>)
      : null;
  delete meta.__dbPayload;

  const level: VersionErrorLogLevel =
    (dbPayload?.level as VersionErrorLogLevel | undefined) ?? event.level ?? "error";
  const category =
    typeof dbPayload?.category === "string"
      ? (dbPayload.category as string)
      : (event.category ?? null);
  const message =
    typeof dbPayload?.message === "string" ? (dbPayload.message as string) : event.error.message;
  const v0VersionId = typeof dbPayload?.v0VersionId === "string" ? (dbPayload.v0VersionId as string) : null;

  return {
    chatId: event.chatId,
    versionId: event.versionId,
    v0VersionId,
    level,
    category,
    message,
    meta: Object.keys(meta).length > 0 ? meta : null,
  };
}

export function __resetErrorLogSinkForTests(): void {
  dbSubscriberInstalled = false;
}

// Auto-install when this module is imported server-side. Consumers
// reach it via `emitVersionErrorLogs` so the subscriber is always in
// place before the first emit.
installDbErrorLogSubscriber();
