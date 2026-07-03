import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import {
  createEngineVersionErrorLogs,
  getEngineVersionErrorLogs,
} from "@/lib/db/services/version-errors";
import { buildErrorLogSummary } from "./summary";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

type ErrorLogPayload = {
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

/**
 * Bounded row-lock wait for the error-log insert. The insert's FK check takes a
 * `FOR KEY SHARE` lock on the referenced `engine_versions` row; a concurrent
 * verify/lease can hold `FOR UPDATE` on it (quality-gate `acquireVersionLease`).
 * Without this bound the insert blocked until Supabase's global
 * `statement_timeout` and the route 500:ade (prod incident 2026-07-03).
 */
const ERROR_LOG_LOCK_TIMEOUT_MS = 3_000;

/**
 * Row contention on `engine_versions` — diagnostics are best-effort, so return a
 * retryable 503 (with `Retry-After`) instead of a statement-timeout 500. Callers
 * that must persist (resume-lane product blocker) retry; fire-and-forget callers
 * ignore it.
 */
function errorLogContentionResponse() {
  return NextResponse.json(
    { success: false, stored: false, code: "row_contention", retryable: true },
    { status: 503, headers: { "Retry-After": "3" } },
  );
}

export async function POST(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const internalChatId = scopedVersion.chat.id;
    const internalVersionId = scopedVersion.version.id;
    const body = (await request.json().catch(() => null)) as
      | { logs?: ErrorLogPayload[] }
      | ErrorLogPayload
      | null;
    if (!body) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    if ("logs" in body && Array.isArray(body.logs)) {
      const requestedCount = body.logs.length;
      const rows = await createEngineVersionErrorLogs(
        body.logs.map((log) => ({
          chatId: internalChatId,
          versionId: internalVersionId,
          level: log.level,
          category: log.category || null,
          message: log.message,
          meta: log.meta || null,
        })),
        { lockTimeoutMs: ERROR_LOG_LOCK_TIMEOUT_MS },
      );
      // The insert is atomic, so `rows` is either the full batch or `[]` (only
      // possible outcome is row contention when a batch was requested).
      if (requestedCount > 0 && rows.length === 0) {
        return errorLogContentionResponse();
      }
      return NextResponse.json({ success: true, stored: true, logs: rows });
    }

    const payload = body as ErrorLogPayload;
    const rows = await createEngineVersionErrorLogs(
      [
        {
          chatId: internalChatId,
          versionId: internalVersionId,
          level: payload.level,
          category: payload.category || null,
          message: payload.message,
          meta: payload.meta || null,
        },
      ],
      { lockTimeoutMs: ERROR_LOG_LOCK_TIMEOUT_MS },
    );
    if (rows.length === 0) {
      return errorLogContentionResponse();
    }
    return NextResponse.json({ success: true, stored: true, log: rows[0] });
  } catch (error) {
    console.error("[API] Failed to store version error log:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const logs = await getEngineVersionErrorLogs(scopedVersion.version.id);
    return NextResponse.json({ success: true, stored: true, logs, summary: buildErrorLogSummary(logs) });
  } catch (error) {
    console.error("[API] Failed to load version error logs:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
