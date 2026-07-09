import { beforeEach, describe, expect, it, vi } from "vitest";

const handleCreateChatStreamPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/engine/chats/create-chat-stream-post", () => ({
  handleCreateChatStreamPost,
}));

// --- v0-side mocks (migrated) so the real create-chat-stream-post can run when
// `handleCreateChatStreamPost.mockImplementation(realImpl)` is wired up below. ---
const createChatSchemaSafeParse = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());
const createGenerationPipeline = vi.hoisted(() => vi.fn());
const prepareGenerationContext = vi.hoisted(() => vi.fn());
const resolveOrchestrationBase = vi.hoisted(() => vi.fn());
const finalizeOrchestrationPrompts = vi.hoisted(() => vi.fn());
const buildGenerationInputPackage = vi.hoisted(() => vi.fn());
const writeOrchestrationDynamicDump = vi.hoisted(() => vi.fn());
const createChat = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const createPromptLog = vi.hoisted(() => vi.fn());
const finalizeOrHandleEmptyGeneration = vi.hoisted(() => vi.fn());
const getUnsignaledDetectedIntegrations = vi.hoisted(() => vi.fn());
const prewarmPreviewSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/preview/preview-prewarm", () => ({
  prewarmPreviewSession,
}));

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

vi.mock("@/lib/validations/chatSchemas", () => ({
  createChatSchema: {
    safeParse: createChatSchemaSafeParse,
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/providers/errors/normalize-provider-error", () => ({
  normalizeProviderError: (error: unknown) => ({
    message: error instanceof Error ? error.message : "Unknown error",
    status: 500,
    code: null,
    retryAfter: null,
  }),
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "sess_1", setCookie: null }),
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
}));

vi.mock("@/lib/builder/server-auto-brief-policy", () => ({
  shouldRunServerAutoBrief: () => false,
}));

vi.mock("@/lib/builder/site-brief-generation", () => ({
  tryGenerateServerAutoBrief: vi.fn(async () => null),
}));

vi.mock("@/lib/tenant", () => ({
  getChatByV0ChatIdForRequest: vi.fn(),
  resolveAppProjectIdForRequest,
}));

vi.mock("@/lib/botProtection", () => ({
  requireNotBot: () => null,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
  devLogFinalizeSite: vi.fn(),
  devLogStartNewSite: vi.fn(),
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
  warnLog: vi.fn(),
}));

vi.mock("@/lib/sanitize/sanitize-metadata", () => ({
  sanitizeMetadata: vi.fn(),
}));

vi.mock("@/lib/db/services/prompt-logs", () => ({
  createPromptLog,
}));

vi.mock("@/lib/models/selection", () => ({
  resolveModelSelection: () => ({
    modelId: "test-model-id",
    modelTier: "fast",
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

vi.mock("@/lib/config", () => ({
  AI: {
    designSystemId: null,
  },
  SECRETS: {
    testUserEmail: "",
    superadminEmail: "",
  },
  PATHS: {
    uploads: "/tmp/uploads",
  },
  REDIS_KEY_PREFIX: "dev:",
  REDIS_CONFIG: {
    url: "",
    host: "",
    port: 6379,
    password: "",
    username: "default",
    enabled: false,
  },
  FEATURES: {
    useRedisCache: false,
  },
}));

vi.mock("@/lib/gen/engine", () => ({
  shouldUseExplicitBuilderFallback: () => false,
  shouldUseV0Fallback: () => false,
  createGenerationPipeline,
}));

vi.mock("@/lib/gen/orchestrate", () => ({
  prepareGenerationContext,
  resolveOrchestrationBase,
  finalizeOrchestrationPrompts,
  buildGenerationInputPackage,
  writeOrchestrationDynamicDump,
}));

vi.mock("@/lib/gen/plan/prompt", () => ({
  buildPlannerSystemPrompt: () => "planner-system-prompt",
  parsePlanResponse: vi.fn(),
}));

vi.mock("@/lib/gen/agent-tools", () => ({
  getAgentTools: () => [],
}));

vi.mock("@/lib/gen/url-compress", () => ({
  compressUrls: (value: string) => ({ compressed: value, urlMap: {} }),
}));

vi.mock("@/lib/gen/plan/review", () => ({
  buildPlanSummaryMessage: vi.fn(),
  buildPlanUiPart: vi.fn(),
  enrichPlanArtifactForReview: vi.fn(),
}));

vi.mock("@/lib/gen/system-prompt", () => ({
  SYSTEM_PROMPT_SEPARATOR: "\n\n---\n\n# Request-Specific Context\n\n",
  getSystemPromptLengths: () => ({ total: 10, static: 5, dynamic: 5 }),
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

  const parseSSEBuffer = (buffer: string) => {
    const chunks = buffer.split("\n\n");
    const remaining = chunks.pop() ?? "";
    const events = chunks.flatMap((chunk) => {
      const lines = chunk.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!eventLine || !dataLine) return [];
      const event = eventLine.slice("event:".length).trim();
      const rawData = dataLine.slice("data:".length).trim();
      return [
        {
          event,
          data: JSON.parse(rawData),
        },
      ];
    });
    return { events, remaining };
  };

  return { SuspenseLineProcessor, parseSSEBuffer };
});

vi.mock("@/lib/db/chat-repository-pg", () => ({
  createChat,
  addMessage,
  failVersionVerification,
}));

vi.mock("@/lib/gen/stream/finalize-version", () => ({
  EmptyGenerationError: class EmptyGenerationError extends Error {
    readonly chatId: string;
    readonly scaffoldId: string | null;

    constructor(chatId: string, scaffoldId: string | null) {
      super("Generation produced no code output");
      this.chatId = chatId;
      this.scaffoldId = scaffoldId;
    }
  },
}));

vi.mock("@/lib/gen/stream/shared-own-engine-helpers", () => ({
  appendPreview: vi.fn(),
  extractToolNames: vi.fn(),
  finalizeOrHandleEmptyGeneration,
  getUnsignaledDetectedIntegrations,
  looksLikeIncompleteJson: vi.fn(),
}));

import { POST, maxDuration, runtime } from "./route";

describe("POST /api/engine/chats/stream", () => {
  it("delegates to create-chat stream handler", async () => {
    const expected = new Response("ok", { status: 201 });
    handleCreateChatStreamPost.mockResolvedValue(expected);
    const request = new Request("https://example.com/api/engine/chats/stream", {
      method: "POST",
      body: JSON.stringify({ message: "hej" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(handleCreateChatStreamPost).toHaveBeenCalledWith(request);
    expect(response).toBe(expected);
  });

  it("uses the same runtime envelope as shared stream routes", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(800);
  });
});

/** `resolveOrchestrationBase` must never return `routePlan: null` — create-chat-stream reads `routePlan.routes`. */
const unitTestRoutePlan = {
  provenance: { primarySource: "prompt" as const, sources: ["prompt" as const] },
  siteType: "one-page" as const,
  reason: "unit-test",
  routes: [] as Array<{ path: string; name: string; intent: string; required: boolean }>,
};

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

describe("POST /api/engine/chats/stream own-engine route (migrated from v0)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    failVersionVerification.mockResolvedValue(null);
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
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: "landing-page",
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: { scaffoldChars: 48000, refsChars: 24000, systemContextChars: 96000 },
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

    createChatSchemaSafeParse.mockImplementation((body: Record<string, unknown>) => ({
      success: true,
      data: {
        message: typeof body.message === "string" ? body.message : "",
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        projectId: null,
        system: "",
        modelId: "test-model-id",
        thinking: true,
        imageGenerations: true,
        chatPrivacy: "private",
        designSystemId: null,
        meta: {
          appProjectId: "app_proj_1",
        },
      },
    }));

    commitCredits.mockResolvedValue(undefined);
    prepareCredits.mockResolvedValue({
      ok: true,
      user: { id: "user_1" },
      commit: commitCredits,
    });
    resolveAppProjectIdForRequest.mockResolvedValue("app_proj_1");
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
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: "landing-page",
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: { scaffoldChars: 48000, refsChars: 24000, systemContextChars: 96000 },
      },
      scaffoldContext: undefined,
      capabilityHints: undefined,
      engineSystemPrompt: "SYSTEM",
      dynamicContext: "V0",
      dynamicContextPruning: {
        budgetTokens: 30000,
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
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: "landing-page",
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: { scaffoldChars: 48000, refsChars: 24000, systemContextChars: 96000 },
      },
      capabilityHints: undefined,
    });
    finalizeOrchestrationPrompts.mockResolvedValue({
      engineSystemPrompt: "SYSTEM",
      dynamicContext: "V0",
      dynamicContextPruning: {
        budgetTokens: 30000,
        usedTokens: 10,
        droppedBlockKeys: [],
        keptBlockKeys: ["build_intent_website"],
      },
      dynamicContextBlocks: [],
    });
    createChat.mockResolvedValue({ id: "engine_chat_1" });
    addMessage.mockResolvedValue(undefined);
    createPromptLog.mockResolvedValue(undefined);
    getUnsignaledDetectedIntegrations.mockReturnValue([]);

    // Wire engine-route POST through to the real create-chat-stream handler so
    // these migrated tests exercise the actual implementation, not the
    // delegation mock used by the existing engine tests above.
    const realModule = await vi.importActual<
      typeof import("@/lib/api/engine/chats/create-chat-stream-post")
    >("@/lib/api/engine/chats/create-chat-stream-post");
    handleCreateChatStreamPost.mockImplementation(realModule.handleCreateChatStreamPost);
  });

  it("finalizes an own-engine generation and emits preview data on done", async () => {
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        {
          event: "content",
          data: { text: "<main>Hello runtime lane</main>" },
        },
        {
          event: "done",
          data: { promptTokens: 11, completionTokens: 22 },
        },
      ]),
    );
    finalizeOrHandleEmptyGeneration.mockResolvedValue({
      version: { id: "ver_1" },
      messageId: "msg_1",
      previewUrl: "https://preview.example/chat_1/ver_1",
      preflight: {
        previewBlocked: false,
        verificationBlocked: false,
        previewBlockingReason: null,
      },
      contentForVersion: "<main>Hello runtime lane</main>",
      rejectedShrinks: [],
      rejectedStructural: [],
      crossFileStubs: [],
    });

    const request = new Request("https://example.com/api/engine/chats/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Build a simple site" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const doneEvent = events.find((event) => event.event === "done");

    expect(events.find((event) => event.event === "chatId")?.data).toEqual({
      id: "engine_chat_1",
    });
    expect(doneEvent?.data).toMatchObject({
      chatId: "engine_chat_1",
      versionId: "ver_1",
      messageId: "msg_1",
      previewUrl: null,
      previewBlocked: false,
      verificationBlocked: false,
      previewBlockingReason: null,
    });
    expect(finalizeOrHandleEmptyGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        emptyGenerationReason: "done_empty_output",
        finalizeParams: expect.objectContaining({
          chatId: "engine_chat_1",
          accumulatedContent: "<main>Hello runtime lane</main>",
          model: "gpt-5.4",
        }),
      }),
    );
    expect(buildGenerationInputPackage).toHaveBeenCalledTimes(1);
    expect(writeOrchestrationDynamicDump).toHaveBeenCalledTimes(1);
    expect(createGenerationPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: request.signal,
      }),
    );
    // Preview prewarm is fired fire-and-forget with the freshly created chat id
    // on the primary init/create path (self-gating on flag/tier-2/dedup inside
    // the module; default OFF makes it a no-op).
    expect(prewarmPreviewSession).toHaveBeenCalledWith("engine_chat_1");
  });

  it("returns awaiting-input done output for tool-only empty generations", async () => {
    createGenerationPipeline.mockReturnValue(
      buildPipelineStream([
        {
          event: "tool-call",
          data: {
            toolName: "suggestIntegration",
            args: {
              provider: "supabase",
              name: "Supabase",
              envVars: ["SUPABASE_URL"],
              reason: "Need database credentials",
            },
          },
        },
        {
          event: "done",
          data: {},
        },
      ]),
    );
    finalizeOrHandleEmptyGeneration.mockImplementation(
      async ({
        emptyGenerationReason,
        handleEmptyGeneration,
      }: {
        emptyGenerationReason: string;
        handleEmptyGeneration: (
          reason: string,
          error: { chatId: string; scaffoldId: string | null },
        ) => Promise<void>;
      }) => {
        await handleEmptyGeneration(emptyGenerationReason, {
          chatId: "engine_chat_1",
          scaffoldId: null,
        });
        return null;
      },
    );

    const response = await POST(
      new Request("https://example.com/api/engine/chats/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Build a site with Supabase auth" }),
      }),
    );

    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const integrationEvent = events.find((event) => event.event === "integration");
    const doneEvent = events.find((event) => event.event === "done");

    expect(integrationEvent).toBeUndefined();
    expect(doneEvent?.data).toMatchObject({
      chatId: "engine_chat_1",
      versionId: null,
      messageId: null,
      previewUrl: null,
      awaitingInput: true,
      reason: "tool_only_empty_generation",
      toolCalls: ["suggestIntegration"],
    });
    expect(String((doneEvent?.data as Record<string, unknown>)?.awaitingInputPrompt)).toContain(
      "Integrationer signalerades",
    );
  });
});
