/**
 * Shared GitHub/ZIP import contract for POST /api/engine/chats/init.
 *
 * Frozen for PR 1 (builder handoff). Additive fields only.
 * Preview status is independent of persist success.
 * Full server POST-idempotency is NOT part of this contract.
 */

export const GITHUB_IMPORT_USER_AGENT = "Sajtmaskin-Import/1.0 (+https://sajtmaskin.se)";

/** Conservative local JSON/base64 upload limit (Vercel Function body ~4.5 MB). */
export const MAX_LOCAL_ZIP_UPLOAD_BYTES = 2.5 * 1024 * 1024;

/** Remote GitHub/ZIP URL archive limit. */
export const MAX_REMOTE_ARCHIVE_BYTES = 50 * 1024 * 1024;

export const MAX_LOCAL_ZIP_BASE64_CHARS = Math.ceil((MAX_LOCAL_ZIP_UPLOAD_BYTES * 4) / 3) + 64;

export type ImportPreviewStatus = "ready" | "starting" | "failed";

export type ImportInitSource = "github" | "zip";

export type ImportErrorStep =
  | "auth"
  | "parse"
  | "github_meta"
  | "github_ref"
  | "download"
  | "extract"
  | "credits"
  | "persist"
  | "preview";

export type ImportErrorCode =
  | "auth_required"
  | "validation_failed"
  | "project_not_found"
  | "credits_insufficient"
  | "github_url_invalid"
  | "github_ref_invalid"
  | "github_ref_ambiguous"
  | "github_subdir_unsupported"
  | "github_auth_required"
  | "github_forbidden"
  | "github_not_found"
  | "github_rate_limited"
  | "github_timeout"
  | "github_unavailable"
  | "zip_invalid"
  | "zip_too_large"
  | "zip_url_blocked"
  | "zip_unauthorized"
  | "zip_forbidden"
  | "zip_not_found"
  | "zip_rate_limited"
  | "zip_empty"
  | "persist_failed"
  | "preview_failed"
  | "import_failed";

export type ImportInitWarning = {
  code: string;
  message: string;
};

export type ImportInitPreview = {
  status: ImportPreviewStatus;
  runtimeReady: boolean;
  retryable: boolean;
  message?: string;
};

export type ImportInitSuccess = {
  success: true;
  id: string;
  chatId: string;
  projectId: string;
  versionId: string;
  previewUrl: string | null;
  preview: ImportInitPreview;
  source: ImportInitSource;
  lockedFiles: string[];
  warnings?: ImportInitWarning[];
};

export type ImportInitFailure = {
  success: false;
  error: string;
  code: ImportErrorCode;
  step: ImportErrorStep;
  requiresAuth?: boolean;
  details?: unknown;
};

export type ImportInitResponse = ImportInitSuccess | ImportInitFailure;

export function isImportInitSuccess(value: unknown): value is ImportInitSuccess {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.success === true &&
    typeof record.id === "string" &&
    typeof record.chatId === "string" &&
    typeof record.projectId === "string" &&
    typeof record.versionId === "string"
  );
}
