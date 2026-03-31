import { beforeEach, describe, expect, it, vi } from "vitest";

const createChatSchemaSafeParse = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());
const createSqliteChat = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const finalizeAndSaveVersion = vi.hoisted(() => vi.fn());
const prepareGenerationContext = vi.hoisted(() => vi.fn());
const streamText = vi.hoisted(() => vi.fn());
const getOpenAIModel = vi.hoisted(() => vi.fn());
const isServerVerifyEligible = vi.hoisted(() => vi.fn());
const triggerServerVerification = vi.hoisted(() => vi.fn());
const updateVersionSandboxUrl = vi.hoisted(() => vi.fn());
const parseCodeFilesFromFilesJson = vi.hoisted(() => vi.fn());
const shouldRunOwnEngineSandbox = vi.hoisted(() => vi.fn());
const startSandboxPreview = vi.hoisted(() => vi.fn());
const isSandboxConfigured = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  streamText,
}));

vi.mock("@/lib/validations/chatSchemas", () => ({
  createChatSchema: {
    safeParse: createChatSchemaSafeParse,
  },
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/tenant", () => ({
  ensureProjectForRequest: vi.fn(),
  resolveV0ProjectId: vi.fn(),
  generateProjectName: vi.fn(),
  getAppProjectByIdForRequest: vi.fn(),
  getProjectByIdForRequest: vi.fn(),
  resolveAppProjectIdForRequest,
}));

vi.mock("@/lib/botProtection", () => ({
  requireNotBot: () => null,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  createChat: createSqliteChat,
  addMessage,
  listChatsByProject: vi.fn(),
  updateVersionSandboxUrl,
}));

vi.mock("@/lib/gen/stream/finalize-version", () => ({
  finalizeAndSaveVersion,
}));

vi.mock("@/lib/gen/orchestrate", () => ({
  prepareGenerationContext,
}));

vi.mock("@/lib/gen/models", () => ({
  getOpenAIModel,
}));

vi.mock("@/lib/gen/server-verify", () => ({
  isServerVerifyEligible,
  triggerServerVerification,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseCodeFilesFromFilesJson,
}));

vi.mock("@/lib/gen/own-engine-sandbox-gate", () => ({
  shouldRunOwnEngineSandbox,
}));

vi.mock("@/lib/gen/sandbox-preview", () => ({
  startSandboxPreview,
}));

vi.mock("@/lib/mcp/runtime-url", () => ({
  isSandboxConfigured,
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
      strategy: "direct",
      promptType: "freeform",
      budgetTarget: 1200,
      optimizedLength: message.length,
      originalLength: message.length,
      reductionRatio: 0,
      reason: "unit-test",
      complexityScore: 0,
    },
  }),
}));

vi.mock("@/lib/models/selection", () => ({
  resolveModelSelection: () => ({
    modelId: "test-model",
    modelTier: "max",
  }),
  resolveEngineModelId: () => "gpt-5.4",
}));

vi.mock("@/lib/models/catalog", () => ({
  DEFAULT_MODEL_ID: "test-model",
  MODEL_LABELS: { max: "Max" },
  getBuildProfileId: () => "profile-max",
}));

vi.mock("@/lib/gen/generation-pipeline", () => ({
  shouldUseExplicitBuilderFallback: () => false,
  shouldUseV0Fallback: () => false,
}));

vi.mock("@/lib/gen/request-metadata", () => ({
  buildUserPromptContent: (message: string) => message,
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

vi.mock("@/lib/config", () => ({
  AI: {
    designSystemId: null,
  },
  FEATURES: {
    useBuildSpec: true,
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: {},
}));

vi.mock("@/lib/db/schema", () => ({
  chats: {},
  versions: {},
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
}));

vi.mock("@/lib/sanitize/sanitize-metadata", () => ({
  sanitizeMetadata: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/v0/chats", () => {
  beforeEach(() => {
    createChatSchemaSafeParse.mockReset();
    prepareCredits.mockReset();
    commitCredits.mockReset();
    resolveAppProjectIdForRequest.mockReset();
    createSqliteChat.mockReset();
    addMessage.mockReset();
    finalizeAndSaveVersion.mockReset();
    prepareGenerationContext.mockReset();
    streamText.mockReset();
    getOpenAIModel.mockReset();
    isServerVerifyEligible.mockReset();
    triggerServerVerification.mockReset();
    updateVersionSandboxUrl.mockReset();
    parseCodeFilesFromFilesJson.mockReset();
    shouldRunOwnEngineSandbox.mockReset();
    startSandboxPreview.mockReset();
    isSandboxConfigured.mockReset();

    createChatSchemaSafeParse.mockReturnValue({
      success: true,
      data: {
        message: "Bygg en sida",
        attachments: [],
        projectId: "proj_1",
        system: "",
        modelId: "test-model",
        thinking: true,
        imageGenerations: true,
        chatPrivacy: "private",
        meta: {
          appProjectId: "app_proj_1",
          buildMethod: "freeform",
        },
      },
    });
    prepareCredits.mockResolvedValue({ ok: true, commit: commitCredits });
    resolveAppProjectIdForRequest.mockResolvedValue("app_proj_1");
    createSqliteChat.mockResolvedValue({ id: "chat_1" });
    addMessage.mockResolvedValue({ id: "msg_user" });
    prepareGenerationContext.mockResolvedValue({
      engineSystemPrompt: "own-system-prompt",
      resolvedScaffold: null,
      routePlan: {
        source: "prompt",
        siteType: "one-page",
        reason: "test",
        routes: [],
      },
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
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
      scaffoldAndCapability: "",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldFamily: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: { scaffoldChars: 20000, refsChars: 8000, systemContextChars: 28000 },
      },
    });
    getOpenAIModel.mockReturnValue("openai-model");
    streamText.mockReturnValue({
      text: Promise.resolve('```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```'),
      usage: Promise.resolve({ inputTokens: 12, outputTokens: 34 }),
    });
    isServerVerifyEligible.mockReturnValue(true);
    triggerServerVerification.mockResolvedValue(undefined);
    parseCodeFilesFromFilesJson.mockReturnValue([
      {
        path: "src/app/page.tsx",
        content: "export default function Page() { return <div>Hello</div>; }",
        language: "tsx",
      },
    ]);
    shouldRunOwnEngineSandbox.mockReturnValue(true);
    isSandboxConfigured.mockReturnValue(true);
    startSandboxPreview.mockResolvedValue({
      ok: true,
      result: {
        sandboxUrl: "https://sandbox.example/ver_1",
        sandboxId: "sandbox_1",
        sandboxPreviewMode: "dev_only",
        fidelityTier: 2,
        prodBuildVerified: false,
        startOutcome: "recreated",
      },
    });
    updateVersionSandboxUrl.mockResolvedValue(true);
  });

  it("returns sync own-engine preflight metadata from finalizeAndSaveVersion", async () => {
    finalizeAndSaveVersion.mockResolvedValue({
      version: {
        id: "ver_1",
        version_number: 1,
        sandbox_url: "https://sandbox.example/ver_1",
        release_state: "draft",
        verification_state: "pending",
        verification_summary: null,
        promoted_at: null,
      },
      messageId: "msg_assistant",
      previewUrl: null,
      filesJson: "[]",
      contentForVersion: "generated content",
      preflight: {
        previewBlocked: false,
        verificationBlocked: false,
        previewBlockingReason: "Automatic preflight could not build a renderable own-engine preview entrypoint.",
        issueCount: 1,
        errorCount: 1,
        warningCount: 0,
        primaryPreviewTarget: "sandbox",
        sandbox: {
          canStartSandbox: true,
          primaryPreviewTarget: "sandbox",
          shimBlocked: false,
          requiresEnvConfig: false,
          hasCriticalInstallRisk: false,
          hasCriticalCodeFailure: false,
          compatibilityShimAllowed: false,
          issueCounts: {
            code_structure_failure: 0,
            dependency_install_failure: 0,
            env_config_missing: 0,
            shim_preview_failure: 0,
            non_blocking_quality_warning: 0,
          },
          blockingCategories: [],
        },
      },
    });

    const response = await POST(
      new Request("https://example.com/api/v0/chats", {
        method: "POST",
        body: JSON.stringify({ message: "Bygg en sida" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.previewUrl).toBeNull();
    expect(json.preflight).toMatchObject({
      previewBlocked: false,
      verificationBlocked: false,
      primaryPreviewTarget: "sandbox",
    });
    expect(json.latestVersion).toMatchObject({
      id: "ver_1",
      versionId: "ver_1",
      messageId: "msg_assistant",
      previewUrl: null,
      verificationState: "pending",
    });
    expect(json.previewBlocked).toBe(false);
    expect(json.previewBlockingReason).toContain("renderable own-engine preview entrypoint");
    expect(finalizeAndSaveVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        model: "gpt-5.4",
        startedAt: expect.any(Number),
        buildSpec: expect.objectContaining({
          buildIntent: "website",
          generationMode: "init",
        }),
        orchestrationStreamMeta: expect.objectContaining({
          enginePath: "own-engine",
          promptStrategy: "direct",
          buildSpec: expect.objectContaining({
            buildIntent: "website",
            generationMode: "init",
          }),
        }),
      }),
    );
    expect(isServerVerifyEligible).toHaveBeenCalledWith("ver_1");
    expect(triggerServerVerification).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_1",
    });
    expect(startSandboxPreview).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/app/page.tsx",
        }),
      ]),
      expect.objectContaining({
        appProjectId: "app_proj_1",
        chatId: "chat_1",
        versionIdForSession: "ver_1",
        skipRepair: true,
      }),
    );
    expect(commitCredits).toHaveBeenCalled();
  });
});
