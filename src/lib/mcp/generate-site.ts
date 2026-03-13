import { nanoid } from "nanoid";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createProject as createAppProject, saveProjectData } from "@/lib/db/services/projects";
import { createGenerationPipeline, shouldUseV0Fallback } from "@/lib/gen/fallback";
import { finalizeAndSaveVersion } from "@/lib/gen/stream/finalize-version";
import { buildSystemPrompt } from "@/lib/gen/system-prompt";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  detectScaffoldMode,
  getScaffoldById,
  matchScaffoldWithEmbeddings,
  serializeScaffoldForPrompt,
  type ScaffoldManifest,
} from "@/lib/gen/scaffolds";
import { parseSSEBuffer, SuspenseLineProcessor } from "@/lib/gen/route-helpers";
import { normalizeBuildIntent, type BuildIntent } from "@/lib/builder/build-intent";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/v0/modelSelection";
import type { RuntimeMode, RuntimeFile, SandboxRuntimeOptions } from "./runtime-url";
import {
  buildOwnEnginePreviewRuntime,
  createSandboxRuntimeFromFiles,
} from "./runtime-url";
import { DEFAULT_MODEL_ID } from "@/lib/v0/models";

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

function getContentText(data: unknown): string {
  return typeof (data as Record<string, unknown> | null)?.text === "string"
    ? ((data as Record<string, string>).text ?? "")
    : "";
}

function getDoneUsage(data: unknown): {
  prompt?: number;
  completion?: number;
} {
  const doneData = data as Record<string, unknown> | null;
  return {
    prompt:
      typeof doneData?.promptTokens === "number" ? doneData.promptTokens : undefined,
    completion:
      typeof doneData?.completionTokens === "number"
        ? doneData.completionTokens
        : undefined,
  };
}

export async function generateSiteFromPrompt(
  params: GenerateSiteParams,
): Promise<GenerateSiteResult> {
  if (shouldUseV0Fallback()) {
    throw new Error(
      "MCP site generation currently supports the own engine only. Disable V0 fallback to use this tool.",
    );
  }

  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const buildIntent: BuildIntent = normalizeBuildIntent(params.buildIntent ?? "website");
  const scaffoldMode = params.scaffoldMode ?? "auto";
  const runtimeMode = params.runtimeMode ?? "preview";
  const thinking = typeof params.thinking === "boolean" ? params.thinking : true;
  const imageGenerations =
    typeof params.imageGenerations === "boolean" ? params.imageGenerations : true;

  const modelSelection = resolveModelSelection({
    requestedModelId: params.modelId ?? null,
    fallbackTier: DEFAULT_MODEL_ID,
  });
  const engineModel = resolveEngineModelId(modelSelection.modelTier, false);

  let resolvedScaffold: ScaffoldManifest | null = null;
  if (scaffoldMode === "manual" && params.scaffoldId) {
    resolvedScaffold = getScaffoldById(params.scaffoldId);
  } else if (scaffoldMode === "auto") {
    resolvedScaffold = await matchScaffoldWithEmbeddings(prompt, buildIntent);
  }

  let scaffoldContext: string | undefined;
  if (resolvedScaffold) {
    const serializeMode = detectScaffoldMode(prompt);
    scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold, serializeMode);
  }

  const systemPrompt = await buildSystemPrompt({
    intent: buildIntent,
    imageGenerations,
    originalPrompt: prompt,
    scaffoldContext,
    brief: null,
  });

  let projectId = `mcp-${nanoid(10)}`;
  try {
    const appProject = await createAppProject(
      deriveProjectName(prompt),
      "mcp",
      prompt.slice(0, 200),
    );
    if (appProject?.id) {
      projectId = appProject.id;
    }
  } catch {
    // Best-effort only. If project creation fails for another reason we still
    // proceed with an internal project id stored in the engine repository.
  }

  const chat = await chatRepo.createChat(
    projectId,
    String(engineModel),
    systemPrompt,
    resolvedScaffold?.id,
  );
  await chatRepo.addMessage(chat.id, "user", prompt);

  const startedAt = Date.now();
  const { compressed: enginePrompt, urlMap } = compressUrls(prompt);
  const pipelineStream = createGenerationPipeline({
    prompt: enginePrompt,
    systemPrompt,
    model: String(engineModel),
    thinking,
  });

  const reader = pipelineStream.getReader();
  const decoder = new TextDecoder();
  const suspense = new SuspenseLineProcessor(undefined, { urlMap });
  let sseBuffer = "";
  let accumulatedContent = "";
  let tokenUsage: { prompt?: number; completion?: number } | undefined;
  let sawDone = false;
  let streamError: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBuffer(sseBuffer);
      sseBuffer = remaining;

      for (const evt of events) {
        switch (evt.event) {
          case "content": {
            const text = getContentText(evt.data);
            if (!text) break;
            const processed = suspense.process(text);
            accumulatedContent += processed;
            break;
          }
          case "done": {
            const flushed = suspense.flush();
            if (flushed) accumulatedContent += flushed;
            tokenUsage = getDoneUsage(evt.data);
            sawDone = true;
            break;
          }
          case "error": {
            const message =
              typeof (evt.data as Record<string, unknown> | null)?.message === "string"
                ? String((evt.data as Record<string, unknown>).message)
                : "Generation failed";
            streamError = message;
            break;
          }
          default:
            break;
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  if (sseBuffer.trim()) {
    const { events } = parseSSEBuffer(`${sseBuffer}\n`);
    for (const evt of events) {
      if (evt.event === "content") {
        const text = getContentText(evt.data);
        if (!text) continue;
        const processed = suspense.process(text);
        accumulatedContent += processed;
      } else if (evt.event === "done" && !sawDone) {
        const flushed = suspense.flush();
        if (flushed) accumulatedContent += flushed;
        tokenUsage = getDoneUsage(evt.data);
        sawDone = true;
      }
    }
  }

  if (!sawDone && !accumulatedContent.trim()) {
    throw new Error(streamError || "Generation produced no content.");
  }

  if (!sawDone) {
    const flushed = suspense.flush();
    if (flushed) accumulatedContent += flushed;
  }

  const finalized = await finalizeAndSaveVersion({
    accumulatedContent,
    chatId: chat.id,
    model: String(engineModel),
    resolvedScaffold,
    urlMap,
    startedAt,
    tokenUsage,
  });

  const files = JSON.parse(finalized.filesJson) as Array<{
    path: string;
    content: string;
  }>;
  const runtimeFiles: RuntimeFile[] = files.map((file) => ({
    name: file.path,
    content: file.content,
  }));

  let runtimeUrl: string | null = finalized.previewUrl;
  let sandboxId: string | undefined;
  let runtime: string | undefined;
  let ports: number[] | undefined;

  if (runtimeMode === "sandbox") {
    const sandboxRuntime = await createSandboxRuntimeFromFiles(
      runtimeFiles,
      params.sandbox,
    );
    runtimeUrl = sandboxRuntime.primaryUrl;
    sandboxId = sandboxRuntime.sandboxId;
    runtime = sandboxRuntime.runtime;
    ports = sandboxRuntime.ports;
  } else {
    runtimeUrl = buildOwnEnginePreviewRuntime({
      chatId: chat.id,
      versionId: finalized.version.id,
      projectId,
    }).url;
  }

  try {
    const persistedChat = await chatRepo.getChat(chat.id);
    await saveProjectData({
      project_id: projectId,
      chat_id: chat.id,
      demo_url: runtimeUrl ?? finalized.previewUrl,
      current_code: finalized.contentForVersion,
      files,
      messages: persistedChat?.messages ?? [],
      meta: {
        source: "mcp.generate-site",
        scaffoldId: resolvedScaffold?.id ?? null,
        runtimeMode,
        versionId: finalized.version.id,
      },
    });
  } catch {
    // Best-effort only. Generation result remains valid even if app project
    // persistence is unavailable in the current environment.
  }

  return {
    projectId,
    chatId: chat.id,
    versionId: finalized.version.id,
    messageId: finalized.messageId,
    previewUrl: finalized.previewUrl,
    runtimeMode,
    runtimeUrl,
    sandboxId,
    runtime,
    ports,
    scaffoldId: resolvedScaffold?.id ?? null,
    filesCount: runtimeFiles.length,
  };
}
