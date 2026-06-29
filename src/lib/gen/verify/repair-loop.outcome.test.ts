import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirror the mocking strategy of repair-loop.preview-policy.test.ts: the LLM
// fixer and the esbuild-backed syntax validator are stubbed so the test fully
// controls what the loop observes. `runAutoFix` (the deterministic mechanical
// pipeline) runs for real — it is harmless on already-valid content.
const runLlmFixer = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/gen/retry/validate-syntax", () => ({ validateGeneratedCode }));

import { runRepairLoop } from "./repair-loop";

function file(path: string, content: string): string {
  return `\`\`\`tsx file="${path}"\n${content}\n\`\`\``;
}

// Syntactically valid page (no "( {") — the validator stub treats it as clean.
const validPage = file(
  "app/page.tsx",
  `export default function Page() {\n  return <main><h1>Acme</h1></main>;\n}`,
);
const validPageEdited = file(
  "app/page.tsx",
  `export default function Page() {\n  return <main><h1>Acme Inc</h1></main>;\n}`,
);

// A quality-gate (typecheck) failure that is NOT a syntax error: esbuild sees
// clean code, but the gate keeps failing. This is the "gate-only" failure mode
// that produced 0/16 promoted server-repairs with earlyStopReason=null (M#sr0).
const gateFailure = {
  check: "typecheck",
  exitCode: 1,
  output:
    "app/page.tsx(2,10): error TS2322: Type 'number' is not assignable to type 'string'.",
};

const fixerSucceedsWithChange = {
  fixedContent: validPageEdited,
  fixedFiles: ["app/page.tsx"],
  missingFiles: [],
  incompleteFiles: [],
  partial: false,
  success: true,
  aborted: false,
  durationMs: 1,
};

describe("runRepairLoop — non-promoted outcome is never silent (M#sr0)", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    validateGeneratedCode.mockClear();
  });

  it("sets earlyStopReason=no_improvement when the gate never passes (was null)", async () => {
    // The fixer 'succeeds' (returns changed, syntactically valid content) but
    // the quality gate keeps failing, so the version is never promoted. The
    // loop exits via the syntax-clean break, then the final gate also fails.
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);

    const result = await runRepairLoop({
      initialContent: validPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      // Gate never passes — neither the deterministic nor the final llm attempt.
      onAttemptPromotion: async () => ({ promoted: false }),
    });

    expect(result.promoted).toBe(false);
    expect(result.method).toBe("llm");
    expect(result.remainingErrors).toBe(0); // syntax clean — gate-only failure
    // The regression this guards: earlyStopReason used to be null here, which
    // is what made prod server-repairs look "silent".
    expect(result.earlyStopReason).toBe("no_improvement");
  });

  it("keeps earlyStopReason null when the repair actually converges (no regression)", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);

    const result = await runRepairLoop({
      initialContent: validPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      // Deterministic attempt fails, but the final llm gate passes → promoted.
      onAttemptPromotion: async (_content, method) =>
        method === "llm" ? { promoted: true } : { promoted: false },
    });

    expect(result.promoted).toBe(true);
    expect(result.method).toBe("llm");
    expect(result.earlyStopReason).toBeNull();
  });
});
