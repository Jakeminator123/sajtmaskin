import { describe, expect, it } from "vitest";

import { parseBacklogRows, remainingBacklogWork, selectTopOpenRisks } from "./build-llm-flow-canvas.mjs";

/** Bygger en minimal "## Aktiv ko"-tabell i samma format som BUG-SWARM-BACKLOG.md.
 *  Kolumner: | Klar | Status | Prio | Fynd | Kalla | Beslut | */
function backlog(rows: string[]): string {
  return [
    "## Aktiv kö",
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

  it("ignorerar checkbox-rader utanfor '## Aktiv ko'-sektionen", () => {
    const md = [
      "## Aktiv kö",
      "",
      "| Klar | Status | Prio | Fynd | Kalla | Beslut |",
      "| --- | --- | --- | --- | --- | --- |",
      "| [ ] | Oppen | P2 | Reell defekt | G#20 | fixa |",
      "",
      "## Behover repro",
      "",
      "| Klar | Status | Prio | Fynd | Kalla | Beslut |",
      "| --- | --- | --- | --- | --- | --- |",
      "| [ ] | Oppen | P0 | Kraver repro, ej aktiv | B12 | repro |",
      "",
      "## Avfardat",
      "",
      "| [ ] | Oppen | P1 | Policybeslut, ej bug | G#10 | BLOCKER |",
    ].join("\n");
    const rows = parseBacklogRows(md);
    expect(rows).toHaveLength(1);
    expect(rows[0].fynd).toBe("Reell defekt");
  });

  it("markerar landad kodfix sa den inte styr ny implementation", () => {
    const rows = parseBacklogRows(
      backlog([
        "| [ ] | Kodfix i master | P1 | `SM-082` ikonfixaren | src/lib/gen/autofix/rules/icon.ts | Bestall inte igen. |",
        "| [ ] | Kodfix i preview | P2 | `SM-077` omverifiering | src/lib/hooks/chat/useResume.ts | Vantar promotion. |",
        "| [ ] | Öppen kodbugg | P1 | `SM-080` isolering | preview-host/src/runtime/x.js | BLOCKER |",
        "| [ ] | Kvarvarande driftprov | P1 | `SM-073` inspector | preview-host/src/runtime/y.js | Stickprov. |",
      ]),
    );
    expect(rows.map((r) => r.workKind)).toEqual(["landed", "landed", "open", "verify"]);
    const remaining = remainingBacklogWork(rows);
    expect(remaining.map((r) => r.fynd)).toEqual(["`SM-080` isolering", "`SM-073` inspector"]);
    const { rows: risks } = selectTopOpenRisks(remaining, 12);
    expect(risks.some((r) => String(r.fynd).includes("SM-082"))).toBe(false);
    expect(risks.some((r) => String(r.fynd).includes("SM-080") && r.blocker)).toBe(true);
    expect(risks.some((r) => String(r.fynd).includes("SM-073") && r.kind === "verify")).toBe(true);
  });

  it("faller tillbaka pa hela filen om '## Aktiv ko' saknas", () => {
    const md = [
      "## Lista",
      "",
      "| [ ] | Oppen | P0 | Aldre format utan Aktiv ko | R#1 | fixa |",
    ].join("\n");
    const rows = parseBacklogRows(md);
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
