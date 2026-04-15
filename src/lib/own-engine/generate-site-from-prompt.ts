import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createGenerationPipeline } from "@/lib/gen/engine";
import { finalizeAndSaveVersion } from "@/lib/gen/stream/finalize-version";
import { dumpOwnEngineCodegenFromFullSystem } from "@/lib/gen/prompt-dump";
import { parseSSEBuffer, SuspenseLineProcessor } from "@/lib/gen/stream/sse-parser";
import { compressUrls } from "@/lib/gen/url-compress";
import { resolveOrchestrationBase, finalizeOrchestrationPrompts } from "@/lib/gen/orchestrate";
import { getAgentTools } from "@/lib/gen/agent-tools";
import { normalizeBuildIntent, type BuildIntent } from "@/lib/builder/build-intent";
import { DEFAULT_MODEL_ID } from "@/lib/models/catalog";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";

type RuntimeMode = "preview";

export type GenerateOwnEngineSiteFromPromptParams = {
  prompt: string;
  projectId: string;
  buildIntent?: string | null;
  modelId?: string | null;
  thinking?: boolean;
  imageGenerations?: boolean;
  scaffoldMode?: "auto" | "manual" | "off";
  scaffoldId?: string | null;
  runtimeMode?: RuntimeMode;
};

export type GenerateOwnEngineSiteFromPromptResult = {
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
  files: Array<{ path: string; content: string }>;
  contentForVersion: string;
  model: string;
};

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

export async function generateOwnEngineSiteFromPrompt(
  params: GenerateOwnEngineSiteFromPromptParams,
): Promise<GenerateOwnEngineSiteFromPromptResult> {
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const projectId = params.projectId.trim();
  if (!projectId) {
    throw new Error("Project ID is required.");
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
  const engineModel = resolveEngineModelId(modelSelection.modelTier);

  const orchestrationInput = {
    prompt,
    buildIntent,
    scaffoldMode,
    scaffoldId: params.scaffoldId ?? null,
    imageGenerations,
  } as const;
  const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
  const { engineSystemPrompt } = await finalizeOrchestrationPrompts(
    orchestrationBase,
    orchestrationInput,
  );
  dumpOwnEngineCodegenFromFullSystem(engineSystemPrompt, {
    source: "own-engine/non-stream-generate",
  });

  const chat = await chatRepo.createChat(
    projectId,
    String(engineModel),
    engineSystemPrompt,
    orchestrationBase.resolvedScaffold?.id,
  );
  await chatRepo.addMessage(chat.id, "user", prompt);

  const startedAt = Date.now();
  const { compressed: enginePrompt, urlMap } = compressUrls(prompt);
  const pipelineStream = createGenerationPipeline({
    prompt: enginePrompt,
    systemPrompt: engineSystemPrompt,
    model: String(engineModel),
    thinking,
    tools: getAgentTools(),
    maxSteps: 4,
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

  if (streamError) {
    if (!accumulatedContent.trim()) {
      throw new Error(streamError);
    }
    console.warn(
      "[own-engine] SSE error after partial output; finalizing with available content:",
      streamError,
    );
  }

  if (!sawDone) {
    const flushed = suspense.flush();
    if (flushed) accumulatedContent += flushed;
  }

  const finalized = await finalizeAndSaveVersion({
    accumulatedContent,
    chatId: chat.id,
    model: String(engineModel),
    resolvedTier: modelSelection.modelTier,
    originalPrompt: prompt,
    buildIntent,
    buildSpec: orchestrationBase.buildSpec,
    routePlan: orchestrationBase.routePlan,
    resolvedScaffold: orchestrationBase.resolvedScaffold,
    urlMap,
    startedAt,
    tokenUsage,
    orchestrationStreamMeta: {
      modelId: String(engineModel),
      modelTier: modelSelection.modelTier,
      enginePath: "own-engine",
      thinking,
      imageGenerations,
      scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
      buildSpec: orchestrationBase.buildSpec,
    },
  });

  let files: Array<{ path: string; content: string }>;
  try {
    const parsed: unknown = JSON.parse(finalized.filesJson);
    if (!Array.isArray(parsed)) {
      throw new Error("filesJson is not a JSON array");
    }
    files = parsed as Array<{ path: string; content: string }>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid filesJson";
    throw new Error(`Could not parse generated files: ${msg}`);
  }
  let runtimeUrl: string | null = finalized.previewUrl;
  let runtime: string | undefined;
  let ports: number[] | undefined;

  const previewSessionStarted = await startPreviewSession(
    files.map((file) => ({
      path: file.path,
      content: file.content,
      language: inferFileLanguage(file.path),
    })),
    {
      chatId: chat.id,
      appProjectId: projectId,
      versionIdForSession: finalized.version.id,
      skipRepair: true,
      skipProjectScaffold: true,
    },
  );
  if (!previewSessionStarted.ok) {
    throw new Error(
      `Tier-2 preview failed (${previewSessionStarted.error.stage}): ${previewSessionStarted.error.message}`,
    );
  }
  runtimeUrl = previewSessionStarted.result.sandboxUrl;
  const previewSessionId = previewSessionStarted.result.sandboxId;
  await chatRepo.updateVersionPreviewUrl(finalized.version.id, runtimeUrl);

  return {
    projectId,
    chatId: chat.id,
    versionId: finalized.version.id,
    messageId: finalized.messageId,
    previewUrl: finalized.previewUrl,
    runtimeMode,
    runtimeUrl,
    sandboxId: previewSessionId,
    runtime,
    ports,
    scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
    filesCount: files.length,
    files,
    contentForVersion: finalized.contentForVersion,
    model: String(engineModel),
  };
}
