/**
 * OMTAG-06 — Default bus subscribers.
 *
 * The bus itself is the single writer; legacy persistence layers
 * (dev-log rolling file + `engine_version_error_logs` DB table) now
 * receive events as subscribers. This keeps:
 *
 *  - `generation-log-writer.ts` summaries working unchanged (it reads
 *    legacy devLog entries from `logs/generationslogg/<runDir>/`),
 *  - `engine_version_error_logs` rows populated for UI surfaces that
 *    haven't migrated to the projection yet (so cut-over is safe),
 *  - the backoffice CSV / panels readable as before.
 *
 * Subscribers run after the in-memory append + NDJSON mirror, so the
 * NDJSON is the authoritative stream and the DB / devLog are derived
 * caches. See OMTAG/06-unified-status-eventbus.md.
 */

import { devLogAppend } from "./devLog";
import { subscribe } from "./event-bus";
import type { EngineEvent } from "./event-bus-types";

/** Guard: only one set of defaults is wired per process. */
let defaultsInstalled = false;

/**
 * Translate a bus event to its legacy `devLog` type + payload so
 * `generation-log-writer.ts` keeps producing the same summary.md /
 * timeline.ndjson rows it does today.
 *
 * Returns `null` for events that have no legacy counterpart (the
 * legacy timeline was never 1:1 with the bus; e.g. `version.started`
 * is already written by `site.start`).
 */
export function mapEventToDevLog(event: EngineEvent): {
  target: "in-progress" | "latest";
  entry: Record<string, unknown>;
} | null {
  switch (event.t) {
    case "version.preflight":
      return {
        target: "in-progress",
        entry: {
          type: "preflight.summary",
          chatId: event.chatId ?? null,
          versionId: event.versionId,
          filesChecked: event.filesChecked,
          issueCount: event.issueCount,
          errorCount: event.errorCount,
          warningCount: event.warningCount,
          verificationBlocked: event.verificationBlocked,
          previewBlocked: event.previewBlocked,
          previewBlockingReason: event.previewBlockingReason ?? null,
        },
      };

    case "version.verifier.done":
      // Legacy `server-verify.policy` entry — kept as the devLog type
      // because existing backoffice filters key off this exact string.
      return {
        target: "in-progress",
        entry: {
          type: "server-verify.policy",
          chatId: event.chatId ?? null,
          versionId: event.versionId,
          run: event.outcome !== "skipped",
          outcome: event.outcome,
          blocked: event.blocked,
          reason: event.reason ?? null,
          findings: event.findings ?? [],
        },
      };

    case "version.build.error":
      return {
        target: "in-progress",
        entry: {
          type: "preview-preflight.error",
          chatId: event.chatId ?? null,
          versionId: event.versionId,
          stage: event.error.stage,
          message: event.error.message,
          failureCode: event.error.failureCode ?? null,
          category: event.category ?? null,
        },
      };

    case "version.repair.started":
      return {
        target: "in-progress",
        entry: {
          type: "version.repair.started",
          chatId: event.chatId ?? null,
          versionId: event.versionId,
          runId: event.runId,
          reason: event.reason,
          trigger: event.trigger,
        },
      };

    case "version.repair.passIndex":
      return {
        target: "in-progress",
        entry: {
          type: "version.repair.passIndex",
          chatId: event.chatId ?? null,
          versionId: event.versionId,
          runId: event.runId,
          passIndex: event.passIndex,
        },
      };

    case "version.saved":
      return {
        target: "in-progress",
        entry: {
          type: "version.saved",
          chatId: event.chatId ?? null,
          versionId: event.versionId,
          previewBlocked: event.previewBlocked,
          verificationBlocked: event.verificationBlocked,
          messageId: event.messageId ?? null,
        },
      };

    case "version.done":
      // `site.done` is still emitted directly by the legacy path during
      // cut-over; skip to avoid duplicate rows. Remove once the legacy
      // `devLogAppend({ type: "site.done" })` in generation-stream-post-finalize
      // moves behind the bus as well.
      return null;

    case "version.started":
    case "version.stream.tokenProgress":
    case "version.autofix.result":
    case "version.syntax.pass":
      // These are observability-only and already covered by existing
      // devLog entries (`site.start`, `autofix.result`, etc). Skipping
      // prevents double-writes during cut-over.
      return null;

    default:
      return null;
  }
}

/**
 * Wire the default subscribers. Idempotent — safe to call from test
 * setup and from module side-effects.
 */
export function installDefaultSubscribers(): void {
  if (defaultsInstalled) return;
  defaultsInstalled = true;
  subscribe((event) => {
    const mapped = mapEventToDevLog(event);
    if (!mapped) return;
    try {
      devLogAppend(mapped.target, mapped.entry);
    } catch (err) {
      // devLogAppend is already best-effort, but we belt-and-suspenders
      // in case the file-system path is momentarily unavailable.
      console.warn(
        "[event-bus] devLog-mirror subscriber failed:",
        err instanceof Error ? err.message : err,
      );
    }
  });
}

/**
 * Test helper — allow re-installing the defaults inside a vi.resetModules()
 * block.
 */
export function __resetSubscribersForTests(): void {
  defaultsInstalled = false;
}

// Auto-install during module load. Safe because:
//   1. `installDefaultSubscribers` is idempotent.
//   2. The only side-effect is `subscribe(fn)` which is a pure map-add.
//   3. Tests can opt-out via `__resetSubscribersForTests()`.
installDefaultSubscribers();
