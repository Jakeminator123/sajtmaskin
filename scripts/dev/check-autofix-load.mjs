#!/usr/bin/env node
/**
 * E6 (OMTAG fas 2·C) — strict-assert for `autofix.heavy_load`.
 *
 * Reads the rolling dev-log (written by `devLogAppend(...)` via
 * `src/lib/logging/shared.ts:DEV_LOG_DOC_PATH`) and fails if more than a
 * configurable fraction of finalize-autofix passes emitted an
 * `autofix.heavy_load` event. "Heavy load" means the deterministic autofix
 * pipeline had to repair more than 5 issues in a single run — which
 * usually points to upstream instability (LLM output quality, prompt
 * drift, or a regression in one of the mechanical fixers).
 *
 * Defaults:
 *   - Threshold: 0.80 (80 % of runs). Override via
 *     `SAJTMASKIN_CHECK_AUTOFIX_LOAD_THRESHOLD=0.5` etc.
 *   - Min sample size: 5 autofix.result events before the gate engages.
 *     Smaller samples are treated as "not enough data" and the script
 *     exits 0 with an info line. Override via
 *     `SAJTMASKIN_CHECK_AUTOFIX_LOAD_MIN_SAMPLE=20`.
 *
 * Safe for CI: when `logs/sajtmaskin-local-document.txt` does not exist,
 * the script exits 0 without failing (CI usually does not generate dev-
 * log data — that path fires only when `npm run dev` or one of the
 * generation routes is actually hit). The gate only bites once someone
 * has actually produced autofix runs.
 *
 * Self-test:
 *   node scripts/dev/check-autofix-load.mjs --self-test
 *
 * Usage (manual):
 *   node scripts/dev/check-autofix-load.mjs
 *   node scripts/dev/check-autofix-load.mjs --log logs/sajtmaskin-local-document.txt
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_LOG_PATH = path.join(REPO_ROOT, "logs", "sajtmaskin-local-document.txt");

function parseFraction(value, fallback) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return fallback;
  return parsed;
}

function parseInteger(value, fallback) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function resolveThreshold() {
  return parseFraction(process.env.SAJTMASKIN_CHECK_AUTOFIX_LOAD_THRESHOLD, 0.8);
}

function resolveMinSample() {
  return parseInteger(process.env.SAJTMASKIN_CHECK_AUTOFIX_LOAD_MIN_SAMPLE, 5);
}

/**
 * Parse the dev-log document into `{ autofixResult, heavyLoad }` counts.
 *
 * Block format (see `src/lib/logging/dev-log-reader.ts`):
 *   <ISO-timestamp> [target](space slug bracket?)
 *   { ... JSON ... }
 *
 *   <next block>
 *
 * We only need to count two event types, so we use a forgiving substring
 * scan that tolerates malformed blocks (broken partial writes on process
 * exit). `autofix.result` fires on every autofix pipeline run;
 * `autofix.heavy_load` fires on the subset where fixCount > threshold.
 */
export function countAutofixEvents(text) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  let autofixResult = 0;
  let heavyLoad = 0;
  for (const block of blocks) {
    // The JSON payload is on the 2nd+ lines. A substring check is enough
    // because `"type": "autofix.result"` / `"type": "autofix.heavy_load"`
    // are the canonical keys written by `devLogAppend(...)`.
    if (block.includes('"type": "autofix.heavy_load"')) {
      heavyLoad += 1;
      continue;
    }
    if (block.includes('"type": "autofix.result"')) {
      autofixResult += 1;
    }
  }
  return { autofixResult, heavyLoad };
}

function parseCliArgs(argv) {
  const args = {
    logPath: DEFAULT_LOG_PATH,
    selfTest: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--log") args.logPath = path.resolve(argv[++i] ?? "");
  }
  return args;
}

function printHelp() {
  const lines = [
    "Usage: node scripts/dev/check-autofix-load.mjs [options]",
    "",
    "Options:",
    "  --log <path>     Override the dev-log path (default logs/sajtmaskin-local-document.txt).",
    "  --self-test      Run internal assertions against synthetic log fixtures.",
    "  --help           Show this help.",
    "",
    "Env:",
    "  SAJTMASKIN_CHECK_AUTOFIX_LOAD_THRESHOLD   Fraction (0-1]. Default 0.8.",
    "  SAJTMASKIN_CHECK_AUTOFIX_LOAD_MIN_SAMPLE  Minimum autofix.result count. Default 5.",
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

function runSelfTest() {
  const threshold = 0.8;
  const minSample = 5;

  const fixtureLow = [
    '2026-04-23T10:00:00.000Z [in-progress]',
    '{ "type": "autofix.result", "chatId": "a" }',
    "",
    '2026-04-23T10:00:01.000Z [in-progress]',
    '{ "type": "autofix.result", "chatId": "b" }',
    "",
    '2026-04-23T10:00:02.000Z [in-progress]',
    '{ "type": "autofix.heavy_load", "chatId": "b" }',
    "",
    '2026-04-23T10:00:03.000Z [in-progress]',
    '{ "type": "autofix.result", "chatId": "c" }',
    "",
    '2026-04-23T10:00:04.000Z [in-progress]',
    '{ "type": "autofix.result", "chatId": "d" }',
    "",
    '2026-04-23T10:00:05.000Z [in-progress]',
    '{ "type": "autofix.result", "chatId": "e" }',
  ].join("\n");
  const low = countAutofixEvents(fixtureLow);
  console.assert(low.autofixResult === 5, `expected 5 autofix.result, got ${low.autofixResult}`);
  console.assert(low.heavyLoad === 1, `expected 1 heavy_load, got ${low.heavyLoad}`);
  const lowRatio = low.heavyLoad / low.autofixResult;
  console.assert(lowRatio < threshold, `low-fixture should be under threshold; got ${lowRatio}`);

  // Build a fixture where > threshold of runs triggered heavy_load.
  const highBlocks = [];
  for (let i = 0; i < 8; i++) {
    highBlocks.push(`2026-04-23T10:00:0${i}.000Z [in-progress]`);
    highBlocks.push(`{ "type": "autofix.result", "chatId": "h${i}" }`);
    highBlocks.push("");
    highBlocks.push(`2026-04-23T10:00:1${i}.000Z [in-progress]`);
    highBlocks.push(`{ "type": "autofix.heavy_load", "chatId": "h${i}" }`);
    highBlocks.push("");
  }
  // Two clean runs so not 100 %.
  highBlocks.push('2026-04-23T10:00:30.000Z [in-progress]');
  highBlocks.push('{ "type": "autofix.result", "chatId": "clean1" }');
  const high = countAutofixEvents(highBlocks.join("\n"));
  console.assert(high.autofixResult === 9, `expected 9 autofix.result, got ${high.autofixResult}`);
  console.assert(high.heavyLoad === 8, `expected 8 heavy_load, got ${high.heavyLoad}`);
  const highRatio = high.heavyLoad / high.autofixResult;
  console.assert(highRatio > threshold, `high-fixture should exceed threshold; got ${highRatio}`);

  // Empty fixture.
  const empty = countAutofixEvents("");
  console.assert(empty.autofixResult === 0 && empty.heavyLoad === 0, "empty fixture should have zero counts");

  // Small-sample guard — ratio can be 100 % but minSample is not reached.
  const smallBlocks = [
    '2026-04-23T10:00:00.000Z [in-progress]',
    '{ "type": "autofix.result", "chatId": "x" }',
    "",
    '2026-04-23T10:00:01.000Z [in-progress]',
    '{ "type": "autofix.heavy_load", "chatId": "x" }',
  ].join("\n");
  const small = countAutofixEvents(smallBlocks);
  console.assert(small.autofixResult === 1 && small.heavyLoad === 1, "small fixture counts");
  console.assert(small.autofixResult < minSample, "small fixture is below minSample");

  console.log("[check-autofix-load] self-test OK");
}

function main() {
  const args = parseCliArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    runSelfTest();
    return;
  }

  const threshold = resolveThreshold();
  const minSample = resolveMinSample();

  if (!fs.existsSync(args.logPath)) {
    console.log(
      `[check-autofix-load] Dev-log not found at ${path.relative(REPO_ROOT, args.logPath)} — skipping (likely CI / fresh checkout).`,
    );
    return;
  }

  let text;
  try {
    text = fs.readFileSync(args.logPath, "utf8");
  } catch (err) {
    console.log(
      `[check-autofix-load] Could not read ${path.relative(REPO_ROOT, args.logPath)}: ${err instanceof Error ? err.message : String(err)} — skipping.`,
    );
    return;
  }

  const counts = countAutofixEvents(text);
  if (counts.autofixResult < minSample) {
    console.log(
      `[check-autofix-load] Only ${counts.autofixResult} autofix.result event(s) logged (min=${minSample}). Skipping assertion — not enough data.`,
    );
    return;
  }

  const ratio = counts.heavyLoad / counts.autofixResult;
  const pct = Math.round(ratio * 1000) / 10;
  const thresholdPct = Math.round(threshold * 1000) / 10;

  if (ratio > threshold) {
    console.error(
      `[check-autofix-load] FAIL: ${counts.heavyLoad}/${counts.autofixResult} autofix runs were heavy_load (${pct}% > threshold ${thresholdPct}%).`,
    );
    console.error(
      "[check-autofix-load] This usually means the codegen LLM is producing unstable output — investigate the system prompt, scaffold pool, or deterministic fixer coverage before shipping.",
    );
    process.exit(1);
  }

  console.log(
    `[check-autofix-load] OK: ${counts.heavyLoad}/${counts.autofixResult} autofix runs were heavy_load (${pct}% <= threshold ${thresholdPct}%).`,
  );
}

main();
