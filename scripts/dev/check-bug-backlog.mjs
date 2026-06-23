import { readFileSync } from "node:fs";

const file = "BUG-SWARM-BACKLOG.md";
const verbose =
  process.argv.includes("--verbose") ||
  process.env.CHECK_BUG_BACKLOG_VERBOSE === "1" ||
  process.env.CHECK_BUG_BACKLOG_VERBOSE === "true";
let body = "";
try {
  body = readFileSync(file, "utf8");
} catch (error) {
  console.error(`[check-bug-backlog] ${file} failed sanity checks:`);
  console.error(`- could not read file: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const lines = body.split(/\r?\n/);

const failures = [];
const headings = lines.filter((line) => line.trim() === "# Bug-backlog (konsoliderad)");

if (headings.length !== 1) {
  failures.push(`expected exactly one consolidated backlog heading, found ${headings.length}`);
}

// Stale raw-backlog-markorer fran tidigare ohanterade ralistor.
for (const marker of [/^# Bug \/ städ-backlog\b/, /^## Huvudtabell$/, /^## Status för A1\/A2/, /^\*Uppdaterad:/]) {
  if (lines.some((line) => marker.test(line.trim()))) {
    failures.push(`stale raw backlog marker remains: ${marker}`);
  }
}

// "## Aktiv ko" ar den enda kanoniska sektionen (canvas + denna check laser den).
const aktivIdxs = lines
  .map((line, idx) => (/^##\s+Aktiv\s+k/iu.test(line.trim()) ? idx : -1))
  .filter((idx) => idx !== -1);

if (aktivIdxs.length !== 1) {
  failures.push(`expected exactly one "## Aktiv kö" section, found ${aktivIdxs.length}`);
} else {
  const start = aktivIdxs[0];
  const endRel = lines.slice(start + 1).findIndex((l) => /^##\s+/u.test(l.trim()));
  const end = endRel === -1 ? lines.length : start + 1 + endRel;
  const section = lines.slice(start + 1, end);

  for (const line of section) {
    const t = line.trim();
    if (!t.startsWith("| [")) continue; // bara dataradar med kryssruta
    const cells = t.split("|").map((c) => c.trim());
    if (cells.length < 7) continue;
    const klar = cells[1];
    const status = cells[3] || "";

    // 1. Inga avbockade rader i Aktiv ko - fixat ska FLYTTAS till arkivet.
    if (klar === "[x]") {
      failures.push(`closed row "[x]" left in Aktiv kö (move it to the archive file): ${cells[4] || t}`);
      continue;
    }

    // 2. En sanning per rad: en oppen "[ ]"-rad far inte ha en status som
    //    pastar att den ar klar (klassisk drift: fix-status men gloomd kryssruta).
    if (/^\[\s*\]$/.test(klar) && /(fixad|fixed|löst|klar|stängd|verifierad)/iu.test(status)) {
      failures.push(`open row "[ ]" claims resolved status "${status}" — flip to [x] and move to archive, or correct the status: ${cells[4] || t}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`[check-bug-backlog] ${file} failed sanity checks:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (verbose) {
  console.info(`[check-bug-backlog] ${file} OK (${lines.length} lines)`);
}
