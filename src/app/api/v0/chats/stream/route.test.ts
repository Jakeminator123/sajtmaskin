import { beforeEach, describe, expect, it, vi } from "vitest";

const createChatSchemaSafeParse = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());
const createGenerationPipeline = vi.hoisted(() => vi.fn());
const prepareGenerationContext = vi.hoisted(() => vi.fn());
const createChat = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const createPromptLog = vi.hoisted(() => vi.fn());
const finalizeOrHandleEmptyGeneration = vi.hoisted(() => vi.fn());
const getUnsignaledDetectedIntegrations = vi.hoisted(() => vi.fn());

vi.mock("@/lib/streaming", () => ({
  createSSEHeaders: () => ({ "Content-Type": "text/event-stream" }),
  formatSSEEvent: (event: string, data: unknown) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
}));

vi.mock("@/lib/db/client", () => ({
  db: {},
}));

vi.mock("@/lib/db/schema", () => ({
  chats: {},
  versions: {},
}));

vi.mock("@/lib/v0", () => ({
  assertV0Key: vi.fn(),
  v0: {
    chats: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/validations/chatSchemas", () => ({
  createChatSchema: {
    safeParse: createChatSchemaSafeParse,
  },
}));

vi.mock("@/lib/v0/resolve-latest-version", () => ({
  resolveLatestVersion: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/v0/errors", () => ({
  normalizeV0Error: (error: unknown) => ({
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

vi.mock("@/lib/tenant", () => ({
  ensureProjectForRequest: vi.fn(),
  resolveV0ProjectId: vi.fn(),
  generateProjectName: vi.fn(),
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

vi.mock("@/lib/v0/sanitize-metadata", () => ({
  sanitizeV0Metadata: vi.fn(),
}));

vi.mock("@/lib/db/services", () => ({
  createPromptLog,
}));

vi.mock("@/lib/v0/modelSelection", () => ({
  resolveModelSelection: () => ({
    modelId: "test-model-id",
    modelTier: "test-tier",
  }),
  resolveEngineModelId: () => "gpt-5.4",
}));

vi.mock("@/lib/v0/models", () => ({
  DEFAULT_MODEL_ID: "test-model-id",
  MODEL_LABELS: {
    "test-tier": "Test Tier",
  },
  getBuildProfileId: () => "profile-test",
  v0TierToOpenAIModel: () => "gpt-5.4",
}));

vi.mock("@/lib/config", () => ({
  AI: {
    designSystemId: null,
  },
}));

vi.mock("@/lib/gen/fallback", () => ({
  shouldUseExplicitBuilderFallback: () => false,
  shouldUseV0Fallback: () => false,
  createGenerationPipeline,
}));

vi.mock("@/lib/gen/orchestrate", () => ({
  prepareGenerationContext,
}));

vi.mock("@/lib/gen/plan-prompt", () => ({
  buildPlannerSystemPrompt: () => "planner-system-prompt",
  parsePlanResponse: vi.fn(),
}));

vi.mock("@/lib/gen/agent-tools", () => ({
  getAgentTools: () => [],
}));

vi.mock("@/lib/gen/url-compress", () => ({
  compressUrls: (value: string) => ({ compressed: value, urlMap: {} }),
}));

vi.mock("@/lib/gen/plan-review", () => ({
  buildPlanSummaryMessage: vi.fn(),
  buildPlanUiPart: vi.fn(),
  enrichPlanArtifactForReview: vi.fn(),
}));

vi.mock("@/lib/gen/system-prompt", () => ({
  getSystemPromptLengths: () => ({ prompt: 10 }),
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

vi.mock("@/lib/gen/route-helpers", () => {
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

import { POST } from "./route";

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

describe("POST /api/v0/chats/stream own-engine route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
      capabilities: { layout: true },
      engineSystemPrompt: "SYSTEM",
      v0EnrichmentContext: "V0",
    });
    createChat.mockResolvedValue({ id: "engine_chat_1" });
    addMessage.mockResolvedValue(undefined);
    createPromptLog.mockResolvedValue(undefined);
    getUnsignaledDetectedIntegrations.mockReturnValue([]);
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
    });

    const response = await POST(
      new Request("https://example.com/api/v0/chats/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Build a simple site" }),
      }),
    );

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
      demoUrl: "https://preview.example/chat_1/ver_1",
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
        handleEmptyGeneration: (reason: string, error: { chatId: string; scaffoldId: string | null }) => Promise<void>;
      }) => {
        await handleEmptyGeneration(emptyGenerationReason, {
          chatId: "engine_chat_1",
          scaffoldId: null,
        });
        return null;
      },
    );

    const response = await POST(
      new Request("https://example.com/api/v0/chats/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Build a site with Supabase auth" }),
      }),
    );

    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const integrationEvent = events.find((event) => event.event === "integration");
    const doneEvent = events.find((event) => event.event === "done");

    expect(integrationEvent?.data).toMatchObject({
      items: [
        expect.objectContaining({
          key: "supabase",
          envVars: ["SUPABASE_URL"],
          status: "Kräver konfiguration",
        }),
      ],
    });
    expect(doneEvent?.data).toMatchObject({
      chatId: "engine_chat_1",
      versionId: null,
      messageId: null,
      demoUrl: null,
      awaitingInput: true,
      reason: "done_empty_output",
      toolCalls: ["suggestIntegration"],
    });
  });
});
