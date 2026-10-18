import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { z } from "zod";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { normalizeProviderError } from "@/lib/providers/errors/normalize-provider-error";
import { getVersionFiles, getLatestVersionFiles } from "@/lib/gen/version-manager";
import type { CodeFile } from "@/lib/gen/parser";
import {
  getPreferredVersion,
  getLatestVersion as getLatestEngineVersion,
  updateVersionFiles,
} from "@/lib/db/chat-repository-pg";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { versionBusyResponseIfLeaseHeld } from "@/lib/api/version-busy-response";

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

/**
 * Persist a MATERIAL user edit (PUT/PATCH/DELETE). GET only reads snapshots.
 * An edited file set is new content — any
 * `promoted`/`passed` verdict on the row belonged to the previous contents,
 * so the write also resets the row to `draft`/`pending` (post-#351 P1:
 * a promoted F3 version must not stay deploy-green after an in-place edit).
 */
async function saveOwnEngineFiles(versionId: string, files: CodeFile[]) {
  return updateVersionFiles(versionId, JSON.stringify(files), {
    invalidateVerification: true,
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;

    const { searchParams } = new URL(req.url);
    const requestedVersionId = searchParams.get("versionId");
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

    const updated = await saveOwnEngineFiles(scopedVersion.version.id, nextFiles);
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
    // A verify/repair job owns the version lease → retryable 409, no file
    // mutation happened (the atomic guard in updateVersionFiles no-op'd).
    const busy = versionBusyResponseIfLeaseHeld(err);
    if (busy) return busy;
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
    const busy = versionBusyResponseIfLeaseHeld(err);
    if (busy) return busy;
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
    const busy = versionBusyResponseIfLeaseHeld(err);
    if (busy) return busy;
    console.error("Error deleting file:", err);
    return engineErrorResponse(err, "Failed to delete file");
  }
}
