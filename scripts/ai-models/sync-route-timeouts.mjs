#!/usr/bin/env node
/**
 * Deterministic route `maxDuration` codegen — canonical owner of the
 * manifest → route-literal sync (Plan B #9).
 *
 * `config/ai_models/manifest.json` `routeTimeouts.*.default` is the source of
 * truth for the per-route server stream ceilings. Next.js requires
 * `maxDuration` to be a statically-analyzable literal in each route segment, so
 * this script writes/verifies the literal `export const maxDuration = N;` in
 * every target listed by `route-timeout-targets.mjs`.
 *
 * This replaces the previous Python regex patcher in the backoffice
 * (`sync_route_timeout_literals`): the backoffice now only saves the manifest,
 * and the literals are regenerated here in dev/build/CI and committed to the repo.
 *
 * Modes (exactly one flag required):
 *   --write   Rewrite drifted literals from the manifest (idempotent). Prints a summary.
 *   --check   Write nothing; exit 1 if any literal drifts/missing. CI/preflight gate.
 *
 * Fail-loud in BOTH modes for every target:
 *   - file missing on disk                  → fail
 *   - 0 `export const maxDuration = <int>;` → fail (format drift / literal removed)
 *   - more than 1 such literal              → fail (ambiguous which to write)
 *
 * Run via `npm run route-timeouts:sync` / `npm run route-timeouts:check`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTE_TIMEOUT_TARGETS } from "./route-timeout-targets.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_REL = "config/ai_models/manifest.json";

// Match every `export const maxDuration = <int>;` so we can enforce exactly one.
const MAX_DURATION_RE = /export const maxDuration = (\d+);/g;

function parseMode(argv) {
  const flags = argv.slice(2).filter((a) => a.startsWith("--"));
  const wantsWrite = flags.includes("--write");
  const wantsCheck = flags.includes("--check");
  if (wantsWrite && wantsCheck) return { error: "Pass exactly one of --write or --check, not both." };
  if (wantsWrite) return { mode: "write" };
  if (wantsCheck) return { mode: "check" };
  return { error: "Missing required flag. Pass --write or --check." };
}

function usageAndExit(message) {
  console.error(`[route-timeouts] ${message}`);
  console.error("");
  console.error("Usage:");
  console.error("  node scripts/ai-models/sync-route-timeouts.mjs --check   # verify, exit 1 on drift");
  console.error("  node scripts/ai-models/sync-route-timeouts.mjs --write   # rewrite drifted literals");
  process.exit(2);
}

function readManifestRouteTimeouts() {
  const manifestPath = path.join(REPO_ROOT, MANIFEST_REL);
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (err) {
    usageAndExit(`could not read ${MANIFEST_REL}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    usageAndExit(`could not parse ${MANIFEST_REL}: ${err.message}`);
  }
  const routeTimeouts = parsed?.routeTimeouts;
  if (!routeTimeouts || typeof routeTimeouts !== "object") {
    usageAndExit(`${MANIFEST_REL} has no \`routeTimeouts\` object`);
  }
  return routeTimeouts;
}

function expectedForField(routeTimeouts, manifestField) {
  const entry = routeTimeouts[manifestField];
  const value = entry?.default;
  if (!Number.isInteger(value)) {
    usageAndExit(
      `${MANIFEST_REL} routeTimeouts.${manifestField}.default is missing or not an integer ` +
        `(got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

/**
 * Find the single `maxDuration` literal in `src`. Fail-loud on 0 or >1 matches.
 * Returns { value, start, end } describing the matched literal substring.
 */
function findSingleMaxDuration(src, rel) {
  const matches = [...src.matchAll(MAX_DURATION_RE)];
  if (matches.length === 0) {
    return { error: `${rel}: found 0 \`export const maxDuration = <int>;\` literals (expected exactly 1)` };
  }
  if (matches.length > 1) {
    return {
      error: `${rel}: found ${matches.length} \`export const maxDuration = <int>;\` literals (expected exactly 1)`,
    };
  }
  const m = matches[0];
  return { value: Number(m[1]), start: m.index, end: m.index + m[0].length };
}

function main() {
  const parsed = parseMode(process.argv);
  if (parsed.error) usageAndExit(parsed.error);
  const mode = parsed.mode;

  const routeTimeouts = readManifestRouteTimeouts();

  const failures = [];
  const drifted = [];
  const lines = [];
  let wrote = 0;

  for (const { rel, manifestField } of ROUTE_TIMEOUT_TARGETS) {
    const expected = expectedForField(routeTimeouts, manifestField);
    const abs = path.join(REPO_ROOT, rel);

    let src;
    try {
      src = fs.readFileSync(abs, "utf8");
    } catch (err) {
      failures.push(`${rel}: file not readable (${err.message})`);
      continue;
    }

    const found = findSingleMaxDuration(src, rel);
    if (found.error) {
      failures.push(found.error);
      continue;
    }

    if (found.value === expected) {
      lines.push(`OK    ${rel}  maxDuration = ${expected}`);
      continue;
    }

    // Drift detected.
    drifted.push({ rel, manifestField, got: found.value, expected });

    if (mode === "write") {
      const replacement = `export const maxDuration = ${expected};`;
      const next = src.slice(0, found.start) + replacement + src.slice(found.end);
      fs.writeFileSync(abs, next, "utf8");
      wrote += 1;
      lines.push(`WRITE ${rel}  ${found.value} -> ${expected}`);
    } else {
      lines.push(`DRIFT ${rel}  got ${found.value}, expected ${expected} (${manifestField})`);
    }
  }

  console.log(`route-timeouts:${mode}`);
  console.log("--------------------");
  for (const line of lines) console.log(line);

  if (failures.length > 0) {
    console.error("");
    console.error(`FAILED (${failures.length} fail-loud problem${failures.length === 1 ? "" : "s"}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  if (mode === "check") {
    if (drifted.length > 0) {
      console.error("");
      console.error(
        `FAILED: ${drifted.length} route literal(s) drifted from ${MANIFEST_REL}. ` +
          `Run \`npm run route-timeouts:sync\` to regenerate.`,
      );
      process.exit(1);
    }
    console.log("");
    console.log("All route maxDuration literals match the manifest.");
    process.exit(0);
  }

  // write mode
  console.log("");
  console.log(
    wrote === 0
      ? "No changes — all route maxDuration literals already match the manifest."
      : `Updated ${wrote} route literal(s) from the manifest.`,
  );
  process.exit(0);
}

main();
