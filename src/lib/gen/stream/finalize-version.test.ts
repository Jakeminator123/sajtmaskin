import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutoFix = vi.hoisted(() => vi.fn());
const runLlmFixer = vi.hoisted(() => vi.fn());
const validateAndFix = vi.hoisted(() => vi.fn());
const checkScaffoldImports = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/gen/autofix/llm-fixer", () => ({
  runLlmFixer,
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

vi.mock("@/lib/gen/verify/verifier-pass", () => ({
  isVerifierPassEnabled,
  runVerifierPass,
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
    runLlmFixer.mockReset();
    validateAndFix.mockReset();
    checkScaffoldImports.mockReset();
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
    runLlmFixer.mockResolvedValue({
      fixedContent: "",
      fixedFiles: [],
      missingFiles: [],
      partial: false,
      success: false,
      durationMs: 0,
    });
    validateAndFix.mockResolvedValue({
      content: '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
      content: '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
      expect.objectContaining({ lifecycleStage: "design" }),
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
      data: expect.objectContaining({ phase: "done", fixes: 0, warnings: 0 }),
    });
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
          category: "quality-gate:verifier",
          level: "warning",
          message:
            "`app/page.tsx` uses external next/image hosts without confirmed remotePatterns config.",
          meta: expect.objectContaining({
            verifierFindingId: "next-image-remote-patterns",
          }),
        }),
      ]),
    );
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
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
      '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```';
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
        '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
          '```tsx file="src/app/page.tsx"\nexport default function Page() { return <div>Hello</div>; }\n```',
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
});
