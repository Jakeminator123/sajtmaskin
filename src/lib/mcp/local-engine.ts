import * as chatRepo from "@/lib/db/chat-repository-pg";
import { getLatestVersionFiles, getVersionFiles } from "@/lib/gen/version-manager";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";

type RuntimeMode = "preview";

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
}

export interface CreateLocalGeneratedRuntimeParams {
  chatId: string;
  versionId?: string | null;
  mode?: RuntimeMode;
}

interface ResolvedGeneratedFilesResult {
  files: LocalGeneratedFile[];
  resolvedVersionId: string | null;
}

async function getOwnEngineProjectId(chatId: string): Promise<string | null> {
  const chat = await chatRepo.getChat(chatId);
  return typeof chat?.project_id === "string" && chat.project_id.trim()
    ? chat.project_id
    : null;
}

async function resolveGeneratedFiles(
  chatId: string,
  versionId?: string | null,
): Promise<ResolvedGeneratedFilesResult> {
  const raw = versionId
    ? await getVersionFiles(versionId)
    : await getLatestVersionFiles(chatId);
  if (!raw) {
    return {
      files: [],
      resolvedVersionId: versionId ?? (await chatRepo.getLatestVersion(chatId))?.id ?? null,
    };
  }
  return {
    files: raw.map((file) => ({
      name: file.path,
      content: file.content,
      language: file.language ?? inferFileLanguage(file.path),
      bytes: file.content.length,
    })),
    resolvedVersionId: versionId ?? (await chatRepo.getLatestVersion(chatId))?.id ?? null,
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
    projectId: await getOwnEngineProjectId(chatId),
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
  const { chatId, versionId, mode = "preview" } = params;
  const projectId = await getOwnEngineProjectId(chatId);

  const { files, resolvedVersionId } = await resolveGeneratedFiles(chatId, versionId);
  if (files.length === 0) {
    throw new Error("No files found for the requested chat/version");
  }

    const started = await startPreviewSession(
    files.map((file) => ({
      path: file.name,
      content: file.content,
      language: file.language,
    })),
    {
      chatId,
      appProjectId: projectId,
      versionIdForSession: resolvedVersionId,
      skipRepair: true,
    },
  );
  if (!started.ok) {
    throw new Error(
      `Tier-2 preview failed (${started.error.stage}): ${started.error.message}`,
    );
  }
  if (resolvedVersionId) {
    await chatRepo.updateVersionPreviewUrl(resolvedVersionId, started.result.sandboxUrl);
  }

  return {
    mode,
    chatId,
    versionId: resolvedVersionId,
    projectId,
    url: started.result.sandboxUrl,
    sandboxId: started.result.sandboxId,
  };
}
