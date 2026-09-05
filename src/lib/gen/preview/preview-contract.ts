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
  /** Exact host lifecycle returned by preview-session; null for legacy sessions. */
  lifecycleToken?: string | null;
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
  | "boot_grace_period"
  | "build_error_overlay"
  /**
   * Host readiness gave up because the page served HTTP 200 HTML with no
   * visible text (client-rendered / locally gated page). `status` is still
   * `build_error` so the client stops its recover loop, but this is NOT
   * evidence that the site is broken — the UI shows a notice, not a failure.
   */
  | "preview_unverified_empty_body";

export type PreviewRuntimeStatus =
  | "running"
  | "stopped"
  | "starting"
  | "missing"
  | "version_mismatch"
  | "build_error";

export function isTerminalPreviewStatus(
  status: string | null | undefined,
): status is Exclude<PreviewRuntimeStatus, "running" | "starting"> {
  return (
    status === "stopped" ||
    status === "missing" ||
    status === "build_error" ||
    status === "version_mismatch"
  );
}

export type PreviewStatusApiJson = {
  ok: boolean;
  status: PreviewRuntimeStatus;
  previewSessionId: string | null;
  /** Host lifecycle fence; null for legacy/tokenless sessions. */
  lifecycleToken?: string | null;
  previewUrl: string | null;
  versionId: string | null;
  sessionExpiresAt: number | null;
  reason?: PreviewStatusReason;
  mismatchDirection?: "session_newer" | "session_older" | "unknown";
  message?: string;
  /** Host `waitForReady` failure detail when `status === "build_error"`. */
  readinessError?: string | null;
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
  /**
   * True when local state was cleared but the host destroy call returned
   * a retryable failure (e.g. 5xx). The host will reap the orphan via idle
   * TTL or `/admin/cleanup`; the user is no longer pointing at the zombie.
   */
  providerDestroyDeferred?: boolean;
};
