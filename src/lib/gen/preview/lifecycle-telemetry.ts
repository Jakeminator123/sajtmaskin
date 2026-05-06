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
      sandboxId?: string | null;
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
      kind: "preview_ready";
      chatId: string;
      versionId?: string | null;
      sandboxId?: string | null;
      sandboxPreviewMode: string;
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
  if ("sandboxId" in event && event.sandboxId) parts.push(`sandbox=${shortId(event.sandboxId)}`);
  if ("status" in event) parts.push(`status=${event.status}`);
  if ("phase" in event) parts.push(`phase=${event.phase}`);
  if ("outcome" in event) parts.push(`outcome=${event.outcome}`);
  if ("startOutcome" in event) parts.push(`outcome=${event.startOutcome}`);
  if ("stage" in event) parts.push(`stage=${event.stage}`);
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
