import { describe, expect, it } from "vitest";

import { parseBacklogRows, selectTopOpenRisks } from "./build-llm-flow-canvas.mjs";

function canonicalSection(heading: string, rows: string[]): string {
  return [
    `## ${heading}`,
    "",
    "| ID | Prio | Räckvidd | Fel | Kodbevis | Nästa steg | Verifierad |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function activeBacklog(rows: string[]): string {
  return canonicalSection("Aktiva produktionsbuggar", rows);
}

describe("parseBacklogRows", () => {
  it("plockar ut rader ur den kanoniska produktbuggkon", () => {
    const rows = parseBacklogRows(
      activeBacklog([
        "| SW-001 | P0 | Produktion | Tyst datatapp i finalize | runner.ts | Fixa persist | 2026-08-05 abcdef0 |",
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prio).toBe("P0");
    expect(rows[0].fynd).toBe("Tyst datatapp i finalize");
  });

  it("bevarar escapade pipe-tecken i Markdown-celler", () => {
    const rows = parseBacklogRows(
      activeBacklog([
        "| SW-001 | P2 | Typkontrakt | Unionen `string \\| undefined` tappas | parser.ts | Bevara hela cellen | 2026-08-05 abcdef0 |",
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fynd).toBe("Unionen string | undefined tappas");
    expect(rows[0].text).toContain("bevara hela cellen");
  });

  it("ignorerar repro, agarbeslut och skuld", () => {
    const md = [
      activeBacklog([
        "| SW-001 | P2 | Produktion | Reell defekt | runner.ts | Fixa | 2026-08-05 abcdef0 |",
      ]),
      "",
      "## Risker som behöver repro",
      "",
      "| ID | Prio vid träff | Hypotes | Bevisläge | Repro för dom | Verifierad |",
      "| --- | --- | --- | --- | --- | --- |",
      "| SW-002 | P0 | Kräver repro | Obevisad | Kör test | 2026-08-05 abcdef0 |",
      "",
      "## Väntar på ägarbeslut",
      "",
      "| ID | Prio | Beslut | Kodområde | Nästa steg | Verifierad |",
      "| --- | --- | --- | --- | --- | --- |",
      "| SW-003 | P1 | Välj policy | credits | Besluta | 2026-08-05 abcdef0 |",
    ].join("\n");
    const rows = parseBacklogRows(md);
    expect(rows).toHaveLength(1);
    expect(rows[0].fynd).toBe("Reell defekt");
  });

  it("kollapsar alla feature-flag-barn till en releasegrind", () => {
    const md = [
      activeBacklog([
        "| SW-001 | P2 | Produktion | Aktiv bugg | runner.ts | Fixa | 2026-08-05 abcdef0 |",
      ]),
      "",
      canonicalSection("Release blockers bakom feature flag", [
        "| SW-055A | P1 | Domain purchase | Registrar fel | client.ts | Fixa endpoint | 2026-08-05 abcdef0 |",
        "| SW-055B | P1 | Domain purchase | Refund race | fulfil.ts | Reconcile | 2026-08-05 abcdef0 |",
      ]),
    ].join("\n");
    const rows = parseBacklogRows(md);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      prio: "P1",
      blocker: true,
      fynd: "2 release blockers bakom avstängd feature flag",
    });
    expect(rows[1].text).toContain("registrar fel");
    expect(rows[1].text).toContain("refund race");
  });

  it("stoder den gamla Aktiv ko-tabellen som fallback", () => {
    const md = [
      "## Aktiv kö",
      "",
      "| Klar | Status | Prio | Fynd | Kalla | Beslut |",
      "| --- | --- | --- | --- | --- | --- |",
      "| [ ] | Oppen | P0 | Aldre format | R#1 | Fixa |",
      "| [x] | Fixad | P1 | Stangd | R#2 | Klar |",
    ].join("\n");
    const rows = parseBacklogRows(md);
    expect(rows).toHaveLength(1);
    expect(rows[0].prio).toBe("P0");
  });
});

describe("selectTopOpenRisks (P0 far aldrig tappas)", () => {
  it("tar med en oppen P0-rad aven utan blocker-tagg", () => {
    const rows = parseBacklogRows(
      activeBacklog([
        "| SW-001 | P0 | Produktion | Kritisk men ej blocker | runner.ts | Fixa | 2026-08-05 abcdef0 |",
      ]),
    );
    const { rows: risks, omitted } = selectTopOpenRisks(rows, 12);
    expect(risks.some((row) => row.prio === "P0")).toBe(true);
    expect(omitted).toBe(0);
  });

  it("sorterar P0 over releasegrind och P2", () => {
    const rows = [
      { prio: "P1", blocker: true, text: "release", fynd: "Releasegrind" },
      { prio: "P2", blocker: false, text: "lagre", fynd: "Lagre prio" },
      { prio: "P0", blocker: false, text: "hogsta", fynd: "Hogsta allvar" },
    ];
    const { rows: risks } = selectTopOpenRisks(rows, 12);
    expect(risks[0].prio).toBe("P0");
  });

  it("doljer aldrig P0 vid trunkering och raknar overskjutande rader", () => {
    const blockerRows = Array.from({ length: 15 }, (_, index) => ({
      prio: "P2",
      blocker: true,
      text: `blocker ${index}`,
      fynd: `Blocker ${index}`,
    }));
    const rows = [
      ...blockerRows,
      { prio: "P0", blocker: false, text: "hogsta", fynd: "Sist men kritisk" },
    ];
    const { rows: risks, omitted } = selectTopOpenRisks(rows, 12);
    expect(risks).toHaveLength(12);
    expect(risks.some((row) => row.prio === "P0")).toBe(true);
    expect(omitted).toBe(4);
  });
});
