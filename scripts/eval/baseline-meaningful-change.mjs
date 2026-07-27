/**
 * Decides whether a refreshed `eval-baseline.json` differs in a way worth
 * opening a PR for.
 *
 * `saveBaseline()` rewrites the whole file on every run, including three fields
 * that change even when the eval outcome is identical: the run `timestamp`,
 * each result's `generationTimeMs`, and the derived `summary.avgTimeMs`. A
 * plain `git diff --quiet` is therefore ALWAYS dirty, so the weekly job's
 * documented "no improvement -> no PR" path could never happen and every
 * Monday would produce a draft PR containing nothing but wall-clock noise.
 * A recurring PR nobody needs to read trains the same reflex as a permanently
 * red badge: ignore it.
 *
 * Scores, pass/fail, blocking checks, file counts, the model and every
 * non-timing summary field are all still compared, so a real regression or
 * improvement is never swallowed.
 *
 * Usage: node scripts/eval/baseline-meaningful-change.mjs <previous.json> <next.json>
 * Prints `true` or `false`. Exit 0 on success, 1 on unreadable input.
 */
import { readFileSync } from "fs";

/** Fields rewritten by every run regardless of outcome. */
export const VOLATILE_RESULT_FIELDS = ["generationTimeMs"];
export const VOLATILE_TOP_LEVEL_FIELDS = ["timestamp"];
export const VOLATILE_SUMMARY_FIELDS = ["avgTimeMs"];

function omit(source, fields) {
  if (!source || typeof source !== "object") return source;
  const copy = { ...source };
  for (const field of fields) delete copy[field];
  return copy;
}

/**
 * The comparable projection of a baseline: everything that describes the eval
 * OUTCOME, with pure wall-clock fields removed.
 *
 * @param {unknown} baseline
 * @returns {unknown}
 */
export function stripVolatileBaselineFields(baseline) {
  if (!baseline || typeof baseline !== "object") return baseline;
  const stripped = omit(baseline, VOLATILE_TOP_LEVEL_FIELDS);
  if (Array.isArray(stripped.results)) {
    stripped.results = stripped.results.map((result) => omit(result, VOLATILE_RESULT_FIELDS));
  }
  if (stripped.summary && typeof stripped.summary === "object") {
    stripped.summary = omit(stripped.summary, VOLATILE_SUMMARY_FIELDS);
  }
  return stripped;
}

/**
 * @param {unknown} previous - baseline as committed
 * @param {unknown} next - baseline the run just wrote
 * @returns {boolean} true when something other than timing changed
 */
export function hasMeaningfulBaselineChange(previous, next) {
  return (
    JSON.stringify(stripVolatileBaselineFields(previous)) !==
    JSON.stringify(stripVolatileBaselineFields(next))
  );
}

function main() {
  const [previousPath, nextPath] = process.argv.slice(2);
  if (!previousPath || !nextPath) {
    console.error(
      "[eval:baseline-change] usage: baseline-meaningful-change.mjs <previous.json> <next.json>",
    );
    process.exit(1);
  }

  let previous;
  let next;
  try {
    previous = JSON.parse(readFileSync(previousPath, "utf8"));
    next = JSON.parse(readFileSync(nextPath, "utf8"));
  } catch (error) {
    console.error(`[eval:baseline-change] could not read baselines: ${error.message}`);
    process.exit(1);
  }

  console.log(hasMeaningfulBaselineChange(previous, next) ? "true" : "false");
}

if (process.argv[1] && process.argv[1].endsWith("baseline-meaningful-change.mjs")) {
  main();
}
