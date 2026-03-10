import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { FEATURES, SECRETS } from "@/lib/config";
import { validateImages } from "@/lib/utils/image-validator";
import { z } from "zod";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { updateVersionFiles } from "@/lib/db/chat-repository";

export const runtime = "nodejs";

const requestSchema = z.object({
  versionId: z.string().min(1),
  autoFix: z.boolean().optional().default(true),
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

    const { versionId, autoFix } = validation.data;

    // ---------------------------------------------------------------
    // Non-fallback: fetch & update via SQLite
    // ---------------------------------------------------------------
    if (!shouldUseV0Fallback()) {
      const codeFiles = getVersionFiles(versionId);
      if (!codeFiles || codeFiles.length === 0) {
        return NextResponse.json({
          valid: true,
          total: 0,
          broken: [],
          replacedCount: 0,
          warnings: [],
          fixed: false,
          message: "No files to validate",
        });
      }

      const filePairs = codeFiles.map((f) => ({
        name: f.path,
        content: f.content,
      }));

      const unsplashKey = FEATURES.useUnsplash ? SECRETS.unsplashAccessKey : null;
      const result = await validateImages({
        files: filePairs,
        autoFix,
        unsplashAccessKey: unsplashKey,
      });

      let fixed = false;
      if (autoFix && result.replacedCount > 0) {
        try {
          const updatedFiles = codeFiles.map((file) => {
            const replacement = result.files.find((f) => f.name === file.path);
            return replacement ? { ...file, content: replacement.content } : file;
          });
          updateVersionFiles(versionId, JSON.stringify(updatedFiles));
          fixed = true;
        } catch (updateError) {
          console.error("[validate-images] Failed to update version:", updateError);
          result.warnings.push("Kunde inte spara fixade bilder till versionen.");
        }
      }

      return NextResponse.json({
        valid: result.broken.length === 0,
        total: result.total,
        broken: result.broken,
        replacedCount: result.replacedCount,
        warnings: result.warnings,
        fixed,
        demoUrl: null,
        message: result.broken.length === 0
          ? `Alla ${result.total} bild-URL:er är giltiga`
          : `${result.broken.length} av ${result.total} bilder trasiga${fixed ? `, ${result.replacedCount} ersatta` : ""}`,
      });
    }

    // ---------------------------------------------------------------
    // V0 fallback: existing flow
    // ---------------------------------------------------------------
    assertV0Key();

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const version = await v0.chats.getVersion({
      chatId,
      versionId,
      includeDefaultFiles: true,
    });

    const rawFiles: any[] = (version as any).files || [];
    const files = rawFiles.map((f: any) => ({
      name: String(f.name || ""),
      content: String(f.content || ""),
    }));

    if (files.length === 0) {
      return NextResponse.json({
        valid: true,
        total: 0,
        broken: [],
        replacedCount: 0,
        warnings: [],
        fixed: false,
        message: "No files to validate",
      });
    }

    const unsplashKey = FEATURES.useUnsplash ? SECRETS.unsplashAccessKey : null;

    const result = await validateImages({
      files,
      autoFix,
      unsplashAccessKey: unsplashKey,
    });

    let demoUrl: string | undefined;
    let fixed = false;

    if (autoFix && result.replacedCount > 0) {
      try {
        const updatedVersion = await v0.chats.updateVersion({
          chatId,
          versionId,
          files: result.files.map((f) => {
            const original = rawFiles.find((r: any) => r.name === f.name);
            return {
              name: f.name,
              content: f.content,
              locked: original?.locked,
            };
          }),
        });
        demoUrl = (updatedVersion as any).demoUrl;
        fixed = true;
      } catch (updateError) {
        console.error("[validate-images] Failed to update version:", updateError);
        result.warnings.push("Kunde inte spara fixade bilder till versionen.");
      }
    }

    return NextResponse.json({
      valid: result.broken.length === 0,
      total: result.total,
      broken: result.broken,
      replacedCount: result.replacedCount,
      warnings: result.warnings,
      fixed,
      demoUrl,
      message: result.broken.length === 0
        ? `Alla ${result.total} bild-URL:er är giltiga`
        : `${result.broken.length} av ${result.total} bilder trasiga${fixed ? `, ${result.replacedCount} ersatta` : ""}`,
    });
  } catch (err) {
    console.error("[validate-images] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image validation failed" },
      { status: 500 },
    );
  }
}
