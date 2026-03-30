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
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import {
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
} from "@/lib/project-env-resolver";
import { deriveSetupContract, buildEnvExampleContent } from "@/lib/gen/setup-contract";

function v0ErrorResponse(err: unknown, fallbackMessage: string) {
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

function inferLanguage(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".tsx")) return "tsx";
  if (normalized.endsWith(".ts")) return "ts";
  if (normalized.endsWith(".jsx")) return "jsx";
  if (normalized.endsWith(".js")) return "js";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "md";
  if (normalized.endsWith(".html")) return "html";
  return "text";
}

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
      const effectiveVersionId = resolvedVersionId ?? requestedVersionId ?? chatId;

      const repairResult = repairGeneratedFiles(files);
      if (repairResult.fixes.length > 0) {
        files = repairResult.files;
        if (resolvedVersionId) {
          await updateVersionFiles(resolvedVersionId, JSON.stringify(files));
        }
      }

      if (shouldMaterialize && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const textFiles = files.map((f) => ({ name: f.path, content: f.content }));
          const imageAssets = await materializeImagesInTextFiles({
            files: textFiles,
            strategy: "blob",
            blobToken: process.env.BLOB_READ_WRITE_TOKEN,
            namespace: { chatId, versionId: effectiveVersionId },
          });

          if (imageAssets.summary.replaced > 0) {
            const blobFileMap = new Map(imageAssets.files.map((f) => [f.name, f.content]));
            files = files.map((f) => ({
              ...f,
              content: blobFileMap.get(f.path) ?? f.content,
            }));
            if (resolvedVersionId) {
              await updateVersionFiles(resolvedVersionId, JSON.stringify(files));
            }
            console.log(
              `[materialize] Own engine: uploaded ${imageAssets.summary.uploaded} images, replaced ${imageAssets.summary.replaced} references`,
            );
          }
        } catch (error) {
          console.error("[materialize] Own engine image materialization failed:", error);
          imageMaterializeError =
            error instanceof Error ? error.message : "Image materialization failed";
        }
      }

      const formattedFiles = files.map((f) => ({
        name: f.path,
        content: f.content,
        language: f.language,
      }));

      const versionRows = files
        .filter((f) => typeof f?.path === "string" && typeof f?.content === "string")
        .map((f) => ({ path: f.path as string, content: f.content as string }));
      const projectEnv = await resolveProjectEnv(
        engineChat?.project_id ?? null,
      );
      const envReqs = resolveEnvRequirementsFromVersionFiles(versionRows, projectEnv);
      if (envReqs.requiredEnvKeys.length > 0) {
        const setupContract = deriveSetupContract(undefined, projectEnv.configuredKeys);
        const envExampleContent = buildEnvExampleContent({
          ...setupContract,
          requiredEnvKeys: envReqs.requiredEnvKeys,
        });
        const alreadyHasEnvExample = formattedFiles.some(
          (f) => f.name === ".env.example" || f.name === ".env.local.example",
        );
        if (!alreadyHasEnvExample && envExampleContent.trim().length > 30) {
          formattedFiles.push({
            name: ".env.example",
            content: envExampleContent,
            language: "text",
          });
        }
      }

      return NextResponse.json({
        versionId: resolvedVersionId,
        files: formattedFiles,
        ...(imageMaterializeError ? { imageMaterializeError } : {}),
      });
    }

    return NextResponse.json({ error: "No files found for version" }, { status: 404 });
  } catch (err) {
    console.error("Error fetching files:", err);
    return v0ErrorResponse(err, "Failed to fetch files");
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
          inferLanguage(file.name),
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
    return v0ErrorResponse(err, "Failed to update files");
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
          language: file.language ?? inferLanguage(fileName),
        };
      }
      return file;
    });

    if (!nextFiles.some((file) => file.path === fileName)) {
      nextFiles.push({
        path: fileName,
        content,
        language: inferLanguage(fileName),
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
    return v0ErrorResponse(err, "Failed to update file");
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
    return v0ErrorResponse(err, "Failed to delete file");
  }
}
