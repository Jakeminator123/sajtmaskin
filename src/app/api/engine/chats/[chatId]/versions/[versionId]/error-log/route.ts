import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import {
  createAttestedProductPostcheckErrorLogs,
  createEngineVersionErrorLogs,
  getEngineVersionErrorLogs,
} from "@/lib/db/services/version-errors";
import { buildErrorLogSummary } from "./summary";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import type { ProductPostcheckAttestation } from "@/lib/gen/verify/product-postcheck";

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

function isProductPostcheckAttestation(
  value: unknown,
): value is ProductPostcheckAttestation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.previewSessionId === "string" &&
    Boolean(input.previewSessionId.trim()) &&
    typeof input.filesRevision === "string" &&
    Boolean(input.filesRevision.trim()) &&
    (input.lifecycleToken === null || typeof input.lifecycleToken === "string")
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
      // Re-read both authorities immediately before the all-or-nothing batch
      // insert. A response for N cannot write PASS/blocker rows after N+1 has
      // replaced either the DB revision or the active preview lifecycle.
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

      const attestation = body.productPostcheckAttestation;
      const attestationMeta = {
        attestedPreviewSessionId: attestation.previewSessionId.trim(),
        attestedLifecycleToken: attestation.lifecycleToken?.trim() || null,
        attestedFilesRevision: attestation.filesRevision.trim(),
      };
      const result = await createAttestedProductPostcheckErrorLogs(
        body.logs.map((log) => ({
          chatId: internalChatId,
          versionId: internalVersionId,
          level: log.level,
          category: log.category || null,
          message: log.message,
          meta: { ...(log.meta || {}), ...attestationMeta },
        })),
        {
          expectedFilesRevision: attestationMeta.attestedFilesRevision,
          lockTimeoutMs: ERROR_LOG_LOCK_TIMEOUT_MS,
        },
      );
      if (result.status === "superseded") {
        return NextResponse.json(
          { success: false, stored: false, code: "product_postcheck_superseded" },
          { status: 409 },
        );
      }
      if (result.status === "contention") return errorLogContentionResponse();
      return NextResponse.json({ success: true, stored: true, logs: result.logs });
    }

    if ("logs" in body && Array.isArray(body.logs)) {
      // Product Postcheck observations are lifecycle/revision-scoped. Existing
      // unattested rows remain readable for backwards compatibility, but every
      // new Product Postcheck write must use the attested all-or-nothing path
      // above. Otherwise an old client could publish a false PASS after N+1.
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
