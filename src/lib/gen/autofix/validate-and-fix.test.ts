import { beforeEach, describe, expect, it, vi } from "vitest";

const runLlmFixer = vi.hoisted(() => vi.fn());
const runAutoFix = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() => vi.fn());
const runPreVmTypecheck = vi.hoisted(() => vi.fn());
const formatTypecheckDiagnosticsForRepair = vi.hoisted(() =>
  vi.fn((diagnostics: Array<{ filePath: string; line: number; column: number; code: string; message: string }>) =>
    diagnostics.map((d) => `${d.filePath}:${d.line}:${d.column} ${d.code}: ${d.message}`),
  ),
);
const parseCodeProject = vi.hoisted(() => vi.fn((content: string) => ({ files: [{ path: "app/page.tsx", content }] })));

vi.mock("./llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("./pipeline", () => ({
  runAutoFix,
}));

vi.mock("../retry/validate-syntax", () => ({
  validateGeneratedCode,
}));

vi.mock("@/lib/gen/preview/warm-typecheck", () => ({
  runPreVmTypecheck,
  formatTypecheckDiagnosticsForRepair,
}));

vi.mock("@/lib/gen/parser", () => ({
  parseCodeProject,
}));

import { validateAndFix } from "./validate-and-fix";

const emptyAutoFixResult = {
  fixedContent: "",
  fixes: [],
  warnings: [],
  dependencies: {},
};

describe("validateAndFix", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    runAutoFix.mockReset();
    validateGeneratedCode.mockReset();
    runPreVmTypecheck.mockReset();

    runAutoFix.mockResolvedValue(emptyAutoFixResult);
    // Default: warm-tsc is not provisioned — skip silently. Tests that
    // exercise the tsc loop override per-call.
    runPreVmTypecheck.mockResolvedValue({
      ok: true,
      skipped: "cache_cold",
      diagnostics: [],
      durationMs: 0,
    });
  });

  it("returns explicit pipeline-error status when validation pipeline throws", async () => {
    validateGeneratedCode.mockRejectedValueOnce(new Error("validator crashed"));

    const result = await validateAndFix("```tsx file=\"app/page.tsx\"\nexport default function Page(){return null}\n```", {
      chatId: "chat_1",
      model: "gpt-5.4",
    });

    expect(result.status).toBe("pipeline-error");
    expect(result.hadErrors).toBe(true);
    expect(result.pipelineError).toContain("validator crashed");
    expect(result.earlyStopReason).toBeNull();
    expect(result.passes).toBe(0);
    expect(result.mechanicalFixCount).toBe(0);
    expect(result.llmFixCount).toBe(0);
    expect(result.residualPatterns).toEqual([]);
  });

  it("returns pipeline-error when syntax validator is unavailable", async () => {
    validateGeneratedCode.mockResolvedValueOnce({
      valid: false,
      errors: [
        {
          file: "__pipeline__",
          line: 0,
          column: 0,
          message: "Syntax validator unavailable: esbuild could not be loaded in this runtime.",
        },
      ],
    });

    const result = await validateAndFix(
      "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <main/>}\n```",
      {
        chatId: "chat_unavailable",
        model: "gpt-5.4",
      },
    );

    expect(result.status).toBe("pipeline-error");
    expect(result.pipelineError).toContain("Syntax validator unavailable");
    expect(runLlmFixer).not.toHaveBeenCalled();
    expect(result.mechanicalFixCount).toBe(0);
    expect(result.llmFixCount).toBe(0);
  });

  it("retries with partial fixer output and still accepts improved revalidation", async () => {
    validateGeneratedCode
      .mockResolvedValueOnce({
        valid: false,
        errors: [
          { file: "app/page.tsx", line: 10, column: 5, message: "Unexpected token" },
          { file: "app/layout.tsx", line: 3, column: 1, message: "Missing import" },
        ],
      })
      .mockResolvedValueOnce({
        valid: true,
        errors: [],
      });

    runLlmFixer.mockResolvedValueOnce({
      fixedContent:
        "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <main/>}\n```",
      fixedFiles: ["app/page.tsx"],
      missingFiles: ["app/layout.tsx"],
      partial: true,
      success: false,
      durationMs: 42,
    });

    runAutoFix
      .mockResolvedValueOnce(emptyAutoFixResult)
      .mockResolvedValueOnce({
        fixedContent:
          "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <main/>}\n```",
        fixes: [],
        warnings: [],
        dependencies: {},
      });

    const result = await validateAndFix(
      "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <div>broken</div>\n```",
      {
        chatId: "chat_1",
        model: "gpt-5.4",
      },
    );

    expect(runLlmFixer).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        requiredFiles: ["app/page.tsx", "app/layout.tsx"],
      }),
    );
    expect(runAutoFix).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("passed");
    expect(result.fixerUsed).toBe(true);
    expect(result.pipelineError).toBeNull();
    expect(result.llmFixCount).toBe(1);
  });

  it("stops early when the fixer returns no changed output", async () => {
    validateGeneratedCode.mockResolvedValueOnce({
      valid: false,
      errors: [{ file: "app/page.tsx", line: 10, column: 5, message: "Unexpected token" }],
    });

    runLlmFixer.mockResolvedValueOnce({
      fixedContent: "",
      fixedFiles: [],
      missingFiles: [],
      partial: false,
      success: false,
      durationMs: 25,
    });

    const result = await validateAndFix(
      "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <div>broken</div>\n```",
      {
        chatId: "chat_1",
        model: "gpt-5.4",
      },
    );

    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect(validateGeneratedCode).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
    expect(result.earlyStopReason).toBe("fixer_noop");
    expect(result.passes).toBe(1);
    expect(result.errorsAfter).toBe(1);
    expect(result.mechanicalFixCount).toBe(0);
    expect(result.llmFixCount).toBe(0);
  });

  it("skips initial mechanical pass when alreadyMechanicallyFixed is true", async () => {
    validateGeneratedCode.mockResolvedValueOnce({ valid: true, errors: [] });

    const content = "```tsx file=\"app/page.tsx\"\nexport default function P(){return <main/>}\n```";
    const result = await validateAndFix(content, {
      chatId: "chat_skip",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
    });

    expect(runAutoFix).not.toHaveBeenCalled();
    expect(result.status).toBe("passed");
    expect(result.content).toBe(content);
    expect(result.mechanicalFixCount).toBe(0);
  });

  it("runs warm-tsc post-pass and feeds diagnostics into runLlmFixer when esbuild passes but tsc fails", async () => {
    const cleanContent =
      '```tsx file="app/page.tsx"\nexport default function P(){return <main/>}\n```';
    validateGeneratedCode.mockResolvedValueOnce({ valid: true, errors: [] });
    runPreVmTypecheck.mockResolvedValueOnce({
      ok: false,
      diagnostics: [
        {
          filePath: "app/page.tsx",
          line: 1,
          column: 1,
          code: "TS2304",
          message: "Cannot find name 'Foo'.",
        },
      ],
      durationMs: 12,
    });
    runLlmFixer.mockResolvedValueOnce({
      fixedContent: cleanContent,
      fixedFiles: ["app/page.tsx"],
      missingFiles: [],
      partial: false,
      success: true,
      durationMs: 30,
    });
    runAutoFix.mockResolvedValueOnce({
      fixedContent: cleanContent,
      fixes: [],
      warnings: [],
      dependencies: {},
    });

    const result = await validateAndFix(cleanContent, {
      chatId: "chat_tsc",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
      resolvedScaffold: { id: "scaffold_x", files: [] } as never,
    });

    expect(runPreVmTypecheck).toHaveBeenCalledWith(
      expect.objectContaining({ scaffoldId: "scaffold_x", force: false }),
    );
    expect(runLlmFixer).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining("TS2304")]),
      expect.objectContaining({ abortSignal: expect.any(Object) }),
    );
    expect(result.status).toBe("passed");
    expect(result.tsc).toEqual(
      expect.objectContaining({ ran: true, repaired: true, diagnosticCount: 1 }),
    );
    expect(result.fixerUsed).toBe(true);
  });

  it("forces tsc when forceTsc=true even without scaffold", async () => {
    const cleanContent =
      '```tsx file="app/page.tsx"\nexport default function P(){return <main/>}\n```';
    validateGeneratedCode.mockResolvedValueOnce({ valid: true, errors: [] });
    runPreVmTypecheck.mockResolvedValueOnce({
      ok: true,
      diagnostics: [],
      durationMs: 5,
    });

    const result = await validateAndFix(cleanContent, {
      chatId: "chat_force_tsc",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
      forceTsc: true,
    });

    expect(runPreVmTypecheck).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
    expect(result.tsc).toEqual(
      expect.objectContaining({ ran: true, diagnosticCount: 0, repaired: false }),
    );
  });

  it("stops early when a fixer pass does not reduce error count", async () => {
    validateGeneratedCode
      .mockResolvedValueOnce({
        valid: false,
        errors: [{ file: "app/page.tsx", line: 10, column: 5, message: "Unexpected token" }],
      })
      .mockResolvedValueOnce({
        valid: false,
        errors: [{ file: "app/page.tsx", line: 10, column: 5, message: "Unexpected token" }],
      });

    runLlmFixer.mockResolvedValueOnce({
      fixedContent:
        "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <main>still broken</main>\n```",
      fixedFiles: ["app/page.tsx"],
      missingFiles: [],
      partial: false,
      success: true,
      durationMs: 35,
    });

    runAutoFix
      .mockResolvedValueOnce(emptyAutoFixResult)
      .mockResolvedValueOnce({
        fixedContent:
          "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <main>still broken</main>\n```",
        fixes: [],
        warnings: [],
        dependencies: {},
      });

    const result = await validateAndFix(
      "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <div>broken</div>\n```",
      {
        chatId: "chat_1",
        model: "gpt-5.4",
      },
    );

    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect(validateGeneratedCode).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("failed");
    expect(result.fixerUsed).toBe(true);
    expect(result.fixerImproved).toBe(false);
    expect(result.earlyStopReason).toBe("no_improvement");
    expect(result.errorsAfter).toBe(1);
    expect(result.residualPatterns.length).toBeGreaterThanOrEqual(0);
  });
});
