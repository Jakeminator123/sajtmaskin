import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirror the mocking strategy of repair-loop.preview-policy.test.ts: the LLM
// fixer and the esbuild-backed syntax validator are stubbed so the test fully
// controls what the loop observes. `runAutoFix` (the deterministic mechanical
// pipeline) runs for real — it is harmless on already-valid content.
const runLlmFixer = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());
const appendErrorLogEvent = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/logging/error-log-rag", () => ({ appendErrorLogEvent }));
vi.mock("@/lib/gen/retry/validate-syntax", () => ({ validateGeneratedCode }));

import { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import { runRepairLoop, type RepairMethod } from "./repair-loop";

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

describe("runRepairLoop — tsc origin diagnostics reach the fixer as PRIMARY structured lines (Fas 3)", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    validateGeneratedCode.mockClear();
  });

  it("feeds the tsc diagnostic (with its TS code) in file:line:col form", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);

    await runRepairLoop({
      initialContent: validPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 1,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async () => ({ promoted: false }),
    });

    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    const errorsArg = runLlmFixer.mock.calls[0]?.[1] as string[];
    // `file:line:col message` is the structured shape buildFixerUserPrompt
    // promotes to "Primary blocking diagnostics" — and the TSxxxx code must
    // survive (the generic diagnostics parser strips it).
    expect(errorsArg).toContain(
      "app/page.tsx:2:10 error TS2322: Type 'number' is not assignable to type 'string'.",
    );
  });
});

describe("runRepairLoop — cross-lane ledger dedupe (Fas 3 RepairGate)", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    validateGeneratedCode.mockClear();
  });

  const loopParams = (ledger: RepairLedger, initialContent: string) => ({
    initialContent,
    failedOutputs: [gateFailure],
    contextLines: [],
    maxLlmPasses: 2,
    llmTimeoutMs: 1_000,
    enableTargetedRepair: false,
    repairLedger: ledger,
    repairScopeId: "ver_1:root",
    onAttemptPromotion: async () => ({ promoted: false }),
  });

  it("skips the LLM when the shared ledger already holds the same content+diagnostics (deduped → fixer_noop)", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);
    const ledger = new RepairLedger();

    // "Finalize lane": first run records the repair attempt in the ledger.
    const first = await runRepairLoop(loopParams(ledger, validPage));
    expect(first.promoted).toBe(false);
    expect(runLlmFixer).toHaveBeenCalledTimes(1);

    // "Server-repair lane": identical content + identical diagnostics with the
    // SAME shared ledger + scope → the gate dedupes; no second LLM call.
    const second = await runRepairLoop(loopParams(ledger, validPage));
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect(second.promoted).toBe(false);
    expect(second.earlyStopReason).toBe("fixer_noop");
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({ type: "llm_repair_gate.deduped", scopeId: "ver_1:root" }),
    );
  });

  it("allows a legitimate retry on NEW content (contentHash differs)", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);
    const ledger = new RepairLedger();

    await runRepairLoop(loopParams(ledger, validPage));
    expect(runLlmFixer).toHaveBeenCalledTimes(1);

    // Same diagnostics but the project content changed → new ledger key.
    await runRepairLoop(loopParams(ledger, validPageEdited));
    expect(runLlmFixer).toHaveBeenCalledTimes(2);
  });
});

describe("runRepairLoop — base-aware early abort (Fas 3 superseded)", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    validateGeneratedCode.mockClear();
  });

  it("aborts BEFORE the first LLM pass when the version is already superseded", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);
    const promotionAttempts: RepairMethod[] = [];

    const result = await runRepairLoop({
      initialContent: validPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      shouldAbortSuperseded: async () => true,
      onAttemptPromotion: async (_content, method) => {
        promotionAttempts.push(method);
        return { promoted: false };
      },
    });

    expect(result.promoted).toBe(false);
    expect(result.earlyStopReason).toBe("superseded");
    // No LLM pass was spent on a version whose result would be discarded.
    expect(runLlmFixer).not.toHaveBeenCalled();
    // The FINAL verify gate is also skipped: only the early deterministic
    // attempt ran (it precedes the superseded check by design — its save is
    // base-bound anyway); no "llm" promotion attempt.
    expect(promotionAttempts).not.toContain("llm");
  });

  it("aborts between the last pass and the final verify gate when superseded mid-repair", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);
    const promotionAttempts: RepairMethod[] = [];
    let checks = 0;
    // Pass-start check (1st call) → not superseded; pre-final-gate check
    // (2nd call) → superseded (a newer version landed while the LLM ran).
    const shouldAbortSuperseded = async () => ++checks > 1;

    const result = await runRepairLoop({
      initialContent: validPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      shouldAbortSuperseded,
      onAttemptPromotion: async (_content, method) => {
        promotionAttempts.push(method);
        return { promoted: false };
      },
    });

    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect(result.promoted).toBe(false);
    expect(result.earlyStopReason).toBe("superseded");
    expect(promotionAttempts).not.toContain("llm");
  });
});

describe("runRepairLoop — TF-IDF error-log RAG producer coverage (best-effort)", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    appendErrorLogEvent.mockReset();
    validateGeneratedCode.mockClear();
  });

  it("logs a fixed outcome for the originating quality-gate check when the deterministic pass promotes immediately", async () => {
    const result = await runRepairLoop({
      initialContent: validPage,
      chatId: "chat-1",
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 1,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async (_content, method) => ({
        promoted: method === "deterministic",
      }),
    });

    expect(result.promoted).toBe(true);
    expect(result.method).toBe("deterministic");
    // The LLM fixer never ran — only the deterministic pass promoted.
    expect(runLlmFixer).not.toHaveBeenCalled();
    expect(appendErrorLogEvent).toHaveBeenCalledTimes(1);
    expect(appendErrorLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "server",
        subphase: "repair-loop:deterministic",
        fault: "quality-gate:typecheck",
        faultText: gateFailure.output,
        result: "fixed",
        chatId: "chat-1",
      }),
    );
  });

  it("logs a fixed outcome when only the final LLM verify gate promotes", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);

    const result = await runRepairLoop({
      initialContent: validPage,
      chatId: "chat-2",
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async (_content, method) =>
        method === "llm" ? { promoted: true } : { promoted: false },
    });

    expect(result.promoted).toBe(true);
    expect(appendErrorLogEvent).toHaveBeenCalledTimes(1);
    expect(appendErrorLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "server",
        subphase: "repair-loop:llm",
        fault: "quality-gate:typecheck",
        result: "fixed",
        chatId: "chat-2",
      }),
    );
  });

  it("logs a still-failing outcome when the gate never passes", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);

    const result = await runRepairLoop({
      initialContent: validPage,
      chatId: "chat-3",
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async () => ({ promoted: false }),
    });

    expect(result.promoted).toBe(false);
    expect(appendErrorLogEvent).toHaveBeenCalledTimes(1);
    expect(appendErrorLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "server",
        subphase: "repair-loop:llm",
        fault: "quality-gate:typecheck",
        result: "still-failing",
        chatId: "chat-3",
      }),
    );
  });

  it("never logs when the loop aborts early because the version was superseded", async () => {
    runLlmFixer.mockResolvedValue(fixerSucceedsWithChange);

    const result = await runRepairLoop({
      initialContent: validPage,
      chatId: "chat-4",
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      shouldAbortSuperseded: async () => true,
      onAttemptPromotion: async () => ({ promoted: false }),
    });

    expect(result.earlyStopReason).toBe("superseded");
    // A superseded abort is not a real fault outcome — must never be logged
    // to RAG as a `still-failing` lesson.
    expect(appendErrorLogEvent).not.toHaveBeenCalled();
  });

  it("caps producer rows at 5 even with many failed checks (row-explosion guard)", async () => {
    const manyFailures = Array.from({ length: 8 }, (_, i) => ({
      check: `check-${i}`,
      exitCode: 1,
      output: `failure ${i}`,
    }));

    await runRepairLoop({
      initialContent: validPage,
      chatId: "chat-5",
      failedOutputs: manyFailures,
      contextLines: [],
      maxLlmPasses: 1,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async (_content, method) => ({
        promoted: method === "deterministic",
      }),
    });

    expect(appendErrorLogEvent).toHaveBeenCalledTimes(5);
  });
});
