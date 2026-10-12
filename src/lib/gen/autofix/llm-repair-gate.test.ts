import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runLlmFixer = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());

vi.mock("./llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("@/lib/logging/dev-log", () => ({
  devLogAppend,
}));

vi.mock("@/lib/logging/generation-log-writer", () => ({
  readRecurringPatternsForChat: () => [],
}));

vi.mock("@/lib/models/phase-routing", () => ({
  resolvePhaseModel: () => ({ modelId: "gpt-5.4" }),
  resolvePhaseThinking: () => ({ thinking: false, reasoningEffort: "medium" }),
}));

import { RepairLedger, runLlmRepairGate } from "./llm-repair-gate";

describe("runLlmRepairGate ledger", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const deadlineParams = () => ({ content: "A", errors: ["boom"], chatId: "c", scopeId: "s", timeoutMs: 5_000,
    ledger: new RepairLedger(), recurringPatterns: [],
    repairBudget: { reserve: vi.fn(async (_identity?: unknown): Promise<void> => undefined), complete: vi.fn(async (): Promise<void> => undefined) } });
  const abortedResult = { fixedContent: "A", fixedFiles: [], missingFiles: [], incompleteFiles: [], partial: false, success: false, durationMs: 0, aborted: true };

  it("deadline STOP before reservation has no payment or fake invocation", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const params = deadlineParams();
    const result = await runLlmRepairGate({ ...params, deadlineEpochMs: Date.now() });
    expect(result.stop).toEqual({ reason: "time_budget_exceeded", retryable: true });
    expect(params.repairBudget.reserve).not.toHaveBeenCalled();
    expect(params.repairBudget.complete).not.toHaveBeenCalled();
    expect(runLlmFixer).not.toHaveBeenCalled();
    expect(params.ledger.exportInvocations("c", "s")).toEqual([]);
  });

  it("slow paid reservation past the original deadline stays reserved without fixer or completion", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const params = deadlineParams();
    const reservations: unknown[] = [];
    params.repairBudget.reserve.mockImplementation(async (identity?: unknown) => {
      reservations.push(identity);
      await new Promise(resolve => setTimeout(resolve, 60));
    });
    const pending = runLlmRepairGate({ ...params, deadlineEpochMs: Date.now() + 50 });
    await vi.advanceTimersByTimeAsync(60);
    const result = await pending;
    expect(result.stop).toEqual({ reason: "time_budget_exceeded", retryable: true });
    expect(result.result.aborted).not.toBe(true);
    expect(reservations).toEqual([expect.objectContaining({ outcome: "unknown" })]);
    expect(runLlmFixer).not.toHaveBeenCalled();
    expect(params.repairBudget.complete).not.toHaveBeenCalled();
    expect(params.ledger.exportInvocations("c", "s")).toEqual([]);
  });

  it("checks again at the actual fixer boundary after synchronous prompt preparation", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const params = deadlineParams();
    Object.defineProperty(params, "recurringPatterns", { get: () => { vi.setSystemTime(100_051); return []; } });
    const result = await runLlmRepairGate(Object.assign(params, { deadlineEpochMs: 100_050 }));
    expect(result.stop).toEqual({ reason: "time_budget_exceeded", retryable: true });
    expect(params.repairBudget.reserve).toHaveBeenCalledTimes(1);
    expect(params.repairBudget.complete).not.toHaveBeenCalled();
    expect(runLlmFixer).not.toHaveBeenCalled();
    expect(params.ledger.exportInvocations("c", "s")).toEqual([]);
  });

  it.each([5_000, 100])("deadline caller clamps the actual timer below 1s and phase cap %s", async phaseCap => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const params = deadlineParams();
    params.repairBudget.reserve.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    runLlmFixer.mockImplementation(async (_content: string, _errors: string[], options: { abortSignal: AbortSignal }) =>
      new Promise(resolve => { options.abortSignal.addEventListener("abort", () => resolve(abortedResult)); }));
    const pending = runLlmRepairGate({ ...params, timeoutMs: phaseCap, deadlineEpochMs: 100_350 });
    await vi.advanceTimersByTimeAsync(100);
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    const signal = runLlmFixer.mock.calls[0][2].abortSignal as AbortSignal;
    await vi.advanceTimersByTimeAsync(Math.min(250, phaseCap) - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect((await pending).stop).toBeUndefined();
    expect(params.repairBudget.complete).toHaveBeenCalledWith(expect.objectContaining({ outcome: "aborted" }));
  });

  it("omitted deadline retains the legacy 1s floor", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const params = deadlineParams();
    runLlmFixer.mockImplementation(async (_content: string, _errors: string[], options: { abortSignal: AbortSignal }) =>
      new Promise(resolve => { options.abortSignal.addEventListener("abort", () => resolve(abortedResult)); }));
    const pending = runLlmRepairGate({ ...params, timeoutMs: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    const signal = runLlmFixer.mock.calls[0][2].abortSignal as AbortSignal;
    await vi.advanceTimersByTimeAsync(999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect((await pending).stop).toBeUndefined();
    expect(params.ledger.exportInvocations("c", "s")).toEqual([expect.objectContaining({ outcome: "aborted" })]);
  });

  it("dedupes repeated identical repair attempts in the same scope", async () => {
    const ledger = new RepairLedger();
    runLlmFixer.mockResolvedValueOnce({
      fixedContent: "fixed",
      fixedFiles: ["app/page.tsx"],
      missingFiles: [],
      incompleteFiles: [],
      partial: false,
      success: true,
      durationMs: 10,
    });

    const params = {
      content: "broken",
      errors: ["app/page.tsx:1:1 Unexpected token"],
      chatId: "chat_1",
      timeoutMs: 1_000,
      requiredFiles: ["app/page.tsx"],
      phase: "syntax",
      scopeId: "ver_1:run_1",
      ledger,
    };

    const first = await runLlmRepairGate(params);
    const second = await runLlmRepairGate(params);

    expect(first.result.success).toBe(true);
    expect(second.result.success).toBe(false);
    expect(second.result.fixedContent).toBe("broken");
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "llm_repair_gate.deduped",
        chatId: "chat_1",
        phase: "syntax",
        scopeId: "ver_1:run_1",
        attempts: 2,
      }),
    );
  });

  it("allows same diagnostics when content hash changes", async () => {
    const ledger = new RepairLedger();
    runLlmFixer.mockResolvedValue({
      fixedContent: "fixed",
      fixedFiles: [],
      missingFiles: [],
      incompleteFiles: [],
      partial: false,
      success: true,
      durationMs: 1,
    });

    await runLlmRepairGate({
      content: "broken A",
      errors: ["same error"],
      chatId: "chat_1",
      timeoutMs: 1_000,
      phase: "syntax",
      ledger,
    });
    await runLlmRepairGate({
      content: "broken B",
      errors: ["same error"],
      chatId: "chat_1",
      timeoutMs: 1_000,
      phase: "syntax",
      ledger,
    });

    expect(runLlmFixer).toHaveBeenCalledTimes(2);
  });

  it("dedupes same content/errors across different phases in the same scope", async () => {
    const ledger = new RepairLedger();
    runLlmFixer.mockResolvedValue({
      fixedContent: "fixed",
      fixedFiles: [],
      missingFiles: [],
      incompleteFiles: [],
      partial: false,
      success: true,
      durationMs: 1,
    });

    await runLlmRepairGate({
      content: "broken",
      errors: ["same error"],
      chatId: "chat_1",
      timeoutMs: 1_000,
      phase: "syntax",
      ledger,
    });
    await runLlmRepairGate({
      content: "broken",
      errors: ["same error"],
      chatId: "chat_1",
      timeoutMs: 1_000,
      phase: "verifier",
      ledger,
    });

    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "llm_repair_gate.deduped",
        phase: "verifier",
      }),
    );
  });

  it("allows the reduced-budget retry after an ABORTED attempt on the same key (Fas 3)", async () => {
    // The repair loop retries a timed-out fixer call with a smaller budget.
    // An aborted attempt produced no output, so the identical retry must NOT
    // be dedupe-blocked — only completed attempts block.
    const ledger = new RepairLedger();
    runLlmFixer
      .mockResolvedValueOnce({
        fixedContent: "broken",
        fixedFiles: [],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: false,
        aborted: true,
        durationMs: 1,
      })
      .mockResolvedValueOnce({
        fixedContent: "fixed",
        fixedFiles: ["app/page.tsx"],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: true,
        aborted: false,
        durationMs: 1,
      });

    const params = {
      content: "broken",
      errors: ["app/page.tsx:1:1 Unexpected token"],
      chatId: "chat_1",
      timeoutMs: 1_000,
      phase: "repair-loop",
      scopeId: "ver_1:server-repair",
      ledger,
    };

    const first = await runLlmRepairGate(params);
    const second = await runLlmRepairGate(params);

    expect(first.result.aborted).toBe(true);
    expect(second.deduped).toBe(false);
    expect(second.result.success).toBe(true);
    expect(runLlmFixer).toHaveBeenCalledTimes(2);

    // A COMPLETED attempt still dedupe-blocks the next identical call.
    const third = await runLlmRepairGate(params);
    expect(third.deduped).toBe(true);
    expect(runLlmFixer).toHaveBeenCalledTimes(2);
  });

  it("threads maxTokens and explicit recurringPatterns through to the fixer (Fas 3)", async () => {
    runLlmFixer.mockResolvedValueOnce({
      fixedContent: "fixed",
      fixedFiles: [],
      missingFiles: [],
      incompleteFiles: [],
      partial: false,
      success: true,
      durationMs: 1,
    });
    const recurringPatterns = [
      { pattern: "TS2322 mismatch", occurrences: 3 },
    ];

    await runLlmRepairGate({
      content: "broken",
      errors: ["app/page.tsx:1:1 boom"],
      chatId: "chat_1",
      timeoutMs: 1_000,
      maxTokens: 4_096,
      recurringPatterns,
    });

    expect(runLlmFixer).toHaveBeenCalledWith(
      "broken",
      ["app/page.tsx:1:1 boom"],
      expect.objectContaining({
        maxTokens: 4_096,
        recurringPatterns,
      }),
    );
  });

  it("exports actual invocations/outcomes, not repeated ledger begin/dedupe attempts", async () => {
    const ledger = new RepairLedger();
    const params = { content: "A", errors: ["boom"], chatId: "c", scopeId: "original:root", requiredFiles: [" a.ts ", "a.ts"], timeoutMs: 1_000, ledger };
    runLlmFixer.mockResolvedValue({ fixedContent: "fixed", fixedFiles: [], missingFiles: [], incompleteFiles: [], partial: false, success: true, durationMs: 1 });
    await runLlmRepairGate(params);
    await runLlmRepairGate(params);
    const calls = ledger.exportInvocations("c", params.scopeId);
    expect(calls).toEqual([expect.objectContaining({ requiredFiles: ["a.ts"], outcome: "success" })]);
    expect(ledger.exportInvocations("other", params.scopeId)).toEqual([]);
    const hydrated = RepairLedger.hydrate("c", params.scopeId, calls);
    expect((await runLlmRepairGate({ ...params, ledger: hydrated })).deduped).toBe(true);
    expect(hydrated.exportInvocations("c", params.scopeId)).toEqual([]);
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect((await runLlmRepairGate({ ...params, content: "B", ledger: hydrated })).deduped).toBe(false);
    ledger.clear();
    expect(ledger.exportInvocations("c", params.scopeId)).toEqual([]);
  });

  it("reserves strictly after dedupe and before invoking, then durably completes before returning", async () => {
    const events: string[] = [];
    const ledger = new RepairLedger();
    const params = { content: "A", errors: ["boom"], chatId: "c", scopeId: "s", timeoutMs: 1_000, ledger,
      repairBudget: { reserve: vi.fn(async () => { events.push("reserve"); }), complete: vi.fn(async () => { events.push("outcome"); }) } };
    runLlmFixer.mockImplementation(async () => { events.push("model"); return { fixedContent: "fixed", fixedFiles: [], missingFiles: [], incompleteFiles: [], partial: false, success: true, durationMs: 1 }; });
    await runLlmRepairGate(params);
    await runLlmRepairGate(params);
    expect(events).toEqual(["reserve", "model", "outcome"]);
    expect(params.repairBudget.complete).toHaveBeenCalledWith(expect.objectContaining({ outcome: "success" }));
  });

  it.each(["reservation", "outcome"])("fails closed on %s persistence without pretending the model succeeded", async (stage) => {
    const ledger = new RepairLedger();
    const failure = new Error("receipt unavailable");
    const hooks = { reserve: vi.fn(async () => { if (stage === "reservation") throw failure; }), complete: vi.fn(async () => { if (stage === "outcome") throw failure; }) };
    runLlmFixer.mockResolvedValue({ fixedContent: "fixed", fixedFiles: [], missingFiles: [], incompleteFiles: [], partial: false, success: true, durationMs: 1 });
    await expect(runLlmRepairGate({ content: "A", errors: ["boom"], chatId: "c", scopeId: "s", timeoutMs: 1_000, ledger, repairBudget: hooks })).rejects.toBe(failure);
    expect(runLlmFixer).toHaveBeenCalledTimes(stage === "reservation" ? 0 : 1);
    expect(ledger.exportInvocations("c", "s")).toHaveLength(stage === "reservation" ? 0 : 1);
  });

  it("restores aborted/unknown identities and records thrown fixer invocations as error", async () => {
    const ledger = new RepairLedger();
    runLlmFixer.mockRejectedValueOnce(new Error("model failed"));
    const params = { content: "A", errors: ["boom"], chatId: "c", scopeId: "s", timeoutMs: 1_000, ledger };
    await expect(runLlmRepairGate(params)).rejects.toThrow("model failed");
    const call = ledger.exportInvocations("c", "s")[0];
    expect(call.outcome).toBe("error");
    runLlmFixer.mockResolvedValue({ fixedContent: "fixed", fixedFiles: [], missingFiles: [], incompleteFiles: [], partial: false, success: true, durationMs: 1 });
    const unknown = RepairLedger.hydrate("c", "s", [{ ...call, outcome: "unknown" }]);
    expect((await runLlmRepairGate({ ...params, ledger: unknown })).deduped).toBe(true);
    const aborted = RepairLedger.hydrate("c", "s", [{ ...call, outcome: "aborted" }]);
    expect((await runLlmRepairGate({ ...params, ledger: aborted })).deduped).toBe(false);
    expect(runLlmFixer).toHaveBeenCalledTimes(2);
  });
});
