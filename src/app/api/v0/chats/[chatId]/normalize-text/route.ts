import { NextResponse } from "next/server";
import { z } from "zod";
import { assertV0Key, v0 } from "@/lib/v0";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { normalizeUnicodeEscapes } from "@/lib/utils/unicode-normalizer";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";

export const runtime = "nodejs";

const normalizeRequestSchema = z.object({
  versionId: z.string().min(1),
  autoFix: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = normalizeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { versionId, autoFix } = parsed.data;
    const resolved = await resolveVersionFiles({
      chatId,
      versionId,
      options: { maxAttempts: 20, delayMs: 1500, minFiles: 1 },
    });
    const version = resolved.version;
    const files = resolved.files.length > 0 ? resolved.files : (version as any)?.files || [];
    if (files.length === 0) {
      return NextResponse.json({
        normalized: true,
        changed: false,
        changedFiles: 0,
        replacements: 0,
        message: "No files to normalize",
      });
    }

    let changedFiles = 0;
    let replacements = 0;
    const updatedFiles = files.map((file: any) => {
      if (typeof file?.content !== "string") {
        return {
          name: file.name,
          content: file.content,
          locked: file.locked,
        };
      }
      const { output, summary } = normalizeUnicodeEscapes(file.content);
      if (summary.changed) {
        changedFiles += 1;
        replacements += summary.replacements;
      }
      return {
        name: file.name,
        content: output,
        locked: file.locked,
      };
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

    const updatedVersion = await v0.chats.updateVersion({
      chatId,
      versionId,
      files: updatedFiles,
    });

    return NextResponse.json({
      normalized: true,
      changed: true,
      changedFiles,
      replacements,
      fixed: true,
      demoUrl: (updatedVersion as any)?.demoUrl ?? null,
    });
  } catch (err) {
    console.error("Unicode normalization error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Normalization failed" },
      { status: 500 },
    );
  }
}
