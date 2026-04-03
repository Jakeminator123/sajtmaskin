/**
 * Contract for sandbox API response shapes.
 */

/** Response body from canonical `POST /api/engine/chats/[chatId]/sandbox-preview` (v0 route is compat). */
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
  startOutcome?: "resumed" | "recreated" | "reused_url";
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

/** `POST /api/v0/chats/[chatId]/sandbox-destroy` */
export type SandboxDestroyApiJson = {
  ok: boolean;
  destroyed?: boolean;
  clearedSandboxUrl?: boolean;
  tier2Provider?: "preview_host" | "vercel_sandbox" | null;
  reason?: string;
  message?: string;
};
