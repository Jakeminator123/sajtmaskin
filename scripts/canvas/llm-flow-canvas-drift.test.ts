import { describe, expect, it } from "vitest";
import {
  extractEmbeddedCanvasData,
  findCanvasBacklogDrift,
  findStaleCanvasBacklogIds,
  normalizeBacklogDerivedCanvas,
} from "./build-llm-flow-canvas.mjs";

const HEADER = `| Klar | Status | Prio | Fynd | Källa | Beslut |\n| --- | --- | --- | --- | --- | --- |\n`;

function backlogWith(rows: string): string {
  return `# Bug-backlog (konsoliderad)\n\n## Aktiv kö\n\n${HEADER}${rows}\n\n## Behöver repro\n`;
}

function canvasData(overrides: Record<string, unknown> = {}) {
  return {
    meta: { repo: "x", commit: "abc", commitDate: "2026-01-01", sinceDays: 14 },
    totals: {
      processes: 1,
      openP0: 0,
      openP1: 1,
      openP2: 0,
      openP3: 0,
      blocked: 0,
      shaky: 1,
      evalExactHitPct: null,
    },
    processes: [
      {
        name: "Preview",
        status: "shaky",
        openBugs: 1,
        openByPrio: { P0: 0, P1: 1, P2: 0, P3: 0, other: 0 },
        churn: 3,
        note: "1 oppna backlog-rader",
      },
    ],
    topOpenRisks: [{ prio: "P1", blocker: false, fynd: "`SM-035` foo" }],
    topOpenRisksOmitted: 0,
    ...overrides,
  };
}

describe("findStaleCanvasBacklogIds", () => {
  it("flags an archived SM-ID still painted on the canvas", () => {
    const backlog = backlogWith("| [ ] | öppen | P1 | `SM-035` foo | x | y |\n");
    const canvas = "BLOCKER: `SM-036` old stuff\n`SM-035` still open";
    expect(findStaleCanvasBacklogIds(canvas, backlog)).toEqual(["SM-036"]);
  });

  it("is quiet when every canvas SM-ID is still in Aktiv kö", () => {
    const backlog = backlogWith("| [ ] | öppen | P1 | `SM-035` foo | x | y |\n");
    const canvas = "note: `SM-035` Fly install";
    expect(findStaleCanvasBacklogIds(canvas, backlog)).toEqual([]);
  });
});

describe("findCanvasBacklogDrift", () => {
  it("stays quiet when only commit/churn stamps differ", () => {
    const painted = canvasData({
      meta: { repo: "x", commit: "old", commitDate: "2026-01-01", sinceDays: 14 },
    });
    const generated = canvasData({
      meta: { repo: "x", commit: "new", commitDate: "2026-08-21", sinceDays: 14 },
      processes: [
        {
          name: "Preview",
          status: "ongoing",
          openBugs: 1,
          openByPrio: { P0: 0, P1: 1, P2: 0, P3: 0, other: 0 },
          churn: 9,
          note: "Aktiv: 9 commits / 14d",
        },
      ],
    });
    expect(findCanvasBacklogDrift(painted, generated)).toEqual([]);
  });

  it("flags a priority change even when the SM-ID set is unchanged", () => {
    const painted = canvasData();
    const generated = canvasData({
      totals: { ...canvasData().totals, openP1: 0, openP0: 1 },
      topOpenRisks: [{ prio: "P0", blocker: false, fynd: "`SM-035` foo" }],
      processes: [
        {
          name: "Preview",
          openBugs: 1,
          openByPrio: { P0: 1, P1: 0, P2: 0, P3: 0, other: 0 },
        },
      ],
    });
    expect(findCanvasBacklogDrift(painted, generated).join(" ")).toMatch(/totals|topOpenRisks/);
  });

  it("flags a new active bug that never appears as a stale canvas ID", () => {
    const painted = canvasData();
    const generated = canvasData({
      totals: { ...canvasData().totals, openP1: 2 },
      topOpenRisks: [
        { prio: "P1", blocker: false, fynd: "`SM-035` foo" },
        { prio: "P1", blocker: false, fynd: "`SM-099` new" },
      ],
      processes: [
        {
          name: "Preview",
          openBugs: 2,
          openByPrio: { P0: 0, P1: 2, P2: 0, P3: 0, other: 0 },
        },
      ],
    });
    expect(findCanvasBacklogDrift(painted, generated).length).toBeGreaterThan(0);
  });

  it("flags an archived omitted risk via totals even when painted IDs stay valid", () => {
    const painted = canvasData({
      totals: { ...canvasData().totals, openP2: 1 },
      topOpenRisksOmitted: 1,
    });
    const generated = canvasData({
      totals: { ...canvasData().totals, openP2: 0 },
      topOpenRisksOmitted: 0,
    });
    expect(findCanvasBacklogDrift(painted, generated).join(" ")).toMatch(
      /totals|topOpenRisksOmitted/,
    );
  });
});

describe("extractEmbeddedCanvasData", () => {
  it("parses the generated DATA block", () => {
    const painted = canvasData();
    const canvas = `const DATA: CanvasData = ${JSON.stringify(painted, null, 2)};\n\nconst STATUS_TONE: Record<Status, TableRowTone> = {};\n`;
    expect(normalizeBacklogDerivedCanvas(extractEmbeddedCanvasData(canvas))).toEqual(
      normalizeBacklogDerivedCanvas(painted),
    );
  });
});
