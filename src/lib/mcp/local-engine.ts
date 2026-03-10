import * as chatRepo from "@/lib/db/chat-repository";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getLatestVersionFiles, getVersionFiles } from "@/lib/gen/version-manager";
import { assertV0Key, v0 } from "@/lib/v0";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";
import {
  buildOwnEnginePreviewRuntime,
  createSandboxRuntimeFromFiles,
  type RuntimeMode,
  type SandboxRuntimeOptions,
} from "./runtime-url";

export interface LocalGeneratedFile {
  name: string;
  content: string;
  language: string;
  bytes: number;
}

export interface LocalGeneratedManifest {
  projectId: string | null;
  chatId: string;
  versionId: string | null;
  totalFiles: number;
  totalBytes: number;
  files: Array<{ name: string; language: string; bytes: number }>;
}

export interface LocalGeneratedRuntimeResult {
  mode: RuntimeMode;
  chatId: string;
  versionId: string | null;
  projectId: string | null;
  url?: string;
  sandboxId?: string;
  primaryUrl?: string | null;
  runtime?: string;
  ports?: number[];
}

export interface CreateLocalGeneratedRuntimeParams extends SandboxRuntimeOptions {
  chatId: string;
  versionId?: string | null;
  mode?: RuntimeMode;
}

interface ResolvedGeneratedFilesResult {
  files: LocalGeneratedFile[];
  resolvedVersionId: string | null;
}

function getOwnEngineProjectId(chatId: string): string | null {
  if (shouldUseV0Fallback()) return null;
  const chat = chatRepo.getChat(chatId);
  return typeof chat?.project_id === "string" && chat.project_id.trim()
    ? chat.project_id
    : null;
}

function inferLanguage(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    tsx: "tsx",
    ts: "ts",
    jsx: "jsx",
    js: "js",
    css: "css",
    json: "json",
    md: "md",
    html: "html",
  };
  return map[ext] ?? "text";
}

function getV0LatestVersionId(chat: unknown): string | null {
  const payload = chat as {
    latestVersion?: { id?: string | null } | null;
  } | null;
  const id = payload?.latestVersion?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function resolveGeneratedFiles(
  chatId: string,
  versionId?: string | null,
): Promise<ResolvedGeneratedFilesResult> {
  if (!shouldUseV0Fallback()) {
    const raw = versionId ? getVersionFiles(versionId) : getLatestVersionFiles(chatId);
    if (!raw) {
      return {
        files: [],
        resolvedVersionId: versionId ?? chatRepo.getLatestVersion(chatId)?.id ?? null,
      };
    }
    return {
      files: raw.map((file) => ({
        name: file.path,
        content: file.content,
        language: file.language ?? inferLanguage(file.path),
        bytes: file.content.length,
      })),
      resolvedVersionId: versionId ?? chatRepo.getLatestVersion(chatId)?.id ?? null,
    };
  }

  assertV0Key();

  const chat = await v0.chats.getById({ chatId });
  const targetVersionId = versionId ?? getV0LatestVersionId(chat) ?? null;

  if (!targetVersionId) {
    return { files: [], resolvedVersionId: null };
  }

  const result = await resolveVersionFiles({
    chatId,
    versionId: targetVersionId,
    options: { maxAttempts: 10, delayMs: 1500, minFiles: 1 },
  });

  if (result.files.length > 0) {
    return {
      files: result.files.map((file) => ({
        name: file.name,
        content: typeof file.content === "string" ? file.content : "",
        language: inferLanguage(file.name),
        bytes: typeof file.content === "string" ? file.content.length : 0,
      })),
      resolvedVersionId: targetVersionId,
    };
  }

  const versionData = result.version as {
    files?: Array<{ name: string; content?: string }>;
  } | null;

  if (!Array.isArray(versionData?.files)) {
    return { files: [], resolvedVersionId: targetVersionId };
  }

  return {
    files: versionData.files.map((file) => ({
      name: file.name,
      content: typeof file.content === "string" ? file.content : "",
      language: inferLanguage(file.name),
      bytes: typeof file.content === "string" ? file.content.length : 0,
    })),
    resolvedVersionId: targetVersionId,
  };
}

export async function loadGeneratedFiles(
  chatId: string,
  versionId?: string | null,
): Promise<LocalGeneratedFile[]> {
  const result = await resolveGeneratedFiles(chatId, versionId);
  return result.files;
}

export async function loadGeneratedManifest(
  chatId: string,
  versionId?: string | null,
): Promise<LocalGeneratedManifest> {
  const { files, resolvedVersionId } = await resolveGeneratedFiles(chatId, versionId);
  return {
    projectId: getOwnEngineProjectId(chatId),
    chatId,
    versionId: resolvedVersionId,
    totalFiles: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files: files.map((file) => ({
      name: file.name,
      language: file.language,
      bytes: file.bytes,
    })),
  };
}

export async function loadGeneratedFile(
  chatId: string,
  fileName: string,
  versionId?: string | null,
): Promise<LocalGeneratedFile | null> {
  const { files } = await resolveGeneratedFiles(chatId, versionId);
  return (
    files.find((file) => file.name === fileName || file.name === `/${fileName}`) ?? null
  );
}

export async function createLocalGeneratedRuntime(
  params: CreateLocalGeneratedRuntimeParams,
): Promise<LocalGeneratedRuntimeResult> {
  const { chatId, versionId, mode = "sandbox", ...sandboxOptions } = params;
  const projectId = getOwnEngineProjectId(chatId);

  if (mode === "preview") {
    const resolvedVersionId = versionId ?? chatRepo.getLatestVersion(chatId)?.id ?? null;
    if (shouldUseV0Fallback()) {
      throw new Error("Own-engine preview URL is not available in v0 fallback mode");
    }

    return buildOwnEnginePreviewRuntime({
      chatId,
      versionId: resolvedVersionId,
      projectId,
    });
  }

  const { files, resolvedVersionId } = await resolveGeneratedFiles(chatId, versionId);
  if (files.length === 0) {
    throw new Error("No files found for the requested chat/version");
  }

  const sandboxRuntime = await createSandboxRuntimeFromFiles(
    files.map((file) => ({
      name: file.name,
      content: file.content,
    })),
    sandboxOptions,
  );

  return {
    ...sandboxRuntime,
    chatId,
    versionId: resolvedVersionId,
    projectId,
  };
}
