/**
 * Contract for own-engine SSE `done` and related preview events.
 * Canonical file payload for sandbox is `filesJson` after `finalizeAndSaveVersion` — see `generation-stream.ts`.
 */
import type { PreviewPreflightSummary } from "@/lib/gen/preview/diagnostics";

export type OwnEngineDoneSsePayload = {
  chatId: string;
  versionId: string;
  messageId: string;
  /** Primary preview URL for the current version. In staged migration this is often null until sandbox is ready. */
  demoUrl: string | null;
  /** True when tier-2 sandbox boot is in progress after this `done`. */
  sandboxPending?: boolean;
  /** Deprecated; always null — tier-1 shim removed. */
  shimPreviewUrl?: string | null;
  preflight?: PreviewPreflightSummary;
  previewBlocked?: boolean;
  verificationBlocked?: boolean;
  previewBlockingReason?: string | null;
  /**
   * When true, the builder only moves selection to the returned `versionId` if the user was
   * already on the previous server "latest" (repair fork — see `preview-deploy.md`).
   */
  onlySelectVersionIfWasLatest?: boolean;
};

export type SandboxReadySsePayload = {
  sandboxUrl: string;
  sandboxId: string;
  sandboxPreviewMode?: string;
  fidelityTier?: number;
  prodBuildVerified?: boolean;
  prodBuildLogSnippet?: string;
};

/** Response body from `POST /api/v0/chats/[chatId]/sandbox-preview`. */
export type SandboxPreviewPostApiJson = {
  ok?: boolean;
  code?: string;
  hint?: string;
  message?: string;
  stage?: string;
  failureCode?: string;
  retryable?: boolean;
  sandboxUrl?: string;
  sandboxId?: string;
  sandboxPreviewMode?: string;
  fidelityTier?: number;
  prodBuildVerified?: boolean;
  prodBuildLogSnippet?: string;
  startOutcome?: "resumed" | "recreated";
};

/** `GET /api/v0/chats/[chatId]/sandbox-status?versionId=&sandboxId=` */
export type SandboxStatusApiJson = {
  ok: boolean;
  status: "running" | "stopped" | "missing" | "version_mismatch";
  sandboxId: string | null;
  sandboxUrl: string | null;
  versionId: string | null;
  sessionExpiresAt: number | null;
  reason?: string;
  message?: string;
};

/** `POST /api/v0/chats/[chatId]/sandbox-heartbeat` */
export type SandboxHeartbeatApiJson = {
  ok: boolean;
  reason?: string;
};
