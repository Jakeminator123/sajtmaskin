import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = "BUG-SWARM-BACKLOG.md";

/** Sektioner som maste finnas exakt en gang. "Aktiv ko" ar dessutom den enda
 *  sektion canvas-generatorn och den har checken laser som oppen risk. */
const REQUIRED_SECTIONS = Object.freeze([
  { label: "Aktiv kö", pattern: /^##\s+Aktiv\s+k/iu },
  { label: "Behöver repro", pattern: /^##\s+Beh(ö|o)ver\s+repro\b/iu },
  { label: "Väntar på ägarbeslut", pattern: /^##\s+V(ä|a)ntar\s+p(å|a)\s+(ä|a)garbeslut\b/iu },
  { label: "Säkerhet, infra och teknisk skuld", pattern: /^##\s+S(ä|a)kerhet,\s+infra\s+och\s+teknisk\s+skuld\b/iu },
]);

/** Stale raw-backlog-markorer fran tidigare ohanterade ralistor. */
const STALE_MARKERS = Object.freeze([
  /^# Bug \/ städ-backlog\b/,
  /^## Huvudtabell$/,
  /^## Status för A1\/A2/,
  /^\*Uppdaterad:/,
]);

const RESOLVED_STATUS_RE = /(fixad|fixed|löst|klar|stängd|verifierad)/iu;
const ROW_ID_RE = /^`(SM-\d{3})`\s+\S/u;

/** @param {string} body @returns {string[]} lista med fel; tom = OK */
export function validateBacklog(body) {
  const lines = body.split(/\r?\n/);
  const failures = [];

  const headings = lines.filter((line) => line.trim() === "# Bug-backlog (konsoliderad)");
  if (headings.length !== 1) {
    failures.push(`expected exactly one consolidated backlog heading, found ${headings.length}`);
  }

  for (const marker of STALE_MARKERS) {
    if (lines.some((line) => marker.test(line.trim()))) {
      failures.push(`stale raw backlog marker remains: ${marker}`);
    }
  }

  for (const { label, pattern } of REQUIRED_SECTIONS) {
    const found = lines.filter((line) => pattern.test(line.trim())).length;
    if (found !== 1) {
      failures.push(`expected exactly one "## ${label}" section, found ${found}`);
    }
  }

  const aktivIdx = lines.findIndex((line) => REQUIRED_SECTIONS[0].pattern.test(line.trim()));
  if (aktivIdx !== -1) {
    const endRel = lines.slice(aktivIdx + 1).findIndex((l) => /^##\s+/u.test(l.trim()));
    const end = endRel === -1 ? lines.length : aktivIdx + 1 + endRel;
    const seenIds = new Map();

    for (const line of lines.slice(aktivIdx + 1, end)) {
      const t = line.trim();
      if (!t.startsWith("| [")) continue; // bara datarader med kryssruta
      const cells = t.split("|").map((c) => c.trim());
      if (cells.length < 7) continue;
      // | Klar | Status | Prio | Fynd | Kalla | Beslut |
      const [, klar, status, , fynd] = cells;
      const label = fynd || t;

      // 1. Inga avbockade rader i Aktiv ko - fixat ska FLYTTAS till arkivet.
      if (klar === "[x]") {
        failures.push(`closed row "[x]" left in Aktiv kö (move it to the archive file): ${label}`);
        continue;
      }

      // 2. En sanning per rad: en oppen "[ ]"-rad far inte ha en status som
      //    pastar att den ar klar (klassisk drift: fix-status men gloomd kryssruta).
      if (/^\[\s*\]$/.test(klar) && RESOLVED_STATUS_RE.test(status)) {
        failures.push(
          `open row "[ ]" claims resolved status "${status}" — flip to [x] and move to archive, or correct the status: ${label}`,
        );
      }

      // 3. Stabilt ID forst i Fynd-cellen, aldrig aterbrukat. Rader refereras
      //    med ID, inte med radnummer eller "raden ovan".
      const idMatch = ROW_ID_RE.exec(fynd || "");
      if (!idMatch) {
        failures.push(`Aktiv kö row is missing a leading stable id (expected \`SM-###\` first in the Fynd cell): ${label}`);
        continue;
      }
      const id = idMatch[1];
      if (seenIds.has(id)) {
        failures.push(`duplicate row id ${id} — ids are stable and never reused: ${label}`);
      } else {
        seenIds.set(id, label);
      }
    }
  }

  return failures;
}

function main() {
  const verbose =
    process.argv.includes("--verbose") ||
    process.env.CHECK_BUG_BACKLOG_VERBOSE === "1" ||
    process.env.CHECK_BUG_BACKLOG_VERBOSE === "true";

  let body = "";
  try {
    body = readFileSync(FILE, "utf8");
  } catch (error) {
    console.error(`[check-bug-backlog] ${FILE} failed sanity checks:`);
    console.error(`- could not read file: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const failures = validateBacklog(body);
  if (failures.length > 0) {
    console.error(`[check-bug-backlog] ${FILE} failed sanity checks:`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  if (verbose) {
    console.info(`[check-bug-backlog] ${FILE} OK (${body.split(/\r?\n/).length} lines)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
