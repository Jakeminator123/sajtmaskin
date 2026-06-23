import { beforeEach, describe, expect, it, vi } from "vitest";

const delegatedPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/engine/chats/chat-message-stream-post", () => ({
  POST: delegatedPost,
  handleMessageStreamRequest: vi.fn(),
}));

// --- v0-side mocks (migrated) so the real chat-message-stream-post can run
// when `delegatedPost.mockImplementation(realImpl)` is wired up below. ---
const sendMessageSchemaSafeParse = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const resolveFollowUpPreviousFiles = vi.hoisted(() => vi.fn());
const resolveChatPreferredVersionId = vi.hoisted(() => vi.fn());
const updateChatProjectId = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const createGenerationPipeline = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const prepareGenerationContext = vi.hoisted(() => vi.fn());
const resolveOrchestrationBase = vi.hoisted(() => vi.fn());
const finalizeOrchestrationPrompts = vi.hoisted(() => vi.fn());
const buildGenerationInputPackage = vi.hoisted(() => vi.fn());
const writeOrchestrationDynamicDump = vi.hoisted(() => vi.fn());
const finalizeOrHandleEmptyGeneration = vi.hoisted(() => vi.fn());
const buildFileContext = vi.hoisted(() => vi.fn());
const parseSSEBuffer = vi.hoisted(() => vi.fn());
const createPromptLog = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return actual;
});

vi.mock("@/lib/streaming", () => ({
  createSSEHeaders: () => ({ "Content-Type": "text/event-stream" }),
  formatSSEEvent: (event: string, data: unknown) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
}));

vi.mock("@/lib/db/client", () => ({
  db: {},
  dbConfigured: false,
}));

vi.mock("@/lib/db/schema", () => ({
  chats: {},
  versions: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getChatByV0ChatIdForRequest,
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "sess_1", setCookie: null }),
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
  devLogFinalizeSite: vi.fn(),
  devLogStartGeneration: vi.fn(),
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
  warnLog: vi.fn(),
}));

vi.mock("@/lib/sanitize/sanitize-metadata", () => ({
  sanitizeMetadata: vi.fn(),
}));

vi.mock("@/lib/providers/errors/normalize-provider-error", () => ({
  normalizeProviderError: (error: unknown) => ({
    message: error instanceof Error ? error.message : "Unknown error",
    status: 500,
    code: null,
    retryAfter: null,
  }),
}));

vi.mock("@/lib/validations/chatSchemas", () => ({
  sendMessageSchema: {
    safeParse: sendMessageSchemaSafeParse,
  },
}));

vi.mock("@/lib/builder/promptLimits", () => ({
  WARN_CHAT_MESSAGE_CHARS: 20_000,
  WARN_CHAT_SYSTEM_CHARS: 20_000,
  MAX_AI_BRIEF_PROMPT_CHARS: 20_000,
  MAX_PROMPT_HANDOFF_CHARS: 20_000,
}));

vi.mock("@/lib/builder/promptOrchestration", () => ({
  orchestratePromptMessage: ({ message }: { message: string }) => ({
    finalMessage: message,
    strategyMeta: {
      strategy: "none",
      promptType: "freeform",
      budgetTarget: "default",
      optimizedLength: message.length,
      originalLength: message.length,
      reductionRatio: 0,
      reason: "unit-test",
      complexityScore: 0,
    },
  }),
  looksDesignHeavyMessage: () => false,
}));

vi.mock("@/lib/db/services/prompt-logs", () => ({
  createPromptLog,
}));

vi.mock("@/lib/models/selection", () => ({
  resolveModelSelection: () => ({
    modelId: "test-model-id",
    modelTier: "test-tier",
  }),
  resolveEngineModelId: () => "gpt-5.4",
}));

vi.mock("@/lib/models/catalog", () => ({
  DEFAULT_MODEL_ID: "test-model-id",
  DEFAULT_OWN_MODEL_ID: "gpt-5.4",
  MODEL_LABELS: {
    "test-tier": "Test Tier",
  },
  canonicalModelIdToOwnModelId: () => "gpt-5.4",
  getBuildProfileId: () => "profile-test",
  isCanonicalModelId: () => false,
}));

vi.mock("@/lib/gen/engine", () => ({
  shouldUseExplicitBuilderFallback: () => false,
  shouldUseV0Fallback: () => false,
  createGenerationPipeline,
}));

vi.mock("@/lib/models/phase-routing", () => ({
  resolvePhaseThinking: () => ({
    phase: "generator",
    thinking: true,
    reasoningEffort: "medium",
    reason: "mock",
  }),
  resolvePhaseModel: () => ({
    phase: "generator",
    modelId: "gpt-5.4",
    reason: "mock",
  }),
}));

vi.mock("@/lib/builder/site-brief-generation", () => ({
  tryGenerateServerAutoBrief: vi.fn(async () => null),
}));

vi.mock("@/lib/api/preview-url-contract", () => ({
  previewUrlField: (url: string | null | undefined) => ({
    previewUrl: url == null || url === "" ? null : String(url),
  }),
}));

vi.mock("@/lib/gen/url-compress", () => ({
  compressUrls: (value: string) => ({ compressed: value, urlMap: {} }),
}));

vi.mock("@/lib/gen/orchestrate", () => ({
  prepareGenerationContext,
  resolveOrchestrationBase,
  finalizeOrchestrationPrompts,
  buildGenerationInputPackage,
  writeOrchestrationDynamicDump,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  resolveFollowUpPreviousFiles,
  resolveChatPreferredVersionId,
}));

vi.mock("@/lib/gen/plan/prompt", () => ({
  buildPlannerSystemPrompt: vi.fn(),
  parsePlanResponse: vi.fn(),
}));

vi.mock("@/lib/gen/plan/review", () => ({
  buildPlanSummaryMessage: vi.fn(),
  buildPlanUiPart: vi.fn(),
  enrichPlanArtifactForReview: vi.fn(),
}));

vi.mock("@/lib/gen/system-prompt", () => ({
  SYSTEM_PROMPT_SEPARATOR: "\n\n---\n\n# Request-Specific Context\n\n",
  getSystemPromptLengths: () => ({ prompt: 10 }),
}));

vi.mock("@/lib/gen/agent-tools", () => ({
  getAgentTools: () => [],
}));

vi.mock("@/lib/gen/request-metadata", () => ({
  extractAppProjectIdFromMeta: () => "app_proj_1",
  extractBriefFromMeta: () => null,
  extractDesignThemePresetFromMeta: () => null,
  extractPaletteStateFromMeta: () => null,
  extractScaffoldSettingsFromMeta: () => ({
    scaffoldMode: "auto",
    scaffoldId: null,
  }),
  extractThemeColorsFromMeta: () => null,
  normalizeRequestAttachments: (attachments: unknown[] | undefined) => attachments ?? [],
  summarizeDesignReferences: () => [],
}));

vi.mock("@/lib/gen/stream/sse-parser", () => {
  class SuspenseLineProcessor {
    process(text: string) {
      return text;
    }

    flush() {
      return "";
    }
  }

  return {
    SuspenseLineProcessor,
    parseSSEBuffer,
  };
});

vi.mock("@/lib/db/chat-repository-pg", () => ({
  updateChatProjectId,
  addMessage,
  createChat: vi.fn(),
  updateChatScaffoldId: vi.fn(),
  failVersionVerification,
}));

vi.mock("@/lib/gen/context/file-context-builder", () => ({
  buildFileContext,
}));

vi.mock("@/lib/gen/prompt-dump", () => ({
  dumpOwnEngineCodegenFromFullSystem: vi.fn(),
}));

vi.mock("@/lib/gen/attachment-text-hydrate", () => ({
  appendHydratedTextAttachmentExcerpts: vi.fn(async (msg: string) => msg),
}));

vi.mock("@/lib/own-engine/session/own-engine-build-session", () => ({
  buildOwnEngineGenerationStreamMeta: vi.fn(() => ({})),
  buildPreGenerationContractGateParams: vi.fn(() => null),
}));

vi.mock("@/lib/own-engine/session/own-engine-pipeline-generation", () => ({
  createOwnEnginePipelineAndGenerationStream: vi.fn(
    (input: {
      chatId: string;
      engineModel: string;
      previousFiles?: Array<{ path: string; content?: string; language?: string }>;
      pipeline: { prompt: string; systemPrompt: string; model?: string; abortSignal?: AbortSignal };
    }) => {
      const pipelineStream = createGenerationPipeline({
        prompt: input.pipeline.prompt,
        systemPrompt: input.pipeline.systemPrompt,
        abortSignal: input.pipeline.abortSignal,
      });
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = pipelineStream.getReader();
          let buffer = "";
          let accumulatedContent = "";
          try {
            while (true) {
              const { done: readerDone, value } = await reader.read();
              if (readerDone) break;
              buffer += decoder.decode(value, { stream: true });
              const parsed = parseSSEBuffer(buffer);
              buffer = parsed.remaining;
              for (const evt of parsed.events) {
                if (evt.event === "content" && evt.data?.text) {
                  accumulatedContent += evt.data.text;
                  controller.enqueue(encoder.encode(
                    `event: content\ndata: ${JSON.stringify(evt.data)}\n\n`,
                  ));
                } else if (evt.event === "done") {
                  const finalized = await finalizeOrHandleEmptyGeneration({
                    emptyGenerationReason: "done_empty_output",
                    finalizeParams: {
                      chatId: input.chatId,
                      accumulatedContent,
                      model: input.engineModel ?? "gpt-5.4",
                      previousFiles: input.previousFiles ?? [],
                    },
                  });
                  controller.enqueue(encoder.encode(
                    `event: done\ndata: ${JSON.stringify({
                      chatId: input.chatId,
                      versionId: finalized.version?.id ?? null,
                      messageId: finalized.messageId ?? null,
                      previewUrl: null,
                      previewBlocked: finalized.preflight?.previewBlocked ?? false,
                      verificationBlocked: finalized.preflight?.verificationBlocked ?? false,
                      previewBlockingReason: finalized.preflight?.previewBlockingReason ?? null,
                    })}\n\n`,
                  ));
                } else {
                  controller.enqueue(encoder.encode(
                    `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`,
                  ));
                }
              }
            }
          } finally {
            controller.close();
          }
        },
      });
    },
  ),
}));

vi.mock("@/lib/own-engine/session/own-engine-plan-mode", () => ({
  computePlanModePlannerPrompts: vi.fn(),
  createPlanModePipelineStream: vi.fn(),
  dumpPlanModePlannerPrompts: vi.fn(),
  logPlanModeGenerationStart: vi.fn(),
  resolvePlanModePlannerSettings: vi.fn(),
}));

vi.mock("@/lib/providers/own-engine/plan-mode-response", () => ({
  createOwnEnginePlanModeResponse: vi.fn(),
}));

vi.mock("@/lib/providers/own-engine/pre-generation-contract-gate", () => ({
  createPreGenerationContractGateReadableStream: vi.fn(),
}));

vi.mock("@/lib/own-engine/resolve-max-steps", () => ({
  resolveOwnEngineMaxSteps: vi.fn(() => 4),
}));

vi.mock("@/lib/gen/stream/finalize-version", () => ({
  EmptyGenerationError: class EmptyGenerationError extends Error {},
}));

vi.mock("@/lib/api/engine/chats/credits-handler", () => ({
  createCommitCreditsOnce: vi.fn(() => vi.fn(async () => undefined)),
}));

vi.mock("@/lib/gen/stream/shared-own-engine-helpers", () => ({
  appendPreview: vi.fn(),
  extractToolNames: vi.fn(),
  finalizeOrHandleEmptyGeneration,
  getUnsignaledDetectedIntegrations: vi.fn(() => []),
  looksLikeIncompleteJson: vi.fn(() => false),
}));

import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { buildFollowUpBriefFromSnapshot } from "@/lib/gen/orchestration-snapshot";

import { POST, maxDuration, runtime } from "./route";

describe("POST /api/engine/chats/[chatId]/stream", () => {
  it("delegates to follow-up stream handler", async () => {
    const expected = new Response("stream", { status: 200 });
    delegatedPost.mockResolvedValue(expected);
    const request = new Request("https://example.com/api/engine/chats/chat_1/stream", {
      method: "POST",
      body: JSON.stringify({ message: "uppdatera" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ chatId: "chat_1" }) };

    const response = await POST(request, ctx);

    expect(delegatedPost).toHaveBeenCalledWith(request, ctx);
    expect(response).toBe(expected);
  });

  it("uses node runtime and stream maxDuration", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(800);
  });
});

const unitTestRoutePlan = {
  provenance: { primarySource: "prompt" as const, sources: ["prompt" as const] },
  siteType: "one-page" as const,
  reason: "unit-test",
  routes: [] as Array<{ path: string; name: string; intent: string; required: boolean }>,
};

async function readSseEvents(response: Response) {
  const body = await response.text();
  const blocks = body.trim().split("\n\n").filter(Boolean);

  return blocks.map((block) => {
    const eventLine = block
      .split("\n")
      .find((line) => line.startsWith("event:"));
    const dataLine = block
      .split("\n")
      .find((line) => line.startsWith("data:"));

    return {
      event: eventLine?.slice("event:".length).trim() ?? "",
      data: dataLine ? JSON.parse(dataLine.slice("data:".length).trim()) : null,
    };
  });
}

function buildPipelineStream(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(
          encoder.encode(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`),
        );
      }
      controller.close();
    },
  });
}

describe("POST /api/engine/chats/[chatId]/stream own-engine follow-up route (migrated from v0)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    addMessage.mockResolvedValue(null);
    failVersionVerification.mockResolvedValue(null);
    createPromptLog.mockResolvedValue(undefined);
    buildFileContext.mockReset();
    parseSSEBuffer.mockReset();
    buildGenerationInputPackage.mockImplementation(
      (
        _base: unknown,
        _input: unknown,
        finalized: {
          engineSystemPrompt: string;
          dynamicContext: string;
          dynamicContextPruning: unknown;
          dynamicContextBlocks?: unknown;
        },
      ) => ({
        resolvedScaffold: {
          id: "scaffold_1",
          family: "marketing",
          label: "Marketing",
        },
        routePlan: unitTestRoutePlan,
        preGenerationContracts: {
          contracts: {
            dataMode: "none",
            databaseProvider: null,
            authProvider: null,
            paymentProvider: null,
            integrations: [],
            envVars: [],
          },
          unresolvedDecisions: [],
          confirmedAnswers: [],
        },
        buildSpec: {
          buildIntent: "website",
          generationMode: "followUp",
          changeScope: "local-layout",
          scaffoldId: "landing-page",
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "fast",
          contextPolicy: "light",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: { scaffoldChars: 36000, refsChars: 12000, systemContextChars: 48000 },
        },
        scaffoldContext: undefined,
        capabilityHints: undefined,
        capabilities: {
          needsMotion: false,
          needs3D: false,
          needsCharts: false,
          needsDatabase: false,
          needsAuth: false,
          needsAppShell: false,
          needsDataUI: false,
          needsForms: false,
          needsEcommerce: false,
          needsCarousel: false,
          needsPremiumVisuals: false,
        },
        userPrompt: "hello",
        brief: null,
        scaffoldMode: "auto",
        engineSystemPrompt: finalized.engineSystemPrompt,
        dynamicContext: finalized.dynamicContext,
        dynamicContextPruning: finalized.dynamicContextPruning,
        dynamicContextBlocks: finalized.dynamicContextBlocks ?? [],
        lineageHash: "lineage-1",
      }),
    );
    writeOrchestrationDynamicDump.mockImplementation(() => undefined);
    commitCredits.mockResolvedValue(undefined);
    prepareCredits.mockResolvedValue({
      ok: true,
      user: { id: "user_1" },
      commit: commitCredits,
    });

    sendMessageSchemaSafeParse.mockImplementation((body: Record<string, unknown>) => ({
      success: true,
      data: {
        message: typeof body.message === "string" ? body.message : "",
        attachments: [],
        modelId: "test-model-id",
        thinking: true,
        imageGenerations: true,
        system: "",
        designSystemId: null,
        meta: {
          appProjectId: "app_proj_1",
        },
      },
    }));

    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "app_proj_1",
      scaffold_id: null,
      messages: [],
    });
    getChatByV0ChatIdForRequest.mockResolvedValue(null);
    resolveFollowUpPreviousFiles.mockResolvedValue([
      {
        path: "src/app/page.tsx",
        content: "export default function Page() { return <div>Old</div>; }",
        language: "tsx",
      },
    ]);
    // 5-2: default server-preferred version. Only consulted when a request
    // carries BOTH engineBaseVersionId and engineLatestKnownVersionId (the
    // stale-base gate); the other tests below never send the latter so the
    // gate short-circuits before this is read.
    resolveChatPreferredVersionId.mockResolvedValue("ver_current");
    prepareGenerationContext.mockResolvedValue({
      resolvedScaffold: {
        id: "scaffold_1",
        family: "marketing",
        label: "Marketing",
      },
      routePlan: unitTestRoutePlan,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          databaseProvider: null,
          authProvider: null,
          paymentProvider: null,
          integrations: [],
          envVars: [],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "local-layout",
        scaffoldId: "landing-page",
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: { scaffoldChars: 36000, refsChars: 12000, systemContextChars: 48000 },
      },
      engineSystemPrompt: "SYSTEM",
      dynamicContext: "V0",
      dynamicContextPruning: {
        budgetTokens: 15000,
        usedTokens: 10,
        droppedBlockKeys: [],
        keptBlockKeys: ["build_intent_website"],
      },
      dynamicContextBlocks: [],
    });
    resolveOrchestrationBase.mockResolvedValue({
      resolvedScaffold: {
        id: "scaffold_1",
        family: "marketing",
        label: "Marketing",
      },
      scaffoldContext: undefined,
      routePlan: unitTestRoutePlan,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          databaseProvider: null,
          authProvider: null,
          paymentProvider: null,
          integrations: [],
          envVars: [],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      capabilities: {
        needsMotion: false,
        needs3D: false,
        needsCharts: false,
        needsDatabase: false,
        needsAuth: false,
        needsAppShell: false,
        needsDataUI: false,
        needsForms: false,
        needsEcommerce: false,
        needsCarousel: false,
        needsPremiumVisuals: false,
      },
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "local-layout",
        scaffoldId: "landing-page",
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: { scaffoldChars: 36000, refsChars: 12000, systemContextChars: 48000 },
      },
      capabilityHints: undefined,
    });
    finalizeOrchestrationPrompts.mockResolvedValue({
      engineSystemPrompt: "SYSTEM",
      dynamicContext: "V0",
      dynamicContextPruning: {
        budgetTokens: 15000,
        usedTokens: 10,
        droppedBlockKeys: [],
        keptBlockKeys: ["build_intent_website"],
      },
      dynamicContextBlocks: [],
    });
    finalizeOrHandleEmptyGeneration.mockResolvedValue({
      version: { id: "ver_2" },
      messageId: "msg_2",
      previewUrl: "https://preview.example/chat_1/ver_2",
      preflight: {
        previewBlocked: false,
        verificationBlocked: false,
        previewBlockingReason: null,
      },
      contentForVersion: "<main>Updated follow-up</main>",
      rejectedShrinks: [],
      rejectedStructural: [],
      crossFileStubs: [],
    });
    buildFileContext.mockReturnValue({
      summary: "## Existing Project Files\n\n- src/app/page.tsx",
    });
    parseSSEBuffer.mockImplementation((buffer: string) => {
      const chunks = buffer.split("\n\n");
      const remaining = chunks.pop() ?? "";
      const events = chunks.flatMap((chunk) => {
        const lines = chunk.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event:"));
        const dataLine = lines.find((line) => line.startsWith("data:"));
        if (!eventLine || !dataLine) return [];
        const event = eventLine.slice("event:".length).trim();
        const rawData = dataLine.slice("data:".length).trim();
        return [{
          event,
          data: JSON.parse(rawData),
        }];
      });
      return { events, remaining };
    });

    // Wire engine-route POST through to the real chat-message-stream-post POST
    // so the migrated tests below exercise the actual implementation rather
    // than the delegation mock used by the existing engine tests above.
    const realModule = await vi.importActual<
      typeof import("@/lib/api/engine/chats/chat-message-stream-post")
    >("@/lib/api/engine/chats/chat-message-stream-post");
    delegatedPost.mockImplementation(realModule.POST);
  });

  it("asks for clarification when a follow-up sounds like a new site request", async () => {
    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Bygg en ny hemsida for samma kund",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(createGenerationPipeline).not.toHaveBeenCalled();

    const events = await readSseEvents(response);
    const toolCallEvent = events.find((event) => event.event === "tool-call");
    const doneEvent = events.find((event) => event.event === "done");

    expect(events.find((event) => event.event === "chatId")?.data).toEqual({
      id: "chat_1",
    });
    expect(toolCallEvent?.data).toMatchObject({
      toolName: "askClarifyingQuestion",
      args: expect.objectContaining({
        kind: "scope",
        blocking: true,
      }),
    });
    expect(doneEvent?.data).toMatchObject({
      chatId: "chat_1",
      versionId: null,
      messageId: null,
      previewUrl: null,
      awaitingInput: true,
      awaitingInputPrompt:
        "Vill du att jag förfinar den nuvarande sajten eller behandlar detta som en riktig redesign?",
      reason: "followup_redesign_ambiguous",
    });
  });

  it("asks for clarification when a follow-up edit request is too vague", async () => {
    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Kan du förbättra den lite?",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(createGenerationPipeline).not.toHaveBeenCalled();

    const events = await readSseEvents(response);
    const toolCallEvent = events.find((event) => event.event === "tool-call");
    const doneEvent = events.find((event) => event.event === "done");

    expect(toolCallEvent?.data).toMatchObject({
      toolName: "askClarifyingQuestion",
      args: expect.objectContaining({
        question: "Vad vill du att jag fokuserar på i nästa ändring?",
        kind: "scope",
        blocking: true,
      }),
    });
    expect(doneEvent?.data).toMatchObject({
      chatId: "chat_1",
      versionId: null,
      messageId: null,
      previewUrl: null,
      awaitingInput: true,
      awaitingInputPrompt: "Vad vill du att jag fokuserar på i nästa ändring?",
      reason: "followup_edit_underspecified",
    });
  });

  it("passes engineBaseVersionId from meta into follow-up base resolution", async () => {
    sendMessageSchemaSafeParse.mockImplementationOnce((body: Record<string, unknown>) => ({
      success: true,
      data: {
        message: typeof body.message === "string" ? body.message : "",
        attachments: [],
        modelId: "test-model-id",
        thinking: true,
        imageGenerations: true,
        system: "",
        designSystemId: null,
        meta: {
          appProjectId: "app_proj_1",
          engineBaseVersionId: "ver_selected",
        },
      },
    }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Kan du förbättra den lite?",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(resolveFollowUpPreviousFiles).toHaveBeenCalledWith("chat_1", "ver_selected");
    // 5-2 (changed assumption): a bare engineBaseVersionId — without the
    // companion engineLatestKnownVersionId signal — is still honoured and is
    // NEVER routed through the stale-base gate. The gate only engages when the
    // client also reports which version it believes is newest (the new tests
    // below). This deliberately refines the previous assumption that *any*
    // explicit base is silently accepted: bare bases stay accepted; the
    // stale-race is caught only once the client reports its known-latest.
    expect(resolveChatPreferredVersionId).not.toHaveBeenCalled();
  });

  it("returns 409 stale_base_version when the client's known-latest is behind the server", async () => {
    resolveChatPreferredVersionId.mockResolvedValue("ver_new");
    sendMessageSchemaSafeParse.mockImplementationOnce((body: Record<string, unknown>) => ({
      success: true,
      data: {
        message: typeof body.message === "string" ? body.message : "",
        attachments: [],
        modelId: "test-model-id",
        thinking: true,
        imageGenerations: true,
        system: "",
        designSystemId: null,
        meta: {
          appProjectId: "app_proj_1",
          engineBaseVersionId: "ver_old",
          engineLatestKnownVersionId: "ver_old",
        },
      },
    }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Uppdatera hero copy och CTA-knappen." }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.reason).toBe("stale_base_version");
    expect(body.requestedBaseVersionId).toBe("ver_old");
    expect(body.latestVersionId).toBe("ver_new");
    // Must not silently build on the superseded base.
    expect(createGenerationPipeline).not.toHaveBeenCalled();
  });

  it("allows a follow-up when the explicit base equals the server's preferred version", async () => {
    resolveChatPreferredVersionId.mockResolvedValue("ver_current");
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        { event: "content", data: { text: "<main>Updated</main>" } },
        { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
      ]),
    );
    sendMessageSchemaSafeParse.mockImplementationOnce((body: Record<string, unknown>) => ({
      success: true,
      data: {
        message: typeof body.message === "string" ? body.message : "",
        attachments: [],
        modelId: "test-model-id",
        thinking: true,
        imageGenerations: true,
        system: "",
        designSystemId: null,
        meta: {
          appProjectId: "app_proj_1",
          engineBaseVersionId: "ver_current",
          engineLatestKnownVersionId: "ver_current",
        },
      },
    }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Uppdatera hero copy och CTA-knappen men behåll nuvarande design.",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(createGenerationPipeline).toHaveBeenCalled();
  });

  it("allows a deliberate edit of an older version (no 409) when the client is up to date", async () => {
    // base is an older version, but the client's known-latest matches the
    // server's preferred — i.e. the user deliberately picked an older version.
    resolveChatPreferredVersionId.mockResolvedValue("ver_new");
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        { event: "content", data: { text: "<main>Edited older</main>" } },
        { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
      ]),
    );
    sendMessageSchemaSafeParse.mockImplementationOnce((body: Record<string, unknown>) => ({
      success: true,
      data: {
        message: typeof body.message === "string" ? body.message : "",
        attachments: [],
        modelId: "test-model-id",
        thinking: true,
        imageGenerations: true,
        system: "",
        designSystemId: null,
        meta: {
          appProjectId: "app_proj_1",
          engineBaseVersionId: "ver_old",
          engineLatestKnownVersionId: "ver_new",
        },
      },
    }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Uppdatera hero copy och CTA-knappen men behåll nuvarande design.",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(createGenerationPipeline).toHaveBeenCalled();
  });

  it("finalizes a follow-up generation and emits done output for a scoped edit", async () => {
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        {
          event: "content",
          data: { text: "<main>Updated follow-up</main>" },
        },
        {
          event: "done",
          data: { promptTokens: 7, completionTokens: 13 },
        },
      ]),
    );

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Uppdatera hero copy och CTA-knappen men behåll nuvarande design.",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(createGenerationPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
      }),
    );

    const events = await readSseEvents(response);
    const doneEvent = events.find((event) => event.event === "done");

    expect(doneEvent?.data).toMatchObject({
      chatId: "chat_1",
      versionId: "ver_2",
      messageId: "msg_2",
      previewUrl: null,
      previewBlocked: false,
      verificationBlocked: false,
      previewBlockingReason: null,
    });
    expect(finalizeOrHandleEmptyGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        emptyGenerationReason: "done_empty_output",
        finalizeParams: expect.objectContaining({
          chatId: "chat_1",
          accumulatedContent: "<main>Updated follow-up</main>",
          model: "gpt-5.4",
          previousFiles: [
            expect.objectContaining({
              path: "src/app/page.tsx",
            }),
          ],
        }),
      }),
    );
    expect(buildGenerationInputPackage).toHaveBeenCalledTimes(1);
    expect(writeOrchestrationDynamicDump).toHaveBeenCalledTimes(1);
  });

  it("uses the richer follow-up file context for capability-heavy visual edits", async () => {
    await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Lägg till en klickbar karusell med klockor och en 3D-figur som skjuter laser över hero-sektionen.",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(buildFileContext).toHaveBeenCalledWith(
      expect.objectContaining({
        maxChars: 72_000,
        includeContents: true,
        maxFilesWithContent: 6,
        includeStructuralInventory: true,
      }),
    );
  });

  it("ignores persisted scaffold lock for clear-redesign follow-ups in auto mode", async () => {
    getEngineChatByIdForRequest.mockResolvedValueOnce({
      id: "chat_1",
      project_id: "app_proj_1",
      scaffold_id: "scaffold_locked",
      messages: [],
      orchestration_snapshot: null,
    });
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        {
          event: "content",
          data: { text: "<main>Redesigned follow-up</main>" },
        },
        {
          event: "done",
          data: { promptTokens: 9, completionTokens: 15 },
        },
      ]),
    );

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Gör om från grunden med mörk editorial stil och ny layout.",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(resolveOrchestrationBase).toHaveBeenCalledWith(
      expect.objectContaining({
        persistedScaffoldId: "scaffold_locked",
        generationMode: "followUp",
        ignorePersistedScaffoldForMatch: true,
      }),
    );
  });

  it("still persists the assistant clarification when user message persistence fails", async () => {
    addMessage
      .mockRejectedValueOnce(new Error("write user failed"))
      .mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Kan du förbättra den lite?",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(addMessage.mock.calls[0]?.slice(0, 3)).toEqual([
      "chat_1",
      "user",
      "Kan du förbättra den lite?",
    ]);
    expect(addMessage.mock.calls[1]?.[0]).toBe("chat_1");
    expect(addMessage.mock.calls[1]?.[1]).toBe("assistant");
    expect(addMessage.mock.calls[1]?.[2]).toBe("Vad vill du att jag fokuserar på i nästa ändring?");
  });

  // 5-4 / F1: the clear-redesign delta-brief is generated (tryGenerateServerAutoBrief)
  // but must actually reach orchestrate. Before the fix `metaBrief` was computed,
  // logged, then dropped — orchestrate fell back to the snapshot brief.
  it("routes the freshly generated clear-redesign delta-brief into orchestration (F1)", async () => {
    // Snapshot carries a recognizable base brief so the assertion can prove the
    // fresh delta — not the snapshot fallback — is what reaches orchestrate.
    const snapshot = {
      briefSummary: {
        projectTitle: "SNAPSHOT_BASE_BRIEF",
        requestedCapabilities: ["contact-form"],
      },
    };
    getEngineChatByIdForRequest.mockResolvedValueOnce({
      id: "chat_1",
      project_id: "app_proj_1",
      scaffold_id: "scaffold_locked",
      messages: [],
      orchestration_snapshot: snapshot,
    });
    const deltaBrief = {
      projectTitle: "DELTA_REDESIGN_SENTINEL",
      visualDirection: { styleKeywords: ["dark", "editorial"] },
    };
    vi.mocked(tryGenerateServerAutoBrief).mockResolvedValueOnce(
      { brief: deltaBrief, modelUsed: "test-delta-model" } as unknown as Awaited<
        ReturnType<typeof tryGenerateServerAutoBrief>
      >,
    );
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        { event: "content", data: { text: "<main>Redesigned</main>" } },
        { event: "done", data: { promptTokens: 9, completionTokens: 15 } },
      ]),
    );

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Gör om från grunden med mörk editorial stil och ny layout.",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    expect(tryGenerateServerAutoBrief).toHaveBeenCalledTimes(1);
    expect(resolveOrchestrationBase).toHaveBeenCalled();
    const orchestrationInput = resolveOrchestrationBase.mock.calls[0]?.[0] as {
      brief: unknown;
    };
    // The fresh delta-brief must be the brief orchestrate sees…
    expect(orchestrationInput.brief).toEqual(deltaBrief);
    // …not the snapshot fallback (the F1 bug: delta computed, then discarded).
    expect(orchestrationInput.brief).not.toEqual(buildFollowUpBriefFromSnapshot(snapshot));
  });

  it("keeps using the snapshot brief for a neutral follow-up (no F1 regression)", async () => {
    const snapshot = {
      briefSummary: {
        projectTitle: "SNAPSHOT_BASE_BRIEF",
        requestedCapabilities: ["contact-form"],
      },
    };
    getEngineChatByIdForRequest.mockResolvedValueOnce({
      id: "chat_1",
      project_id: "app_proj_1",
      scaffold_id: "scaffold_1",
      messages: [],
      orchestration_snapshot: snapshot,
    });
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        { event: "content", data: { text: "<main>Updated</main>" } },
        { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
      ]),
    );

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Uppdatera hero copy och CTA-knappen men behåll nuvarande design.",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(200);
    // A neutral follow-up never generates a delta-brief…
    expect(tryGenerateServerAutoBrief).not.toHaveBeenCalled();
    expect(resolveOrchestrationBase).toHaveBeenCalled();
    const orchestrationInput = resolveOrchestrationBase.mock.calls[0]?.[0] as {
      brief: unknown;
    };
    // …so the deterministic snapshot brief is what reaches orchestrate (unchanged).
    expect(orchestrationInput.brief).toEqual(buildFollowUpBriefFromSnapshot(snapshot));
  });
});
