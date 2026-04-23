#!/usr/bin/env node
/**
 * OMTAG-02 eval baseline runner.
 *
 * Reads every `evals/*.prompt.json` and produces
 * `evals/results/<timestamp>/<slug>.json` containing scaffoldSelectionMeta,
 * expected/actual scaffold match and durationMs for the scaffold-selection
 * phase — the deterministic, offline-safe signal a fresh clone can always
 * reproduce.
 *
 * Why this shape:
 *   The full finalize-version pipeline (autofix-stats, preflight.summary,
 *   verifier.*) requires an LLM call, DB, session and tenant wiring — that
 *   path is opt-in via `--full` / `EVAL_FULL=1` (placeholder, not yet wired;
 *   see `evals/README.md` for the rationale). The checked-in
 *   `evals/results/baseline-master/` snapshot therefore only covers the
 *   deterministic scaffold layer so the number is reproducible in CI.
 *
 * CLI flags:
 *   --output-dir <dir>   Output directory (default `evals/results/<ts>`).
 *   --prompts <glob>     Restrict to a subset of prompts (substring match on id).
 *   --help               Show usage.
 *
 * Env:
 *   EVAL_FULL=1          Reserved for the future end-to-end pipeline path.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = { outputDir: null, promptsFilter: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--output-dir") {
      args.outputDir = argv[++i];
    } else if (arg === "--prompts") {
      args.promptsFilter = argv[++i];
    }
  }
  return args;
}

function printHelp() {
  const msg = [
    "Usage: node scripts/evals/run-baseline.mjs [options]",
    "",
    "Options:",
    "  --output-dir <dir>   Write results to <dir> instead of evals/results/<timestamp>",
    "  --prompts <substr>   Only run prompts whose id contains <substr>",
    "  --help               Show this help",
    "",
    "Full pipeline (autofix, preflight, verifier) is not yet wired into the baseline.",
    "See evals/README.md for the roadmap.",
    "",
  ].join("\n");
  process.stdout.write(msg);
}

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

async function loadPromptFiles(filter) {
  const evalsDir = path.join(REPO_ROOT, "evals");
  const entries = await fs.readdir(evalsDir);
  const promptFiles = entries
    .filter((name) => name.endsWith(".prompt.json"))
    .map((name) => path.join(evalsDir, name))
    .sort();

  if (!filter) return promptFiles;
  return promptFiles.filter((p) => path.basename(p).includes(filter));
}

function runProbe(promptPath, outputPath) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const child = spawn(
      isWin ? "npx.cmd" : "npx",
      ["tsx", "scripts/evals/probe.ts", promptPath, outputPath],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env },
        shell: isWin,
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`probe exited with code ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  if (process.env.EVAL_FULL === "1") {
    process.stderr.write(
      "[run-baseline] EVAL_FULL=1 set but full pipeline path is not yet wired. Running scaffold-selection baseline.\n",
    );
  }

  const promptFiles = await loadPromptFiles(args.promptsFilter);
  if (promptFiles.length === 0) {
    process.stderr.write("[run-baseline] No prompt files found.\n");
    process.exit(1);
  }

  const timestamp = formatTimestamp();
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(REPO_ROOT, "evals", "results", timestamp);
  await fs.mkdir(outputDir, { recursive: true });

  process.stderr.write(
    `[run-baseline] ${promptFiles.length} prompts → ${path.relative(REPO_ROOT, outputDir)}\n`,
  );

  const runSummary = {
    timestamp: new Date().toISOString(),
    outputDir: path.relative(REPO_ROOT, outputDir),
    baselineKind: "scaffold-selection-only",
    total: promptFiles.length,
    results: [],
  };

  for (const promptPath of promptFiles) {
    const slug = path.basename(promptPath, ".prompt.json");
    const outputPath = path.join(outputDir, `${slug}.json`);
    const startedAt = Date.now();
    try {
      await runProbe(promptPath, outputPath);
      const raw = await fs.readFile(outputPath, "utf-8");
      const parsed = JSON.parse(raw);
      runSummary.results.push({
        id: parsed.id,
        scaffold: parsed.expectedMatch.actualScaffold,
        expectedScaffold: parsed.expectedMatch.expectedScaffold,
        match: parsed.expectedMatch.match,
        acceptableHit: parsed.expectedMatch.acceptableHit,
        selectionMethod: parsed.scaffoldSelectionMeta?.selectionMethod ?? null,
        selectionConfidence:
          parsed.scaffoldSelectionMeta?.selectionConfidence ?? null,
        durationMs: parsed.phases?.scaffold_selection?.durationMs ?? null,
        runDurationMs: Date.now() - startedAt,
      });
    } catch (err) {
      process.stderr.write(
        `[run-baseline] ${slug} failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      runSummary.results.push({
        id: slug,
        error: err instanceof Error ? err.message : String(err),
        runDurationMs: Date.now() - startedAt,
      });
    }
  }

  const exactHits = runSummary.results.filter((r) => r.match === true).length;
  const acceptableHits = runSummary.results.filter(
    (r) => r.match === true || r.acceptableHit === true,
  ).length;
  const errors = runSummary.results.filter((r) => r.error).length;

  runSummary.summary = {
    exactHits,
    exactHitRatePercent: runSummary.results.length
      ? Number(((exactHits / runSummary.results.length) * 100).toFixed(1))
      : 0,
    acceptableHits,
    acceptableHitRatePercent: runSummary.results.length
      ? Number(
          ((acceptableHits / runSummary.results.length) * 100).toFixed(1),
        )
      : 0,
    errors,
  };

  const summaryPath = path.join(outputDir, "_summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(runSummary, null, 2), "utf-8");

  process.stderr.write(
    `[run-baseline] exact=${exactHits}/${runSummary.total} ` +
      `acceptable=${acceptableHits}/${runSummary.total} ` +
      `errors=${errors}\n`,
  );
  process.stderr.write(`[run-baseline] summary → ${summaryPath}\n`);

  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(
    `[run-baseline] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
