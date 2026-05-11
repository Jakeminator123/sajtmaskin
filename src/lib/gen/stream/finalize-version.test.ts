import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutoFix = vi.hoisted(() => vi.fn());
const runLlmFixer = vi.hoisted(() => vi.fn());
const validateAndFix = vi.hoisted(() => vi.fn());
const checkCrossFileImports = vi.hoisted(() => vi.fn());
const runProjectSanityChecks = vi.hoisted(() => vi.fn());
const expandUrls = vi.hoisted(() => vi.fn());
const materializeImages = vi.hoisted(() => vi.fn());
const runVerifierPass = vi.hoisted(() => vi.fn());
const isVerifierPassEnabled = vi.hoisted(() => vi.fn());
const buildPreviewHtml = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());
const repairGeneratedFiles = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());
const addAssistantMessageAndCreateDraftVersion = vi.hoisted(() => vi.fn());
const addAssistantMessageAndUpdateExistingVersion = vi.hoisted(() => vi.fn());
const updateChatOrchestrationSnapshot = vi.hoisted(() => vi.fn());
const getChatOrchestrationSnapshot = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const deleteEngineMessage = vi.hoisted(() => vi.fn());
const logGeneration = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const createGenerationTelemetryRecord = vi.hoisted(() => vi.fn());
const parseFilesFromContent = vi.hoisted(() => vi.fn());
const mergeVersionFilesWithWarnings = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() => vi.fn());

// Mock the FEATURES gate so optional dossier RAG / recurring-patterns
// blocks stay deterministic in tests. The repair-pass / verifier-rerun /
// merge-syntax-escalation flags were inlined 2026-04-28 and no longer
// need overrides here.
vi.mock("@/lib/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config")>("@/lib/config");
  return {
    ...actual,
    FEATURES: {
      ...actual.FEATURES,
      recurringPatternsInMainPrompt: false,
      useErrorLogRag: false,
    },
  };
});

vi.mock("@/lib/gen/autofix/pipeline", () => ({
  runAutoFix,
}));

vi.mock("@/lib/gen/autofix/llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("@/lib/gen/autofix/validate-and-fix", () => ({
  validateAndFix,
}));

vi.mock("@/lib/gen/autofix/rules/cross-file-import-checker", () => ({
  checkCrossFileImports,
}));

vi.mock("@/lib/gen/validation/project-sanity", () => ({
  runProjectSanityChecks,
}));

vi.mock("@/lib/gen/url-compress", () => ({
  expandUrls,
}));

vi.mock("@/lib/gen/post-process/image-materializer", () => ({
  materializeImages,
}));

vi.mock("@/lib/gen/verify/verifier-pass", () => ({
  isVerifierPassEnabled,
  runVerifierPass,
  formatVerifierFindingsAsFixerErrors: (findings: {
    blocking: Array<{ id: string; detail: string }>;
  }) =>
    findings.blocking.map((f) => `[verifier:${f.id}] ${f.detail}`),
  // SAJ-61 c5: file-path extractor consumed by `verifier-phase` to seed
  // `runLlmRepairGate({ requiredFiles })`. The unit tests don't care
  // about the exact list, just that the export exists.
  extractFilePathsFromVerifierFindings: () => [] as string[],
}));

vi.mock("@/lib/gen/preview/build-preview-document", () => ({
  buildPreviewHtml,
  buildPreviewUrl,
}));

vi.mock("@/lib/gen/autofix/repair-generated-files", () => ({
  repairGeneratedFiles,
}));

vi.mock("@/lib/gen/export/project-scaffold", () => ({
  buildCompleteProject,
}));

vi.mock("@/lib/gen/export/project-scaffold-ui-reader", () => ({
  collectRequiredUiComponents: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  addAssistantMessageAndCreateDraftVersion,
  addAssistantMessageAndUpdateExistingVersion,
  updateChatOrchestrationSnapshot,
  getChatOrchestrationSnapshot,
  addMessage,
  deleteEngineMessage,
  logGeneration,
  failVersionVerification,
}));

const pruneStaleVersionErrorLogs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
  pruneStaleVersionErrorLogs,
}));

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  createGenerationTelemetryRecord,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseFilesFromContent,
  mergeVersionFilesWithWarnings,
}));

vi.mock("@/lib/gen/retry/validate-syntax", () => ({
  validateGeneratedCode,
}));

const devLogAppend = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend,
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get() { return vi.fn(); } }),
  dbConfigured: false,
}));

vi.mock("@/lib/gen/scaffolds/scaffold-aware-retry", () => ({
  inferScaffoldRetrySuggestion: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/gen/validation/seo-preflight", () => ({
  runSeoPreflightChecks: vi.fn().mockReturnValue([]),
}));

import { finalizeAndSaveVersion } from "./finalize-version";

describe("finalizeAndSaveVersion", () => {
  beforeEach(() => {
    runAutoFix.mockReset();
    runLlmFixer.mockReset();
    validateAndFix.mockReset();
    checkCrossFileImports.mockReset();
    runProjectSanityChecks.mockReset();
    expandUrls.mockReset();
    materializeImages.mockReset();
    runVerifierPass.mockReset();
    buildPreviewHtml.mockReset();
    buildPreviewUrl.mockReset();
    repairGeneratedFiles.mockReset();
    buildCompleteProject.mockReset();
    addAssistantMessageAndCreateDraftVersion.mockReset();
    addAssistantMessageAndUpdateExistingVersion.mockReset();
    updateChatOrchestrationSnapshot.mockReset();
    getChatOrchestrationSnapshot.mockReset();
    addMessage.mockReset();
    deleteEngineMessage.mockReset();
    logGeneration.mockReset();
    failVersionVerification.mockReset();
    createEngineVersionErrorLogs.mockReset();
    pruneStaleVersionErrorLogs.mockReset();
    pruneStaleVersionErrorLogs.mockResolvedValue(0);
    createGenerationTelemetryRecord.mockReset();
    parseFilesFromContent.mockReset();
    mergeVersionFilesWithWarnings.mockReset();
    validateGeneratedCode.mockReset();

    runAutoFix.mockResolvedValue({
      fixedContent: '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      fixes: [],
      warnings: [],
      dependencies: [],
    });
    runLlmFixer.mockResolvedValue({
      fixedContent: "",
      fixedFiles: [],
      missingFiles: [],
      partial: false,
      success: false,
      durationMs: 0,
    });
    validateAndFix.mockResolvedValue({
      content: '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      hadErrors: false,
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: 0,
      errorsAfter: 0,
      passes: 1,
      status: "passed",
      pipelineError: null,
      earlyStopReason: null,
    });
    expandUrls.mockImplementation((value: string) => value);
    materializeImages.mockResolvedValue({
      content: '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      replacedCount: 0,
      skippedCount: 0,
      resolvedUrls: new Set<string>(),
      queries: [],
    });
    isVerifierPassEnabled.mockReturnValue(true);
    runVerifierPass.mockResolvedValue({
      blocking: [],
      quality: [],
    });
    parseFilesFromContent.mockReturnValue(
      JSON.stringify([
        {
          path: "package.json",
          content: JSON.stringify(
            {
              name: "unit-test",
              version: "0.0.0",
              private: true,
              scripts: { dev: "next dev", build: "next build" },
              dependencies: { next: "15.0.0", react: "19.0.0", "react-dom": "19.0.0" },
              devDependencies: { typescript: "5.6.0" },
            },
            null,
            2,
          ),
          language: "json",
        },
        {
          path: "next-env.d.ts",
          content: '/// <reference types="next" />\n',
          language: "ts",
        },
        {
          path: "src/app/page.tsx",
          content: "export default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }",
          language: "tsx",
        },
      ]),
    );
    mergeVersionFilesWithWarnings.mockImplementation((_base: unknown, files: unknown) => ({
      files,
      warnings: [],
    }));
    checkCrossFileImports.mockImplementation((files: unknown) => ({
      files,
      fixes: [],
    }));
    repairGeneratedFiles.mockImplementation((files: unknown) => ({
      files,
      fixes: [],
    }));
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    buildCompleteProject.mockImplementation((files: unknown) => files);
    validateGeneratedCode.mockResolvedValue({
      valid: true,
      errors: [],
    });
    runProjectSanityChecks.mockReturnValue({
      valid: true,
      issues: [],
    });
    addAssistantMessageAndCreateDraftVersion.mockResolvedValue({
      message: { id: "msg_1" },
      version: { id: "ver_1" },
    });
    addAssistantMessageAndUpdateExistingVersion.mockResolvedValue({
      message: { id: "msg_1" },
      version: { id: "ver_1" },
    });
    updateChatOrchestrationSnapshot.mockResolvedValue(true);
    getChatOrchestrationSnapshot.mockResolvedValue(null);
    addMessage.mockResolvedValue({ id: "orphan_msg" });
    deleteEngineMessage.mockResolvedValue(true);
    logGeneration.mockResolvedValue({});
    failVersionVerification.mockResolvedValue({});
    createEngineVersionErrorLogs.mockResolvedValue([]);
    createGenerationTelemetryRecord.mockResolvedValue({ id: "telemetry_1" });
    buildPreviewUrl.mockReturnValue("https://preview.example/chat_1/ver_1");
  });

  describe("thinking persistence", () => {
    it("forwards accumulatedThinking into the draft persist call (new version path)", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
        accumulatedThinking: "Step 1: pick layout. Step 2: render hero.",
      });

      expect(addAssistantMessageAndCreateDraftVersion).toHaveBeenCalledTimes(1);
      const call = addAssistantMessageAndCreateDraftVersion.mock.calls[0];
      expect(call?.[3]).toEqual(
        expect.objectContaining({
          thinking: "Step 1: pick layout. Step 2: render hero.",
        }),
      );
    });

    it("forwards accumulatedThinking when updating an existing version (repair path)", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
        targetVersionId: "ver_existing",
        accumulatedThinking: "Repair reasoning trace",
      });

      expect(addAssistantMessageAndUpdateExistingVersion).toHaveBeenCalledTimes(1);
      const call = addAssistantMessageAndUpdateExistingVersion.mock.calls[0];
      expect(call?.[4]).toEqual(
        expect.objectContaining({ thinking: "Repair reasoning trace" }),
      );
    });

    it("passes thinking: null when no reasoning was collected", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      const call = addAssistantMessageAndCreateDraftVersion.mock.calls[0];
      expect(call?.[3]).toEqual(expect.objectContaining({ thinking: null }));
    });

    it("normalizes empty-string accumulatedThinking to null", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
        accumulatedThinking: "",
      });

      const call = addAssistantMessageAndCreateDraftVersion.mock.calls[0];
      expect(call?.[3]).toEqual(expect.objectContaining({ thinking: null }));
    });
  });

  it("does not call addMessage for assistant rows (avoids orphan assistant without version)", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(addMessage).not.toHaveBeenCalled();
    expect(addAssistantMessageAndCreateDraftVersion).toHaveBeenCalledTimes(1);
    expect(updateChatOrchestrationSnapshot).not.toHaveBeenCalled();
  });

  it("persists orchestration snapshot when orchestrationStreamMeta is provided", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      buildIntent: "website",
      orchestrationStreamMeta: { modelTier: "max", promptStrategy: "compress" },
    });
    expect(updateChatOrchestrationSnapshot).toHaveBeenCalledTimes(1);
    const arg = updateChatOrchestrationSnapshot.mock.calls[0];
    expect(arg?.[0]).toBe("chat_1");
    expect((arg?.[1] as Record<string, unknown>)?.lastVersionId).toBe("ver_1");
  });

  it("merges orchestration snapshot with previous chat row (K-019)", async () => {
    getChatOrchestrationSnapshot.mockResolvedValueOnce({
      scaffoldId: "scaffold_prev",
      modelTier: "pro",
    });
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      orchestrationStreamMeta: { promptStrategy: "deep" },
    });
    expect(getChatOrchestrationSnapshot).toHaveBeenCalledWith("chat_1");
    const saved = updateChatOrchestrationSnapshot.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(saved?.scaffoldId).toBe("scaffold_prev");
    expect(saved?.promptStrategy).toBe("deep");
    expect(saved?.lastVersionId).toBe("ver_1");
  });

  it("propagates when transactional assistant+draft persist fails (no manual message delete)", async () => {
    addAssistantMessageAndCreateDraftVersion.mockRejectedValueOnce(new Error("draft insert failed"));

    await expect(
      finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      }),
    ).rejects.toThrow("draft insert failed");

    expect(addAssistantMessageAndCreateDraftVersion).toHaveBeenCalledWith(
      "chat_1",
      expect.stringContaining("export default function Page()"),
      expect.any(String),
      expect.objectContaining({ lifecycleStage: "design" }),
    );
    expect(deleteEngineMessage).not.toHaveBeenCalled();
  });

  it("emits a terminal autofix progress event even when autofix makes no changes", async () => {
    const progressEvents: Array<{ event: string; data: Record<string, unknown> }> = [];

    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      onProgress: (event, data) => progressEvents.push({ event, data }),
    });

    expect(progressEvents).toContainEqual({
      event: "autofix",
      data: expect.objectContaining({ phase: "done", fixes: 0, warnings: 0 }),
    });
  });

  it("skips warm-tsc when downstream quality-gate will run typecheck AND qualityGatePlanned is true (R2 guard)", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
        routeRealization: {
          mode: "full",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: [],
        },
      },
      resolvedScaffold: null,
      willRunQualityGate: true,
      qualityGatePlanned: true,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(validateAndFix).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        skipWarmTsc: true,
      }),
    );
  });

  it("R2 guard: keeps warm-tsc ON when willRunQualityGate=true but qualityGatePlanned is missing", async () => {
    // Regression test för R2-guarden: utan explicit qualityGatePlanned får
    // finalize INTE skippa warm-tsc. Stoppar den "tysta luckan" där
    // willRunQualityGate sätts optimistiskt upstream men quality-gate sedan
    // hoppas över sent (t.ex. design_preview_skip_verify) — då har vi
    // varken warm-tsc- eller QG-resultat.
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
        routeRealization: {
          mode: "full",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: [],
        },
      },
      resolvedScaffold: null,
      willRunQualityGate: true,
      // qualityGatePlanned MEDVETET UTELÄMNAT — defaultar till false.
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(validateAndFix).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        skipWarmTsc: false,
      }),
    );
  });

  it("R2 guard: keeps warm-tsc ON when qualityGatePlanned=false even with willRunQualityGate=true", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
        routeRealization: {
          mode: "full",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: [],
        },
      },
      resolvedScaffold: null,
      willRunQualityGate: true,
      qualityGatePlanned: false,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(validateAndFix).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        skipWarmTsc: false,
      }),
    );
  });

  it("keeps warm-tsc enabled when downstream quality-gate is not planned", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
        routeRealization: {
          mode: "full",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: [],
        },
      },
      resolvedScaffold: null,
      willRunQualityGate: false,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(validateAndFix).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        skipWarmTsc: false,
      }),
    );
  });

  it("SAJ-61: SAJTMASKIN_PRE_VM_TYPECHECK=true forces warm-tsc on even when QG-planned skip would normally fire", async () => {
    // Setup: same shape as the "skips warm-tsc when downstream quality-gate
    // will run typecheck AND qualityGatePlanned is true" baseline. The only
    // difference is the env override, which must invert the decision so the
    // operator's "always typecheck before VM" signal wins.
    const previous = process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
    process.env.SAJTMASKIN_PRE_VM_TYPECHECK = "true";
    try {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: {
            scaffoldChars: 36_000,
            refsChars: 12_000,
            systemContextChars: 48_000,
          },
          routeRealization: {
            mode: "full",
            primaryRoutePath: "/",
            fullRoutePaths: ["/"],
            shellRoutePaths: [],
          },
        },
        resolvedScaffold: null,
        willRunQualityGate: true,
        qualityGatePlanned: true,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      expect(validateAndFix).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          skipWarmTsc: false,
        }),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
      } else {
        process.env.SAJTMASKIN_PRE_VM_TYPECHECK = previous;
      }
    }
  });

  it("SAJ-61: SAJTMASKIN_PRE_VM_TYPECHECK=false leaves QG-planned skip intact", async () => {
    const previous = process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
    process.env.SAJTMASKIN_PRE_VM_TYPECHECK = "false";
    try {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: {
            scaffoldChars: 36_000,
            refsChars: 12_000,
            systemContextChars: 48_000,
          },
          routeRealization: {
            mode: "full",
            primaryRoutePath: "/",
            fullRoutePaths: ["/"],
            shellRoutePaths: [],
          },
        },
        resolvedScaffold: null,
        willRunQualityGate: true,
        qualityGatePlanned: true,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      expect(validateAndFix).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          skipWarmTsc: true,
        }),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
      } else {
        process.env.SAJTMASKIN_PRE_VM_TYPECHECK = previous;
      }
    }
  });

  it("emits no preview URL when tier-2 preview is blocked and shim path is removed", async () => {
    runProjectSanityChecks.mockReturnValue({
      valid: false,
      issues: [
        {
          file: "src/app/page.tsx",
          severity: "error",
          message: "Missing required export",
        },
      ],
    });

    const result = await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      logNote: "unit-test",
    });

    expect(result.previewUrl).toBeNull();
    expect(result.preflight.previewBlocked).toBe(true);
    expect(result.preflight.verificationBlocked).toBe(true);
    expect(buildPreviewUrl).not.toHaveBeenCalled();
    expect(logGeneration).toHaveBeenCalledWith(
      "chat_1",
      "gpt-5.4",
      { prompt: undefined, completion: undefined },
      expect.any(Number),
      false,
      "Automatic preflight found preview-blocking issues.",
    );
    expect(failVersionVerification).toHaveBeenCalledWith(
      "ver_1",
      "Automatic preflight found preview-blocking issues.",
    );
  });

  it("suppresses preview URLs when finalize preflight cannot build a renderable preview", async () => {
    buildPreviewHtml.mockReturnValue(null);

    const result = await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(result.previewUrl).toBeNull();
    expect(result.preflight.previewBlocked).toBe(false);
    expect(result.preflight.verificationBlocked).toBe(false);
    expect(result.preflight.previewBlockingReason).toBe(
      "Automatic preflight could not build a renderable own-engine preview entrypoint.",
    );
    expect(result.preflight.primaryPreviewTarget).toBe("preview");
    expect(buildPreviewUrl).not.toHaveBeenCalled();
    expect(logGeneration).toHaveBeenCalledWith(
      "chat_1",
      "gpt-5.4",
      { prompt: undefined, completion: undefined },
      expect.any(Number),
      true,
      undefined,
    );
    expect(failVersionVerification).not.toHaveBeenCalled();
  });

  it("uses previousFiles as the merge base for follow-up generations", async () => {
    const previousFiles = [
      {
        path: "src/app/page.tsx",
        content: "export default function PreviousPage() { return <div>Previous</div>; }",
        language: "tsx",
      },
    ];

    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: {
        id: "scaffold_1",
        files: [
          {
            path: "src/app/layout.tsx",
            content: "export default function Layout({ children }) { return children; }",
          },
        ],
      } as never,
      urlMap: {},
      startedAt: Date.now() - 500,
      previousFiles,
      logNote: "follow-up characterization",
    });

    expect(mergeVersionFilesWithWarnings).toHaveBeenCalledWith(
      previousFiles,
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/app/page.tsx",
        }),
      ]),
      { rejectSignificantShrinks: true, rejectDroppedStructuralElements: true },
    );
  });

  it("returns shrinkRetry when a critical follow-up page shrink is rejected", async () => {
    const previousFiles = [
      {
        path: "src/app/page.tsx",
        content: "export default function PreviousPage() { return <main>Previous full page</main>; }",
        language: "tsx",
      },
    ];

    mergeVersionFilesWithWarnings.mockImplementationOnce((_base: unknown, files: unknown) => ({
      files,
      warnings: [
        {
          type: "significant-shrink",
          file: "src/app/page.tsx",
          previousSize: 13_000,
          newSize: 200,
        },
      ],
    }));

    const result = await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello</h1></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: {
        id: "scaffold_1",
        files: [
          {
            path: "src/app/layout.tsx",
            content: "export default function Layout({ children }) { return children; }",
          },
        ],
      } as never,
      urlMap: {},
      startedAt: Date.now() - 500,
      previousFiles,
    });

    expect(result.rejectedShrinks).toEqual([
      { file: "src/app/page.tsx", previousSize: 13_000, newSize: 200 },
    ]);
    expect(result.shrinkRetry).toEqual(
      expect.objectContaining({
        files: ["src/app/page.tsx"],
        ctaLabel: "Försök igen med mer innehåll",
      }),
    );
  });

  it("skips merge and scaffold import checks for non-scaffold first generations", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(mergeVersionFilesWithWarnings).not.toHaveBeenCalled();
    expect(checkCrossFileImports).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/app/page.tsx",
        }),
      ]),
    );
  });

  it("persists preview-specific preflight logs when preview rendering is blocked", async () => {
    buildPreviewHtml.mockReturnValue(null);

    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: "preflight:summary",
          meta: expect.objectContaining({
            previewBlocked: false,
            verificationBlocked: false,
            previewStart: expect.objectContaining({
              canStartPreview: true,
              primaryPreviewTarget: "preview",
            }),
          }),
        }),
        expect.objectContaining({
          category: "preview",
          level: "warning",
          meta: expect.objectContaining({
            previewCode: "compatibility_shim_blocked",
            previewBlocked: false,
            verificationBlocked: false,
            primaryPreviewTarget: "preview",
          }),
        }),
      ]),
    );
  });

  it("persists a dedicated syntax diagnostic when validation still has blocking errors", async () => {
    validateAndFix.mockResolvedValueOnce({
      content:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      hadErrors: true,
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: 3,
      errorsAfter: 2,
      passes: 1,
      status: "failed",
      pipelineError: null,
      earlyStopReason: "no_improvement",
    });

    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: "syntax",
          level: "error",
          meta: expect.objectContaining({
            syntaxStatus: "failed",
            errorsBefore: 3,
            errorsAfter: 2,
            earlyStopReason: "no_improvement",
          }),
        }),
      ]),
    );
  });

  it("persists verifier blockers as reusable version error logs", async () => {
    runVerifierPass.mockResolvedValueOnce({
      blocking: [
        {
          id: "next-image-remote-patterns",
          detail:
            "`app/page.tsx` uses external next/image hosts without confirmed remotePatterns config.",
        },
      ],
      quality: [],
    });

    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "premium",
        previewPolicy: "fidelity2",
        verificationPolicy: "strict",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
        routeRealization: {
          mode: "full",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: [],
        },
      },
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: "quality-gate:verifier-blocking",
          level: "error",
          message:
            "`app/page.tsx` uses external next/image hosts without confirmed remotePatterns config.",
          meta: expect.objectContaining({
            verifierFindingId: "next-image-remote-patterns",
          }),
        }),
      ]),
    );
    // 2026-04-23 (showcase-bug rootfix, fas D1): verifier-only blocking findings
    // must NOT pre-commit `failed` anymore. Server-verify (real tsc/build) is
    // the authority that decides terminal verification state. Verifier findings
    // are still persisted as diagnostics above.
    expect(failVersionVerification).not.toHaveBeenCalled();
  });

  it("(fas D1) preflight hard errors still pre-commit failed (unchanged path)", async () => {
    // Preflight code-structure failures — distinct from verifier-LLM findings —
    // ARE deterministic and should still immediately fail the version so
    // the UI doesn't spin on "Verifierar" for something that can't render.
    runProjectSanityChecks.mockReturnValueOnce({
      valid: false,
      issues: [
        {
          file: "src/app/page.tsx",
          severity: "error",
          message: "Missing required export",
        },
      ],
    });

    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(failVersionVerification).toHaveBeenCalledWith(
      "ver_1",
      expect.stringContaining("Automatic preflight"),
    );
  });

  it("feeds verifier blocking findings into runLlmFixer (closes verifier feedback loop)", async () => {
    const cleanContent =
      '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```';
    runVerifierPass.mockResolvedValueOnce({
      blocking: [
        {
          id: "navigation-placeholder-actions",
          detail: "src/app/page.tsx: hero CTA href is empty",
        },
      ],
      quality: [],
    });
    runLlmFixer.mockResolvedValueOnce({
      fixedContent: cleanContent,
      fixedFiles: ["src/app/page.tsx"],
      missingFiles: [],
      partial: false,
      success: true,
      durationMs: 1100,
    });
    const progressEvents: Array<{ event: string; data: Record<string, unknown> }> = [];

    await finalizeAndSaveVersion({
      accumulatedContent: cleanContent,
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "premium",
        previewPolicy: "fidelity2",
        verificationPolicy: "strict",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
        routeRealization: {
          mode: "full",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: [],
        },
      },
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      onProgress: (event, data) => progressEvents.push({ event, data }),
    });

    expect(runLlmFixer).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.stringContaining("[verifier:navigation-placeholder-actions]"),
      ]),
      expect.objectContaining({
        abortSignal: expect.any(Object),
      }),
    );
    expect(progressEvents).toContainEqual({
      event: "verifier",
      data: expect.objectContaining({ phase: "fixing", findingsCount: 1 }),
    });
    expect(progressEvents).toContainEqual({
      event: "verifier",
      data: expect.objectContaining({ phase: "fixed", fixerImproved: true }),
    });
    // When the fixer succeeds, the version should NOT be marked verifier-blocked.
    expect(failVersionVerification).not.toHaveBeenCalled();
  });

  it("fails before persist when preflight detects partial file output", async () => {
    runProjectSanityChecks.mockReturnValueOnce({
      valid: false,
      issues: [
        {
          file: "components/trailer-dialog.tsx",
          severity: "error",
          message:
            "File starts with overlapping import statements that look like a partial repair snippet. This usually means a repair/generation step returned a file excerpt instead of a complete file.",
          category: "code_structure_failure",
        },
      ],
    });

    await expect(
      finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      }),
    ).rejects.toMatchObject({
      name: "PartialFileOutputError",
    });

    expect(addAssistantMessageAndCreateDraftVersion).not.toHaveBeenCalled();
  });

  it("repairs partial file output via LLM fixer and persists when second preflight passes", async () => {
    const cleanContent =
      '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```';
    runProjectSanityChecks
      .mockReturnValueOnce({
        valid: false,
        issues: [
          {
            file: "components/trailer-dialog.tsx",
            severity: "error",
            message:
              "File starts with overlapping import statements that look like a partial repair snippet.",
            category: "code_structure_failure",
          },
        ],
      })
      .mockReturnValueOnce({ valid: true, issues: [] });

    runLlmFixer.mockResolvedValueOnce({
      fixedContent: cleanContent,
      fixedFiles: ["components/trailer-dialog.tsx"],
      missingFiles: [],
      partial: false,
      success: true,
      durationMs: 1200,
    });

    const result = await finalizeAndSaveVersion({
      accumulatedContent: cleanContent,
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(result.version.id).toBe("ver_1");
    expect(addAssistantMessageAndCreateDraftVersion).toHaveBeenCalled();
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
  });

  it("skips deep-path image materialization and verifier for light follow-up finalize", async () => {
    const progressEvents: Array<{ event: string; data: Record<string, unknown> }> = [];

    const result = await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "copy",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
        routeRealization: {
          mode: "full",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: [],
        },
      },
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      onProgress: (event, data) => progressEvents.push({ event, data }),
    });

    expect(materializeImages).not.toHaveBeenCalled();
    expect(runVerifierPass).not.toHaveBeenCalled();
    expect(result.telemetryRecordId).toBe("telemetry_1");
    expect(progressEvents).toContainEqual({
      event: "materialize_images",
      data: { phase: "skipped", reason: "light_followup_fast_policy" },
    });
    expect(progressEvents).toContainEqual({
      event: "verifier",
      data: { phase: "skipped", reason: "light_followup_fast_policy" },
    });
    expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGateResult: "preflight_passed",
        retryCount: 0,
        meta: expect.objectContaining({
          finalizePath: "light",
          finalizePathReason: "light_followup_fast_policy",
          repairPassIndex: 0,
          buildSpec: expect.objectContaining({
            generationMode: "followUp",
            changeScope: "copy",
            previewPolicy: "fidelity2",
            verificationPolicy: "fast",
            contextPolicy: "light",
          }),
          autofix: expect.objectContaining({
            fixCount: 0,
            warningCount: 0,
          }),
          preflight: expect.objectContaining({
            previewBlocked: false,
            verificationBlocked: false,
          }),
        }),
      }),
    );
  });

  describe("finalize telemetry and persistence", () => {
    it("init with premium quality target records preflight_passed and full default telemetry", async () => {
      const result = await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "premium",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: {
            scaffoldChars: 36_000,
            refsChars: 12_000,
            systemContextChars: 48_000,
          },
          routeRealization: {
            mode: "full",
            primaryRoutePath: "/",
            fullRoutePaths: ["/"],
            shellRoutePaths: [],
          },
        },
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          qualityGateResult: "preflight_passed",
          meta: expect.objectContaining({
            buildSpec: expect.objectContaining({
              qualityTarget: "premium",
              previewPolicy: "fidelity2",
            }),
            finalizePath: "full",
            finalizePathReason: "default",
            postStreamSteps: expect.objectContaining({
              autofix: expect.objectContaining({ status: "done" }),
              url_expand: expect.objectContaining({ status: "done" }),
              materialize_images: expect.objectContaining({
                status: "done",
                maxReplacements: 7,
              }),
              validate_syntax: expect.objectContaining({ status: "done" }),
              verifier: expect.objectContaining({
                status: "done",
                trigger: "high_quality_target",
              }),
              parse_merge_preflight: expect.objectContaining({ status: "done" }),
            }),
          }),
        }),
      );
      expect(materializeImages).toHaveBeenCalledWith(expect.any(String), {
        maxReplacements: 7,
      });
      expect(runVerifierPass).toHaveBeenCalled();
      expect(result.telemetryRecordId).not.toBeNull();
    });

    it("skips verifier when standard init has no verifier signal", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: {
            scaffoldChars: 36_000,
            refsChars: 12_000,
            systemContextChars: 48_000,
          },
          routeRealization: {
            mode: "full",
            primaryRoutePath: "/",
            fullRoutePaths: ["/"],
            shellRoutePaths: [],
          },
        },
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      expect(runVerifierPass).not.toHaveBeenCalled();
      expect(materializeImages).toHaveBeenCalledWith(expect.any(String), {
        maxReplacements: 6,
      });
      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            postStreamSteps: expect.objectContaining({
              verifier: expect.objectContaining({
                status: "skipped",
                reason: "no_verifier_signal",
              }),
            }),
          }),
        }),
      );
    });

    it("follow-up with fast verification skips materializeImages and records light light_followup telemetry", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
        buildSpec: {
          buildIntent: "website",
          generationMode: "followUp",
          changeScope: "copy",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "fast",
          contextPolicy: "light",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: {
            scaffoldChars: 36_000,
            refsChars: 12_000,
            systemContextChars: 48_000,
          },
          routeRealization: {
            mode: "full",
            primaryRoutePath: "/",
            fullRoutePaths: ["/"],
            shellRoutePaths: [],
          },
        },
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      expect(materializeImages).not.toHaveBeenCalled();
      expect(runVerifierPass).not.toHaveBeenCalled();
      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            finalizePath: "light",
            finalizePathReason: "light_followup_fast_policy",
            postStreamSteps: expect.objectContaining({
              materialize_images: expect.objectContaining({
                status: "skipped",
                reason: "light_followup_fast_policy",
              }),
              verifier: expect.objectContaining({
                status: "skipped",
                reason: "light_followup_fast_policy",
              }),
            }),
          }),
        }),
      );
    });
  });

  // SAJ-25 — pruneStaleVersionErrorLogs acceptance.
  describe("SAJ-25 — pruneStaleVersionErrorLogs", () => {
    const baseFinalizeArgs = () => ({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_saj25",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    it("init pass (repairPassIndex=0) does NOT call prune even on clean finalize", async () => {
      await finalizeAndSaveVersion({
        ...baseFinalizeArgs(),
        repairPassIndex: 0,
      });
      expect(pruneStaleVersionErrorLogs).not.toHaveBeenCalled();
    });

    it("clean follow-up pass (repairPassIndex=1) calls prune with the version id and current pass index", async () => {
      pruneStaleVersionErrorLogs.mockResolvedValue(2);
      await finalizeAndSaveVersion({
        ...baseFinalizeArgs(),
        repairPassIndex: 1,
        targetVersionId: "ver_existing",
      });
      expect(pruneStaleVersionErrorLogs).toHaveBeenCalledTimes(1);
      expect(pruneStaleVersionErrorLogs).toHaveBeenCalledWith("ver_1", 1);
    });

    it("verifier-only blockers do not prevent pruning older repair-pass logs", async () => {
      runVerifierPass.mockResolvedValueOnce({
        blocking: [
          {
            id: "navigation-placeholder-actions",
            detail: "src/app/page.tsx: CTA href is empty",
          },
        ],
        quality: [],
      });

      await finalizeAndSaveVersion({
        ...baseFinalizeArgs(),
        repairPassIndex: 1,
        targetVersionId: "ver_existing",
      });

      expect(pruneStaleVersionErrorLogs).toHaveBeenCalledTimes(1);
      expect(pruneStaleVersionErrorLogs).toHaveBeenCalledWith("ver_1", 1);
    });

    it("current preflight errors still prevent pruning older repair-pass logs", async () => {
      runProjectSanityChecks.mockReturnValueOnce({
        valid: false,
        issues: [
          {
            file: "src/app/page.tsx",
            severity: "error",
            message: "Missing required export",
          },
        ],
      });

      await finalizeAndSaveVersion({
        ...baseFinalizeArgs(),
        repairPassIndex: 1,
        targetVersionId: "ver_existing",
      });

      expect(pruneStaleVersionErrorLogs).not.toHaveBeenCalled();
    });

    it("syntax validation failures prevent pruning older repair-pass logs", async () => {
      validateAndFix.mockResolvedValueOnce({
        content:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
        hadErrors: true,
        fixerUsed: false,
        fixerImproved: false,
        errorsBefore: 2,
        errorsAfter: 2,
        passes: 1,
        status: "failed",
        pipelineError: null,
        earlyStopReason: "no_improvement",
      });

      await finalizeAndSaveVersion({
        ...baseFinalizeArgs(),
        repairPassIndex: 1,
        targetVersionId: "ver_existing",
      });

      expect(pruneStaleVersionErrorLogs).not.toHaveBeenCalled();
    });

    it("prune failure is non-fatal — finalize still completes (best-effort)", async () => {
      pruneStaleVersionErrorLogs.mockRejectedValue(new Error("transient db error"));
      const result = await finalizeAndSaveVersion({
        ...baseFinalizeArgs(),
        repairPassIndex: 1,
        targetVersionId: "ver_existing",
      });
      expect(result.version.id).toBe("ver_1");
      expect(pruneStaleVersionErrorLogs).toHaveBeenCalledTimes(1);
    });
  });

  // Repair-loop hardening B — verifier re-run after LLM-fixer.
  // The re-run is unconditional (was hardcoded ON via the now-removed
  // FEATURES.verifierRerunAfterFix flag, inlined 2026-04-28).
  describe("Phase 2B — verifier re-run after LLM-fixer", () => {
    const verifierTriggeringBuildSpec = {
      buildIntent: "website" as const,
      generationMode: "init" as const,
      changeScope: "redesign" as const,
      scaffoldId: null,
      routePlanSummary: "prompt:one-page:/",
      stylePack: "brand-led",
      qualityTarget: "premium" as const,
      previewPolicy: "fidelity2" as const,
      verificationPolicy: "strict" as const,
      contextPolicy: "normal" as const,
      referenceCategories: [],
      forbiddenPatterns: [],
      tokenBudgets: {
        scaffoldChars: 36_000,
        refsChars: 12_000,
        systemContextChars: 48_000,
      },
      routeRealization: {
        mode: "full" as const,
        primaryRoutePath: "/",
        fullRoutePaths: ["/"],
        shellRoutePaths: [],
      },
    };

    const baseArgs = () => ({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return (<main><h1>Hello from Acme</h1><p>Welcome to Acme — modern infrastructure, careful onboarding, friendly support every day, and a dedicated success manager who actually picks up the phone within seconds of dialing</p></main>); }\n```',
      chatId: "chat_2b",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      buildSpec: verifierTriggeringBuildSpec,
    });

    it("blocking → fix succeeds → rerun reports clean → no rerun-blocking findings persisted", async () => {
      // First verifier call: 1 blocking finding.
      // Second verifier call (rerun): 0 blocking findings.
      runVerifierPass
        .mockResolvedValueOnce({
          blocking: [{ id: "missing-h1", detail: "page missing h1" }],
          quality: [],
        })
        .mockResolvedValueOnce({ blocking: [], quality: [] });
      runLlmFixer.mockResolvedValue({
        fixedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <h1>Hello</h1>; }\n```',
        fixedFiles: [],
        missingFiles: [],
        partial: false,
        success: true,
        durationMs: 50,
      });
      await finalizeAndSaveVersion(baseArgs());
      // Two verifier calls: initial pass + rerun.
      expect(runVerifierPass).toHaveBeenCalledTimes(2);
      // Telemetry should reflect a clean rerun.
      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            preflight: expect.objectContaining({
              verifierBlocked: false,
              verifierBlockingFindingCount: 0,
            }),
          }),
        }),
      );
    });

    it("blocking → fix succeeds → rerun reports still-blocking → keeps findings + verifierBlocked", async () => {
      runVerifierPass
        .mockResolvedValueOnce({
          blocking: [{ id: "missing-h1", detail: "page missing h1" }],
          quality: [],
        })
        .mockResolvedValueOnce({
          blocking: [{ id: "missing-h1", detail: "page still missing h1" }],
          quality: [],
        });
      runLlmFixer.mockResolvedValue({
        fixedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Still missing h1</div>; }\n```',
        fixedFiles: [],
        missingFiles: [],
        partial: false,
        success: true,
        durationMs: 50,
      });
      await finalizeAndSaveVersion(baseArgs());
      expect(runVerifierPass).toHaveBeenCalledTimes(2);
      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            preflight: expect.objectContaining({
              verifierBlocked: true,
              verifierBlockingFindingCount: 1,
            }),
          }),
        }),
      );
    });

    it("postmortem 2026-04-28: rerun reports REGRESSION (3>2) → success:false in devLog (was true)", async () => {
      // Postmortem run `20260428-041927-freeform`: the verifier-pass.fixer
      // devLog row was emitted with `success: true` even when
      // `findingsAfterRerun: 3` exceeded `findingsBefore: 2`. That gave UI
      // and telemetry a false-positive "fixed" signal. The fix anchors
      // `success` on `rerunBlockingCount < findings.blocking.length`.
      runVerifierPass
        .mockResolvedValueOnce({
          blocking: [
            { id: "missing-h1", detail: "page missing h1" },
            { id: "missing-meta", detail: "page missing meta" },
          ],
          quality: [],
        })
        .mockResolvedValueOnce({
          blocking: [
            { id: "missing-h1", detail: "page missing h1" },
            { id: "missing-meta", detail: "page missing meta" },
            { id: "broken-import", detail: "extra blocker added" },
          ],
          quality: [],
        });
      runLlmFixer.mockResolvedValue({
        fixedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <h1>Still bad</h1>; }\n```',
        fixedFiles: [],
        missingFiles: [],
        partial: false,
        success: true,
        durationMs: 50,
      });
      devLogAppend.mockClear();
      await finalizeAndSaveVersion(baseArgs());
      expect(runVerifierPass).toHaveBeenCalledTimes(2);
      const fixerLogCalls = devLogAppend.mock.calls.filter(
        (call) =>
          call[1] && typeof call[1] === "object" && (call[1] as { type?: string }).type === "verifier-pass.fixer",
      );
      expect(fixerLogCalls).toHaveLength(1);
      const fixerLogPayload = fixerLogCalls[0]?.[1] as Record<string, unknown>;
      expect(fixerLogPayload.success).toBe(false);
      expect(fixerLogPayload.fixerImproved).toBe(false);
      expect(fixerLogPayload.findingsBefore).toBe(2);
      expect(fixerLogPayload.findingsAfterRerun).toBe(3);
      expect(fixerLogPayload.repairGateSuccess).toBe(true);
    });

    it("SAJ-61 c5: rerun failure → keeps the original blockers so UI does not lie 'fixed'", async () => {
      // Pre-SAJ-61 the rerun-failure branch fell through to an optimistic
      // clear (`verifierBlockingFindings = []`). That meant the UI saw
      // `verifierBlocked: false` even though the verifier never had a chance
      // to confirm anything was actually fixed. The new behaviour is to
      // keep the original blocking findings — the version stays correctly
      // verifier-blocked until a clean rerun says otherwise.
      runVerifierPass
        .mockResolvedValueOnce({
          blocking: [{ id: "missing-h1", detail: "page missing h1" }],
          quality: [],
        })
        .mockRejectedValueOnce(new Error("rerun aborted"));
      runLlmFixer.mockResolvedValue({
        fixedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <h1>Hello</h1>; }\n```',
        fixedFiles: [],
        missingFiles: [],
        partial: false,
        success: true,
        durationMs: 50,
      });
      await finalizeAndSaveVersion(baseArgs());
      expect(runVerifierPass).toHaveBeenCalledTimes(2);
      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            preflight: expect.objectContaining({ verifierBlocked: true }),
          }),
        }),
      );
    });
  });
});
