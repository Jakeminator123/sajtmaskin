import { describe, expect, it } from "vitest";

import * as repairLoopApi from "./repair-loop";
import {
  createRepairLoop,
  notePreviewRepair,
  type RepairLoopState,
} from "./repair-loop";

function jobState(
  jobId: string,
  overrides: Partial<RepairLoopState> = {},
): RepairLoopState {
  return {
    jobId,
    previewLoopsUsed: 0,
    maxPreviewLoops: 2,
    ...overrides,
  };
}

describe("createRepairLoop", () => {
  it("starts unused with a max of two preview loops", () => {
    expect(createRepairLoop("job-fresh-start")).toEqual({
      jobId: "job-fresh-start",
      previewLoopsUsed: 0,
      maxPreviewLoops: 2,
    });
  });

  it("does not reset the budget when createRepairLoop is called again for the same job", () => {
    const first = notePreviewRepair(createRepairLoop("job-no-reset"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(createRepairLoop("job-no-reset")).toEqual({
      jobId: "job-no-reset",
      previewLoopsUsed: 1,
      maxPreviewLoops: 2,
    });
    const second = notePreviewRepair(createRepairLoop("job-no-reset"));
    expect(second).toEqual({
      ok: true,
      action: "submit_best",
      state: { jobId: "job-no-reset", previewLoopsUsed: 2, maxPreviewLoops: 2 },
    });
    expect(notePreviewRepair(createRepairLoop("job-no-reset"))).toEqual({
      ok: false,
      code: "budget_exhausted",
    });
  });
});

describe("notePreviewRepair", () => {
  it("first call repairs and spends one loop", () => {
    const first = notePreviewRepair(createRepairLoop("job-first"));
    expect(first).toEqual({
      ok: true,
      action: "repair",
      state: { jobId: "job-first", previewLoopsUsed: 1, maxPreviewLoops: 2 },
    });
  });

  it("second call submits best and spends the last loop", () => {
    const first = notePreviewRepair(createRepairLoop("job-second"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = notePreviewRepair(first.state);
    expect(second).toEqual({
      ok: true,
      action: "submit_best",
      state: { jobId: "job-second", previewLoopsUsed: 2, maxPreviewLoops: 2 },
    });
  });

  it("third call exhausts the budget without incrementing past two", () => {
    const first = notePreviewRepair(createRepairLoop("job-third"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = notePreviewRepair(first.state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.previewLoopsUsed).toBe(2);

    const third = notePreviewRepair(second.state);
    expect(third).toEqual({ ok: false, code: "budget_exhausted" });
    expect(second.state.previewLoopsUsed).toBe(2);

    const fourth = notePreviewRepair(jobState("job-third", { previewLoopsUsed: 2 }));
    expect(fourth).toEqual({ ok: false, code: "budget_exhausted" });
  });

  it("does not let a forged unused state refill a spent job", () => {
    const first = notePreviewRepair(createRepairLoop("job-forged"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = notePreviewRepair(first.state);
    expect(second.ok).toBe(true);
    expect(notePreviewRepair(jobState("job-forged", { previewLoopsUsed: 0 }))).toEqual({
      ok: false,
      code: "budget_exhausted",
    });
  });

  it("does not mutate the input state", () => {
    const state = createRepairLoop("job-immutable");
    notePreviewRepair(state);
    expect(state).toEqual({
      jobId: "job-immutable",
      previewLoopsUsed: 0,
      maxPreviewLoops: 2,
    });
  });

  it("rejects negative or NaN used as invalid_state", () => {
    expect(
      notePreviewRepair(jobState("job-invalid-used", { previewLoopsUsed: -1 })),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair(jobState("job-invalid-used", { previewLoopsUsed: Number.NaN })),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair(
        jobState("job-invalid-used", { previewLoopsUsed: Number.NEGATIVE_INFINITY }),
      ),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair(jobState("job-invalid-used", { previewLoopsUsed: 1.5 })),
    ).toEqual({ ok: false, code: "invalid_state" });
  });

  it("rejects a missing, malformed, or wrong-max state", () => {
    expect(notePreviewRepair(null as unknown as RepairLoopState)).toEqual({
      ok: false,
      code: "invalid_state",
    });
    expect(
      notePreviewRepair({
        jobId: "job-malformed",
        previewLoopsUsed: "1",
        maxPreviewLoops: 2,
      } as unknown as RepairLoopState),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair({
        jobId: "job-wrong-max",
        previewLoopsUsed: 0,
        maxPreviewLoops: 3,
      } as unknown as RepairLoopState),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair(jobState("   ", { previewLoopsUsed: 0 })),
    ).toEqual({ ok: false, code: "invalid_state" });
  });
});

describe("repair-loop exports", () => {
  it("exports no reset helper — createRepairLoop is the only constructor", () => {
    const exportedFns = Object.entries(repairLoopApi)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();
    expect(exportedFns).toEqual(["createRepairLoop", "notePreviewRepair"]);
    expect(repairLoopApi).not.toHaveProperty("reset");
    expect(repairLoopApi).not.toHaveProperty("retry");
    expect(repairLoopApi).not.toHaveProperty("resetRepairLoop");

    const first = notePreviewRepair(createRepairLoop("job-exports"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = notePreviewRepair(first.state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(notePreviewRepair(second.state)).toEqual({
      ok: false,
      code: "budget_exhausted",
    });

    expect(createRepairLoop("job-exports").previewLoopsUsed).toBe(2);
    expect(second.state.previewLoopsUsed).toBe(2);
    expect(notePreviewRepair(second.state)).toEqual({
      ok: false,
      code: "budget_exhausted",
    });
  });
});
