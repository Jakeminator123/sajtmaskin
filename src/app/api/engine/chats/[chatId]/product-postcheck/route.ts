import { NextResponse } from "next/server";
import { z } from "zod";
import { FEATURES } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { runProductPostcheck } from "@/lib/gen/verify/product-postcheck";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  versionId: z.string().min(1),
  previewUrl: z.string().trim().optional().nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "engine:product-postcheck", () => handlePOST(req, ctx));
}

async function handlePOST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
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

    const result = await runProductPostcheck({
      previewUrl,
      chatId,
      versionId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[product-postcheck] Error:", err);
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
