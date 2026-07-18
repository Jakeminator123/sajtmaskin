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

export function extractPlanStatus(content) {
  const header = content.split(/\r?\n/).slice(0, 15).join("\n");
  const match = header.match(/^\s*(?:\*\*status:\*\*|\*\*status\*\*:|status:)\s*([^\n#]+)/im);
  const raw = match?.[1]?.trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2");
}

export function checkHistoricalPlanStatuses({ trackedPaths, readTrackedFile } = {}) {
  const tracked =
    trackedPaths ??
    execFileSync("git", ["ls-files", "-z", "docs/plans/archived", "docs/plans/avklarat"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
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

async function main() {
  const failures = await checkHistoricalPlanStatuses();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `[plans:history:check] ${failure.path}: status=${failure.status} contradicts ${failure.expectedLocation}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log("[plans:history:check] Historical plan locations and statuses agree.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
