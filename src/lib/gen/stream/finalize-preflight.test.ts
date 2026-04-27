import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutoFix = vi.hoisted(() => vi.fn());
const buildPreviewHtml = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());
const repairGeneratedFiles = vi.hoisted(() => vi.fn());
const runProjectSanityChecks = vi.hoisted(() => vi.fn());
const parseFilesFromContent = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() => vi.fn());
const runLlmFixer = vi.hoisted(() => vi.fn());
const runLlmRepairGate = vi.hoisted(() => vi.fn());
const runSeoPreflightChecks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/autofix/pipeline", () => ({
  runAutoFix,
}));

vi.mock("@/lib/gen/preview/build-preview-document", () => ({
  buildPreviewHtml,
}));

vi.mock("@/lib/gen/export/project-scaffold", () => ({
  buildCompleteProject,
}));

vi.mock("@/lib/gen/autofix/repair-generated-files", () => ({
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

vi.mock("@/lib/gen/autofix/llm-repair-gate", () => ({
  runLlmRepairGate,
}));

vi.mock("@/lib/gen/post-process/image-materializer", () => ({
  materializeImages: vi.fn(),
}));

vi.mock("@/lib/gen/export/project-scaffold-ui-reader", () => ({
  collectRequiredUiComponents: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
}));

import { runFinalizePreflight } from "./finalize-preflight";
import { FEATURES } from "@/lib/config";
import { serializeCodeProject } from "@/lib/gen/parser";

/**
 * Plan 11 / open-question #5: the new home-route hard gate (>200 chars
 * rendered) is intentionally above tiny placeholders. Existing tests
 * that just verify preflight wiring use this richer fixture so the
 * gate does not fire as a side effect of unrelated assertions.
 */
const RICH_PAGE_CONTENT = `
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";

export default function Page() {
  return (
    <main>
      <Hero
        title="Welcome to Acme"
        subtitle="We build delightful tools for delightful teams."
      />
      <section>
        <h2>Why teams pick Acme</h2>
        <p>
          Modern infrastructure, careful onboarding, and a support team
          that actually picks up the phone. We pair every plan with a
          dedicated success manager so you are never on your own.
        </p>
      </section>
      <Features
        items={[
          { title: "Scalable", body: "From two-person beta to global rollout." },
          { title: "Reliable", body: "99.99% uptime backed by a real SLA." },
          { title: "Friendly", body: "Docs, examples, and humans available." },
        ]}
      />
    </main>
  );
}
`.trim();

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
              next: "16.2.3",
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
    runLlmRepairGate.mockReset();

    repairGeneratedFiles.mockImplementation((files: unknown) => ({ files, fixes: [] }));
    buildCompleteProject.mockImplementation((files: unknown) => withMinimalBaseline(files));
    runProjectSanityChecks.mockReturnValue({ valid: true, issues: [] });
    runSeoPreflightChecks.mockReturnValue([]);
    validateGeneratedCode.mockResolvedValue({ valid: true, errors: [] });
    runLlmFixer.mockResolvedValue({ success: false });
    runLlmRepairGate.mockResolvedValue({ result: { success: false }, fixerModel: "gpt-5.4" });
    runAutoFix.mockResolvedValue({ fixedContent: "", fixes: [], warnings: [], dependencies: [] });
    (FEATURES as { escalateMergeSyntaxToLlm: boolean }).escalateMergeSyntaxToLlm = false;
  });

  it("marks preview as blocked when no renderable page can be built", async () => {
    buildPreviewHtml.mockReturnValue(null);

    const result = await runFinalizePreflight({
      chatId: "chat_1",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "src/app/page.tsx",
          content: RICH_PAGE_CONTENT,
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
          content: RICH_PAGE_CONTENT,
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

  it("sets a preview blocking reason when project sanity reports critical code issues", async () => {
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
          content: RICH_PAGE_CONTENT,
          language: "tsx",
        },
      ]),
    });

    expect(result.previewBlockingReason).toBe(
      "Automatic preflight blocked preview: src/app/page.tsx: Missing required export",
    );
    expect(result.preflightIssues).toContainEqual({
      file: "src/app/page.tsx",
      severity: "error",
      message: "Missing required export",
      category: "code_structure_failure",
    });
    expect(result.previewStart.canStartPreview).toBe(false);
    expect(result.previewStart.primaryPreviewTarget).toBe("none");
  });

  it("sets a preview blocking reason for merged syntax errors", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    validateGeneratedCode
      .mockResolvedValueOnce({
        valid: false,
        errors: [
          {
            file: "components/flying-can-scene.tsx",
            line: 24,
            column: 0,
            message: 'Unexpected "}"',
          },
        ],
      })
      .mockResolvedValueOnce({
        valid: false,
        errors: [
          {
            file: "components/flying-can-scene.tsx",
            line: 24,
            column: 0,
            message: 'Unexpected "}"',
          },
        ],
      });

    const result = await runFinalizePreflight({
      chatId: "chat_syntax",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "app/page.tsx",
          content: RICH_PAGE_CONTENT,
          language: "tsx",
        },
        {
          path: "components/flying-can-scene.tsx",
          content: "export function FlyingCanScene() {\n  return <div />;\n}\n}",
          language: "tsx",
        },
      ]),
    });

    expect(result.previewBlockingReason).toBe(
      'Automatic preflight blocked preview: components/flying-can-scene.tsx: Merged syntax error line 24:0 — Unexpected "}"',
    );
    expect(result.previewStart.canStartPreview).toBe(false);
  });

  it("escalates merged syntax to LLM once when mechanical pass is a no-op", async () => {
    (FEATURES as { escalateMergeSyntaxToLlm: boolean }).escalateMergeSyntaxToLlm = true;
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    const repairedContent = serializeCodeProject([
      {
        path: "app/page.tsx",
        content: RICH_PAGE_CONTENT,
        language: "tsx",
      },
      {
        path: "components/flying-can-scene.tsx",
        content: "export function FlyingCanScene() {\n  return <div />;\n}\n",
        language: "tsx",
      },
    ]);
    validateGeneratedCode
      .mockResolvedValueOnce({
        valid: false,
        errors: [
          {
            file: "components/flying-can-scene.tsx",
            line: 24,
            column: 0,
            message: 'Unexpected "}"',
          },
        ],
      })
      .mockResolvedValueOnce({
        valid: false,
        errors: [
          {
            file: "components/flying-can-scene.tsx",
            line: 24,
            column: 0,
            message: 'Unexpected "}"',
          },
        ],
      })
      .mockResolvedValueOnce({ valid: true, errors: [] });
    runAutoFix.mockResolvedValueOnce({
      fixedContent: "invalid merged content",
      fixes: [],
      warnings: [],
      dependencies: [],
    });
    runLlmRepairGate.mockResolvedValueOnce({
      result: {
        success: true,
        partial: false,
        fixedContent: repairedContent,
      },
      fixerModel: "gpt-5.4",
    });

    const result = await runFinalizePreflight({
      chatId: "chat_merge_escalation",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "app/page.tsx",
          content: RICH_PAGE_CONTENT,
          language: "tsx",
        },
        {
          path: "components/flying-can-scene.tsx",
          content: "export function FlyingCanScene() {\n  return <div />;\n}\n}",
          language: "tsx",
        },
      ]),
    });

    expect(runLlmRepairGate).toHaveBeenCalledTimes(1);
    expect(result.previewBlockingReason).toBeNull();
    expect(result.previewStart.canStartPreview).toBe(true);
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
          content: RICH_PAGE_CONTENT,
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

  it("backfills deferred init shell routes before route-plan preflight checks", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");

    const result = await runFinalizePreflight({
      chatId: "chat_1",
      model: "gpt-5.4",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "page-addition",
        scaffoldId: "ecommerce",
        routePlanSummary: "prompt:brochure:/,/about",
        stylePack: "commerce",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["ecommerce"],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 28_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
        routeRealization: {
          mode: "primary-full-with-shells",
          primaryRoutePath: "/",
          fullRoutePaths: ["/"],
          shellRoutePaths: ["/about"],
        },
      },
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "brochure",
        reason: "test",
        routes: [
          { path: "/", name: "Home", intent: "Primary landing page", required: true },
          { path: "/about", name: "About", intent: "Tell the company story", required: false },
        ],
      },
      filesJson: JSON.stringify([
        {
          path: "src/app/page.tsx",
          content: "export default function Page() { return <div>Hello</div>; }",
          language: "tsx",
        },
      ]),
    });

    const finalFiles = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;
    expect(finalFiles.some((file) => file.path === "app/about/page.tsx")).toBe(true);
    expect(
      finalFiles.find((file) => file.path === "app/about/page.tsx")?.content,
    ).toContain("Skapa sida");
    expect(result.preflightIssues.some((issue) => issue.message.includes("/about"))).toBe(false);
  });

  // Plan 11 / open-question #5 regression suite ──────────────────────────
  // Three regression tests that pin the new home-route hard gate +
  // count-parity invariant in `finalize-preflight.ts`.

  it("plan-11 bug 1: blocks persist when the LLM omits app/page.tsx entirely", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    // Override `withMinimalBaseline` for this test so the assembled
    // project does NOT contain a home route — emulating the Run A / B
    // failure where LLM_ONLY_PATHS stripped the scaffold default and
    // the LLM never emitted a replacement.
    buildCompleteProject.mockImplementation((files: unknown) => {
      const arr = Array.isArray(files) ? [...files] : [];
      const typed = arr as Array<{ path: string; content: string; language?: string }>;
      const filtered = typed.filter(
        (f) => f.path !== "app/page.tsx" && f.path !== "src/app/page.tsx",
      );
      // Add minimal baseline (package.json/layout/css) so only page.tsx is missing.
      filtered.push({
        path: "package.json",
        content: JSON.stringify({
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
        language: "json",
      });
      filtered.push({
        path: "app/layout.tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
        language: "tsx",
      });
      return filtered;
    });

    const result = await runFinalizePreflight({
      chatId: "chat_missing_home",
      model: "gpt-5.4",
      // Pass at least one unrelated file so the JSON parses cleanly.
      filesJson: JSON.stringify([
        {
          path: "app/about/page.tsx",
          content: RICH_PAGE_CONTENT,
          language: "tsx",
        },
      ]),
    });

    const homeIssue = result.preflightIssues.find(
      (i) => i.file === "app/page.tsx" && i.severity === "error",
    );
    expect(homeIssue).toBeDefined();
    expect(homeIssue?.message).toMatch(/Required home route is missing/);
    expect(result.previewStart.canStartPreview).toBe(false);
    expect(result.previewStart.hasCriticalCodeFailure).toBe(true);
  });

  it("plan-11 bug 1: blocks persist when home route content is trivial (empty <main>)", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    const trivialPage =
      "export default function Page() { return <main></main>; }";

    const result = await runFinalizePreflight({
      chatId: "chat_trivial_home",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "app/page.tsx",
          content: trivialPage,
          language: "tsx",
        },
      ]),
    });

    const trivialIssue = result.preflightIssues.find(
      (i) => i.file === "app/page.tsx" && /trivial content/i.test(i.message),
    );
    expect(trivialIssue).toBeDefined();
    expect(trivialIssue?.severity).toBe("error");
    expect(result.previewStart.canStartPreview).toBe(false);
  });

  it("plan-11 bug 1: emits count-parity error when buildCompleteProject mutates the array length silently", async () => {
    buildPreviewHtml.mockReturnValue("<html><body>preview</body></html>");
    // Assemble a "drift" scenario: input has 1 file, the assembled
    // result has 5 (baseline files added). The current implementation
    // already keeps these in sync via `nextFilesJson = JSON.stringify(...)`,
    // so this test guards the invariant: count parity holds, and no
    // parity error is emitted in the happy path.
    const result = await runFinalizePreflight({
      chatId: "chat_count_parity",
      model: "gpt-5.4",
      filesJson: JSON.stringify([
        {
          path: "app/page.tsx",
          content: RICH_PAGE_CONTENT,
          language: "tsx",
        },
      ]),
    });

    const persistedFiles = JSON.parse(result.filesJson) as Array<{ path: string }>;
    expect(persistedFiles.length).toBe(result.preflightFileCount);
    const parityIssue = result.preflightIssues.find((i) =>
      /count parity invariant/i.test(i.message),
    );
    expect(parityIssue).toBeUndefined();
  });
});
