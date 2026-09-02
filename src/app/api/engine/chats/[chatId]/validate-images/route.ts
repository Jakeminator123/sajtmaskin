import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { FEATURES, SECRETS } from "@/lib/config";
import { buildKnownImageReplacementMap, validateImages } from "@/lib/utils/image-validator";
import { MAX_SCOPED_IMAGE_URLS } from "@/lib/utils/validate-images-limit";
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
        onlyUrls: urls,
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

      let persisted = result.replacedCount <= 0;
      let filesRevision = scopedVersion.version.files_revision?.trim() || null;
      if (autoFix && result.replacedCount > 0) {
        if (req.signal.aborted) {
          persisted = false;
          result.warnings.push("Kunde inte spara fixade bilder — requesten avbröts.");
        } else {
          try {
            const updatedFiles = codeFiles.map((file) => {
              const replacement = result.files.find((f) => f.name === file.path);
              return replacement ? { ...file, content: replacement.content } : file;
            });
            // Material mutation: the replacement image is different content
            // than the verdict (if any) was earned on. Same flag as PUT
            // `/files` — never leave `passed`/`promoted` describing revision N
            // after `files_json` advanced to N+1. Gated on `replacedCount > 0`
            // above, so a no-op scan never resets the row.
            const updated = await updateVersionFiles(
              scopedVersion.version.id,
              JSON.stringify(updatedFiles),
              { invalidateVerification: true },
            );
            // Bugbot on #507: only report `fixed`/`persisted` when the write
            // actually landed — a no-op (missing row / degraded guard) must
            // not 200 as if the replacement images were saved. `replacedCount`
            // stays the in-memory/planned swap count.
            persisted = updated;
            if (updated) {
              const refreshed = await getEngineVersionForChatByIdForRequest(
                req,
                chatId,
                versionId,
              );
              filesRevision = refreshed?.version.files_revision?.trim() || filesRevision;
            }
          } catch (updateError) {
            // A foreign verify/repair lease must surface as a retryable 409 — do
            // NOT swallow it into a soft warning (that would 200 as if nothing
            // was busy). Re-throw so the outer catch translates it to
            // `version_busy`; other write failures stay soft as before.
            if (updateError instanceof VersionLeaseHeldError) throw updateError;
            console.error("[validate-images] Failed to update version:", updateError);
            result.warnings.push("Kunde inte spara fixade bilder till versionen.");
            persisted = false;
          }
        }
      }

      const fixed = persisted && result.replacedCount > 0;

      return NextResponse.json({
        valid: result.broken.length === 0,
        total: result.total,
        broken: result.broken,
        replacedCount: result.replacedCount,
        warnings: result.warnings,
        fixed,
        persisted,
        filesRevision,
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
        persisted: true,
        filesRevision: null,
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
