/**
 * Contract for own-engine SSE `done` and related preview events.
 * Canonical file payload for sandbox is `filesJson` after `finalizeAndSaveVersion` — see `generation-stream.ts`.
 */

export type OwnEngineDoneSsePayload = {
  chatId: string;
  versionId: string;
  messageId: string;
  /** Tier-1 shim URL when available — show in iframe even while sandbox is pending. */
  demoUrl: string | null;
  /** True when tier-2 sandbox boot is in progress after this `done`. */
  sandboxPending?: boolean;
  shimPreviewUrl?: string | null;
  preflight?: unknown;
  previewBlocked?: boolean;
  verificationBlocked?: boolean;
  previewBlockingReason?: string | null;
};

export type SandboxReadySsePayload = {
  sandboxUrl: string;
  sandboxId: string;
  sandboxPreviewMode?: string;
  fidelityTier?: number;
  prodBuildVerified?: boolean;
  prodBuildLogSnippet?: string;
  fallbackDemoUrl?: string;
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
};
