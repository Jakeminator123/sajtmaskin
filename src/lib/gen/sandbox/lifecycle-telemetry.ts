/**
 * Structured logs for sandbox preview lifecycle (heartbeat, status, recover, start outcome).
 * Query logs with prefix `[telemetry:sandbox-lifecycle]`.
 */

export type SandboxLifecycleTelemetryEvent =
  | {
      kind: "heartbeat";
      ok: boolean;
      chatId: string;
      reason?: string;
      viewerId?: string;
    }
  | {
      kind: "sandbox_status";
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
      kind: "sandbox_start_outcome";
      chatId: string;
      versionId?: string | null;
      outcome: "resumed" | "recreated";
      previewPolicy?: string | null;
      verificationPolicy?: string | null;
    }
  | {
      kind: "sandbox_preview_ready";
      chatId: string;
      versionId?: string | null;
      sandboxId?: string | null;
      sandboxPreviewMode: string;
      fidelityTier: 2 | 3;
      prodBuildVerified: boolean;
      startOutcome: "resumed" | "recreated";
      previewPolicy?: string | null;
      verificationPolicy?: string | null;
      msSinceEngineStart: number;
    }
  | {
      kind: "sandbox_preview_failed";
      chatId: string;
      versionId?: string | null;
      stage: string;
      failureCode?: string;
      detail?: string;
      previewPolicy?: string | null;
      verificationPolicy?: string | null;
      msSinceEngineStart: number;
    }
  | {
      kind: "sandbox_url_resync";
      chatId: string;
      versionId?: string;
      /** Normalized URLs differed; iframe src updated from GET sandbox-status. */
      detail?: string;
    };

const PREFIX = "[telemetry:sandbox-lifecycle]";

export function logSandboxLifecycleTelemetry(event: SandboxLifecycleTelemetryEvent): void {
  console.info(PREFIX, JSON.stringify(event));
}
