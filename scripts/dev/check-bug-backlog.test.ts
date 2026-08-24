import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateBacklog as validateBacklogStrict } from "./check-bug-backlog.mjs";

const validateBacklog = (body: string) => validateBacklogStrict(body, { retiredIds: [] });

/** Minsta backlogg som uppfyller kontraktet. */
function backlog(
  rows: string[],
  extra: {
    repro?: string[];
    release?: string[];
    decisions?: string[];
    debt?: string[];
    archive?: string[];
    nextId?: string;
  } = {},
): string {
  return [
    "# Bug-backlog (konsoliderad)",
    "",
    `Nästa lediga ID är \`${extra.nextId ?? "SM-002"}\`.`,
    "",
    "## Aktiv kö",
    "",
    "| Klar | Status | Prio | Fynd | Bevis på `master` | Nästa steg |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Releaseblockerare bakom avstängd flagga",
    "",
    "| ID | Prio | Flagga | Kvar före aktivering |",
    "| --- | --- | --- | --- |",
    ...(extra.release ?? []),
    "",
    "## Behöver repro",
    "",
    "| Ref | Osäkerhet | Vad avgör raden |",
    "| --- | --- | --- |",
    ...(extra.repro ?? []),
    "",
    "## Väntar på ägarbeslut",
    "",
    "| Prio | Fråga | Senast när |",
    "| --- | --- | --- |",
    ...(extra.decisions ?? []),
    "",
    "## Säkerhet, infra och teknisk skuld",
    "",
    "| Prio | Klass | Kvarvarande skuld |",
    "| --- | --- | --- |",
    ...(extra.debt ?? []),
    "",
    "## Arkiv",
    "",
    "| Klar | Rad | Status på `master` | Bevis |",
    "| --- | --- | --- | --- |",
    ...(extra.archive ?? []),
    "",
  ].join("\n");
}

const OK_ROW =
  "| [ ] | Öppen bug | P2 | `SM-001` **Något är fel:** och så här ser det ut. | `src/lib/example.ts:12` visar felet. | Fixa det. |";

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
    const failures = validateBacklog(
      backlog([OK_ROW.replace("`SM-001` ", "")], { nextId: "SM-001" }),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("missing a leading stable id");
  });

  it("rejects reused ids", () => {
    const failures = validateBacklog(backlog([OK_ROW, OK_ROW]));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("duplicate row id SM-001");
  });

  it.each([
    ["releaseblockerare", { release: ["| `SM-001` | P1 | FLAG | Gör klart. |"] }],
    ["repro", { repro: ["| `SM-001` | Osäkert. | Reproducera. |"] }],
    ["ägarbeslut", { decisions: ["| P2 | Bestäm kontrakt (`SM-001`). | Nu. |"] }],
    ["teknisk skuld", { debt: ["| P2 | Config (`SM-001`) | Ta bort drift. |"] }],
    ["arkiv", { archive: ["| [x] | `SM-001` | Fixad | PR #1. |"] }],
  ])("rejects an id reused between Aktiv kö and %s", (_label, extra) => {
    const failures = validateBacklog(backlog([OK_ROW], extra));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("duplicate row id SM-001");
  });

  it("requires the next free id to follow the highest canonical id", () => {
    const failures = validateBacklog(
      backlog([OK_ROW], {
        archive: ["| [x] | `SM-009` | Fixad | PR #9. |"],
        nextId: "SM-009",
      }),
    );
    expect(failures).toContain(
      "issued id SM-009 must be below next free id SM-009; allocate only the current next id",
    );
  });

  it("rejects reuse of an id from the immutable retired ledger", () => {
    const reused = OK_ROW.replace("SM-001", "SM-002");
    const failures = validateBacklogStrict(backlog([OK_ROW, reused], { nextId: "SM-003" }), {
      retiredIds: ["SM-002"],
    });
    expect(failures).toEqual([
      "retired row id SM-002 may never be reused in a canonical backlog row",
    ]);
  });

  it("requires every earlier issued id to remain canonical or retired", () => {
    const failures = validateBacklogStrict(backlog([OK_ROW], { nextId: "SM-003" }), {
      retiredIds: [],
    });
    expect(failures).toEqual([
      "issued id SM-002 is missing from canonical rows and the immutable retired ledger",
    ]);
  });

  it("accepts the repository backlog with its full immutable ledger", () => {
    expect(validateBacklogStrict(readFileSync("BUG-SWARM-BACKLOG.md", "utf8"))).toEqual([]);
  });

  it("requires exactly one machine-readable next-id marker", () => {
    const failures = validateBacklog(
      backlog([OK_ROW]).replace("Nästa lediga ID är `SM-002`.", "ID-listan finns ovan."),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("expected exactly one");
  });

  it("requires exactly six columns in Aktiv kö", () => {
    const failures = validateBacklog(
      backlog([OK_ROW.replace("| Fixa det. |", "| Extra | Fixa det. |")]),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("exactly six columns");
  });

  it("requires the canonical six-column header", () => {
    const body = backlog([OK_ROW]).replace("Bevis på `master`", "Källa");
    const failures = validateBacklog(body);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("header must be exactly six columns");
  });

  it("rejects a legacy M# source tag as master evidence", () => {
    const failures = validateBacklog(
      backlog([OK_ROW.replace("`src/lib/example.ts:12` visar felet.", "M#17")]),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("needs real master evidence");
  });

  it("rejects prose without a verifiable master anchor", () => {
    const failures = validateBacklog(
      backlog([OK_ROW.replace("`src/lib/example.ts:12` visar felet.", "En agent såg detta")]),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("needs real master evidence");
  });

  it("requires each canonical section exactly once", () => {
    const missing = backlog([OK_ROW]).replace("## Väntar på ägarbeslut", "## Beslut & policy");
    const failures = validateBacklog(missing);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(
      'expected exactly one "## Väntar på ägarbeslut" section, found 0',
    );
  });

  it("still catches stale raw-backlog markers", () => {
    const failures = validateBacklog(`${backlog([OK_ROW])}\n## Huvudtabell\n`);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("stale raw backlog marker");
  });
});
