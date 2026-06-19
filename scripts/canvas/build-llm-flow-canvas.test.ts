import { describe, expect, it } from "vitest";

import { parseBacklogRows, selectTopOpenRisks } from "./build-llm-flow-canvas.mjs";

/** Bygger en minimal "## Lista"-tabell i samma format som BUG-SWARM-BACKLOG.md.
 *  Kolumner: | Klar | Status | Prio | Fynd | Kalla | Beslut | */
function backlog(rows: string[]): string {
  return [
    "## Lista",
    "",
    "| Klar | Status | Prio | Fynd | Kalla | Beslut |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

describe("parseBacklogRows", () => {
  it("plockar ut oppna P0-rader men hoppar over stangda ([x])", () => {
    const rows = parseBacklogRows(
      backlog([
        "| [ ] | Oppen | P0 | Tyst datatapp i finalize | R#1 | Maste fixas |",
        "| [x] | Fixad | P0 | Redan stangd | R#2 | Klar |",
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prio).toBe("P0");
  });
});

describe("selectTopOpenRisks (P0 far aldrig tappas)", () => {
  it("tar med en oppen P0-rad aven utan BLOCKER-tagg (regressionsskydd)", () => {
    const rows = parseBacklogRows(
      backlog(["| [ ] | Oppen | P0 | Kritisk men ej blocker-taggad | R#1 | Atgardas |"]),
    );
    const { rows: risks, omitted } = selectTopOpenRisks(rows, 12);
    expect(risks.some((r) => r.prio === "P0")).toBe(true);
    expect(omitted).toBe(0);
  });

  it("sorterar P0 overst, over bade BLOCKER och P1", () => {
    const rows = parseBacklogRows(
      backlog([
        "| [ ] | Oppen | P1 | Vanlig blocker | R#1 | BLOCKER |",
        "| [ ] | Oppen | P2 | Lagre prio | R#2 | oppen |",
        "| [ ] | Oppen | P0 | Hogsta allvar | R#3 | oppen |",
      ]),
    );
    const { rows: risks } = selectTopOpenRisks(rows, 12);
    expect(risks[0].prio).toBe("P0");
  });

  it("doljer aldrig P0 vid trunkering; overskjutande lagre-prio raknas som omitted", () => {
    const blockerRows = Array.from(
      { length: 15 },
      (_, i) => `| [ ] | Oppen | P2 | Blocker ${i} | R#${i} | BLOCKER |`,
    );
    const rows = parseBacklogRows(
      backlog([
        ...blockerRows,
        "| [ ] | Oppen | P0 | Sist i kallan men far ej tappas | R#X | oppen |",
      ]),
    );
    const { rows: risks, omitted } = selectTopOpenRisks(rows, 12);
    expect(risks).toHaveLength(12);
    expect(risks.some((r) => r.prio === "P0")).toBe(true);
    expect(omitted).toBe(4);
  });
});
