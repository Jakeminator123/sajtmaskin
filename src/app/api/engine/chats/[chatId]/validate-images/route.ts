import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { validateVersionImages } from "@/lib/gen/verify/version-image-validation";
import { MAX_SCOPED_IMAGE_URLS } from "@/lib/utils/validate-images-limit";
import { z } from "zod";
import { versionBusyResponseIfLeaseHeld } from "@/lib/api/version-busy-response";

export const runtime = "nodejs";

const requestSchema = z.object({
  versionId: z.string().min(1),
  autoFix: z.boolean().optional().default(true),
  urls: z.array(z.string().trim().min(1).max(2000)).max(MAX_SCOPED_IMAGE_URLS).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }
    const { versionId, autoFix, urls } = validation.data;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const outcome = await validateVersionImages({
      chatId, versionId: scopedVersion.version.id, autoFix, urls, signal: req.signal,
    });
    return NextResponse.json(
      { ...outcome.result, ...(outcome.kind === "no_files" ? {} : previewUrlField(null)) },
      { status: outcome.kind === "no_files" ? 404 : 200 },
    );
  } catch (err) {
    const busy = versionBusyResponseIfLeaseHeld(err);
    if (busy) return busy;
    console.error("[validate-images] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image validation failed" },
      { status: 500 },
    );
  }
}
