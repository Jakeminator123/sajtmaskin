import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createProject as createAppProject, saveProjectData } from "@/lib/db/services/projects";
import { generateOwnEngineSiteFromPrompt } from "@/lib/own-engine/generate-site-from-prompt";
import type { RuntimeMode, SandboxRuntimeOptions } from "./runtime-url";

export type GenerateSiteParams = {
  prompt: string;
  buildIntent?: string | null;
  modelId?: string | null;
  thinking?: boolean;
  imageGenerations?: boolean;
  scaffoldMode?: "auto" | "manual" | "off";
  scaffoldId?: string | null;
  runtimeMode?: RuntimeMode;
  sandbox?: SandboxRuntimeOptions;
};

export type GenerateSiteResult = {
  projectId: string;
  chatId: string;
  versionId: string;
  messageId: string;
  previewUrl: string | null;
  runtimeMode: RuntimeMode;
  runtimeUrl: string | null;
  sandboxId?: string;
  runtime?: string;
  ports?: number[];
  scaffoldId: string | null;
  filesCount: number;
};

function deriveProjectName(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (!singleLine) return "MCP Generated Site";
  return singleLine.length > 64 ? `${singleLine.slice(0, 61)}...` : singleLine;
}

export async function generateSiteFromPrompt(
  params: GenerateSiteParams,
): Promise<GenerateSiteResult> {
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }
  let projectId = "";
  try {
    const appProject = await createAppProject(
      deriveProjectName(prompt),
      "mcp",
      prompt.slice(0, 200),
    );
    if (appProject?.id) {
      projectId = appProject.id;
    }
  } catch (error) {
    throw new Error(
      `Could not create app project for MCP generation: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
  const generated = await generateOwnEngineSiteFromPrompt({
    ...params,
    projectId,
  });

  try {
    const persistedChat = await chatRepo.getChat(generated.chatId);
    await saveProjectData({
      project_id: projectId,
      chat_id: generated.chatId,
      demo_url: generated.runtimeUrl ?? generated.previewUrl,
      current_code: generated.contentForVersion,
      files: generated.files,
      messages: persistedChat?.messages ?? [],
      meta: {
        source: "mcp.generate-site",
        scaffoldId: generated.scaffoldId,
        runtimeMode: generated.runtimeMode,
        versionId: generated.versionId,
      },
    });
  } catch {
    // Best-effort only. Generation result remains valid even if app project
    // persistence is unavailable in the current environment.
  }

  return {
    projectId: generated.projectId,
    chatId: generated.chatId,
    versionId: generated.versionId,
    messageId: generated.messageId,
    previewUrl: generated.previewUrl,
    runtimeMode: generated.runtimeMode,
    runtimeUrl: generated.runtimeUrl,
    sandboxId: generated.sandboxId,
    runtime: generated.runtime,
    ports: generated.ports,
    scaffoldId: generated.scaffoldId,
    filesCount: generated.filesCount,
  };
}
