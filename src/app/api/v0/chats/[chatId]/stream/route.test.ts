import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMessageSchemaSafeParse = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const updateChatProjectId = vi.hoisted(() => vi.fn());
const createGenerationPipeline = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return actual;
});

vi.mock("@/lib/v0", () => ({
  assertV0Key: vi.fn(),
  v0: {
    chats: {
      sendMessage: vi.fn(),
      getById: vi.fn(),
    },
  },
}));

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

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/v0Stream", () => ({
  extractContentText: vi.fn(),
  extractDemoUrl: vi.fn(),
  extractIntegrationSignals: vi.fn(),
  extractMessageId: vi.fn(),
  extractThinkingText: vi.fn(),
  extractUiParts: vi.fn(),
  extractVersionId: vi.fn(),
  shouldSuppressContentForEvent: vi.fn(),
  safeJsonParse: vi.fn(),
}));

vi.mock("@/lib/v0/resolve-latest-version", () => ({
  resolveLatestVersion: vi.fn(),
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
  prepareCredits: vi.fn(),
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
  warnLog: vi.fn(),
}));

vi.mock("@/lib/v0/sanitize-metadata", () => ({
  sanitizeV0Metadata: vi.fn(),
}));

vi.mock("@/lib/v0/errors", () => ({
  normalizeV0Error: (error: unknown) => ({
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

vi.mock("@/lib/gen/fallback", () => ({
  shouldUseExplicitBuilderFallback: () => false,
  shouldUseV0Fallback: () => false,
  createGenerationPipeline,
}));

vi.mock("@/lib/gen/url-compress", () => ({
  compressUrls: (value: string) => ({ compressed: value, urlMap: {} }),
}));

vi.mock("@/lib/gen/orchestrate", () => ({
  prepareGenerationContext: vi.fn(),
}));

vi.mock("@/lib/gen/plan-prompt", () => ({
  buildPlannerSystemPrompt: vi.fn(),
  parsePlanResponse: vi.fn(),
}));

vi.mock("@/lib/gen/plan-review", () => ({
  buildPlanSummaryMessage: vi.fn(),
  buildPlanUiPart: vi.fn(),
  enrichPlanArtifactForReview: vi.fn(),
}));

vi.mock("@/lib/gen/system-prompt", () => ({
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

vi.mock("@/lib/gen/route-helpers", () => {
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
    parseSSEBuffer: vi.fn(),
  };
});

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getLatestVersion,
  updateChatProjectId,
  addMessage: vi.fn(),
  createChat: vi.fn(),
  updateChatScaffoldId: vi.fn(),
}));

vi.mock("@/lib/gen/context", () => ({
  buildFileContext: vi.fn(),
}));

vi.mock("@/lib/gen/stream/finalize-version", () => ({
  EmptyGenerationError: class EmptyGenerationError extends Error {},
}));

vi.mock("@/lib/gen/stream/shared-own-engine-helpers", () => ({
  appendPreview: vi.fn(),
  extractToolNames: vi.fn(),
  finalizeOrHandleEmptyGeneration: vi.fn(),
  getUnsignaledDetectedIntegrations: vi.fn(() => []),
  looksLikeIncompleteJson: vi.fn(() => false),
}));

import { POST } from "./route";

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

describe("POST /api/v0/chats/[chatId]/stream own-engine follow-up route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
    getLatestVersion.mockResolvedValue({
      files_json: JSON.stringify([
        {
          path: "src/app/page.tsx",
          content: "export default function Page() { return <div>Old</div>; }",
          language: "tsx",
        },
      ]),
    });
  });

  it("asks for clarification when a follow-up sounds like a new site request", async () => {
    const response = await POST(
      new Request("https://example.com/api/v0/chats/chat_1/stream", {
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
      demoUrl: null,
      awaitingInput: true,
      reason: "followup_redesign_ambiguous",
    });
  });

  it("asks for clarification when a follow-up edit request is too vague", async () => {
    const response = await POST(
      new Request("https://example.com/api/v0/chats/chat_1/stream", {
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
      demoUrl: null,
      awaitingInput: true,
      reason: "followup_edit_underspecified",
    });
  });
});
