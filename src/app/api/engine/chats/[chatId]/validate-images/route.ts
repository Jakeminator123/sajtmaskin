import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { FEATURES, SECRETS } from "@/lib/config";
import { buildKnownImageReplacementMap, validateImages } from "@/lib/utils/image-validator";
import { z } from "zod";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  recordKnownBrokenImageReplacements,
  updateVersionFiles,
} from "@/lib/db/chat-repository-pg";
import { VersionLeaseHeldError } from "@/lib/db/version-lease-error";
import { versionBusyResponseIfLeaseHeld } from "@/lib/api/version-busy-response";

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

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const codeFiles = await getVersionFiles(scopedVersion.version.id);
    if (codeFiles && codeFiles.length > 0) {
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

      // Codex P2 (PR #376 round 2): a dry-run (`autoFix: false`) must not
      // mutate the chat snapshot — the heal path consumes the map
      // unconditionally, so recording here would let a validation-only call
      // rewrite future generated files. Record only when a fix was requested.
      if (autoFix) {
        const knownReplacements = buildKnownImageReplacementMap(result.broken);
        if (Object.keys(knownReplacements).length > 0) {
          try {
            await recordKnownBrokenImageReplacements(chatId, knownReplacements);
          } catch (recordError) {
            console.warn("[validate-images] Failed to record known image replacements:", recordError);
          }
        }
      }

      let fixed = false;
      if (autoFix && result.replacedCount > 0) {
        try {
          const updatedFiles = codeFiles.map((file) => {
            const replacement = result.files.find((f) => f.name === file.path);
            return replacement ? { ...file, content: replacement.content } : file;
          });
          await updateVersionFiles(scopedVersion.version.id, JSON.stringify(updatedFiles));
          fixed = true;
        } catch (updateError) {
          // A foreign verify/repair lease must surface as a retryable 409 — do
          // NOT swallow it into a soft warning (that would 200 as if nothing
          // was busy). Re-throw so the outer catch translates it to
          // `version_busy`; other write failures stay soft as before.
          if (updateError instanceof VersionLeaseHeldError) throw updateError;
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
        ...previewUrlField(null),
        message: result.broken.length === 0
          ? `Alla ${result.total} bild-URL:er är giltiga`
          : `${result.broken.length} av ${result.total} bilder trasiga${fixed ? `, ${result.replacedCount} ersatta` : ""}`,
      });
    }

    return NextResponse.json(
      {
        valid: true,
        total: 0,
        broken: [],
        replacedCount: 0,
        warnings: [],
        fixed: false,
        message: "No files to validate",
      },
      { status: 404 },
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
