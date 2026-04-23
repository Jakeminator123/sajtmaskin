#!/usr/bin/env node
/**
 * OMTAG-02 eval diff — compares two result directories produced by
 * `run-baseline.mjs` and prints a regression/win table per prompt.
 *
 * Usage:
 *   node scripts/evals/diff-results.mjs <before-dir> <after-dir>
 *
 * "Regression" signals that matter for the eval-baseline contract:
 *   - selected scaffold changed
 *   - selectionMethod changed (e.g. embedding → default)
 *   - selectionConfidence dropped (high → medium, medium → low)
 *   - match/acceptableHit flipped to false
 *   - selection wall-clock got > 50 % slower
 *
 * Anything else (slight duration drift, embedding cosine jitter, new
 * notes) is reported as an "info" line, not a regression.
 */
import fs from "node:fs/promises";
import path from "node:path";

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };
const DURATION_REGRESSION_RATIO = 1.5;

async function loadResult(dir, slug) {
  const file = path.join(dir, `${slug}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

async function listResultSlugs(dir) {
  const entries = await fs.readdir(dir);
  return entries
    .filter((e) => e.endsWith(".json") && !e.startsWith("_"))
    .map((e) => e.slice(0, -".json".length))
    .sort();
}

function compareDurations(before, after) {
  if (typeof before !== "number" || typeof after !== "number") return null;
  if (before <= 0) return null;
  const ratio = after / before;
  if (ratio >= DURATION_REGRESSION_RATIO) {
    return { kind: "regression", ratio };
  }
  if (ratio <= 1 / DURATION_REGRESSION_RATIO) {
    return { kind: "win", ratio };
  }
  return null;
}

function diffOne(beforeResult, afterResult) {
  const regressions = [];
  const wins = [];
  const infos = [];

  if (!beforeResult && !afterResult) return { regressions, wins, infos };
  if (!beforeResult) {
    infos.push("new prompt (no prior result)");
    return { regressions, wins, infos };
  }
  if (!afterResult) {
    regressions.push("result missing in <after>");
    return { regressions, wins, infos };
  }

  const beforeScaffold = beforeResult.expectedMatch?.actualScaffold ?? null;
  const afterScaffold = afterResult.expectedMatch?.actualScaffold ?? null;
  if (beforeScaffold !== afterScaffold) {
    const line = `scaffold ${beforeScaffold ?? "null"} → ${afterScaffold ?? "null"}`;
    const expected = afterResult.expectedMatch?.expectedScaffold;
    if (afterResult.expectedMatch?.match && !beforeResult.expectedMatch?.match) {
      wins.push(`${line} (now matches expected=${expected})`);
    } else if (
      !afterResult.expectedMatch?.match &&
      beforeResult.expectedMatch?.match
    ) {
      regressions.push(`${line} (lost match vs expected=${expected})`);
    } else {
      infos.push(line);
    }
  }

  const beforeMethod =
    beforeResult.scaffoldSelectionMeta?.selectionMethod ?? null;
  const afterMethod =
    afterResult.scaffoldSelectionMeta?.selectionMethod ?? null;
  if (beforeMethod !== afterMethod) {
    const line = `selectionMethod ${beforeMethod ?? "null"} → ${afterMethod ?? "null"}`;
    if (afterMethod === "default" && beforeMethod !== "default") {
      regressions.push(`${line} (fell back to default)`);
    } else {
      infos.push(line);
    }
  }

  const beforeConf =
    beforeResult.scaffoldSelectionMeta?.selectionConfidence ?? null;
  const afterConf =
    afterResult.scaffoldSelectionMeta?.selectionConfidence ?? null;
  if (beforeConf !== afterConf) {
    const beforeRank = CONFIDENCE_RANK[beforeConf] ?? -1;
    const afterRank = CONFIDENCE_RANK[afterConf] ?? -1;
    const line = `confidence ${beforeConf ?? "null"} → ${afterConf ?? "null"}`;
    if (afterRank < beforeRank) {
      regressions.push(line);
    } else if (afterRank > beforeRank) {
      wins.push(line);
    } else {
      infos.push(line);
    }
  }

  const durationDelta = compareDurations(
    beforeResult.phases?.scaffold_selection?.durationMs,
    afterResult.phases?.scaffold_selection?.durationMs,
  );
  if (durationDelta?.kind === "regression") {
    regressions.push(
      `scaffold_selection duration ${durationDelta.ratio.toFixed(2)}× slower`,
    );
  } else if (durationDelta?.kind === "win") {
    wins.push(
      `scaffold_selection duration ${(1 / durationDelta.ratio).toFixed(2)}× faster`,
    );
  }

  if (
    beforeResult.scaffoldSelectionMeta?.embeddingFailed === false &&
    afterResult.scaffoldSelectionMeta?.embeddingFailed === true
  ) {
    regressions.push("embedding query failed in <after>");
  }

  return { regressions, wins, infos };
}

function formatRow(slug, diff) {
  const lines = [];
  const header = `${slug}`;
  if (
    diff.regressions.length === 0 &&
    diff.wins.length === 0 &&
    diff.infos.length === 0
  ) {
    lines.push(`  ${header}: unchanged`);
    return lines.join("\n");
  }
  lines.push(`  ${header}:`);
  for (const r of diff.regressions) lines.push(`    REGRESS  ${r}`);
  for (const w of diff.wins) lines.push(`    WIN      ${w}`);
  for (const i of diff.infos) lines.push(`    info     ${i}`);
  return lines.join("\n");
}

async function main() {
  const [, , beforeArg, afterArg] = process.argv;
  if (!beforeArg || !afterArg) {
    process.stderr.write(
      "Usage: node scripts/evals/diff-results.mjs <before-dir> <after-dir>\n",
    );
    process.exit(2);
  }

  const beforeDir = path.resolve(beforeArg);
  const afterDir = path.resolve(afterArg);

  const [beforeSlugs, afterSlugs] = await Promise.all([
    listResultSlugs(beforeDir),
    listResultSlugs(afterDir),
  ]);
  const slugs = [...new Set([...beforeSlugs, ...afterSlugs])].sort();

  const lines = [
    `before: ${path.relative(process.cwd(), beforeDir)}`,
    `after:  ${path.relative(process.cwd(), afterDir)}`,
    "",
  ];

  let regressionCount = 0;
  let winCount = 0;

  for (const slug of slugs) {
    const [beforeResult, afterResult] = await Promise.all([
      loadResult(beforeDir, slug),
      loadResult(afterDir, slug),
    ]);
    const diff = diffOne(beforeResult, afterResult);
    regressionCount += diff.regressions.length;
    winCount += diff.wins.length;
    lines.push(formatRow(slug, diff));
  }

  lines.push("");
  lines.push(
    `summary: regressions=${regressionCount} wins=${winCount} prompts=${slugs.length}`,
  );

  process.stdout.write(`${lines.join("\n")}\n`);

  if (regressionCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(
    `[diff-results] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
