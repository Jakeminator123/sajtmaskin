import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./llm-fixer", () => ({
  runLlmFixer: vi.fn(),
}));
vi.mock("./pipeline", () => ({
  runAutoFix: vi.fn(),
}));
vi.mock("@/lib/models/phase-routing", () => ({
  resolvePhaseModel: vi.fn(() => ({ modelId: "test-model" })),
}));
vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
}));

import { runSharedRepair } from "./shared-repair";
import { runLlmFixer } from "./llm-fixer";
import { runAutoFix } from "./pipeline";
import type { RepairDiagnostic } from "./repair-diagnostics";

const mockLlmFixer = vi.mocked(runLlmFixer);
const mockAutoFix = vi.mocked(runAutoFix);

beforeEach(() => {
  vi.clearAllMocks();
  mockAutoFix.mockImplementation(async (content) => ({
    fixedContent: content,
    fixes: [],
    warnings: [],
    dependencies: {},
  }));
});

describe("runSharedRepair", () => {
  it("returns immediately when machine autofix clears all diagnostics", async () => {
    const validate = vi.fn().mockResolvedValue([]);
    const result = await runSharedRepair(
      "content",
      [{ source: "syntax", message: "error" }],
      validate,
      { chatId: "c1", model: "m1" },
    );
    expect(result.fixerUsed).toBe(false);
    expect(result.diagnosticsAfter).toBe(0);
    expect(mockLlmFixer).not.toHaveBeenCalled();
  });

  it("calls LLM fixer when machine autofix leaves errors", async () => {
    const diag: RepairDiagnostic = { source: "syntax", message: "error" };
    const validate = vi.fn()
      .mockResolvedValueOnce([diag])
      .mockResolvedValueOnce([]);
    mockLlmFixer.mockResolvedValueOnce({
      fixedContent: "fixed",
      fixedFiles: ["a.tsx"],
      success: true,
      durationMs: 100,
    });

    const result = await runSharedRepair(
      "content",
      [diag],
      validate,
      { chatId: "c1", model: "m1", maxPasses: 2 },
    );
    expect(result.fixerUsed).toBe(true);
    expect(result.diagnosticsAfter).toBe(0);
    expect(result.passes).toBe(1);
  });

  it("respects max passes budget", async () => {
    const diag: RepairDiagnostic = { source: "preview", message: "error" };
    const validate = vi.fn().mockResolvedValue([diag]);
    mockLlmFixer.mockResolvedValue({
      fixedContent: "still-broken",
      fixedFiles: ["a.tsx"],
      success: true,
      durationMs: 100,
    });

    const result = await runSharedRepair(
      "content",
      [diag],
      validate,
      { chatId: "c1", model: "m1", maxPasses: 2 },
    );
    expect(result.passes).toBeLessThanOrEqual(2);
    expect(result.diagnosticsAfter).toBeGreaterThan(0);
  });

  it("stops early when LLM fixer returns success: false", async () => {
    const diag: RepairDiagnostic = { source: "quality-gate", message: "build failed" };
    const validate = vi.fn().mockResolvedValue([diag]);
    mockLlmFixer.mockResolvedValueOnce({
      fixedContent: "content",
      fixedFiles: [],
      success: false,
      durationMs: 50,
    });

    const result = await runSharedRepair(
      "content",
      [diag],
      validate,
      { chatId: "c1", model: "m1", maxPasses: 3 },
    );
    expect(result.fixerUsed).toBe(false);
    expect(result.passes).toBe(1);
  });
});
