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
const getVersionById = vi.hoisted(() => vi.fn());
const consumeF3ContinuationMarker = vi.hoisted(() => vi.fn());
const appendF3ApprovedToSnapshot = vi.hoisted(() => vi.fn(async () => true));
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
const checkTier3ReadinessForVersion = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  checkTier3ReadinessForVersion,
}));

vi.mock("@/lib/gen/dossiers/snapshot-selection", () => ({
  resolveSelectedDossiersFromSnapshot: vi.fn(() => []),
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
  getVersionById,
  consumeF3ContinuationMarker,
  appendF3ApprovedToSnapshot,
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
import { buildF3AwaitingInputUiPart } from "@/lib/gen/stream/f3-continuation";
import { createOwnEnginePipelineAndGenerationStream } from "@/lib/own-engine/session/own-engine-pipeline-generation";

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

  it("gates F3 readiness against the build base (preferred) when only parentVersionId is sent", async () => {
    // Post-#351 hardening: `parentVersionId` is lineage-only — the generation
    // builds from `engineBaseVersionId ?? preferred`. When the meta omits
    // `engineBaseVersionId`, the readiness gate must inspect the preferred
    // version (the actual build base), never the parentVersionId.
    resolveChatPreferredVersionId.mockResolvedValue("ver_preferred");
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "missing_env",
      readiness: {
        ready: false,
        missingByIntegration: { stripe: ["STRIPE_SECRET_KEY"] },
      },
    });
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
          lifecycleStage: "integrations",
          parentVersionId: "ver_parent_no_integrations",
        },
      },
    }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Bygg integrationer nu." }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(412);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("tier3_env_not_ready");
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: "ver_preferred" }),
    );
    expect(createGenerationPipeline).not.toHaveBeenCalled();
  });

  it("blocks F3 stream start when the gate reports product_postcheck_blocked (Codex P1 r5)", async () => {
    // The Product Postcheck block must hold on BOTH F3 entry points — a
    // client that skips finalize-design and posts straight to /stream with
    // lifecycleStage: "integrations" hits the same shared gate.
    resolveChatPreferredVersionId.mockResolvedValue("ver_preferred");
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "product_postcheck_blocked",
    });
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
          lifecycleStage: "integrations",
        },
      },
    }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/chat_1/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Bygg integrationer nu." }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("product_postcheck_blocked");
    expect(createGenerationPipeline).not.toHaveBeenCalled();
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

  // ── P1 F3-entry: server-side lifecycle-stage inheritance over awaiting-input ──
  // Reproduces the prod chain (chat cc10e7de): F3 auto-kick ends tool-only
  // (awaiting-input, marker persisted) → the user's "Godkänn förslag" reply is a
  // plain follow-up send WITHOUT meta.lifecycleStage. The server must derive the
  // F3 stage from persisted history — not default the codegen into the F2 lane.
  describe("F3-entry inheritance (P1, BUG-SWARM-BACKLOG)", () => {
    const F3_QUESTION =
      "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.";

    function f3AwaitingHistory(
      parentVersionId: string,
      markerOptions?: { suggestedProviders?: string[]; toolOnlyRounds?: number },
    ) {
      return [
        {
          id: "msg_kick",
          chat_id: "chat_1",
          role: "user",
          content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
          ui_parts: null,
          token_count: null,
          created_at: "2026-07-03T10:00:00.000Z",
        },
        {
          id: "msg_marker",
          chat_id: "chat_1",
          role: "assistant",
          content: F3_QUESTION,
          ui_parts: [
            buildF3AwaitingInputUiPart({
              question: F3_QUESTION,
              parentVersionId,
              suggestedProviders: markerOptions?.suggestedProviders,
              toolOnlyRounds: markerOptions?.toolOnlyRounds,
            }),
          ],
          token_count: null,
          created_at: "2026-07-03T10:01:00.000Z",
        },
      ];
    }

    function mockApprovalReplyRequestMeta() {
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
          // A real approval reply is a NORMAL follow-up send: base + known-latest,
          // but NO lifecycleStage / parentVersionId meta.
          meta: {
            appProjectId: "app_proj_1",
            engineBaseVersionId: "ver_f2_parent",
            engineLatestKnownVersionId: "ver_f2_parent",
          },
        },
      }));
    }

    it("inherits F3 for the direct approval reply: gate engaged, orchestrate + stream run in the integrations lane", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        // Providers on the marker: a provider-less approval with no evidence
        // takes the honest nothing-to-build close (own test below) — this
        // test exercises the BUILD path.
        messages: f3AwaitingHistory("ver_f2_parent", {
          suggestedProviders: ["stripe"],
        }),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      consumeF3ContinuationMarker.mockResolvedValue(true);
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Integrations build</main>" } },
          { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
        ]),
      );
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      // The atomic marker consume ran BEFORE generation (exactly once), on
      // the marker message — at the persistence boundary after the gates.
      expect(consumeF3ContinuationMarker).toHaveBeenCalledTimes(1);
      expect(consumeF3ContinuationMarker).toHaveBeenCalledWith("chat_1", "msg_marker");
      // The shared M#818-2 env-readiness gate MUST have run on the build base.
      expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
        expect.objectContaining({ versionId: "ver_f2_parent" }),
      );
      // Orchestrate sees the inherited stage → previewPolicyOverride "fidelity3"
      // downstream (build-spec.test.ts locks that mapping), so tier3-sdk-guard-fixer
      // (active only when previewPolicy !== "fidelity3") does NOT strip SDK imports.
      expect(resolveOrchestrationBase).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStage: "integrations" }),
      );
      // P2 F3-loop (åtgärd 1): the approval round FORCES codegen — the
      // proposal tools are pulled OUT of the tool set (the proposal phase is
      // over) and an explicit end-to-end build directive with the #374
      // graceful-fallback contract is injected into the round's prompt.
      expect(createOwnEnginePipelineAndGenerationStream).toHaveBeenCalledWith(
        expect.objectContaining({
          includeIntegrationSignals: false,
          lifecycleParentVersionId: "ver_f2_parent",
          f3PriorToolOnlyRounds: 1,
        }),
      );
      const orchestrationInput = resolveOrchestrationBase.mock.calls[0]?.[0] as {
        prompt: string;
      };
      expect(orchestrationInput.prompt).toContain("## F3 Integration Build Approval");
      expect(orchestrationInput.prompt).toContain("not-configured");
    });

    it("maps approved providers to dossier capabilities so the build round gets the hard-dossier templates (P2 F3-loop åtgärd 2)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent", {
          suggestedProviders: ["stripe"],
          toolOnlyRounds: 1,
        }),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      consumeF3ContinuationMarker.mockResolvedValue(true);
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Integrations build</main>" } },
          { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
        ]),
      );
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      // stripe → the stripe-checkout hard dossier (capability "payments"),
      // resolved via the REAL integrationRegistry + dossier registry — the
      // same selection mechanic the init path feeds.
      const orchestrationInput = resolveOrchestrationBase.mock.calls[0]?.[0] as {
        requestedDossierCapabilities?: string[];
        prompt: string;
      };
      expect(orchestrationInput.requestedDossierCapabilities).toContain("payments");
      // The build directive names the approved provider.
      expect(orchestrationInput.prompt).toContain(
        "Approved integration providers: stripe",
      );
      // Durable approval (review round 2, fix 5a): the approved capabilities +
      // providers are persisted on the snapshot so LATER rounds still treat
      // them as approved even when the build ends without file evidence.
      expect(appendF3ApprovedToSnapshot).toHaveBeenCalledWith(
        "chat_1",
        expect.arrayContaining(["payments"]),
        ["stripe"],
      );
    });

    it("closes F3 honestly when the approval has NOTHING approvable — no providers, no persisted approvals, no file evidence (fix 5b)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        // Marker with zero providers (malformed suggestIntegration round).
        messages: f3AwaitingHistory("ver_f2_parent"),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      consumeF3ContinuationMarker.mockResolvedValue(true);
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      // The marker is consumed (no re-ask loop) …
      expect(consumeF3ContinuationMarker).toHaveBeenCalledWith("chat_1", "msg_marker");
      // … an honest close-out message is persisted …
      expect(addMessage).toHaveBeenCalledWith(
        "chat_1",
        "assistant",
        expect.stringContaining("inga konkreta integrationer"),
      );
      // … and NO generation runs (previously: a doomed silent round).
      expect(resolveOrchestrationBase).not.toHaveBeenCalled();
      expect(createOwnEnginePipelineAndGenerationStream).not.toHaveBeenCalled();
      const body = await response.text();
      expect(body).toContain("f3_approval_nothing_to_build");
    });

    it("falls back to PERSISTED approvals when the marker carries zero providers (fix 5a durability)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent"),
        // An earlier approval round persisted stripe → payments.
        orchestration_snapshot: {
          f3ApprovedCapabilities: ["payments"],
          f3ApprovedProviders: ["stripe"],
        },
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      consumeF3ContinuationMarker.mockResolvedValue(true);
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Integrations build</main>" } },
          { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
        ]),
      );
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      // The persisted approval powers the build round: capabilities reach
      // orchestration and the directive names the provider.
      const orchestrationInput = resolveOrchestrationBase.mock.calls[0]?.[0] as {
        requestedDossierCapabilities?: string[];
        prompt: string;
      };
      expect(orchestrationInput.requestedDossierCapabilities).toContain("payments");
      expect(orchestrationInput.prompt).toContain(
        "Approved integration providers: stripe",
      );
    });

    it("closes F3 calmly on a rejecting reply — marker consumed, NO generation runs (P2 F3-loop åtgärd 4)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent"),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      consumeF3ContinuationMarker.mockResolvedValue(true);
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Avvisa förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      // The reject consumes the marker (a later reply cannot resurrect F3)…
      expect(consumeF3ContinuationMarker).toHaveBeenCalledWith("chat_1", "msg_marker");
      // …and NOTHING is generated: the observed prod reject ran a fully
      // silent generation (toolCalls: [], no text) and re-asked the same
      // question. Now the route short-circuits before orchestration.
      expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
      expect(resolveOrchestrationBase).not.toHaveBeenCalled();
      expect(createOwnEnginePipelineAndGenerationStream).not.toHaveBeenCalled();
      expect(createGenerationPipeline).not.toHaveBeenCalled();
      // No credits are prepared/charged for the acknowledgement.
      expect(prepareCredits).not.toHaveBeenCalled();

      // The user reply and a short assistant confirmation are persisted.
      expect(addMessage).toHaveBeenCalledWith("chat_1", "user", "Avvisa förslag");
      expect(addMessage).toHaveBeenCalledWith(
        "chat_1",
        "assistant",
        expect.stringContaining("avvisades"),
      );

      // SSE: confirmation content + calm done (versionId null, dedicated reason).
      const events = await readSseEvents(response);
      const contentEvent = events.find((event) => event.event === "content");
      expect(
        String((contentEvent?.data as Record<string, unknown>)?.text ?? contentEvent?.data),
      ).toContain("avvisades");
      const doneEvent = events.find((event) => event.event === "done");
      expect(doneEvent?.data).toMatchObject({
        chatId: "chat_1",
        versionId: null,
        awaitingInput: false,
        reason: "f3_reject_acknowledged",
      });
    });

    it("does NOT inherit for an unrelated design reply to the F3 question (Bugbot HIGH)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent"),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      consumeF3ContinuationMarker.mockResolvedValue(true);
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Blue hero</main>" } },
          { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
        ]),
      );
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Byt hero-färgen till blå, tack." }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      expect(consumeF3ContinuationMarker).toHaveBeenCalledWith("chat_1", "msg_marker");
      expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
      expect(resolveOrchestrationBase).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStage: "design" }),
      );
      expect(createOwnEnginePipelineAndGenerationStream).toHaveBeenCalledWith(
        expect.objectContaining({ includeIntegrationSignals: false }),
      );
    });

    it("does NOT inherit when the atomic consume is not confirmed — race loser stays F2 (Bugbot MEDIUM)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent"),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      // The provisional F3 stage runs the readiness gate BEFORE the consume
      // (Codex P1 r3 ordering) — green here so the request reaches Phase B.
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      // A concurrent reply already consumed the marker: the conditional
      // jsonb UPDATE reports 0 rows for this request.
      consumeF3ContinuationMarker.mockResolvedValue(false);
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Race loser</main>" } },
          { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
        ]),
      );
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      expect(consumeF3ContinuationMarker).toHaveBeenCalledWith("chat_1", "msg_marker");
      // The unconfirmed consume downgrades the provisional stage: the
      // generation itself runs in the F2 design lane.
      expect(resolveOrchestrationBase).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStage: "design" }),
      );
      expect(createOwnEnginePipelineAndGenerationStream).toHaveBeenCalledWith(
        expect.objectContaining({
          includeIntegrationSignals: false,
          lifecycleParentVersionId: null,
        }),
      );
    });

    it("does NOT inherit when the consume write throws — unconfirmed is never F3 (Bugbot MEDIUM)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent"),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      consumeF3ContinuationMarker.mockRejectedValue(new Error("db down"));
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Fail-safe F2</main>" } },
          { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
        ]),
      );
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      expect(resolveOrchestrationBase).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStage: "design" }),
      );
      expect(createOwnEnginePipelineAndGenerationStream).toHaveBeenCalledWith(
        expect.objectContaining({ includeIntegrationSignals: false }),
      );
    });

    it("resolves inherited F3 lineage from the SAME resolution as the build base, not the raw marker parent (Codex P2 r3)", async () => {
      // The marker points at an older parent (ver_old_parent), but the reply
      // carries no engineBaseVersionId → files + gate resolve from the chat's
      // preferred version. Lineage must follow that SAME resolution.
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_old_parent", {
          suggestedProviders: ["stripe"],
        }),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_preferred");
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      consumeF3ContinuationMarker.mockResolvedValue(true);
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Integrations build</main>" } },
          { event: "done", data: { promptTokens: 5, completionTokens: 9 } },
        ]),
      );
      // Plain approval reply WITHOUT engineBaseVersionId (e.g. after reload
      // with no active version selected).
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
          meta: { appProjectId: "app_proj_1" },
        },
      }));

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(200);
      // Gate and lineage agree on the resolved base (preferred)…
      expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
        expect.objectContaining({ versionId: "ver_preferred" }),
      );
      expect(createOwnEnginePipelineAndGenerationStream).toHaveBeenCalledWith(
        expect.objectContaining({
          // Approval build round: proposal tools are OFF (P2 F3-loop åtgärd 1).
          includeIntegrationSignals: false,
          // …NOT the raw marker parent (ver_old_parent), which was never the
          // build base for this generation.
          lifecycleParentVersionId: "ver_preferred",
        }),
      );
    });

    it("keeps the env-requirement strict: inherited F3 still 412s when keys are missing", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent"),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      consumeF3ContinuationMarker.mockResolvedValue(true);
      checkTier3ReadinessForVersion.mockResolvedValue({
        ok: false,
        reason: "missing_env",
        readiness: {
          ready: false,
          missingByIntegration: { stripe: ["STRIPE_SECRET_KEY"] },
        },
      });
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(412);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe("tier3_env_not_ready");
      expect(createGenerationPipeline).not.toHaveBeenCalled();
      // Codex P1 r3: a 412-aborted approval must NOT consume the marker —
      // after the user fixes the env keys, the same approval inherits F3.
      expect(consumeF3ContinuationMarker).not.toHaveBeenCalled();
      // Nothing was persisted either, so the pending walk stays armed.
      expect(addMessage).not.toHaveBeenCalled();
    });

    it("does NOT consume the marker when the credit gate aborts the send (Codex P1 r3)", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: f3AwaitingHistory("ver_f2_parent"),
        orchestration_snapshot: null,
      });
      resolveChatPreferredVersionId.mockResolvedValue("ver_f2_parent");
      getVersionById.mockResolvedValue({ id: "ver_f2_parent", chat_id: "chat_1" });
      checkTier3ReadinessForVersion.mockResolvedValue({ ok: true });
      prepareCredits.mockResolvedValueOnce({
        ok: false,
        response: new Response(JSON.stringify({ error: "insufficient_credits" }), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        }),
      });
      mockApprovalReplyRequestMeta();

      const response = await POST(
        new Request("https://example.com/api/engine/chats/chat_1/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Godkänn förslag" }),
        }),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(response.status).toBe(402);
      // Credit abort → marker untouched → the retried approval inherits F3.
      expect(consumeF3ContinuationMarker).not.toHaveBeenCalled();
      expect(addMessage).not.toHaveBeenCalled();
      expect(createGenerationPipeline).not.toHaveBeenCalled();
    });

    it("does NOT inherit for a plain design follow-up (no pending marker)", async () => {
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Design edit</main>" } },
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
      expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
      expect(resolveOrchestrationBase).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStage: "design" }),
      );
      expect(createOwnEnginePipelineAndGenerationStream).toHaveBeenCalledWith(
        expect.objectContaining({
          includeIntegrationSignals: false,
          lifecycleParentVersionId: null,
        }),
      );
    });

    it("does NOT inherit after the marker is consumed — a design follow-up after finished F3 stays F2", async () => {
      getEngineChatByIdForRequest.mockResolvedValueOnce({
        id: "chat_1",
        project_id: "app_proj_1",
        scaffold_id: "scaffold_1",
        messages: [
          ...f3AwaitingHistory("ver_f2_parent"),
          {
            id: "msg_reply",
            chat_id: "chat_1",
            role: "user",
            content: "Godkänn förslag",
            ui_parts: null,
            token_count: null,
            created_at: "2026-07-03T10:02:00.000Z",
          },
          {
            id: "msg_f3_done",
            chat_id: "chat_1",
            role: "assistant",
            content: "Integrationerna är byggda.",
            ui_parts: null,
            token_count: null,
            created_at: "2026-07-03T10:05:00.000Z",
          },
        ],
        orchestration_snapshot: null,
      });
      createGenerationPipeline.mockReturnValue(
        buildPipelineStream([
          { event: "content", data: { text: "<main>Design edit</main>" } },
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
      expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
      expect(resolveOrchestrationBase).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStage: "design" }),
      );
      expect(createOwnEnginePipelineAndGenerationStream).toHaveBeenCalledWith(
        expect.objectContaining({
          includeIntegrationSignals: false,
          lifecycleParentVersionId: null,
        }),
      );
    });
  });
});
