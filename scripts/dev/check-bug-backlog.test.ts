import { describe, expect, it } from "vitest";

import { validateBacklog } from "./check-bug-backlog.mjs";

/** Minsta backlogg som uppfyller kontraktet. `rows` gar in i Aktiv ko som de star. */
function backlog(rows: string[]): string {
  return [
    "# Bug-backlog (konsoliderad)",
    "",
    "## Aktiv kö",
    "",
    "| Klar | Status | Prio | Fynd | Källa | Beslut / nästa steg |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Behöver repro",
    "",
    "## Väntar på ägarbeslut",
    "",
    "## Säkerhet, infra och teknisk skuld",
    "",
  ].join("\n");
}

const OK_ROW = "| [ ] | Öppen bug | P2 | `SM-001` **Något är fel:** och så här ser det ut. | M#1 | Fixa det. |";

describe("check-bug-backlog", () => {
  it("accepts a backlog with all required sections and well-formed rows", () => {
    expect(validateBacklog(backlog([OK_ROW]))).toEqual([]);
  });

  it("rejects a closed row left in Aktiv kö", () => {
    const failures = validateBacklog(backlog([OK_ROW.replace("[ ]", "[x]")]));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('closed row "[x]" left in Aktiv kö');
  });

  it("reads the Status cell, not the Prio cell, when spotting resolved-claiming rows", () => {
    // Regressionslas: kontrollen lasta tidigare cells[3] (= Prio), sa en oppen
    // rad kunde saga "Fixad" i Status utan att grinden reagerade.
    const failures = validateBacklog(backlog([OK_ROW.replace("Öppen bug", "Fixad i #123")]));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("claims resolved status");
  });

  it("does not mistake a Prio value for a resolved status", () => {
    expect(validateBacklog(backlog([OK_ROW.replace("| P2 |", "| P1 |")]))).toEqual([]);
  });

  it("requires a leading stable id in the Fynd cell", () => {
    const failures = validateBacklog(backlog([OK_ROW.replace("`SM-001` ", "")]));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("missing a leading stable id");
  });

  it("rejects reused ids", () => {
    const failures = validateBacklog(backlog([OK_ROW, OK_ROW]));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("duplicate row id SM-001");
  });

  it("requires each canonical section exactly once", () => {
    const missing = backlog([OK_ROW]).replace("## Väntar på ägarbeslut", "## Beslut & policy");
    const failures = validateBacklog(missing);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('expected exactly one "## Väntar på ägarbeslut" section, found 0');
  });

  it("still catches stale raw-backlog markers", () => {
    const failures = validateBacklog(`${backlog([OK_ROW])}\n## Huvudtabell\n`);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("stale raw backlog marker");
  });
});
