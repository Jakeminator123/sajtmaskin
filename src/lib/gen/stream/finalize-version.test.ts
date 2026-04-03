import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutoFix = vi.hoisted(() => vi.fn());
const validateAndFix = vi.hoisted(() => vi.fn());
const checkScaffoldImports = vi.hoisted(() => vi.fn());
const checkCrossFileImports = vi.hoisted(() => vi.fn());
const runProjectSanityChecks = vi.hoisted(() => vi.fn());
const expandUrls = vi.hoisted(() => vi.fn());
const materializeImages = vi.hoisted(() => vi.fn());
const runPolishPass = vi.hoisted(() => vi.fn());
const isPolishPassEnabled = vi.hoisted(() => vi.fn());
const runVerifierPass = vi.hoisted(() => vi.fn());
const isVerifierPassEnabled = vi.hoisted(() => vi.fn());
const resolvePostGenerationPolishConfig = vi.hoisted(() => vi.fn());
const buildPreviewHtml = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());
const repairGeneratedFiles = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());
const addAssistantMessageAndCreateDraftVersion = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/gen/autofix/pipeline", () => ({
  runAutoFix,
}));

vi.mock("@/lib/gen/autofix/validate-and-fix", () => ({
  validateAndFix,
}));

vi.mock("@/lib/gen/autofix/rules/scaffold-import-checker", () => ({
  checkScaffoldImports,
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

vi.mock("@/lib/gen/polish-pass", () => ({
  runPolishPass,
  isPolishPassEnabled,
}));

vi.mock("@/lib/gen/verifier-pass", () => ({
  isVerifierPassEnabled,
  runVerifierPass,
}));

vi.mock("@/lib/gen/post-generation-config", () => ({
  resolvePostGenerationPolishConfig,
}));

vi.mock("@/lib/gen/preview/build-preview-document", () => ({
  buildPreviewHtml,
  buildPreviewUrl,
}));

vi.mock("@/lib/gen/repair-generated-files", () => ({
  repairGeneratedFiles,
}));

vi.mock("@/lib/gen/project-scaffold", () => ({
  buildCompleteProject,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  addAssistantMessageAndCreateDraftVersion,
  updateChatOrchestrationSnapshot,
  getChatOrchestrationSnapshot,
  addMessage,
  deleteEngineMessage,
  logGeneration,
  failVersionVerification,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
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

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
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
    validateAndFix.mockReset();
    checkScaffoldImports.mockReset();
    checkCrossFileImports.mockReset();
    runProjectSanityChecks.mockReset();
    expandUrls.mockReset();
    materializeImages.mockReset();
    runPolishPass.mockReset();
    isPolishPassEnabled.mockReset();
    runVerifierPass.mockReset();
    resolvePostGenerationPolishConfig.mockReset();
    buildPreviewHtml.mockReset();
    buildPreviewUrl.mockReset();
    repairGeneratedFiles.mockReset();
    buildCompleteProject.mockReset();
    addAssistantMessageAndCreateDraftVersion.mockReset();
    updateChatOrchestrationSnapshot.mockReset();
    getChatOrchestrationSnapshot.mockReset();
    addMessage.mockReset();
    deleteEngineMessage.mockReset();
    logGeneration.mockReset();
    failVersionVerification.mockReset();
    createEngineVersionErrorLogs.mockReset();
    createGenerationTelemetryRecord.mockReset();
    parseFilesFromContent.mockReset();
    mergeVersionFilesWithWarnings.mockReset();
    validateGeneratedCode.mockReset();

    runAutoFix.mockResolvedValue({
      fixedContent: '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
      fixes: [],
      warnings: [],
      dependencies: [],
    });
    validateAndFix.mockResolvedValue({
      content: '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: [],
      errorsAfter: [],
    });
    expandUrls.mockImplementation((value: string) => value);
    materializeImages.mockResolvedValue({
      content: '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
      replacedCount: 0,
      skippedCount: 0,
      resolvedUrls: new Set<string>(),
      queries: [],
    });
    runPolishPass.mockResolvedValue({
      applied: false,
      polishedContent: '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
      filesChanged: 0,
    });
    isPolishPassEnabled.mockReturnValue(true);
    isVerifierPassEnabled.mockReturnValue(true);
    runVerifierPass.mockResolvedValue({
      blocking: [],
      quality: [],
      polishCandidates: [],
    });
    resolvePostGenerationPolishConfig.mockReturnValue({
      maxOutputTokens: 16_000,
      timeoutMs: 45_000,
      maxFilesWhenUnscoped: 14,
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
          content: "export default function Page() { return <div>Hello</div>; }",
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
    checkScaffoldImports.mockImplementation((files: unknown) => ({
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

  it("does not call addMessage for assistant rows (avoids orphan assistant without version)", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
    );
    expect(deleteEngineMessage).not.toHaveBeenCalled();
  });

  it("emits a terminal autofix progress event even when autofix makes no changes", async () => {
    const progressEvents: Array<{ event: string; data: Record<string, unknown> }> = [];

    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      onProgress: (event, data) => progressEvents.push({ event, data }),
    });

    expect(progressEvents).toContainEqual({
      event: "autofix",
      data: { phase: "done", fixes: 0, warnings: 0 },
    });
  });

  it("emits no preview URL when sandbox is blocked and shim path is removed", async () => {
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
    expect(result.preflight.primaryPreviewTarget).toBe("sandbox");
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
      { rejectSignificantShrinks: true },
    );
    expect(checkScaffoldImports).toHaveBeenCalled();
  });

  it("skips merge and scaffold import checks for non-scaffold first generations", async () => {
    await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
    });

    expect(mergeVersionFilesWithWarnings).not.toHaveBeenCalled();
    expect(checkScaffoldImports).not.toHaveBeenCalled();
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
            sandbox: expect.objectContaining({
              canStartSandbox: true,
              primaryPreviewTarget: "sandbox",
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
          }),
        }),
      ]),
    );
  });

  it("skips deep-path image materialization and polish for light follow-up finalize", async () => {
    const progressEvents: Array<{ event: string; data: Record<string, unknown> }> = [];

    const result = await finalizeAndSaveVersion({
      accumulatedContent:
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
      chatId: "chat_1",
      model: "gpt-5.4",
      buildIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "copy",
        scaffoldFamily: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 12_000,
          refsChars: 4_000,
          systemContextChars: 18_000,
        },
      },
      resolvedScaffold: null,
      urlMap: {},
      startedAt: Date.now() - 500,
      onProgress: (event, data) => progressEvents.push({ event, data }),
    });

    expect(materializeImages).not.toHaveBeenCalled();
    expect(runVerifierPass).not.toHaveBeenCalled();
    expect(runPolishPass).not.toHaveBeenCalled();
    expect(result.telemetryRecordId).toBe("telemetry_1");
    expect(progressEvents).toContainEqual({
      event: "materialize_images",
      data: { phase: "skipped", reason: "light_followup_fast_policy" },
    });
    expect(progressEvents).toContainEqual({
      event: "verifier",
      data: { phase: "skipped", reason: "light_followup_fast_policy" },
    });
    expect(progressEvents).toContainEqual({
      event: "polish",
      data: { phase: "skipped", reason: "light_followup_fast_policy" },
    });
    expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGateResult: "preflight_passed",
        retryCount: 0,
        meta: expect.objectContaining({
          finalizePath: "fast-only",
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
    it("init with premium quality target records preflight_passed and fast+deep default telemetry", async () => {
      const result = await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldFamily: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "premium",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: {
            scaffoldChars: 12_000,
            refsChars: 4_000,
            systemContextChars: 18_000,
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
            finalizePath: "fast+deep",
            finalizePathReason: "default",
            postStreamSteps: expect.objectContaining({
              autofix: expect.objectContaining({ status: "done" }),
              url_expand: expect.objectContaining({ status: "done" }),
              materialize_images: expect.objectContaining({
                status: "done",
                maxReplacements: 4,
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
        maxReplacements: 4,
      });
      expect(runVerifierPass).toHaveBeenCalled();
      expect(result.telemetryRecordId).not.toBeNull();
    });

    it("skips polish when standard init has no verifier candidates or placeholder signal", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
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
          tokenBudgets: {
            scaffoldChars: 12_000,
            refsChars: 4_000,
            systemContextChars: 18_000,
          },
        },
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      expect(runVerifierPass).not.toHaveBeenCalled();
      expect(runPolishPass).not.toHaveBeenCalled();
      expect(materializeImages).toHaveBeenCalledWith(expect.any(String), {
        maxReplacements: 2,
      });
      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            postStreamSteps: expect.objectContaining({
              verifier: expect.objectContaining({
                status: "skipped",
                reason: "no_verifier_signal",
              }),
              polish: expect.objectContaining({
                status: "skipped",
                reason: "no_polish_signal",
              }),
            }),
          }),
        }),
      );
    });

    it("still runs polish when placeholder signals remain in the generated content", async () => {
      runAutoFix.mockResolvedValue({
        fixedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>[Company Name]</div>; }\n```',
        fixes: [],
        warnings: [],
        dependencies: [],
      });
      validateAndFix.mockResolvedValue({
        content:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>[Company Name]</div>; }\n```',
        fixerUsed: false,
        fixerImproved: false,
        errorsBefore: [],
        errorsAfter: [],
      });
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>[Company Name]</div>; }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
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
          tokenBudgets: {
            scaffoldChars: 12_000,
            refsChars: 4_000,
            systemContextChars: 18_000,
          },
        },
        resolvedScaffold: null,
        urlMap: {},
        startedAt: Date.now() - 500,
      });

      expect(runVerifierPass).not.toHaveBeenCalled();
      expect(runPolishPass).toHaveBeenCalled();
      expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            postStreamSteps: expect.objectContaining({
              verifier: expect.objectContaining({
                status: "skipped",
                reason: "no_verifier_signal",
              }),
              polish: expect.objectContaining({
                status: "done",
                trigger: "placeholder_signal",
              }),
            }),
          }),
        }),
      );
    });

    it("follow-up with fast verification skips materializeImages and records fast-only light_followup telemetry", async () => {
      await finalizeAndSaveVersion({
        accumulatedContent:
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
        chatId: "chat_1",
        model: "gpt-5.4",
        buildIntent: "website",
        buildSpec: {
          buildIntent: "website",
          generationMode: "followUp",
          changeScope: "copy",
          scaffoldFamily: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "fast",
          contextPolicy: "light",
          referenceCategories: ["marketing-sites"],
          forbiddenPatterns: ["leave_bracket_placeholders"],
          tokenBudgets: {
            scaffoldChars: 12_000,
            refsChars: 4_000,
            systemContextChars: 18_000,
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
            finalizePath: "fast-only",
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
              polish: expect.objectContaining({
                status: "skipped",
                reason: "light_followup_fast_policy",
              }),
            }),
          }),
        }),
      );
    });
  });
});
