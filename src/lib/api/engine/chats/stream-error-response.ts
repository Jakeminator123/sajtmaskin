/**
 * Shared error-path for engine chat stream POST routes.
 *
 * Both `create-chat-stream-post.ts` (init) and `chat-message-stream-post.ts`
 * (follow-up) catch any error thrown by the pre-stream plumbing (schema
 * validation, orchestration, credits, etc.) and respond with the same
 * structured payload:
 *
 *  1. log to `errorLog("engine", ...)` with requestId
 *  2. record prompt-to-done telemetry as `"aborted"` (if `req.signal.aborted`)
 *     or `"failed"`
 *  3. devLog one line of type `comm.error.<variant>`
 *  4. return `NextResponse.json({ error, code, retryAfter }, { status })`
 *     passed through `normalizeProviderError`
 *
 * Extracted 2026-04-21. Behavior-preserving.
 */

import { NextResponse } from "next/server";
import { recordPromptToDone } from "@/lib/observability/metrics";
import { normalizeProviderError } from "@/lib/providers/errors/normalize-provider-error";
import { devLogAppend } from "@/lib/logging/devLog";
import { errorLog } from "@/lib/utils/debug";

export type StreamErrorKind = "init" | "followup";

export interface BuildStreamErrorResponseParams {
  err: unknown;
  req: Request;
  requestId: string;
  promptStartedAt: number;
  kind: StreamErrorKind;
  /**
   * Log prefix shown in `errorLog("engine", ...)`. Example:
   *   - init:     "Create chat error"
   *   - followup: "Send message error"
   */
  logLabel: string;
  /**
   * `devLog.type` string. Example:
   *   - init:     "comm.error.create"
   *   - followup: "comm.error.send"
   */
  devLogType: string;
  /** Extra fields merged into the devLog row (e.g. `{ chatId: null }`). */
  devLogExtras?: Record<string, unknown>;
  /** If set, the returned Response is passed through this wrapper (session cookie, etc.). */
  attachSessionCookie?: (response: Response) => Response;
}

export function buildStreamErrorResponse(
  params: BuildStreamErrorParams,
): Response {
  const {
    err,
    req,
    requestId,
    promptStartedAt,
    kind,
    logLabel,
    devLogType,
    devLogExtras,
    attachSessionCookie,
  } = params;

  errorLog("engine", `${logLabel} (requestId=${requestId})`, err);
  try {
    recordPromptToDone(
      Date.now() - promptStartedAt,
      req.signal?.aborted ? "aborted" : "failed",
      kind,
    );
  } catch {
    // Telemetry is fail-safe.
  }
  const normalized = normalizeProviderError(err);
  devLogAppend("latest", {
    type: devLogType,
    ...(devLogExtras ?? {}),
    message: normalized.message,
    code: normalized.code,
  });
  const response = NextResponse.json(
    {
      error: normalized.message,
      code: normalized.code,
      retryAfter: normalized.retryAfter ?? null,
    },
    { status: normalized.status },
  );
  return attachSessionCookie ? attachSessionCookie(response) : response;
}

// Re-export under a stable alias so future refactors can rename the params
// type without breaking callers.
export type BuildStreamErrorParams = BuildStreamErrorResponseParams;
