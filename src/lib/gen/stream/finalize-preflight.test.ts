import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutoFix = vi.hoisted(() => vi.fn());
const buildPreviewHtml = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());
const repairGeneratedFiles = vi.hoisted(() => vi.fn());
const runProjectSanityChecks = vi.hoisted(() => vi.fn());
const parseFilesFromContent = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() => vi.fn());
const runLlmFixer = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/autofix/pipeline", () => ({
  runAutoFix,
}));

vi.mock("@/lib/gen/preview", () => ({
  buildPreviewHtml,
}));

vi.mock("@/lib/gen/project-scaffold", () => ({
  buildCompleteProject,
}));

vi.mock("@/lib/gen/repair-generated-files", () => ({
  repairGeneratedFiles,
}));

vi.mock("@/lib/gen/validation/project-sanity", () => ({
  runProjectSanityChecks,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseFilesFromContent,
}));

vi.mock("@/lib/gen/retry/validate-syntax", () => ({
  validateGeneratedCode,
}));

vi.mock("@/lib/gen/autofix/llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("@/lib/gen/post-process/image-materializer", () => ({
  materializeImages: vi.fn(),
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
}));

import { runFinalizePreflight } from "./finalize-preflight";

describe("runFinalizePreflight", () => {
  beforeEach(() => {
    runAutoFix.mockReset();
    buildPreviewHtml.mockReset();
    buildCompleteProject.mockReset();
    repairGeneratedFiles.mockReset();
    runProjectSanityChecks.mockReset();
    parseFilesFromContent.mockReset();
    validateGeneratedCode.mockReset();
    runLlmFixer.mockReset();

    repairGeneratedFiles.mockImplementation((files: unknown) => ({ files, fixes: [] }));
    buildCompleteProject.mockImplementation((files: unknown) => files);
    runProjectSanityChecks.mockReturnValue({ valid: true, issues: [] });
    validateGeneratedCode.mockResolvedValue({ valid: true, errors: [] });
    runLlmFixer.mockResolvedValue({ success: false });
    runAutoFix.mockResolvedValue({ fixedContent: "", fixes: [], warnings: [], dependencies: [] });
  });

  it("marks preview as blocked when no renderable page can be built", async () => {
    buildPreviewHtml.mockReturnValue(null);

    const result = await runFinalizePreflight({
      chatId: "chat_1",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "src/app/page.tsx",
          content: "export default function Page() { return <div>Hello</div>; }",
          language: "tsx",
        },
      ]),
    });

    expect(result.previewBlockingReason).toBe(
      "Automatic preflight could not build a renderable own-engine preview entrypoint.",
    );
    expect(result.preflightIssues).toContainEqual({
      file: "preview",
      severity: "error",
      message: "Automatic preflight could not build a renderable own-engine preview entrypoint.",
    });
  });

  it("preserves the thrown preview preparation error in the blocking reason", async () => {
    buildPreviewHtml.mockImplementation(() => {
      throw new Error("kaboom");
    });

    const result = await runFinalizePreflight({
      chatId: "chat_1",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "src/app/page.tsx",
          content: "export default function Page() { return <div>Hello</div>; }",
          language: "tsx",
        },
      ]),
    });

    expect(result.previewBlockingReason).toBe(
      "Automatic preflight failed while preparing preview: kaboom",
    );
    expect(result.preflightIssues).toContainEqual({
      file: "preview",
      severity: "error",
      message: "Automatic preflight failed while preparing preview: kaboom",
    });
  });

  it("keeps preview unblocked when only project sanity reports verification issues", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
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

    const result = await runFinalizePreflight({
      chatId: "chat_1",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "src/app/page.tsx",
          content: "export default function Page() { return <div>Hello</div>; }",
          language: "tsx",
        },
      ]),
    });

    expect(result.previewBlockingReason).toBeNull();
    expect(result.preflightIssues).toContainEqual({
      file: "src/app/page.tsx",
      severity: "error",
      message: "Missing required export",
    });
  });
});
