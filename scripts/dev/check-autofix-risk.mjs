#!/usr/bin/env node
/**
 * Lightweight dev-log sanity check for risk-classified autofix telemetry.
 *
 * This replaces the old volume-based autofix load gate. It does NOT fail on
 * "many fixes": safe autofix churn is normal. The script only parses the
 * rolling dev-log and reports the current safe/risky split so preflight still
 * catches malformed telemetry during local development.
 *
 * Safe for CI: when the dev-log does not exist, the script exits 0.
 *
 * Self-test:
 *   node scripts/dev/check-autofix-risk.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_LOG_PATH = path.join(REPO_ROOT, "logs", "sajtmaskin-local-document.txt");

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
  process.stdout.write(
    [
      "Usage: node scripts/dev/check-autofix-risk.mjs [options]",
      "",
      "Options:",
      "  --log <path>     Override the dev-log path (default logs/sajtmaskin-local-document.txt).",
      "  --self-test      Run internal assertions against synthetic log fixtures.",
      "  --help           Show this help.",
      "",
    ].join("\n"),
  );
}

function parseJsonPayload(block) {
  const firstBrace = block.indexOf("{");
  if (firstBrace < 0) return null;
  try {
    return JSON.parse(block.slice(firstBrace));
  } catch {
    return null;
  }
}

export function countAutofixRiskEvents(text) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  let autofixResult = 0;
  let riskEvents = 0;
  let riskyEvents = 0;
  let safeFixCount = 0;
  let riskyFixCount = 0;
  const riskyFixerIds = new Set();
  let malformedRiskEvents = 0;

  for (const block of blocks) {
    if (block.includes('"type": "autofix.result"')) {
      autofixResult += 1;
      continue;
    }
    if (!block.includes('"type": "autofix.risk"')) continue;
    riskEvents += 1;
    const payload = parseJsonPayload(block);
    const safe = payload?.safeFixCount;
    const risky = payload?.riskyFixCount;
    const ids = payload?.riskyFixerIds;
    if (
      typeof safe !== "number" ||
      typeof risky !== "number" ||
      !Number.isFinite(safe) ||
      !Number.isFinite(risky) ||
      !Array.isArray(ids)
    ) {
      malformedRiskEvents += 1;
      continue;
    }
    safeFixCount += safe;
    riskyFixCount += risky;
    if (risky > 0) riskyEvents += 1;
    for (const id of ids) {
      if (typeof id === "string" && id.trim()) riskyFixerIds.add(id.trim());
    }
  }

  return {
    autofixResult,
    riskEvents,
    riskyEvents,
    safeFixCount,
    riskyFixCount,
    riskyFixerIds: Array.from(riskyFixerIds).sort(),
    malformedRiskEvents,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTest() {
  const fixture = [
    "2026-07-02T10:00:00.000Z [in-progress]",
    '{ "type": "autofix.result", "chatId": "a" }',
    "",
    "2026-07-02T10:00:00.100Z [in-progress]",
    '{ "type": "autofix.risk", "chatId": "a", "safeFixCount": 24, "riskyFixCount": 0, "riskyFixerIds": [] }',
    "",
    "2026-07-02T10:01:00.000Z [in-progress]",
    '{ "type": "autofix.result", "chatId": "b" }',
    "",
    "2026-07-02T10:01:00.100Z [in-progress]",
    '{ "type": "autofix.risk", "chatId": "b", "safeFixCount": 3, "riskyFixCount": 1, "riskyFixerIds": ["local-symbol-import-fixer"] }',
  ].join("\n");
  const counts = countAutofixRiskEvents(fixture);
  assert(counts.autofixResult === 2, `expected 2 autofix.result, got ${counts.autofixResult}`);
  assert(counts.riskEvents === 2, `expected 2 autofix.risk, got ${counts.riskEvents}`);
  assert(counts.riskyEvents === 1, `expected 1 risky event, got ${counts.riskyEvents}`);
  assert(counts.safeFixCount === 27, `expected 27 safe fixes, got ${counts.safeFixCount}`);
  assert(counts.riskyFixCount === 1, `expected 1 risky fix, got ${counts.riskyFixCount}`);
  assert(
    counts.riskyFixerIds.includes("local-symbol-import-fixer"),
    "expected local-symbol-import-fixer in risky ids",
  );
  assert(counts.malformedRiskEvents === 0, "expected no malformed risk events");

  const malformed = countAutofixRiskEvents(
    '2026-07-02T10:00:00.000Z [in-progress]\n{ "type": "autofix.risk", "safeFixCount": "bad" }',
  );
  assert(malformed.malformedRiskEvents === 1, "expected malformed risk event");

  console.log("[check-autofix-risk] self-test OK");
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

  if (!fs.existsSync(args.logPath)) {
    console.log(
      `[check-autofix-risk] Dev-log not found at ${path.relative(REPO_ROOT, args.logPath)} — skipping (likely CI / fresh checkout).`,
    );
    return;
  }

  let text;
  try {
    text = fs.readFileSync(args.logPath, "utf8");
  } catch (err) {
    console.log(
      `[check-autofix-risk] Could not read ${path.relative(REPO_ROOT, args.logPath)}: ${err instanceof Error ? err.message : String(err)} — skipping.`,
    );
    return;
  }

  const counts = countAutofixRiskEvents(text);
  if (counts.malformedRiskEvents > 0) {
    console.error(
      `[check-autofix-risk] FAIL: ${counts.malformedRiskEvents} malformed autofix.risk event(s) found.`,
    );
    process.exit(1);
  }

  console.log(
    `[check-autofix-risk] OK: ${counts.riskEvents} risk event(s), ${counts.safeFixCount} safe fix(es), ${counts.riskyFixCount} risky fix(es), risky fixers: ${counts.riskyFixerIds.join(", ") || "none"}.`,
  );
}

main();
