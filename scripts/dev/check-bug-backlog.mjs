import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = "BUG-SWARM-BACKLOG.md";

/** Sektioner som maste finnas exakt en gang. "Aktiv ko" ar dessutom den enda
 *  sektion canvas-generatorn och den har checken laser som oppen risk. */
const REQUIRED_SECTIONS = Object.freeze([
  { label: "Aktiv kö", pattern: /^##\s+Aktiv\s+k/iu },
  { label: "Behöver repro", pattern: /^##\s+Beh(ö|o)ver\s+repro\b/iu },
  { label: "Väntar på ägarbeslut", pattern: /^##\s+V(ä|a)ntar\s+p(å|a)\s+(ä|a)garbeslut\b/iu },
  {
    label: "Säkerhet, infra och teknisk skuld",
    pattern: /^##\s+S(ä|a)kerhet,\s+infra\s+och\s+teknisk\s+skuld\b/iu,
  },
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
const ACTIVE_HEADER = Object.freeze([
  "Klar",
  "Status",
  "Prio",
  "Fynd",
  "Bevis på `master`",
  "Nästa steg",
]);
const MASTER_EVIDENCE_RE =
  /(?:\b(?:src|backoffice|scripts|config|data|docs|preview-host|public)\/[\w@.[\]/-]+|\b[\w.-]+\.(?:ts|tsx|js|mjs|cjs|py|json|md)\b|https:\/\/github\.com\/[^\s)]+\/pull\/\d+|\bprod(?:uction)?\b|\b[0-9a-f]{7,40}\b)/iu;
const ISSUE_ID_RE = /\bSM-(\d{3})\b/gu;
const NEXT_ID_RE = /N(ä|a)sta lediga ID (ä|a)r\s+`(SM-\d{3})`/iu;

// Monotont, committat tombstone-ledger. Backloggen haller bara ett tunt arkiv,
// men ett borttrimmat ID blir aldrig ledigt igen. Nar en kanonisk arkivrad
// senare trimmas maste dess ID flyttas hit i samma granskade andring. Golvet ar
// avsiktligt kod, inte redigerbar backloggprosa, sa aterbruk kraver en synlig
// forsvagning av sjalva grinden.
const RETIRED_ID_LEDGER = Object.freeze([
  "SM-002",
  "SM-004",
  "SM-005",
  "SM-006",
  "SM-008",
  "SM-009",
  "SM-010",
  "SM-011",
  "SM-012",
  "SM-016",
  "SM-017",
  "SM-019",
  "SM-020",
  "SM-021",
  "SM-022",
  "SM-023",
  "SM-024",
  "SM-026",
  "SM-027",
  "SM-028",
  "SM-029",
  "SM-031",
  "SM-034",
  "SM-036",
  "SM-039",
  "SM-041",
  "SM-042",
  "SM-043",
  "SM-044",
  "SM-048",
  "SM-049",
  "SM-050",
  "SM-051",
  "SM-052",
  "SM-053",
  "SM-055",
  "SM-057",
  "SM-058",
  "SM-059",
  "SM-060",
  "SM-061",
  "SM-062",
  "SM-063",
  "SM-064",
  "SM-065",
  "SM-066",
  "SM-067",
  "SM-068",
  "SM-069",
]);

/**
 * Kolumnen som DEFINIERAR ett stabilt ID i respektive kanonisk tabell.
 * Avsiktligt ingar inte "Pagaende PR-spar" eller forklarande brodtext: dar
 * forekommer endast referenser till rader som ags av nagon av tabellerna nedan.
 */
const CANONICAL_ID_SECTIONS = Object.freeze([
  { label: "Aktiv kö", pattern: /^##\s+Aktiv\s+k/iu, column: 3 },
  {
    label: "Releaseblockerare bakom avstängd flagga",
    pattern: /^##\s+Releaseblockerare\s+bakom\s+avst(ä|a)ngd\s+flagga\b/iu,
    column: 0,
  },
  { label: "Behöver repro", pattern: /^##\s+Beh(ö|o)ver\s+repro\b/iu, column: 0 },
  {
    label: "Väntar på ägarbeslut",
    pattern: /^##\s+V(ä|a)ntar\s+p(å|a)\s+(ä|a)garbeslut\b/iu,
    column: 1,
  },
  {
    label: "Säkerhet, infra och teknisk skuld",
    pattern: /^##\s+S(ä|a)kerhet,\s+infra\s+och\s+teknisk\s+skuld\b/iu,
    column: 1,
  },
  { label: "Arkiv", pattern: /^##\s+Arkiv\b/iu, column: 1 },
]);

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function canonicalIssueIds(lines) {
  const definitions = [];

  for (const section of CANONICAL_ID_SECTIONS) {
    for (let heading = 0; heading < lines.length; heading += 1) {
      if (!section.pattern.test(lines[heading].trim())) continue;

      const endRel = lines.slice(heading + 1).findIndex((line) => /^##\s+/u.test(line.trim()));
      const end = endRel === -1 ? lines.length : heading + 1 + endRel;
      for (let lineIndex = heading + 1; lineIndex < end; lineIndex += 1) {
        const cells = tableCells(lines[lineIndex]);
        const ownerCell = cells?.[section.column];
        if (!ownerCell) continue;

        for (const match of ownerCell.matchAll(ISSUE_ID_RE)) {
          definitions.push({
            id: match[0],
            numeric: Number.parseInt(match[1], 10),
            section: section.label,
            label: ownerCell,
          });
        }
      }
    }
  }

  return definitions;
}

/** @param {string} body @returns {string[]} lista med fel; tom = OK */
export function validateBacklog(body, { retiredIds = RETIRED_ID_LEDGER } = {}) {
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
    const activeLines = lines.slice(aktivIdx + 1, end);
    const header = activeLines.map(tableCells).find((cells) => cells?.[0] === "Klar");
    if (
      !header ||
      header.length !== ACTIVE_HEADER.length ||
      header.some((cell, i) => cell !== ACTIVE_HEADER[i])
    ) {
      failures.push(`Aktiv kö header must be exactly six columns: ${ACTIVE_HEADER.join(" | ")}`);
    }

    for (const line of activeLines) {
      const t = line.trim();
      if (!t.startsWith("| [")) continue; // bara datarader med kryssruta
      const cells = tableCells(t);
      if (!cells || cells.length !== ACTIVE_HEADER.length) {
        failures.push(`Aktiv kö row must have exactly six columns: ${t}`);
        continue;
      }
      // | Klar | Status | Prio | Fynd | Bevis pa master | Nasta steg |
      const [klar, status, , fynd, evidence] = cells;
      const label = fynd || t;

      // 1. Inga avbockade rader i Aktiv ko - fixat ska FLYTTAS till arkivet.
      if (klar === "[x]") {
        failures.push(
          `closed row "[x]" left in Aktiv kö (move it to ## Arkiv in the fix PR; it becomes canonical after merge): ${label}`,
        );
        continue;
      }

      // 2. En sanning per rad: en oppen "[ ]"-rad far inte ha en status som
      //    pastar att den ar klar (klassisk drift: fix-status men gloomd kryssruta).
      if (/^\[\s*\]$/.test(klar) && RESOLVED_STATUS_RE.test(status)) {
        failures.push(
          `open row "[ ]" claims resolved status "${status}" — flip to [x] and move to ## Arkiv, or correct the status: ${label}`,
        );
      }

      // 3. Stabilt ID forst i Fynd-cellen, aldrig aterbrukat. Rader refereras
      //    med ID, inte med radnummer eller "raden ovan".
      const idMatch = ROW_ID_RE.exec(fynd || "");
      if (!idMatch) {
        failures.push(
          `Aktiv kö row is missing a leading stable id (expected \`SM-###\` first in the Fynd cell): ${label}`,
        );
        continue;
      }

      // 4. Aktiv ko ar verifierad master-sanning. Gamla kalla-taggar eller ren
      //    hypotes far inte sta dar beviset ska ga att kontrollera.
      if (!evidence || /\bM#\d+\b/iu.test(evidence) || !MASTER_EVIDENCE_RE.test(evidence)) {
        failures.push(
          `Aktiv kö row needs real master evidence (repo path/symbol, merged PR, SHA or prod proof; never M#): ${label}`,
        );
      }
    }
  }

  // ID:n ar globala och far aldrig ateranvandas nar en rad flyttas mellan
  // ko, repro, releaseblockerare, beslut, skuld och arkiv.
  const definitions = canonicalIssueIds(lines);
  const seenIds = new Map();
  for (const definition of definitions) {
    const previous = seenIds.get(definition.id);
    if (previous) {
      failures.push(
        `duplicate row id ${definition.id} — ids are stable and never reused (${previous.section} and ${definition.section}): ${definition.label}`,
      );
    } else {
      seenIds.set(definition.id, definition);
    }
  }

  const retired = new Set();
  for (const id of retiredIds) {
    if (!/^SM-\d{3}$/u.test(id) || id === "SM-000") {
      failures.push(`invalid retired backlog id in immutable ledger: ${id}`);
      continue;
    }
    if (retired.has(id)) {
      failures.push(`duplicate retired backlog id in immutable ledger: ${id}`);
      continue;
    }
    retired.add(id);
    if (seenIds.has(id)) {
      failures.push(`retired row id ${id} may never be reused in a canonical backlog row`);
    }
  }

  const nextIdMatches = lines
    .map((line) => NEXT_ID_RE.exec(line))
    .filter((match) => match !== null);
  if (nextIdMatches.length !== 1) {
    failures.push(
      `expected exactly one \"Nästa lediga ID är SM-###\" marker, found ${nextIdMatches.length}`,
    );
  } else {
    const nextId = nextIdMatches[0][3];
    const nextNumeric = Number.parseInt(nextId.slice(3), 10);
    const issued = new Set([...seenIds.keys(), ...retired]);
    for (let numeric = 1; numeric < nextNumeric; numeric += 1) {
      const id = `SM-${String(numeric).padStart(3, "0")}`;
      if (!issued.has(id)) {
        failures.push(
          `issued id ${id} is missing from canonical rows and the immutable retired ledger`,
        );
      }
    }
    for (const id of issued) {
      const numeric = Number.parseInt(id.slice(3), 10);
      if (numeric >= nextNumeric) {
        failures.push(
          `issued id ${id} must be below next free id ${nextId}; allocate only the current next id`,
        );
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
    console.error(
      `- could not read file: ${error instanceof Error ? error.message : String(error)}`,
    );
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
