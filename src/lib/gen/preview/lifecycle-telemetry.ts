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

export function logPreviewLifecycleTelemetry(event: PreviewLifecycleTelemetryEvent): void {
  console.info(PREFIX, JSON.stringify(event));
  if (event.kind === "heartbeat" || event.kind === "preview_status") {
    return;
  }
  if (typeof window === "undefined") {
    import("@/lib/logging/devLog").then(({ devLogAppend }) => {
      devLogAppend("latest", {
        type: `preview-lifecycle.${event.kind}`,
        ...event,
      });
    }).catch(() => {});
  }
}
