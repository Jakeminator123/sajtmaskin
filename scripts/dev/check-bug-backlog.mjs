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

for (const marker of [/^# Bug \/ städ-backlog\b/, /^## Huvudtabell$/, /^## Status för A1\/A2/, /^\*Uppdaterad:/]) {
  if (lines.some((line) => marker.test(line.trim()))) {
    failures.push(`stale raw backlog marker remains: ${marker}`);
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
