// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const checker = fileURLToPath(new URL("./check-bug-backlog.mjs", import.meta.url));
const workdirs: string[] = [];

function executeChecker(
  backlog: string,
  archive: string,
  additionalArchives: Record<string, string> = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), "sajtmaskin-backlog-check-"));
  workdirs.push(cwd);
  const archiveDir = join(cwd, "docs", "plans", "avklarat", "bug-swarm");
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(join(cwd, "BUG-SWARM-BACKLOG.md"), backlog, "utf8");
  writeFileSync(join(archiveDir, "backlog-arkiv-2026-08-05.md"), archive, "utf8");
  for (const [filename, body] of Object.entries(additionalArchives)) {
    writeFileSync(join(archiveDir, filename), body, "utf8");
  }
  return import("node:child_process").then(({ spawnSync }) =>
    spawnSync(process.execPath, [checker], { cwd, encoding: "utf8" }),
  );
}

function backlogWith(
  activeRows: string[] = [],
  releaseRows: string[] = [],
  additionalArchiveLinks: string[] = [],
) {
  const executable = (heading: string, rows: string[]) => [
    `## ${heading}`,
    "",
    "| ID | Prio | Räckvidd | Fel | Kodbevis | Nästa steg | Verifierad |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ];
  return [
    "# Bug-backlog",
    "",
    ...executable("Aktiva produktionsbuggar", activeRows),
    "",
    ...executable("Release blockers bakom feature flag", releaseRows),
    "",
    "## Risker som behöver repro",
    "",
    "| ID | Prio vid träff | Hypotes | Bevisläge | Repro för dom | Verifierad |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "## Väntar på ägarbeslut",
    "",
    "| ID | Prio | Beslut | Kodområde | Nästa steg | Verifierad |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "## Säkerhet, infra och teknisk skuld",
    "",
    "| ID | Prio | Klass | Punkt | Nästa steg | Verifierad |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "## Arkiv",
    "",
    "[Senaste](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-08-05.md)",
    ...additionalArchiveLinks,
  ].join("\n");
}

const validArchive = [
  "# Arkiv",
  "",
  "| ID | Dom | Tidigare premiss | Bevis |",
  "| --- | --- | --- | --- |",
  "| SW-900 | Löst | Tidigare fel | PR #1 |",
].join("\n");

afterEach(() => {
  for (const cwd of workdirs.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

describe("check-bug-backlog", () => {
  it("tillåter tomma exekverbara köer", async () => {
    const result = await executeChecker(backlogWith(), validArchive);
    expect(result.status, result.stderr).toBe(0);
  });

  it("bevarar escapade pipe-tecken i tabellceller", async () => {
    const backlog = backlogWith([
      "| SW-001 | P2 | Typkontrakt | Unionen `string \\| undefined` tappas | parser.ts | Bevara hela cellen | 2026-08-05 abcdef0 |",
    ]);
    const result = await executeChecker(backlog, validArchive);
    expect(result.status, result.stderr).toBe(0);
  });

  it("underkänner checkboxformat i det länkade arkivet", async () => {
    const legacyArchive = [
      "# Arkiv",
      "",
      "| Klar | Status | Prio | Fynd |",
      "| --- | --- | --- | --- |",
      "| [x] | Fixad | P2 | Äldre rad |",
    ].join("\n");
    const result = await executeChecker(backlogWith(), legacyArchive);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected headers ID, Dom, Tidigare premiss, Bevis");
  });

  it("underkänner återanvänt ID i ett äldre ID-baserat arkiv", async () => {
    const olderArchive = [
      "# Arkiv",
      "",
      "| ID | Dom | Tidigare premiss | Bevis |",
      "| --- | --- | --- | --- |",
      "| SW-900 | Löst | Äldre premiss | PR #0 |",
    ].join("\n");
    const backlog = backlogWith(
      [],
      [],
      ["[Äldre](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-08-04.md)"],
    );
    const result = await executeChecker(backlog, validArchive, {
      "backlog-arkiv-2026-08-04.md": olderArchive,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("duplicate stable ID SW-900");
  });
});
