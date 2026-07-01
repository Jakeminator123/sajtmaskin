import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { z } from "zod";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { materializeImagesInTextFiles } from "@/lib/imageAssets";
import { normalizeProviderError } from "@/lib/providers/errors/normalize-provider-error";
import { getVersionFiles, getLatestVersionFiles } from "@/lib/gen/version-manager";
import type { CodeFile } from "@/lib/gen/parser";
import {
  getPreferredVersion,
  getLatestVersion as getLatestEngineVersion,
  updateVersionFiles,
} from "@/lib/db/chat-repository-pg";
import { repairGeneratedFiles } from "@/lib/gen/autofix/repair-generated-files";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";

function engineErrorResponse(err: unknown, fallbackMessage: string) {
  const info = normalizeProviderError(err);
  return NextResponse.json(
    { error: info.message || fallbackMessage, code: info.code },
    { status: info.status },
  );
}

const updateFilesSchema = z.object({
  versionId: z.string().min(1, "Version ID is required"),
  files: z
    .array(
      z.object({
        name: z.string().min(1, "File name is required"),
        content: z.string(),
        locked: z.boolean().optional(),
      }),
    )
    .min(1, "At least one file is required"),
});

async function loadOwnEngineFilesForChat(req: Request, chatId: string, versionId: string) {
  const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
  if (!scopedVersion) {
    return null;
  }

  const existingFiles = (await getVersionFiles(scopedVersion.version.id)) ?? [];
  return {
    scopedVersion,
    existingFiles,
  };
}

async function saveOwnEngineFiles(versionId: string, files: CodeFile[]) {
  return updateVersionFiles(versionId, JSON.stringify(files));
}

export async function GET(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;

    const { searchParams } = new URL(req.url);
    const requestedVersionId = searchParams.get("versionId");
    const shouldMaterialize = searchParams.get("materialize") === "1";
    const engineChat = await getEngineChatByIdForRequest(req, chatId);

    if (!engineChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    let files;
    let resolvedVersionId: string | null = null;

    if (engineChat) {
      if (requestedVersionId) {
        const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, requestedVersionId);
        if (!scopedVersion) {
          return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
        }
        files = await getVersionFiles(scopedVersion.version.id);
        resolvedVersionId = scopedVersion.version.id;
      } else {
        files = await getLatestVersionFiles(engineChat.id);
        resolvedVersionId =
          (await getPreferredVersion(engineChat.id))?.id ??
          (await getLatestEngineVersion(engineChat.id))?.id ??
          null;
      }
    }

    if (files) {
      let imageMaterializeError: string | null = null;
      let imageMaterialization:
        | {
            attempted: boolean;
            strategy: "blob";
            replaced: number;
            uploaded: number;
            skipped: number;
            warningCount: number;
            reason?: string;
            error?: string | null;
          }
        | null = null;
      const effectiveVersionId = resolvedVersionId ?? requestedVersionId ?? chatId;

      const repairResult = repairGeneratedFiles(files);
      if (repairResult.fixes.length > 0) {
        files = repairResult.files;
        if (resolvedVersionId) {
          // Best-effort, fail-fast heal-persist (M#files1). A files READ must
          // never block on — or fail from — a ~120 KB `files_json` UPDATE under
          // row-lock contention. `lockTimeoutMs` makes a contended write give up
          // fast (so it can't starve concurrent reads → 429 / error-log INSERTs
          // → 500), and the try/catch guarantees the read still returns the
          // repaired files even if the persist is skipped. The repair is
          // idempotent, so the next uncontended read commits the heal.
          try {
            await updateVersionFiles(resolvedVersionId, JSON.stringify(files), {
              lockTimeoutMs: 2000,
            });
          } catch {
            // never turn a files read into a 429/500 over a best-effort heal
          }
        }
      }

      if (shouldMaterialize) {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          imageMaterialization = {
            attempted: false,
            strategy: "blob",
            replaced: 0,
            uploaded: 0,
            skipped: 0,
            warningCount: 0,
            reason: "blob_not_configured",
          };
        } else {
          try {
            const textFiles = files.map((f) => ({ name: f.path, content: f.content }));
            const imageAssets = await materializeImagesInTextFiles({
              files: textFiles,
              strategy: "blob",
              blobToken: process.env.BLOB_READ_WRITE_TOKEN,
              namespace: { chatId, versionId: effectiveVersionId },
            });
            imageMaterialization = {
              attempted: true,
              strategy: "blob",
              replaced: imageAssets.summary.replaced,
              uploaded: imageAssets.summary.uploaded,
              skipped: imageAssets.summary.skipped,
              warningCount: imageAssets.warnings.length,
            };

            if (imageAssets.summary.replaced > 0) {
              const blobFileMap = new Map(imageAssets.files.map((f) => [f.name, f.content]));
              files = files.map((f) => ({
                ...f,
                content: blobFileMap.get(f.path) ?? f.content,
              }));
              if (resolvedVersionId) {
                await updateVersionFiles(resolvedVersionId, JSON.stringify(files));
              }
              console.info(
                `[materialize] Own engine: uploaded ${imageAssets.summary.uploaded} images, replaced ${imageAssets.summary.replaced} references`,
              );
            }
          } catch (error) {
            console.error("[materialize] Own engine image materialization failed:", error);
            imageMaterializeError =
              error instanceof Error ? error.message : "Image materialization failed";
            imageMaterialization = {
              attempted: true,
              strategy: "blob",
              replaced: 0,
              uploaded: 0,
              skipped: 0,
              warningCount: 0,
              error: imageMaterializeError,
            };
          }
        }
      }

      // env.example (no leading dot) is canonical and is materialized into
      // version files by `injectProjectEnvFileIntoFilesJson` in the
      // finalize preflight phase. We deliberately do NOT inject a second
      // `.env.example` here — that would surface two near-identical env
      // files in the builder file panel and confuse users about which
      // one to copy. Builder shows env.example; export-only `.env.local`
      // is added by `buildCompleteProject` in the export scaffold.
      const formattedFiles = files.map((f) => ({
        name: f.path,
        content: f.content,
        language: f.language,
      }));

      return NextResponse.json({
        versionId: resolvedVersionId,
        files: formattedFiles,
        ...(imageMaterialization ? { imageMaterialization } : {}),
        ...(imageMaterializeError ? { imageMaterializeError } : {}),
      });
    }

    return NextResponse.json({ error: "No files found for version" }, { status: 404 });
  } catch (err) {
    console.error("Error fetching files:", err);
    return engineErrorResponse(err, "Failed to fetch files");
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const body = await req.json();

    const validationResult = updateFilesSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 },
      );
    }

    const { versionId, files } = validationResult.data;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const existingFiles = (await getVersionFiles(scopedVersion.version.id)) ?? [];
    const nextFiles = [...existingFiles];

    for (const file of files) {
      const nextFile = {
        path: file.name,
        content: file.content,
        language:
          existingFiles.find((existing) => existing.path === file.name)?.language ??
          inferFileLanguage(file.name),
      };
      const existingIndex = nextFiles.findIndex((existing) => existing.path === file.name);
      if (existingIndex >= 0) {
        nextFiles[existingIndex] = nextFile;
      } else {
        nextFiles.push(nextFile);
      }
    }

    const updated = await updateVersionFiles(scopedVersion.version.id, JSON.stringify(nextFiles));
    if (!updated) {
      return NextResponse.json({ error: "Failed to update version files" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      versionId: scopedVersion.version.id,
      files: nextFiles.map((file) => ({
        name: file.path,
        content: file.content,
      })),
      ...previewUrlField(null),
    });
  } catch (err) {
    console.error("Error updating files:", err);
    return engineErrorResponse(err, "Failed to update files");
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const body = await req.json();

    const singleFileSchema = z.object({
      versionId: z.string().min(1),
      fileName: z.string().min(1),
      content: z.string(),
      locked: z.boolean().optional(),
    });

    const validationResult = singleFileSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 },
      );
    }

    const { versionId, fileName, content, locked } = validationResult.data;
    const loaded = await loadOwnEngineFilesForChat(req, chatId, versionId);
    if (!loaded) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }

    const nextFiles = loaded.existingFiles.map((file) => {
      if (file.path === fileName) {
        return {
          ...file,
          content,
          language: file.language ?? inferFileLanguage(fileName),
        };
      }
      return file;
    });

    if (!nextFiles.some((file) => file.path === fileName)) {
      nextFiles.push({
        path: fileName,
        content,
        language: inferFileLanguage(fileName),
      });
    }

    const updated = await saveOwnEngineFiles(loaded.scopedVersion.version.id, nextFiles);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update version files" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      versionId: loaded.scopedVersion.version.id,
      file: nextFiles.find((file) => file.path === fileName)
        ? {
            name: fileName,
            content,
            locked: locked ?? false,
          }
        : null,
      ...previewUrlField(null),
    });
  } catch (err) {
    console.error("Error updating file:", err);
    return engineErrorResponse(err, "Failed to update file");
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("versionId");
    const fileName = searchParams.get("fileName");

    if (!versionId || !fileName) {
      return NextResponse.json(
        { error: "versionId and fileName are required query parameters" },
        { status: 400 },
      );
    }

    const loaded = await loadOwnEngineFilesForChat(req, chatId, versionId);
    if (!loaded) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }

    const updatedFiles = loaded.existingFiles.filter((file) => file.path !== fileName);
    const updated = await saveOwnEngineFiles(loaded.scopedVersion.version.id, updatedFiles);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update version files" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: fileName,
      versionId: loaded.scopedVersion.version.id,
      remainingFiles: updatedFiles.length,
    });
  } catch (err) {
    console.error("Error deleting file:", err);
    return engineErrorResponse(err, "Failed to delete file");
  }
}
