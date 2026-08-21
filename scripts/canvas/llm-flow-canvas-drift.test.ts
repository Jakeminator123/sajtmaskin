import { describe, expect, it } from "vitest";
import { findStaleCanvasBacklogIds } from "./build-llm-flow-canvas.mjs";

const HEADER = `| Klar | Status | Prio | Fynd | Källa | Beslut |\n| --- | --- | --- | --- | --- | --- |\n`;

function backlogWith(rows: string): string {
  return `# Bug-backlog (konsoliderad)\n\n## Aktiv kö\n\n${HEADER}${rows}\n\n## Behöver repro\n`;
}

describe("findStaleCanvasBacklogIds", () => {
  it("flags an archived SM-ID still painted on the canvas", () => {
    const backlog = backlogWith("| [ ] | öppen | P1 | `SM-035` foo | x | y |\n");
    const canvas = 'BLOCKER: `SM-036` old stuff\n`SM-035` still open';
    expect(findStaleCanvasBacklogIds(canvas, backlog)).toEqual(["SM-036"]);
  });

  it("is quiet when every canvas SM-ID is still in Aktiv kö", () => {
    const backlog = backlogWith("| [ ] | öppen | P1 | `SM-035` foo | x | y |\n");
    const canvas = "note: `SM-035` Fly install";
    expect(findStaleCanvasBacklogIds(canvas, backlog)).toEqual([]);
  });
});
