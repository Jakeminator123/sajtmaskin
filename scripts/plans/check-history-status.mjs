#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const HISTORICAL_PREFIXES = Object.freeze({
  "docs/plans/archived/": new Set(["active", "in-progress", "ready", "scope"]),
  "docs/plans/avklarat/": new Set(["active", "in-progress", "parked", "paused", "ready", "scope"]),
});

const ARCHIVED_PREFIX = "docs/plans/archived/";
const ARCHIVED_HEADER_RULES = Object.freeze([
  { marker: "Status: Archived", pattern: /^Status:\s*Archived$/i },
  { marker: "Not current architecture", pattern: /^Not current architecture\.?$/i },
  {
    marker: "Do not use as runtime guidance",
    pattern: /^Do not use as runtime guidance\.?$/i,
  },
  {
    marker: "Replaced by",
    pattern: /^Replaced by:\s+\[[^\]]+\]\([^)]+\)$/i,
  },
]);

function listTrackedHistoricalPaths() {
  return execFileSync("git", ["ls-files", "-z", "docs/plans/archived", "docs/plans/avklarat"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

export function extractPlanStatus(content) {
  const header = content.split(/\r?\n/).slice(0, 15).join("\n");
  const match = header.match(/^\s*(?:\*\*status:\*\*|\*\*status\*\*:|status:)\s*([^\n#]+)/im);
  const raw = match?.[1]?.trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2");
}

export function checkHistoricalPlanStatuses({ trackedPaths, readTrackedFile } = {}) {
  const tracked = trackedPaths ?? listTrackedHistoricalPaths();
  const read = readTrackedFile ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));

  return Promise.all(
    tracked
      .filter((path) => posix.extname(path).toLowerCase() === ".md")
      .sort()
      .map(async (path) => {
        const prefix = Object.keys(HISTORICAL_PREFIXES).find((candidate) =>
          path.startsWith(candidate),
        );
        if (!prefix) return null;
        const status = extractPlanStatus(await read(path));
        if (!status) return null;
        const normalized = status.split(/[\s(]/, 1)[0] ?? status;
        return HISTORICAL_PREFIXES[prefix].has(normalized)
          ? { path, status, expectedLocation: prefix }
          : null;
      }),
  ).then((results) => results.filter(Boolean));
}

export function findMissingArchivedPlanHeaderMarkers(content) {
  const lines = content.split(/\r?\n/);
  const firstHeading = lines.findIndex((line) => /^#\s+/.test(line.trimStart()));
  const preHeadingLines = firstHeading === -1 ? lines : lines.slice(0, firstHeading);
  const frontmatterEnd =
    preHeadingLines[0]?.trim() === "---"
      ? preHeadingLines.findIndex((line, index) => index > 0 && line.trim() === "---")
      : -1;
  const preamble = preHeadingLines
    .slice(frontmatterEnd + 1)
    .map((line) => line.trim().replace(/^>\s?/, "").trim());

  return ARCHIVED_HEADER_RULES.filter(
    ({ pattern }) => !preamble.some((line) => pattern.test(line)),
  ).map(({ marker }) => marker);
}

export function checkArchivedPlanHeaders({ trackedPaths, readTrackedFile } = {}) {
  const tracked = trackedPaths ?? listTrackedHistoricalPaths();
  const read = readTrackedFile ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));

  return Promise.all(
    tracked
      .filter(
        (path) => path.startsWith(ARCHIVED_PREFIX) && posix.extname(path).toLowerCase() === ".md",
      )
      .sort()
      .map(async (path) => {
        const missingMarkers = findMissingArchivedPlanHeaderMarkers(await read(path));
        return missingMarkers.length > 0 ? { path, missingMarkers } : null;
      }),
  ).then((results) => results.filter(Boolean));
}

async function main() {
  const trackedPaths = listTrackedHistoricalPaths();
  const [statusFailures, headerFailures] = await Promise.all([
    checkHistoricalPlanStatuses({ trackedPaths }),
    checkArchivedPlanHeaders({ trackedPaths }),
  ]);

  for (const failure of statusFailures) {
    console.error(
      `[plans:history:check] ${failure.path}: status=${failure.status} contradicts ${failure.expectedLocation}`,
    );
  }
  for (const failure of headerFailures) {
    console.error(
      `[plans:history:check] ${failure.path}: missing archive header markers: ${failure.missingMarkers.join(
        ", ",
      )}`,
    );
  }

  if (statusFailures.length > 0 || headerFailures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    "[plans:history:check] Historical plan locations, statuses, and archive headers agree.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
