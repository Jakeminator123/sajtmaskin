import { assertV0Key, v0 } from "@/lib/v0";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { materializeImagesInTextFiles } from "@/lib/imageAssets";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";
import { normalizeV0Error } from "@/lib/v0/errors";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getVersionFiles, getLatestVersionFiles } from "@/lib/gen/version-manager";
import {
  getLatestVersion as getLatestEngineVersion,
  getVersionById,
  updateVersionFiles,
} from "@/lib/db/chat-repository-pg";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";

function v0ErrorResponse(err: unknown, fallbackMessage: string) {
  const info = normalizeV0Error(err);
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

type V0FileEntry = {
  name: string;
  content: string;
  locked?: boolean;
};

type V0VersionPayload = {
  id?: string | null;
  demoUrl?: string | null;
  files?: unknown;
  latestVersion?: {
    id?: string | null;
  } | null;
};

function getV0VersionPayload(value: unknown): V0VersionPayload {
  return (value as V0VersionPayload | null) ?? {};
}

function getV0VersionId(value: unknown): string | null {
  const id = getV0VersionPayload(value).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function getV0LatestVersionId(value: unknown): string | null {
  const latestId = getV0VersionPayload(value).latestVersion?.id;
  return typeof latestId === "string" && latestId.length > 0 ? latestId : null;
}

function getV0Files(value: unknown): V0FileEntry[] {
  const files = getV0VersionPayload(value).files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) => {
    if (!file || typeof file !== "object") return [];
    const entry = file as {
      name?: unknown;
      content?: unknown;
      locked?: unknown;
    };
    if (typeof entry.name !== "string" || entry.name.length === 0) return [];
    return [{
      name: entry.name,
      content: typeof entry.content === "string" ? entry.content : "",
      locked: typeof entry.locked === "boolean" ? entry.locked : undefined,
    }];
  });
}

async function isPinnedVersion(chatId: string, versionId: string) {
  const rows = await db
    .select({ pinned: versions.pinned })
    .from(versions)
    .where(
      and(
        eq(versions.chatId, chatId),
        or(eq(versions.id, versionId), eq(versions.v0VersionId, versionId)),
      ),
    )
    .limit(1);
  return rows[0]?.pinned ?? false;
}

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

export async function GET(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;

    // ---------------------------------------------------------------
    // Non-fallback: fetch files from Postgres engine store (+ optional blob materialization)
    // ---------------------------------------------------------------
    if (!shouldUseV0Fallback()) {
      const { searchParams } = new URL(req.url);
      const requestedVersionId = searchParams.get("versionId");
      const shouldMaterialize = searchParams.get("materialize") === "1";

      let files;
      let resolvedVersionId: string | null = null;

      if (requestedVersionId) {
        files = await getVersionFiles(requestedVersionId);
        resolvedVersionId = requestedVersionId;
      } else {
        files = await getLatestVersionFiles(chatId);
        resolvedVersionId = (await getLatestEngineVersion(chatId))?.id ?? null;
      }

      if (files) {
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
          }
        }

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
    }

    // ---------------------------------------------------------------
    // V0 fallback: existing flow
    // ---------------------------------------------------------------
    assertV0Key();
    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const { searchParams } = new URL(req.url);
    const requestedVersionId = searchParams.get("versionId");
    const shouldMaterialize = searchParams.get("materialize") === "1";
    const shouldWait = searchParams.get("wait") === "1";

    const chat = await v0.chats.getById({ chatId });

    const versionIdToFetch = requestedVersionId || getV0LatestVersionId(chat) || null;

    if (!versionIdToFetch) {
      return NextResponse.json({ error: "No version found for this chat" }, { status: 404 });
    }

    const versionResponse = shouldWait
      ? await resolveVersionFiles({
          chatId,
          versionId: versionIdToFetch,
          options: { maxAttempts: 20, delayMs: 1500, minFiles: 1 },
        })
      : {
          version: await v0.chats.getVersion({
            chatId,
            versionId: versionIdToFetch,
            includeDefaultFiles: true,
          }),
          files: [],
          resolved: true,
          errorMessage: null,
          attempts: 1,
        };

    const version = versionResponse.version;

    let files: V0FileEntry[] =
      versionResponse.files.length > 0
        ? versionResponse.files.map((file) => ({
            name: file.name,
            content: typeof file.content === "string" ? file.content : "",
            locked: file.locked,
          }))
        : getV0Files(version);
    let resolvedVersionId = getV0VersionId(version);

    if (shouldMaterialize && process.env.BLOB_READ_WRITE_TOKEN) {
      const isPinned = await isPinnedVersion(dbChat.id, versionIdToFetch);
      if (!isPinned) {
        const fileLocks = new Map<string, boolean | undefined>(
          files.map((file) => [file.name, file.locked]),
        );
        try {
          const imageAssets = await materializeImagesInTextFiles({
            files: files.map((file) => ({ name: file.name, content: file.content })),
            strategy: "blob",
            blobToken: process.env.BLOB_READ_WRITE_TOKEN,
            namespace: { chatId, versionId: versionIdToFetch },
          });

          if (imageAssets.summary.replaced > 0) {
            const updatedFiles = imageAssets.files.map((file) => ({
              name: file.name,
              content: file.content,
              locked: fileLocks.get(file.name),
            }));
            const updatedVersion = await v0.chats.updateVersion({
              chatId,
              versionId: versionIdToFetch,
              files: updatedFiles,
            });
            resolvedVersionId = getV0VersionId(updatedVersion) || resolvedVersionId;
            files = getV0Files(updatedVersion).length > 0 ? getV0Files(updatedVersion) : updatedFiles;
          }
        } catch (error) {
          console.error("Error materializing images:", error);
        }
      }
    }

    return NextResponse.json({
      versionId: resolvedVersionId,
      files,
    });
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

    if (!shouldUseV0Fallback()) {
      const version = await getVersionById(versionId);
      if (version && version.chat_id === chatId) {
        const existingFiles = (await getVersionFiles(versionId)) ?? [];
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

        const updated = await updateVersionFiles(versionId, JSON.stringify(nextFiles));
        if (!updated) {
          return NextResponse.json({ error: "Failed to update version files" }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          versionId,
          files: nextFiles.map((file) => ({
            name: file.path,
            content: file.content,
          })),
          demoUrl: null,
        });
      }
    }

    assertV0Key();
    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    if (await isPinnedVersion(dbChat.id, versionId)) {
      return NextResponse.json({ error: "Version is pinned and read-only" }, { status: 409 });
    }

    const updatedVersion = await v0.chats.updateVersion({
      chatId,
      versionId,
      files,
    });

    return NextResponse.json({
      success: true,
      versionId: getV0VersionId(updatedVersion),
      files: getV0Files(updatedVersion),
      demoUrl: getV0VersionPayload(updatedVersion).demoUrl ?? null,
    });
  } catch (err) {
    console.error("Error updating files:", err);
    return v0ErrorResponse(err, "Failed to update files");
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;
    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
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
    if (await isPinnedVersion(dbChat.id, versionId)) {
      return NextResponse.json({ error: "Version is pinned and read-only" }, { status: 409 });
    }

    const currentVersion = await v0.chats.getVersion({
      chatId,
      versionId,
      includeDefaultFiles: true,
    });

    const updatedFiles = getV0Files(currentVersion).map((file) => {
      if (file.name === fileName) {
        return {
          name: fileName,
          content,
          locked: locked ?? file.locked,
        };
      }
      return {
        name: file.name,
        content: file.content,
        locked: file.locked,
      };
    });

    if (!updatedFiles.some((f) => f.name === fileName)) {
      updatedFiles.push({
        name: fileName,
        content,
        locked: locked ?? false,
      });
    }

    const updatedVersion = await v0.chats.updateVersion({
      chatId,
      versionId,
      files: updatedFiles,
    });

    return NextResponse.json({
      success: true,
      versionId: getV0VersionId(updatedVersion),
      file: getV0Files(updatedVersion).find((f) => f.name === fileName),
      demoUrl: getV0VersionPayload(updatedVersion).demoUrl ?? null,
    });
  } catch (err) {
    console.error("Error updating file:", err);
    return v0ErrorResponse(err, "Failed to update file");
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;
    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("versionId");
    const fileName = searchParams.get("fileName");

    if (!versionId || !fileName) {
      return NextResponse.json(
        { error: "versionId and fileName are required query parameters" },
        { status: 400 },
      );
    }

    if (await isPinnedVersion(dbChat.id, versionId)) {
      return NextResponse.json({ error: "Version is pinned and read-only" }, { status: 409 });
    }

    const currentVersion = await v0.chats.getVersion({
      chatId,
      versionId,
      includeDefaultFiles: true,
    });

    const updatedFiles = getV0Files(currentVersion)
      .filter((file) => file.name !== fileName)
      .map((file) => ({
        name: file.name,
        content: file.content,
        locked: file.locked,
      }));

    const updatedVersion = await v0.chats.updateVersion({
      chatId,
      versionId,
      files: updatedFiles,
    });

    return NextResponse.json({
      success: true,
      deleted: fileName,
      versionId: getV0VersionId(updatedVersion),
      remainingFiles: getV0Files(updatedVersion).length,
    });
  } catch (err) {
    console.error("Error deleting file:", err);
    return v0ErrorResponse(err, "Failed to delete file");
  }
}
