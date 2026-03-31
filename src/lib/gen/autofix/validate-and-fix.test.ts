import { beforeEach, describe, expect, it, vi } from "vitest";

const runLlmFixer = vi.hoisted(() => vi.fn());
const runAutoFix = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() => vi.fn());

vi.mock("./llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("./pipeline", () => ({
  runAutoFix,
}));

vi.mock("../retry/validate-syntax", () => ({
  validateGeneratedCode,
}));

import { validateAndFix } from "./validate-and-fix";

describe("validateAndFix", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    runAutoFix.mockReset();
    validateGeneratedCode.mockReset();
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
    expect(result.passes).toBe(0);
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

    runAutoFix.mockResolvedValueOnce({
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
    expect(runAutoFix).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("passed");
    expect(result.fixerUsed).toBe(true);
    expect(result.pipelineError).toBeNull();
  });
});
