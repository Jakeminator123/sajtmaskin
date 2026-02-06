import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { FEATURES, SECRETS } from "@/lib/config";
import { validateImages } from "@/lib/utils/image-validator";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  versionId: z.string().min(1),
  autoFix: z.boolean().optional().default(true),
});

/**
 * POST /api/v0/chats/[chatId]/validate-images
 *
 * Validates image URLs in generated files.
 * Detects broken/hallucinated Unsplash URLs and replaces them
 * with real alternatives via the Unsplash API.
 *
 * Request body:
 * {
 *   versionId: string,
 *   autoFix?: boolean (default true)
 * }
 *
 * Response:
 * {
 *   valid: boolean,
 *   total: number,
 *   broken: BrokenImage[],
 *   replacedCount: number,
 *   warnings: string[],
 *   fixed: boolean,
 *   demoUrl?: string
 * }
 */
export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId, autoFix } = validation.data;

    // Get current version files
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

    // If auto-fix replaced images, update the version files
    let demoUrl: string | undefined;
    let fixed = false;

    if (autoFix && result.replacedCount > 0) {
      try {
        // Merge updated content back with original file metadata (preserving locked)
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
