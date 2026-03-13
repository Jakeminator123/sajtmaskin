import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutoFix = vi.hoisted(() => vi.fn());
const validateAndFix = vi.hoisted(() => vi.fn());
const checkScaffoldImports = vi.hoisted(() => vi.fn());
const checkCrossFileImports = vi.hoisted(() => vi.fn());
const runProjectSanityChecks = vi.hoisted(() => vi.fn());
const expandUrls = vi.hoisted(() => vi.fn());
const materializeImages = vi.hoisted(() => vi.fn());
const buildPreviewHtml = vi.hoisted(() => vi.fn());
const buildPreviewUrl = vi.hoisted(() => vi.fn());
const repairGeneratedFiles = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const logGeneration = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/gen/preview", () => ({
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
  addMessage,
  createDraftVersion,
  logGeneration,
  failVersionVerification,
}));

vi.mock("@/lib/db/services", () => ({
  createEngineVersionErrorLogs,
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
    buildPreviewHtml.mockReset();
    buildPreviewUrl.mockReset();
    repairGeneratedFiles.mockReset();
    buildCompleteProject.mockReset();
    addMessage.mockReset();
    createDraftVersion.mockReset();
    logGeneration.mockReset();
    failVersionVerification.mockReset();
    createEngineVersionErrorLogs.mockReset();
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
      resolvedUrls: new Set<string>(),
      queries: [],
    });
    parseFilesFromContent.mockReturnValue(
      JSON.stringify([
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
    addMessage.mockResolvedValue({ id: "msg_1" });
    createDraftVersion.mockResolvedValue({ id: "ver_1" });
    logGeneration.mockResolvedValue({});
    failVersionVerification.mockResolvedValue({});
    createEngineVersionErrorLogs.mockResolvedValue([]);
    buildPreviewUrl.mockReturnValue("https://preview.example/chat_1/ver_1");
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

  it("keeps preview URLs when verification blockers do not prevent preview rendering", async () => {
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

    expect(result.previewUrl).toBe("https://preview.example/chat_1/ver_1");
    expect(result.preflight.previewBlocked).toBe(false);
    expect(result.preflight.verificationBlocked).toBe(true);
    expect(buildPreviewUrl).toHaveBeenCalledWith("chat_1", "ver_1");
    expect(logGeneration).toHaveBeenCalledWith(
      "chat_1",
      "gpt-5.4",
      { prompt: undefined, completion: undefined },
      expect.any(Number),
      false,
      "Automatic preflight found verification-blocking issues.",
    );
    expect(failVersionVerification).toHaveBeenCalledWith(
      "ver_1",
      "Automatic preflight found verification-blocking issues.",
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
    expect(result.preflight.previewBlocked).toBe(true);
    expect(result.preflight.previewBlockingReason).toBe(
      "Automatic preflight could not build a renderable own-engine preview entrypoint.",
    );
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
});
