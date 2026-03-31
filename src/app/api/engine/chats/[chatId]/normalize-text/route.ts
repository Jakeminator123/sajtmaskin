import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { normalizeUnicodeEscapes } from "@/lib/utils/unicode-normalizer";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { updateVersionFiles } from "@/lib/db/chat-repository-pg";

export const runtime = "nodejs";

const normalizeRequestSchema = z.object({
  versionId: z.string().min(1),
  autoFix: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = normalizeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { versionId, autoFix } = parsed.data;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const files = await getVersionFiles(scopedVersion.version.id);
    if (files && files.length > 0) {
      let changedFiles = 0;
      let replacements = 0;
      const updatedFiles = files.map((file) => {
        if (typeof file?.content !== "string") return file;
        const { output, summary } = normalizeUnicodeEscapes(file.content);
        if (summary.changed) {
          changedFiles += 1;
          replacements += summary.replacements;
        }
        return { ...file, content: output };
      });

      if (!autoFix || changedFiles === 0) {
        return NextResponse.json({
          normalized: true,
          changed: changedFiles > 0,
          changedFiles,
          replacements,
          message: changedFiles > 0 ? "Unicode escapes detected" : "No unicode escapes found",
        });
      }

      await updateVersionFiles(scopedVersion.version.id, JSON.stringify(updatedFiles));

      return NextResponse.json({
        normalized: true,
        changed: true,
        changedFiles,
        replacements,
        fixed: true,
        ...previewUrlField(null),
      });
    }

    return NextResponse.json(
      {
        normalized: true,
        changed: false,
        changedFiles: 0,
        replacements: 0,
        message: "No files to normalize",
      },
      { status: 404 },
    );
  } catch (err) {
    console.error("Unicode normalization error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Normalization failed" },
      { status: 500 },
    );
  }
}
