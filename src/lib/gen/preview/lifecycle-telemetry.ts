/**
 * Structured logs for preview lifecycle (heartbeat, status, recover, start outcome).
 * Query logs with prefix `[telemetry:preview-lifecycle]`.
 */

export type PreviewLifecycleTelemetryEvent =
  | {
      kind: "heartbeat";
      ok: boolean;
      chatId: string;
      reason?: string;
      viewerId?: string;
    }
  | {
      kind: "preview_status";
      chatId: string;
      status: string;
      versionId?: string;
      previewSessionId?: string | null;
    }
  | {
      kind: "recover";
      phase: "started" | "succeeded" | "failed";
      chatId: string;
      versionId?: string;
      detail?: string;
    }
  | {
      kind: "preview_start_outcome";
      chatId: string;
      versionId?: string | null;
      outcome: "resumed" | "recreated";
      previewPolicy?: string | null;
      verificationPolicy?: string | null;
      tier2Provider?: "preview_host";
    }
  | {
      /**
       * Runtime-up-signal: preview-host bekräftade `running: true` för
       * versionens session (resume-verifierad). Incident-/loggtooling tolkar
       * `preview_ready` som "runtime uppe" — emittera den ALDRIG för en boot
       * som bara är köad (M#pv1, PR #377 runda 4); använd
       * `preview_url_handoff` för det fallet.
       */
      kind: "preview_ready";
      chatId: string;
      versionId?: string | null;
      previewSessionId?: string | null;
      previewMode: string;
      fidelityTier: 2 | 3;
      prodBuildVerified?: boolean;
      startOutcome: "resumed" | "recreated";
      previewPolicy?: string | null;
      verificationPolicy?: string | null;
      msSinceEngineStart: number;
    }
  | {
      /**
       * URL-handoff för en KÖAD boot: sessionen skapades/uppdaterades och
       * preview-URL:en har lämnats till klienten, men preview-host har bara
       * köat bootet — runtimen är INTE bekräftad ännu (`preview_success`
       * förblir pending tills ett riktigt kvitto). Samma fält som
       * `preview_ready` så latens-analys (`msSinceEngineStart`) fungerar.
       */
      kind: "preview_url_handoff";
      chatId: string;
      versionId?: string | null;
      previewSessionId?: string | null;
      previewMode: string;
      fidelityTier: 2 | 3;
      prodBuildVerified?: boolean;
      startOutcome: "resumed" | "recreated";
      previewPolicy?: string | null;
      verificationPolicy?: string | null;
      msSinceEngineStart: number;
    }
  | {
      kind: "preview_failed";
      chatId: string;
      versionId?: string | null;
      stage: string;
      failureCode?: string;
      detail?: string;
      previewPolicy?: string | null;
      verificationPolicy?: string | null;
      msSinceEngineStart: number;
      tier2Provider?: "preview_host";
    }
  | {
      kind: "preview_url_resync";
      chatId: string;
      versionId?: string;
      detail?: string;
    }
  | {
      /**
       * Which lane a follow-up version took to reach the live preview:
       * `patch` (Fast Edit Lane — only the changed files, no Next dev restart)
       * or `update` (full file-set replacement + restart). `reason` names the
       * fallback cause for `update`, so the patch-lane hit rate and the reasons
       * it is skipped are both queryable from one event.
       */
      kind: "preview_followup_lane";
      chatId: string;
      versionId?: string | null;
      baseVersionId?: string | null;
      lane: "patch" | "update";
      /** Why the update lane was chosen (always set for `lane: "update"`). */
      reason?: string;
      /** Free-text context: host message on a failed patch, or its `patchReason`. */
      detail?: string;
      /** Host-reported patch outcome; only set for `lane: "patch"`. */
      patchMode?: "patched" | "restarted" | "booted";
      changedFiles?: number;
      removedPaths?: number;
      durationMs?: number;
    };

const PREFIX = "[telemetry:preview-lifecycle]";

function shortId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 10 ? value.slice(0, 8) : value;
}

function buildPreviewTelemetrySummary(event: PreviewLifecycleTelemetryEvent): string {
  const parts = [`kind=${event.kind}`];
  if ("chatId" in event) parts.push(`chat=${shortId(event.chatId)}`);
  if ("versionId" in event && event.versionId) parts.push(`version=${shortId(event.versionId)}`);
  if ("previewSessionId" in event && event.previewSessionId) {
    parts.push(`previewSession=${shortId(event.previewSessionId)}`);
  }
  if ("status" in event) parts.push(`status=${event.status}`);
  if ("phase" in event) parts.push(`phase=${event.phase}`);
  if ("outcome" in event) parts.push(`outcome=${event.outcome}`);
  if ("startOutcome" in event) parts.push(`outcome=${event.startOutcome}`);
  if ("stage" in event) parts.push(`stage=${event.stage}`);
  if ("lane" in event) parts.push(`lane=${event.lane}`);
  if ("patchMode" in event && event.patchMode) parts.push(`patchMode=${event.patchMode}`);
  if ("changedFiles" in event && event.changedFiles !== undefined) {
    parts.push(`changed=${event.changedFiles}`);
  }
  if ("removedPaths" in event && event.removedPaths !== undefined) {
    parts.push(`removed=${event.removedPaths}`);
  }
  if ("durationMs" in event && event.durationMs !== undefined) {
    parts.push(`durationMs=${event.durationMs}`);
  }
  if ("failureCode" in event && event.failureCode) parts.push(`code=${event.failureCode}`);
  if ("reason" in event && event.reason) parts.push(`reason=${event.reason}`);
  if ("detail" in event && event.detail) parts.push(`detail=${event.detail.slice(0, 90)}`);
  if ("msSinceEngineStart" in event) parts.push(`ms=${event.msSinceEngineStart}`);
  return parts.join(" | ");
}

/**
 * Log a preview lifecycle event to `console.info`.
 *
 * This module is imported by client components (`usePreviewSession`), so it
 * must NOT reference server-only modules like `devLog` (which imports
 * `node:fs`).  Turbopack resolves dynamic `import()` paths statically and
 * would pull `node:fs` into the client chunk, crashing the build.
 *
 * All events are written to structured console output with the
 * `[telemetry:preview-lifecycle]` prefix so they remain queryable in
 * server logs without a file-system dependency.
 */
export function logPreviewLifecycleTelemetry(event: PreviewLifecycleTelemetryEvent): void {
  console.info(PREFIX, buildPreviewTelemetrySummary(event), JSON.stringify(event));
}
