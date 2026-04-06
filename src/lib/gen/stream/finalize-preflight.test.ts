import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutoFix = vi.hoisted(() => vi.fn());
const buildPreviewHtml = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());
const repairGeneratedFiles = vi.hoisted(() => vi.fn());
const runProjectSanityChecks = vi.hoisted(() => vi.fn());
const parseFilesFromContent = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() => vi.fn());
const runLlmFixer = vi.hoisted(() => vi.fn());
const runSeoPreflightChecks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/autofix/pipeline", () => ({
  runAutoFix,
}));

vi.mock("@/lib/gen/preview/build-preview-document", () => ({
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

vi.mock("@/lib/gen/validation/seo-preflight", () => ({
  runSeoPreflightChecks,
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
  function withMinimalBaseline(files: unknown): unknown {
    const arr = Array.isArray(files) ? [...files] : [];
    const typed = arr as Array<{ path: string; content: string; language?: string }>;
    const paths = new Set(typed.map((file) => file.path));

    if (!paths.has("package.json")) {
      typed.push({
        path: "package.json",
        content: JSON.stringify(
          {
            dependencies: {
              next: "16.2.1",
              react: "19.2.4",
              "react-dom": "19.2.4",
            },
            devDependencies: {
              typescript: "5.9.3",
            },
            scripts: {
              dev: "next dev",
              build: "next build",
            },
          },
          null,
          2,
        ),
        language: "json",
      });
    }

    if (!paths.has("app/layout.tsx") && !paths.has("src/app/layout.tsx")) {
      typed.push({
        path: "app/layout.tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
        language: "tsx",
      });
    }

    if (!paths.has("app/globals.css") && !paths.has("src/app/globals.css")) {
      typed.push({
        path: "app/globals.css",
        content: "@theme inline { --color-background: 0 0% 100%; }",
        language: "css",
      });
    }

    if (!paths.has("next-env.d.ts")) {
      typed.push({
        path: "next-env.d.ts",
        content: '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
        language: "ts",
      });
    }

    return typed;
  }

  beforeEach(() => {
    runAutoFix.mockReset();
    buildPreviewHtml.mockReset();
    buildCompleteProject.mockReset();
    repairGeneratedFiles.mockReset();
    runProjectSanityChecks.mockReset();
    runSeoPreflightChecks.mockReset();
    parseFilesFromContent.mockReset();
    validateGeneratedCode.mockReset();
    runLlmFixer.mockReset();

    repairGeneratedFiles.mockImplementation((files: unknown) => ({ files, fixes: [] }));
    buildCompleteProject.mockImplementation((files: unknown) => withMinimalBaseline(files));
    runProjectSanityChecks.mockReturnValue({ valid: true, issues: [] });
    runSeoPreflightChecks.mockReturnValue([]);
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
      category: "shim_preview_failure",
    });
    expect(result.previewStart.canStartPreview).toBe(true);
    expect(result.previewStart.primaryPreviewTarget).toBe("preview");
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
      category: "shim_preview_failure",
    });
    expect(result.previewStart.canStartPreview).toBe(true);
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
      category: "code_structure_failure",
    });
    expect(result.previewStart.canStartPreview).toBe(false);
    expect(result.previewStart.primaryPreviewTarget).toBe("none");
  });

  it("preserves explicit sanity categories instead of falling back to message heuristics", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    runProjectSanityChecks.mockReturnValue({
      valid: false,
      issues: [
        {
          file: "package.json",
          severity: "error",
          message: "Install validation failed",
          category: "dependency_install_failure",
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

    expect(result.preflightIssues).toContainEqual({
      file: "package.json",
      severity: "error",
      message: "Install validation failed",
      category: "dependency_install_failure",
    });
    expect(result.previewStart.canStartPreview).toBe(false);
    expect(result.previewStart.hasCriticalInstallRisk).toBe(true);
  });

  it("keeps preview eligible when SEO preflight only reports non-blocking quality issues", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    runSeoPreflightChecks.mockReturnValue([
      {
        file: "src/app/layout.tsx",
        severity: "error",
        code: "missing-title",
        message: "Metadata saknar title.",
        category: "non_blocking_quality_warning",
      },
    ]);

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

    expect(result.preflightIssues).toContainEqual({
      file: "src/app/layout.tsx",
      severity: "error",
      message: "Metadata saknar title.",
      category: "non_blocking_quality_warning",
    });
    expect(result.previewStart.canStartPreview).toBe(true);
    expect(result.previewStart.primaryPreviewTarget).toBe("preview");
  });
});
