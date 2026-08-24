import { describe, expect, it } from "vitest";

import * as repairLoopApi from "./repair-loop";
import {
  createRepairLoop,
  notePreviewRepair,
  type RepairLoopState,
} from "./repair-loop";

describe("createRepairLoop", () => {
  it("starts unused with a max of two preview loops", () => {
    expect(createRepairLoop()).toEqual({
      previewLoopsUsed: 0,
      maxPreviewLoops: 2,
    });
  });
});

describe("notePreviewRepair", () => {
  it("first call repairs and spends one loop", () => {
    const first = notePreviewRepair(createRepairLoop());
    expect(first).toEqual({
      ok: true,
      action: "repair",
      state: { previewLoopsUsed: 1, maxPreviewLoops: 2 },
    });
  });

  it("second call submits best and spends the last loop", () => {
    const first = notePreviewRepair(createRepairLoop());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = notePreviewRepair(first.state);
    expect(second).toEqual({
      ok: true,
      action: "submit_best",
      state: { previewLoopsUsed: 2, maxPreviewLoops: 2 },
    });
  });

  it("third call exhausts the budget without incrementing past two", () => {
    const first = notePreviewRepair(createRepairLoop());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = notePreviewRepair(first.state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.previewLoopsUsed).toBe(2);

    const third = notePreviewRepair(second.state);
    expect(third).toEqual({ ok: false, code: "budget_exhausted" });
    expect(second.state.previewLoopsUsed).toBe(2);

    const fourth = notePreviewRepair({
      previewLoopsUsed: 2,
      maxPreviewLoops: 2,
    });
    expect(fourth).toEqual({ ok: false, code: "budget_exhausted" });
  });

  it("does not mutate the input state", () => {
    const state = createRepairLoop();
    notePreviewRepair(state);
    expect(state).toEqual({ previewLoopsUsed: 0, maxPreviewLoops: 2 });
  });

  it("rejects negative or NaN used as invalid_state", () => {
    expect(
      notePreviewRepair({ previewLoopsUsed: -1, maxPreviewLoops: 2 }),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair({ previewLoopsUsed: Number.NaN, maxPreviewLoops: 2 }),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair({
        previewLoopsUsed: Number.NEGATIVE_INFINITY,
        maxPreviewLoops: 2,
      }),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair({
        previewLoopsUsed: 1.5,
        maxPreviewLoops: 2,
      }),
    ).toEqual({ ok: false, code: "invalid_state" });
  });

  it("rejects a missing, malformed, or wrong-max state", () => {
    expect(notePreviewRepair(null as unknown as RepairLoopState)).toEqual({
      ok: false,
      code: "invalid_state",
    });
    expect(
      notePreviewRepair({
        previewLoopsUsed: "1",
        maxPreviewLoops: 2,
      } as unknown as RepairLoopState),
    ).toEqual({ ok: false, code: "invalid_state" });
    expect(
      notePreviewRepair({
        previewLoopsUsed: 0,
        maxPreviewLoops: 3,
      } as unknown as RepairLoopState),
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

    const first = notePreviewRepair(createRepairLoop());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = notePreviewRepair(first.state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(notePreviewRepair(second.state)).toEqual({
      ok: false,
      code: "budget_exhausted",
    });

    const fresh = createRepairLoop();
    expect(fresh.previewLoopsUsed).toBe(0);
    expect(second.state.previewLoopsUsed).toBe(2);
    expect(notePreviewRepair(second.state)).toEqual({
      ok: false,
      code: "budget_exhausted",
    });
  });
});
