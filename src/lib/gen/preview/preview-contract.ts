/**
 * Contract for tier-2 preview session API response shapes.
 */

/** Response body from canonical `POST /api/engine/chats/[chatId]/preview-session` (v0 route is compat). */
export type PreviewSessionPostApiJson = {
  ok?: boolean;
  code?: string;
  hint?: string;
  message?: string;
  stage?: string;
  failureCode?: string;
  retryable?: boolean;
  previewUrl?: string;
  previewSessionId?: string;
  previewMode?: string;
  previewTier?: number;
  prodBuildVerified?: boolean;
  prodBuildLogSnippet?: string;
  startOutcome?: "resumed" | "recreated" | "reused_url";
};

/** `GET /api/engine/chats/[chatId]/preview-status?versionId=&previewSessionId=` (v0 route is compat). */
export type PreviewStatusReason =
  | "preview_session_not_configured"
  | "no_session"
  | "session_bound_to_other_version"
  | "preview_session_id_mismatch"
  | "provider_not_running_or_unreachable"
  | "boot_grace_period";

export type PreviewStatusApiJson = {
  ok: boolean;
  status: "running" | "stopped" | "starting" | "missing" | "version_mismatch";
  previewSessionId: string | null;
  previewUrl: string | null;
  versionId: string | null;
  sessionExpiresAt: number | null;
  reason?: PreviewStatusReason;
  message?: string;
};

/** `POST /api/engine/chats/[chatId]/preview-heartbeat` (v0 route is compat). */
export type PreviewHeartbeatApiJson = {
  ok: boolean;
  reason?: string;
};

/** `POST /api/engine/chats/[chatId]/preview-hibernate` (v0 route is compat). */
export type PreviewHibernateApiJson = {
  ok: boolean;
  hibernated?: boolean;
  reason?: string;
  message?: string;
};

/** `POST /api/engine/chats/[chatId]/preview-destroy` (v0 route is compat). */
export type PreviewDestroyApiJson = {
  ok: boolean;
  destroyed?: boolean;
  clearedPreviewUrl?: boolean;
  tier2Provider?: "preview_host" | null;
  reason?: string;
  message?: string;
};
