import { readFileSync } from "node:fs";

const file = "BUG-SWARM-BACKLOG.md";
const verbose =
  process.argv.includes("--verbose") ||
  process.env.CHECK_BUG_BACKLOG_VERBOSE === "1" ||
  process.env.CHECK_BUG_BACKLOG_VERBOSE === "true";

const REQUIRED_SECTIONS = [
  "Aktiva produktionsbuggar",
  "Release blockers bakom feature flag",
  "Risker som behöver repro",
  "Väntar på ägarbeslut",
  "Säkerhet, infra och teknisk skuld",
  "Arkiv",
];

const EXECUTABLE_SECTIONS = new Set([
  "Aktiva produktionsbuggar",
  "Release blockers bakom feature flag",
]);

const EXECUTABLE_HEADERS = [
  "ID",
  "Prio",
  "Räckvidd",
  "Fel",
  "Kodbevis",
  "Nästa steg",
  "Verifierad",
];

function readBacklog() {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    console.error(`[check-bug-backlog] ${file} failed sanity checks:`);
    console.error(
      `- could not read file: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

function normalizeCell(value) {
  return String(value ?? "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const cells = [];
  let cell = "";
  for (const character of trimmed.slice(1, -1)) {
    if (character !== "|") {
      cell += character;
      continue;
    }
    const trailingBackslashes = cell.match(/\\+$/u)?.[0].length ?? 0;
    if (trailingBackslashes % 2 === 1) {
      cell = `${cell.slice(0, -1)}|`;
      continue;
    }
    cells.push(cell.trim());
    cell = "";
  }
  cells.push(cell.trim());
  return cells;
}

function isSeparatorRow(cells) {
  return cells?.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function collectSection(lines, heading) {
  const indexes = lines
    .map((line, index) => (line.trim() === `## ${heading}` ? index : -1))
    .filter((index) => index !== -1);

  if (indexes.length !== 1) return { indexes, lines: [] };

  const start = indexes[0] + 1;
  const endRelative = lines.slice(start).findIndex((line) => /^##\s+/u.test(line.trim()));
  const end = endRelative === -1 ? lines.length : start + endRelative;
  return { indexes, lines: lines.slice(start, end) };
}

function parseFirstTable(sectionLines) {
  const tableLines = sectionLines.filter((line) => line.trim().startsWith("|"));
  if (tableLines.length < 2) return null;

  const headers = splitTableLine(tableLines[0]);
  const separator = splitTableLine(tableLines[1]);
  if (!headers || !separator || !isSeparatorRow(separator)) return null;

  const rows = [];
  for (const line of tableLines.slice(2)) {
    const cells = splitTableLine(line);
    if (!cells || isSeparatorRow(cells)) continue;
    const row = {};
    for (let index = 0; index < headers.length; index += 1) {
      row[normalizeCell(headers[index])] = normalizeCell(cells[index]);
    }
    rows.push(row);
  }
  return { headers: headers.map(normalizeCell), rows };
}

function validateStableId({ row, section, failures, seenIds }) {
  const id = row.ID ?? "";
  if (!/^SW-\d{3}[A-Z]?$/.test(id)) {
    failures.push(`${section}: invalid or missing stable ID "${id || "<empty>"}"`);
  } else if (seenIds.has(id)) {
    failures.push(`${section}: duplicate stable ID ${id} (already in ${seenIds.get(id)})`);
  } else {
    seenIds.set(id, section);
  }
  return id;
}

function validateIdAndPriority({ row, section, failures, seenIds }) {
  const id = validateStableId({ row, section, failures, seenIds });
  const priority = row.Prio ?? row["Prio vid träff"] ?? "";
  if (!/^P[0-3]$/.test(priority)) {
    failures.push(`${section} ${id || "<unknown>"}: invalid priority "${priority || "<empty>"}"`);
  }
}

const body = readBacklog();
const lines = body.split(/\r?\n/);
const failures = [];
const seenIds = new Map();
let rowCount = 0;
let archiveRowCount = 0;

if (lines.filter((line) => line.trim() === "# Bug-backlog").length !== 1) {
  failures.push('expected exactly one canonical heading "# Bug-backlog"');
}

for (const marker of [
  /^# Bug-backlog \(konsoliderad\)$/,
  /^# Bug \/ städ-backlog\b/,
  /^## Aktiv kö$/,
  /^## Huvudtabell$/,
  /^## Status för A1\/A2/,
  /^\*Uppdaterad:/,
]) {
  if (lines.some((line) => marker.test(line.trim()))) {
    failures.push(`stale backlog marker remains: ${marker}`);
  }
}

for (const heading of REQUIRED_SECTIONS) {
  const section = collectSection(lines, heading);
  if (section.indexes.length !== 1) {
    failures.push(`expected exactly one "## ${heading}" section, found ${section.indexes.length}`);
    continue;
  }

  if (heading === "Arkiv") {
    const archivePaths = [
      ...new Set(
        [
          ...section.lines
            .join("\n")
            .matchAll(
              /\((docs\/plans\/avklarat\/bug-swarm\/backlog-arkiv-\d{4}-\d{2}-\d{2}\.md)\)/gu,
            ),
        ].map((match) => match[1]),
      ),
    ];
    if (archivePaths.length === 0) {
      failures.push("Arkiv: expected a link to a dated backlog archive");
      continue;
    }
    const expectedArchiveHeaders = ["ID", "Dom", "Tidigare premiss", "Bevis"];
    for (const [archiveIndex, archivePath] of archivePaths.entries()) {
      try {
        const archiveLines = readFileSync(archivePath, "utf8").split(/\r?\n/u);
        const archiveTable = parseFirstTable(archiveLines);
        const hasStableIdRow = archiveLines.some((line) => /^\|\s*SW-\d{3}[A-Z]?\s*\|/u.test(line));
        const isCurrentFormat =
          archiveTable &&
          JSON.stringify(archiveTable.headers) === JSON.stringify(expectedArchiveHeaders);

        // Den först länkade filen är det aktuella skrivmålet och måste alltid ha
        // ID-formatet. Äldre checkboxarkiv är fryst legacy, men så fort en äldre
        // fil innehåller SW-ID:n deltar den i samma globala unikhetskontroll.
        if (archiveIndex === 0 || hasStableIdRow) {
          if (!archiveTable) {
            failures.push(`Arkiv: ${archivePath} must contain a Markdown table`);
            continue;
          }
          if (!isCurrentFormat) {
            failures.push(
              `Arkiv: ${archivePath} expected headers ${expectedArchiveHeaders.join(", ")}; found ${archiveTable.headers.join(", ")}`,
            );
            continue;
          }
          for (const row of archiveTable.rows) {
            archiveRowCount += 1;
            const id = validateStableId({
              row,
              section: `Arkiv (${archivePath})`,
              failures,
              seenIds,
            });
            if (!row.Dom || !row["Tidigare premiss"] || !row.Bevis) {
              failures.push(
                `Arkiv ${id || "<unknown>"}: missing verdict, prior premise, or evidence`,
              );
            }
            if (/\[[x ]\]/iu.test(Object.values(row).join(" "))) {
              failures.push(
                `Arkiv ${id || "<unknown>"}: checkbox state is forbidden; archive placement owns status`,
              );
            }
          }
        }
      } catch (error) {
        failures.push(
          `Arkiv: could not read linked archive ${archivePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    continue;
  }

  const table = parseFirstTable(section.lines);
  if (!table) {
    failures.push(`${heading}: expected a Markdown table`);
    continue;
  }

  if (EXECUTABLE_SECTIONS.has(heading)) {
    if (JSON.stringify(table.headers) !== JSON.stringify(EXECUTABLE_HEADERS)) {
      failures.push(
        `${heading}: expected headers ${EXECUTABLE_HEADERS.join(", ")}; found ${table.headers.join(", ")}`,
      );
    }
  }

  for (const row of table.rows) {
    rowCount += 1;
    validateIdAndPriority({ row, section: heading, failures, seenIds });

    if (!EXECUTABLE_SECTIONS.has(heading)) continue;

    const id = row.ID || "<unknown>";
    if (!row.Räckvidd || !row.Fel || !row.Kodbevis || !row["Nästa steg"]) {
      failures.push(`${heading} ${id}: missing scope, defect, code evidence, or next step`);
    }
    if (!/^\d{4}-\d{2}-\d{2}\s+[0-9a-f]{7,40}$/i.test(row.Verifierad ?? "")) {
      failures.push(`${heading} ${id}: Verifierad must contain YYYY-MM-DD and a git SHA`);
    }
    if ((row.Fel ?? "").length > 220) {
      failures.push(
        `${heading} ${id}: defect text is too long (${row.Fel.length} > 220 characters)`,
      );
    }
    if ((row["Nästa steg"] ?? "").length > 220) {
      failures.push(
        `${heading} ${id}: next step is too long (${row["Nästa steg"].length} > 220 characters)`,
      );
    }
    if (/\[[x ]\]/iu.test(Object.values(row).join(" "))) {
      failures.push(`${heading} ${id}: checkbox state is forbidden; section placement owns status`);
    }
  }
}

if (failures.length > 0) {
  console.error(`[check-bug-backlog] ${file} failed sanity checks:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (verbose) {
  console.info(
    `[check-bug-backlog] ${file} OK (${rowCount} operational rows, ${archiveRowCount} archived rows, ${seenIds.size} unique IDs)`,
  );
}
