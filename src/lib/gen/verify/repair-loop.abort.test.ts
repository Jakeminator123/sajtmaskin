import { beforeEach, describe, expect, it, vi } from "vitest";

const runLlmFixer = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());
const runAutoFix = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() =>
  vi.fn(async (content: string) => {
    const broken = content.includes("( {");
    return broken
      ? {
          valid: false,
          errors: [
            { file: "app/page.tsx", line: 3, column: 33, message: "')' expected." },
          ],
          fileErrors: new Map<string, string[]>(),
        }
      : { valid: true, errors: [], fileErrors: new Map<string, string[]>() };
  }),
);

vi.mock("@/lib/gen/autofix/llm-fixer", () => ({ runLlmFixer }));
vi.mock("@/lib/logging/devLog", () => ({ devLogAppend }));
vi.mock("@/lib/gen/autofix/pipeline", () => ({ runAutoFix }));
vi.mock("@/lib/gen/retry/validate-syntax", () => ({ validateGeneratedCode }));

import { runRepairLoop } from "./repair-loop";

function file(path: string, content: string, lang = "tsx"): string {
  return `\`\`\`${lang} file="${path}"\n${content}\n\`\`\``;
}

const validPage = file(
  "app/page.tsx",
  `export default function Page() {\n  return <main><h1>Acme</h1></main>;\n}`,
);
const depEnrichedPage = file(
  "app/page.tsx",
  `export default function Page() {\n  return <main><h1>Acme Inc</h1></main>;\n}`,
);
const gateFailure = {
  check: "typecheck",
  exitCode: 1,
  output:
    "app/page.tsx(2,10): error TS2322: Type 'number' is not assignable to type 'string'.",
};

describe("runRepairLoop — LLM abort preserves deterministic progress (B2)", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    validateGeneratedCode.mockClear();
    runAutoFix.mockReset();
    runAutoFix.mockImplementation(async (content: string) => ({
      fixedContent: content,
      fixes: [],
    }));
  });

  it("does not report no_improvement when deterministic pre-pass changed content but LLM aborted", async () => {
    runAutoFix.mockImplementation(async (content: string, _opts?: unknown) => {
      if (content === validPage) {
        return {
          fixedContent: depEnrichedPage,
          fixes: [{ fixer: "dep-completer", file: "package.json" }],
        };
      }
      return { fixedContent: content, fixes: [] };
    });
    runLlmFixer
      .mockResolvedValueOnce({
        fixedContent: depEnrichedPage,
        fixedFiles: [],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: false,
        aborted: true,
        durationMs: 180_000,
      })
      .mockResolvedValueOnce({
        fixedContent: depEnrichedPage,
        fixedFiles: [],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: false,
        aborted: true,
        durationMs: 240_000,
      });

    const result = await runRepairLoop({
      initialContent: validPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 1,
      llmTimeoutMs: 1_000,
      llmRetryTimeoutMs: 2_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async () => ({ promoted: false }),
    });

    expect(result.promoted).toBe(false);
    expect(result.earlyStopReason).not.toBe("no_improvement");
    expect(result.earlyStopReason).toBe("time_budget_exceeded");
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "repair_loop.llm_abort",
        attempt: "primary",
        hasDeterministicProgress: true,
      }),
    );
  });

  it("retries with a targeted per-file bundle scoped to incomplete files", async () => {
    const multiFileBroken = [
      file(
        "app/page.tsx",
        `export default function Page() {\n  return <main><h1>Acme</h1></main>;\n}`,
      ),
      file(
        "app/api/contact/route.ts",
        `export async function POST() {\n  const resend = new Resend("x");\n  return Response.json({ ok: true });\n}`,
        "ts",
      ),
      file(
        "components/extra.tsx",
        `export function Extra() {\n  return <div>extra</div>;\n}`,
      ),
    ].join("\n\n");

    const contactOnlyBundle = file(
      "app/api/contact/route.ts",
      `export async function POST() {\n  const resend = new Resend("x");\n  return Response.json({ ok: true });\n}`,
      "ts",
    );

    runLlmFixer
      .mockResolvedValueOnce({
        fixedContent: contactOnlyBundle,
        fixedFiles: ["app/api/contact/route.ts"],
        missingFiles: [],
        incompleteFiles: [{ path: "app/api/contact/route.ts", reason: "unbalanced_delimiters" }],
        partial: true,
        success: false,
        aborted: false,
        durationMs: 100,
      })
      .mockResolvedValueOnce({
        fixedContent: contactOnlyBundle,
        fixedFiles: ["app/api/contact/route.ts"],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: true,
        aborted: false,
        durationMs: 50,
      });

    await runRepairLoop({
      initialContent: multiFileBroken,
      failedOutputs: [
        {
          check: "typecheck",
          exitCode: 1,
          output:
            "app/api/contact/route.ts(2,22): error TS2552: Cannot find name 'Resend'.",
        },
      ],
      contextLines: [],
      maxLlmPasses: 1,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: true,
      targetedRepairMaxFiles: 4,
      onAttemptPromotion: async () => ({ promoted: false }),
    });

    expect(runLlmFixer).toHaveBeenCalledTimes(2);
    const retryContent = runLlmFixer.mock.calls[1]?.[0] as string;
    expect(retryContent).toContain('file="app/api/contact/route.ts"');
    expect(retryContent).not.toContain('file="components/extra.tsx"');
  });
});
