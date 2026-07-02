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
const runDeterministicImportRepair = vi.hoisted(() => vi.fn());

vi.mock("./llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("./deterministic-import-repair", () => ({
  runDeterministicImportRepair,
}));

// Wrap (not replace) the repair gate so call arguments — e.g. the threaded
// `scopeId` — are assertable while the real gating/ledger logic still runs.
const runLlmRepairGateSpy = vi.hoisted(() => vi.fn());
vi.mock("./llm-repair-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm-repair-gate")>();
  runLlmRepairGateSpy.mockImplementation(actual.runLlmRepairGate);
  return {
    ...actual,
    runLlmRepairGate: runLlmRepairGateSpy,
  };
});

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
    runDeterministicImportRepair.mockReset();
    runLlmRepairGateSpy.mockClear();

    runAutoFix.mockResolvedValue(emptyAutoFixResult);
    // Default: warm-tsc is not provisioned — skip silently. Tests that
    // exercise the tsc loop override per-call.
    runPreVmTypecheck.mockResolvedValue({
      ok: true,
      skipped: "cache_cold",
      diagnostics: [],
      durationMs: 0,
    });
    // Default: deterministic import-repair finds nothing resolvable.
    runDeterministicImportRepair.mockImplementation((content: string) => ({
      content,
      fixed: false,
      fixes: [],
      handledCodes: [],
    }));
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

  it("resolves warm-tsc import diagnostics deterministically WITHOUT any LLM call", async () => {
    // Fas 1 kontrollflöde: TS2304 on a known library name (Badge) at warm-tsc
    // failure is fixed mechanically and re-checked — `runLlmRepairGate` /
    // `runLlmFixer` must never be invoked when the deterministic pass
    // resolves everything.
    const cleanContent =
      '```tsx file="app/page.tsx"\nexport default function P(){return <Badge>x</Badge>}\n```';
    const repairedContent =
      '```tsx file="app/page.tsx"\nimport { Badge } from "@/components/ui/badge"\nexport default function P(){return <Badge>x</Badge>}\n```';
    validateGeneratedCode.mockResolvedValueOnce({ valid: true, errors: [] });
    runPreVmTypecheck
      .mockResolvedValueOnce({
        ok: false,
        diagnostics: [
          {
            filePath: "app/page.tsx",
            line: 2,
            column: 30,
            code: "TS2304",
            message: "Cannot find name 'Badge'.",
          },
        ],
        durationMs: 10,
      })
      .mockResolvedValueOnce({ ok: true, diagnostics: [], durationMs: 5 });
    runDeterministicImportRepair.mockReturnValueOnce({
      content: repairedContent,
      fixed: true,
      fixes: [
        {
          fixer: "ts2304-known-import-fixer",
          category: "mechanical",
          description: "Added known import(s) for Badge (@/components/ui/badge)",
          file: "app/page.tsx",
        },
      ],
      handledCodes: ["TS2304"],
    });

    const result = await validateAndFix(cleanContent, {
      chatId: "chat_det",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
      resolvedScaffold: { id: "scaffold_x", files: [] } as never,
      previewPolicy: "fidelity2",
    });

    expect(runDeterministicImportRepair).toHaveBeenCalledWith(
      cleanContent,
      [{ file: "app/page.tsx", message: "Cannot find name 'Badge'." }],
      { previewPolicy: "fidelity2" },
    );
    // Exactly ONE extra warm-tsc pass (initial + re-check), no loop.
    expect(runPreVmTypecheck).toHaveBeenCalledTimes(2);
    expect(runLlmRepairGateSpy).not.toHaveBeenCalled();
    expect(runLlmFixer).not.toHaveBeenCalled();
    expect(result.status).toBe("passed");
    expect(result.content).toBe(repairedContent);
    expect(result.tsc).toEqual(
      expect.objectContaining({ ran: true, repaired: true, diagnosticCount: 1 }),
    );
    expect(result.mechanicalFixCount).toBe(1);
    expect(result.llmFixCount).toBe(0);
  });

  it("hands only the residual diagnostics to the LLM after a partial deterministic fix", async () => {
    const cleanContent =
      '```tsx file="app/page.tsx"\nexport default function P(){return <main/>}\n```';
    const partiallyRepaired =
      '```tsx file="app/page.tsx"\nimport { Badge } from "@/components/ui/badge"\nexport default function P(){return <main/>}\n```';
    validateGeneratedCode.mockResolvedValueOnce({ valid: true, errors: [] });
    runPreVmTypecheck
      .mockResolvedValueOnce({
        ok: false,
        diagnostics: [
          {
            filePath: "app/page.tsx",
            line: 1,
            column: 1,
            code: "TS2304",
            message: "Cannot find name 'Badge'.",
          },
          {
            filePath: "app/page.tsx",
            line: 3,
            column: 1,
            code: "TS2554",
            message: "Expected 1 arguments, but got 0.",
          },
        ],
        durationMs: 10,
      })
      .mockResolvedValueOnce({
        ok: false,
        diagnostics: [
          {
            filePath: "app/page.tsx",
            line: 3,
            column: 1,
            code: "TS2554",
            message: "Expected 1 arguments, but got 0.",
          },
        ],
        durationMs: 5,
      });
    runDeterministicImportRepair.mockReturnValueOnce({
      content: partiallyRepaired,
      fixed: true,
      fixes: [
        {
          fixer: "ts2304-known-import-fixer",
          category: "mechanical",
          description: "Added known import(s) for Badge (@/components/ui/badge)",
          file: "app/page.tsx",
        },
      ],
      handledCodes: ["TS2304"],
    });
    runLlmFixer.mockResolvedValueOnce({
      fixedContent: partiallyRepaired,
      fixedFiles: ["app/page.tsx"],
      missingFiles: [],
      partial: false,
      success: true,
      durationMs: 30,
    });
    runAutoFix.mockResolvedValueOnce({
      fixedContent: partiallyRepaired,
      fixes: [],
      warnings: [],
      dependencies: {},
    });

    const result = await validateAndFix(cleanContent, {
      chatId: "chat_det_residual",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
      resolvedScaffold: { id: "scaffold_x", files: [] } as never,
    });

    // The LLM sees the deterministically repaired content and ONLY the
    // residual (non-import) diagnostic — the resolved TS2304 is gone.
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    const [llmContent, llmErrors] = runLlmFixer.mock.calls[0];
    expect(llmContent).toBe(partiallyRepaired);
    expect(llmErrors.join("\n")).toContain("TS2554");
    expect(llmErrors.join("\n")).not.toContain("Badge");
    expect(result.status).toBe("passed");
    expect(result.tsc).toEqual(
      expect.objectContaining({ ran: true, repaired: true, diagnosticCount: 2 }),
    );
  });

  it("drops unverified deterministic fixes when the warm-tsc re-check is unavailable (content/diagnostics stay in sync)", async () => {
    // Bugbot #363: if the re-check after the deterministic repair is skipped
    // (cache cold / budget), the LLM must NOT see repaired content paired
    // with pre-repair diagnostics — both fall back to the originals.
    const cleanContent =
      '```tsx file="app/page.tsx"\nexport default function P(){return <main/>}\n```';
    const repairedContent =
      '```tsx file="app/page.tsx"\nimport { Badge } from "@/components/ui/badge"\nexport default function P(){return <main/>}\n```';
    validateGeneratedCode.mockResolvedValueOnce({ valid: true, errors: [] });
    runPreVmTypecheck
      .mockResolvedValueOnce({
        ok: false,
        diagnostics: [
          {
            filePath: "app/page.tsx",
            line: 1,
            column: 1,
            code: "TS2304",
            message: "Cannot find name 'Badge'.",
          },
        ],
        durationMs: 10,
      })
      .mockResolvedValueOnce({
        ok: true,
        skipped: "cache_cold",
        diagnostics: [],
        durationMs: 0,
      });
    runDeterministicImportRepair.mockReturnValueOnce({
      content: repairedContent,
      fixed: true,
      fixes: [
        {
          fixer: "ts2304-known-import-fixer",
          category: "mechanical",
          description: "Added known import(s) for Badge (@/components/ui/badge)",
          file: "app/page.tsx",
        },
      ],
      handledCodes: ["TS2304"],
    });
    runLlmFixer.mockResolvedValueOnce({
      fixedContent: "",
      fixedFiles: [],
      missingFiles: [],
      partial: false,
      success: false,
      durationMs: 5,
    });

    const result = await validateAndFix(cleanContent, {
      chatId: "chat_det_unverified",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
      resolvedScaffold: { id: "scaffold_x", files: [] } as never,
    });

    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    const [llmContent, llmErrors] = runLlmFixer.mock.calls[0];
    expect(llmContent).toBe(cleanContent);
    expect(llmErrors.join("\n")).toContain("Badge");
    // Unverified deterministic output is dropped entirely.
    expect(result.content).toBe(cleanContent);
    expect(result.mechanicalFixCount).toBe(0);
    expect(result.tsc).toEqual(
      expect.objectContaining({ ran: true, repaired: false, diagnosticCount: 1 }),
    );
  });

  it("threads repairScopeId into the warm-tsc repair gate", async () => {
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
          code: "TS2554",
          message: "Expected 1 arguments, but got 0.",
        },
      ],
      durationMs: 10,
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

    await validateAndFix(cleanContent, {
      chatId: "chat_scope",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
      resolvedScaffold: { id: "scaffold_x", files: [] } as never,
      repairScopeId: "version_v42",
    });

    expect(runLlmRepairGateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scopeId: "version_v42", phase: "warm-tsc" }),
    );
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

  it("skips warm-tsc when skipWarmTsc=true (quality-gate will typecheck later)", async () => {
    const cleanContent =
      '```tsx file="app/page.tsx"\nexport default function P(){return <main/>}\n```';
    validateGeneratedCode.mockResolvedValueOnce({ valid: true, errors: [] });

    const result = await validateAndFix(cleanContent, {
      chatId: "chat_skip_tsc",
      model: "gpt-5.4",
      alreadyMechanicallyFixed: true,
      resolvedScaffold: { id: "scaffold_x", files: [] } as never,
      skipWarmTsc: true,
    });

    expect(runPreVmTypecheck).not.toHaveBeenCalled();
    expect(result.tsc).toEqual(
      expect.objectContaining({ ran: false, skipped: "quality_gate_planned" }),
    );
    expect(result.status).toBe("passed");
  });

  it("invokes the LLM fixer on the final pass too (regression: was dead code when pass === SYNTAX_FIX_MAX_PASSES)", async () => {
    // Each pass: validate → fixer (improves) → reValidate (one fewer error).
    // With the bug, the gave-up branch fired before the fixer on the final
    // pass; with the fix, the fixer runs every pass within the loop budget.
    // Manifest default for syntaxFixPasses is 4; we mock four full pass
    // cycles (validate + reValidate) and four fixer responses.
    const initialContent = '```tsx file="app/page.tsx"\nbroken\n```';
    const improvedContent = '```tsx file="app/page.tsx"\nbetter\n```';

    for (let pass = 1; pass <= 4; pass++) {
      validateGeneratedCode
        .mockResolvedValueOnce({
          valid: false,
          errors: Array.from({ length: 5 - (pass - 1) }, () => ({
            file: "app/page.tsx",
            line: pass,
            column: 1,
            message: `err pass${pass}`,
          })),
        })
        .mockResolvedValueOnce({
          valid: false,
          errors: Array.from({ length: 5 - pass }, () => ({
            file: "app/page.tsx",
            line: pass,
            column: 1,
            message: `err pass${pass}`,
          })),
        });
    }

    for (let i = 0; i < 4; i++) {
      runLlmFixer.mockResolvedValueOnce({
        fixedContent: improvedContent,
        fixedFiles: ["app/page.tsx"],
        missingFiles: [],
        partial: false,
        success: true,
        durationMs: 10,
      });
    }

    // runAutoFix is called once for the initial mech pass + once after each
    // successful LLM fixer attempt = 1 + 4 = 5 invocations.
    for (let i = 0; i < 5; i++) {
      runAutoFix.mockResolvedValueOnce({
        fixedContent: improvedContent,
        fixes: [],
        warnings: [],
        dependencies: {},
      });
    }

    const result = await validateAndFix(initialContent, {
      chatId: "chat_multi_pass",
      model: "gpt-5.4",
    });

    expect(runLlmFixer).toHaveBeenCalledTimes(4);
    expect(result.passes).toBe(4);
    expect(result.fixerUsed).toBe(true);
    expect(result.fixerImproved).toBe(true);
    // Final reValidate (pass 4) leaves 1 residual error, so we end "partial",
    // never "passed", and never short-circuit before the fixer runs.
    expect(result.status).toBe("partial");
    expect(result.errorsAfter).toBe(1);
  });

  it("uses all syntax-fix passes before giving up on repeated no-improvement", async () => {
    for (let pass = 1; pass <= 4; pass++) {
      validateGeneratedCode
        .mockResolvedValueOnce({
          valid: false,
          errors: [{ file: "app/page.tsx", line: pass, column: 5, message: "Unexpected token" }],
        })
        .mockResolvedValueOnce({
          valid: false,
          errors: [{ file: "app/page.tsx", line: pass, column: 5, message: "Unexpected token" }],
        });
    }

    for (let pass = 1; pass <= 4; pass++) {
      runLlmFixer.mockResolvedValueOnce({
        fixedContent:
          "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <main>still broken</main>\n```",
        fixedFiles: ["app/page.tsx"],
        missingFiles: [],
        partial: false,
        success: true,
        durationMs: 35,
      });
    }

    runAutoFix.mockResolvedValueOnce(emptyAutoFixResult);
    for (let pass = 1; pass <= 4; pass++) {
      runAutoFix.mockResolvedValueOnce({
        fixedContent:
          "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <main>still broken</main>\n```",
        fixes: [],
        warnings: [],
        dependencies: {},
      });
    }

    const result = await validateAndFix(
      "```tsx file=\"app/page.tsx\"\nexport default function Page(){return <div>broken</div>\n```",
      {
        chatId: "chat_1",
        model: "gpt-5.4",
      },
    );

    expect(runLlmFixer).toHaveBeenCalledTimes(4);
    expect(validateGeneratedCode).toHaveBeenCalledTimes(8);
    expect(result.status).toBe("failed");
    expect(result.passes).toBe(4);
    expect(result.fixerUsed).toBe(true);
    expect(result.fixerImproved).toBe(false);
    expect(result.earlyStopReason).toBe("no_improvement");
    expect(result.errorsAfter).toBe(1);
    expect(result.residualPatterns.length).toBeGreaterThanOrEqual(0);
  });

  it("restarts next pass from bestContent after a regression", async () => {
    const bestContent =
      '```tsx file="app/page.tsx"\nexport default function Page(){return <main>best</main>}\n```';
    const worseContent =
      '```tsx file="app/page.tsx"\nexport default function Page(){return <main>worse</main>\n```';

    validateGeneratedCode
      .mockResolvedValueOnce({
        valid: false,
        errors: [{ file: "app/page.tsx", line: 1, column: 1, message: "one error" }],
      })
      .mockResolvedValueOnce({
        valid: false,
        errors: [
          { file: "app/page.tsx", line: 1, column: 1, message: "error a" },
          { file: "app/page.tsx", line: 2, column: 1, message: "error b" },
        ],
      })
      .mockResolvedValueOnce({
        valid: false,
        errors: [{ file: "app/page.tsx", line: 1, column: 1, message: "one error" }],
      });

    runLlmFixer
      .mockResolvedValueOnce({
        fixedContent: worseContent,
        fixedFiles: ["app/page.tsx"],
        missingFiles: [],
        partial: false,
        success: true,
        durationMs: 10,
      })
      .mockResolvedValueOnce({
        fixedContent: "",
        fixedFiles: [],
        missingFiles: [],
        partial: false,
        success: false,
        durationMs: 10,
      });

    runAutoFix
      .mockResolvedValueOnce({
        fixedContent: bestContent,
        fixes: [],
        warnings: [],
        dependencies: {},
      })
      .mockResolvedValueOnce({
        fixedContent: worseContent,
        fixes: [],
        warnings: [],
        dependencies: {},
      });

    const result = await validateAndFix(bestContent, {
      chatId: "chat_regression",
      model: "gpt-5.4",
    });

    expect(validateGeneratedCode).toHaveBeenNthCalledWith(3, bestContent);
    expect(validateGeneratedCode).not.toHaveBeenNthCalledWith(3, worseContent);
    expect(result.earlyStopReason).toBe("fixer_noop");
  });
});
