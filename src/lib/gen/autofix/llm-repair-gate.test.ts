import { beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(ledger.exportFinalizeSeed("v", "c", params.scopeId)).toBeUndefined();
    ledger.markKnownFinalize("v", "c", params.scopeId);
    const seed = ledger.exportFinalizeSeed("v", "c", params.scopeId)!;
    expect(seed.history.consumed).toEqual([]);
    expect(seed.history.finalize).toEqual([expect.objectContaining({ requiredFiles: ["a.ts"], outcome: "success" })]);
    expect(ledger.exportFinalizeSeed("other", "c", params.scopeId)).toBeUndefined();
    const hydrated = RepairLedger.hydrate("c", params.scopeId, seed.history.finalize);
    expect((await runLlmRepairGate({ ...params, ledger: hydrated })).deduped).toBe(true);
    expect(hydrated.exportFinalizeSeed("v", "c", params.scopeId)).toBeUndefined();
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    expect((await runLlmRepairGate({ ...params, content: "B", ledger: hydrated })).deduped).toBe(false);
    ledger.clear();
    expect(ledger.exportFinalizeSeed("v", "c", params.scopeId)).toBeUndefined();
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
    ledger.markKnownFinalize("v", "c", "s");
    expect(ledger.exportFinalizeSeed("v", "c", "s")!.history.finalize).toHaveLength(stage === "reservation" ? 0 : 1);
  });

  it("restores aborted/unknown identities and records thrown fixer invocations as error", async () => {
    const ledger = new RepairLedger();
    runLlmFixer.mockRejectedValueOnce(new Error("model failed"));
    const params = { content: "A", errors: ["boom"], chatId: "c", scopeId: "s", timeoutMs: 1_000, ledger };
    await expect(runLlmRepairGate(params)).rejects.toThrow("model failed");
    ledger.markKnownFinalize("v", "c", "s");
    const call = ledger.exportFinalizeSeed("v", "c", "s")!.history.finalize[0];
    expect(call.outcome).toBe("error");
    runLlmFixer.mockResolvedValue({ fixedContent: "fixed", fixedFiles: [], missingFiles: [], incompleteFiles: [], partial: false, success: true, durationMs: 1 });
    const unknown = RepairLedger.hydrate("c", "s", [{ ...call, outcome: "unknown" }]);
    expect((await runLlmRepairGate({ ...params, ledger: unknown })).deduped).toBe(true);
    const aborted = RepairLedger.hydrate("c", "s", [{ ...call, outcome: "aborted" }]);
    expect((await runLlmRepairGate({ ...params, ledger: aborted })).deduped).toBe(false);
    expect(runLlmFixer).toHaveBeenCalledTimes(2);
  });
});
