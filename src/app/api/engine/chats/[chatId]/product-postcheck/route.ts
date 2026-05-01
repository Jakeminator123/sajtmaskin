import { NextResponse } from "next/server";
import { z } from "zod";
import { FEATURES } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { runProductPostcheck } from "@/lib/gen/verify/product-postcheck";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  versionId: z.string().min(1),
  previewUrl: z.string().trim().optional().nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "engine:product-postcheck", () => handlePOST(req, ctx));
}

function emitPostcheckDegraded(params: {
  versionId: string;
  chatId: string;
  reason: string;
  checkedUrl: string | null;
  durationMs: number | null;
}): void {
  try {
    emitBusEvent({
      t: "version.degraded",
      versionId: params.versionId,
      chatId: params.chatId,
      kind: "product_postcheck_skipped",
      message: `F2 Product Postcheck skipped (${params.reason}).`,
      meta: {
        skippedReason: params.reason,
        checkedUrl: params.checkedUrl,
        durationMs: params.durationMs,
      },
    });
  } catch {
    // Bus emit is fire-and-forget telemetry — never let a logging
    // failure break the route response.
  }
}

async function handlePOST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const validation = requestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: validation.error.issues },
      { status: 400 },
    );
  }

  const { versionId, previewUrl } = validation.data;
  if (!FEATURES.f2ProductPostcheck) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      skippedReason: "feature_disabled",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 0,
      checkedUrl: previewUrl?.trim() || null,
    });
  }

  if (!previewUrl?.trim()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      skippedReason: "missing_preview_url",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 0,
      checkedUrl: null,
    });
  }

  const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
  if (!scopedVersion) {
    return NextResponse.json({ ok: false, error: "Version not found for chat" }, { status: 404 });
  }
  const resolvedVersionId = scopedVersion.version.id;

  try {
    const result = await runProductPostcheck({
      previewUrl,
      chatId,
      versionId,
    });

    // OMTAG-06 follow-up: emit a `version.degraded` bus event when the
    // product-postcheck never ran. The route already returns
    // `skipped: true` to the caller and post-checks.ts logs an info-level
    // engine_version_error_logs row, but neither surfaced the skip on
    // the version-status projection — so the UI showed "preview ok"
    // with no hint that DOM-level verification was missing.
    if (result.skipped) {
      emitPostcheckDegraded({
        versionId: resolvedVersionId,
        chatId,
        reason: result.skippedReason ?? "unknown",
        checkedUrl: result.checkedUrl ?? null,
        durationMs: result.durationMs ?? null,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[product-postcheck] Error:", err);
    // Mirror the skip emission for the runtime-error branch — same
    // observability surface for "ran but threw" as for the planned
    // skip cases above. Without this the version-status projection
    // can show solid green even when the postcheck blew up.
    emitPostcheckDegraded({
      versionId: resolvedVersionId,
      chatId,
      reason: "runtime_error",
      checkedUrl: null,
      durationMs: null,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      skippedReason: "runtime_error",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 0,
      checkedUrl: null,
      error: err instanceof Error ? err.message : "Product postcheck failed",
    });
  }
}
