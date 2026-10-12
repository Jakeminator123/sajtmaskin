import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import {
  createEngineVersionErrorLogs,
  getEngineVersionErrorLogs,
  SERVER_REPAIR_BUDGET_LOG_CATEGORY,
} from "@/lib/db/services/version-errors";
import { buildErrorLogSummary } from "./summary";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import {
  isProductPostcheckAttestation,
  type ProductPostcheckAttestation,
} from "@/lib/gen/verify/product-postcheck";
import { lookupProductPostcheckRun, normalizeProductPostcheckMutationRevision } from "@/lib/db/services/product-postcheck-runs";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

type ErrorLogPayload = {
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

type ErrorLogBatchPayload = {
  logs?: ErrorLogPayload[];
  productPostcheckAttestation?: ProductPostcheckAttestation | null;
};

function isProductPostcheckCategory(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("product_postcheck.");
}

function productPostcheckAttestationRequiredResponse() {
  return NextResponse.json(
    {
      success: false,
      stored: false,
      code: "product_postcheck_attestation_required",
    },
    { status: 400 },
  );
}

function productPostcheckAttestationMatches(
  attestation: ProductPostcheckAttestation,
  version: { id: string; files_revision?: string | null },
  session: Awaited<ReturnType<typeof getActivePreviewSessionAsync>>,
): boolean {
  const filesRevision = attestation.filesRevision.trim();
  return Boolean(
    version.files_revision?.trim() === filesRevision &&
      session?.versionId === version.id &&
      session.previewSessionId === attestation.previewSessionId.trim() &&
      session.filesRevision === filesRevision &&
      (session.lifecycleToken?.trim() || null) ===
        (attestation.lifecycleToken?.trim() || null),
  );
}

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
      | ErrorLogBatchPayload
      | ErrorLogPayload
      | null;
    if (!body) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    // Attestation authorizes preview observations, never paid-budget receipts.
    // Reject the entire payload before choosing singleton/batch/attested paths.
    if (("category" in body && body.category === SERVER_REPAIR_BUDGET_LOG_CATEGORY) ||
      ("logs" in body && Array.isArray(body.logs) && body.logs.some((log) => log?.category === SERVER_REPAIR_BUDGET_LOG_CATEGORY))) {
      return NextResponse.json({ success: false, stored: false, code: "server_repair_budget_server_owned" }, { status: 400 });
    }

    if ("productPostcheckAttestation" in body) {
      if (!isProductPostcheckAttestation(body.productPostcheckAttestation)) {
        return NextResponse.json(
          { success: false, stored: false, code: "invalid_product_postcheck_attestation" },
          { status: 400 },
        );
      }
      if (!("logs" in body) || !Array.isArray(body.logs)) {
        return NextResponse.json(
          { success: false, stored: false, code: "invalid_product_postcheck_batch" },
          { status: 400 },
        );
      }
      // Re-read both authorities before replay. An old N receipt may not
      // return current release proof after revision or preview lifecycle N+1.
      const [latestScopedVersion, activeSession] = await Promise.all([
        getEngineVersionForChatByIdForRequest(request, chatId, versionId),
        getActivePreviewSessionAsync(chatId),
      ]);
      if (
        !latestScopedVersion ||
        !productPostcheckAttestationMatches(
          body.productPostcheckAttestation,
          latestScopedVersion.version,
          activeSession,
        )
      ) {
        return NextResponse.json(
          { success: false, stored: false, code: "product_postcheck_superseded" },
          { status: 409 },
        );
      }

      // Compatibility replay only. Ignore all client-supplied log/message/meta.
      const attestation = body.productPostcheckAttestation;
      const claim = await lookupProductPostcheckRun({ chatId: internalChatId, key: {
        versionId: internalVersionId, filesRevision: attestation.filesRevision.trim(),
        previewSession: attestation.previewSessionId.trim(), lifecycleToken: attestation.lifecycleToken,
        mutationRevision: normalizeProductPostcheckMutationRevision(activeSession?.mutationRevision),
      } });
      if (claim.kind === "unavailable" || claim.kind === "busy") return errorLogContentionResponse();
      if (claim.kind !== "settled") return NextResponse.json(
        { success: false, stored: false, code: "product_postcheck_not_stored" }, { status: 409 });
      const logs = (await getEngineVersionErrorLogs(internalVersionId)).filter(log => {
        const meta = log.meta && typeof log.meta === "object" ? log.meta as Record<string, unknown> : null;
        return isProductPostcheckCategory(log.category) && meta?.verificationRunId === claim.runId &&
          meta?.attestedFilesRevision === attestation.filesRevision.trim() &&
          meta?.attestedPreviewSessionId === attestation.previewSessionId.trim() &&
          (meta?.attestedLifecycleToken ?? null) === (attestation.lifecycleToken?.trim() || null);
      });
      if (!logs.length) return NextResponse.json(
        { success: false, stored: false, code: "product_postcheck_not_stored" }, { status: 409 });
      return NextResponse.json({ success: true, stored: true, logs });
    }

    if ("logs" in body && Array.isArray(body.logs)) {
      // Product results have exactly one server writer. Generic diagnostics
      // remain writable, but a client can never create a release-domain row.
      if (body.logs.some((log) => isProductPostcheckCategory(log.category))) {
        return productPostcheckAttestationRequiredResponse();
      }
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
    if (isProductPostcheckCategory(payload.category)) {
      return productPostcheckAttestationRequiredResponse();
    }
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
