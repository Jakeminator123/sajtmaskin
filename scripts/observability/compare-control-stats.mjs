#!/usr/bin/env node
/**
 * Compare two `scripts/db/control-stats.mjs --json` snapshots.
 *
 * This tool is intentionally file-only: it performs no DB, network or env
 * reads. The orchestrator/owner pulls production env and runs control-stats
 * separately, then feeds the resulting JSON file here.
 *
 * Usage:
 *   node scripts/observability/compare-control-stats.mjs --current /tmp/control-stats-current.json
 *   node scripts/observability/compare-control-stats.mjs --baseline baseline.json --current current.json --md
 *   node scripts/observability/compare-control-stats.mjs baseline.json current.json
 *   node scripts/observability/compare-control-stats.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_BASELINE = path.join(
  __dirname,
  "control-stats-baseline-2026-07-02.json",
);

function parseArgs(argv) {
  const args = {
    baseline: null,
    current: null,
    md: false,
    selfTest: false,
    help: false,
  };
  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--md") args.md = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--baseline") args.baseline = path.resolve(argv[++i] ?? "");
    else if (arg.startsWith("--baseline=")) {
      args.baseline = path.resolve(arg.slice("--baseline=".length));
    } else if (arg === "--current") args.current = path.resolve(argv[++i] ?? "");
    else if (arg.startsWith("--current=")) {
      args.current = path.resolve(arg.slice("--current=".length));
    } else {
      positional.push(arg);
    }
  }
  if (!args.baseline && positional[0]) args.baseline = path.resolve(positional[0]);
  if (!args.current && positional[1]) args.current = path.resolve(positional[1]);
  if (!args.baseline) args.baseline = DEFAULT_BASELINE;
  return args;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/observability/compare-control-stats.mjs [options] [baseline.json current.json]",
      "",
      "Options:",
      "  --baseline <path>  Baseline control-stats JSON (default committed 2026-07-02 baseline).",
      "  --current <path>   Current control-stats JSON to compare.",
      "  --md               Print a Markdown table.",
      "  --self-test        Run internal assertions against synthetic JSON examples.",
      "  --help             Show this help.",
      "",
    ].join("\n"),
  );
}

function fail(message) {
  console.error(`[compare-control-stats] FAIL: ${message}`);
  process.exit(1);
}

function readJsonFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read ${path.relative(REPO_ROOT, filePath)}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Could not parse ${path.relative(REPO_ROOT, filePath)} as JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function rowCount(row, preferredField = "n") {
  return (
    numberOrNull(row?.[preferredField]) ??
    numberOrNull(row?.n) ??
    numberOrNull(row?.count) ??
    numberOrNull(row?.total) ??
    0
  );
}

function kpis(stats) {
  return stats?.derivedKpis ?? stats?._kpis ?? {};
}

function fixedPct(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : value;
  return `${Number(rounded).toFixed(Number.isInteger(rounded) ? 0 : digits)} %`;
}

function deltaPct(base, current) {
  if (base === null || current === null || base === undefined || current === undefined) return "n/a";
  const delta = current - base;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} pp`;
}

function deriveQualityGatePassPct(stats) {
  const explicit = numberOrNull(kpis(stats).qualityGatePassPct);
  if (explicit !== null) return { value: explicit, note: "explicit" };

  const rows = Array.isArray(stats?.qualityGateResults) ? stats.qualityGateResults : null;
  if (!rows || rows.length === 0) return { value: null, note: "saknas i input" };
  let pass = 0;
  let total = 0;
  for (const row of rows) {
    const n = rowCount(row);
    total += n;
    const result = String(row.result ?? row.quality_gate_result ?? "").toLowerCase();
    if (
      result === "passed" ||
      result === "pass" ||
      result === "success" ||
      result === "ok" ||
      result.includes("passed")
    ) {
      pass += n;
    }
  }
  if (total === 0) return { value: null, note: "tom qualityGateResults" };
  return { value: (pass / total) * 100, note: "från qualityGateResults" };
}

function deriveTypecheckFirstFailurePct(stats) {
  const explicit = numberOrNull(kpis(stats).typecheckFirstFailureOfGateFailsPct);
  if (explicit !== null) return { value: explicit, note: "explicit" };

  const rows = Array.isArray(stats?.qualityGateFirstFailure)
    ? stats.qualityGateFirstFailure
    : null;
  if (!rows || rows.length === 0) return { value: null, note: "saknas i input" };
  let typecheck = 0;
  let gateFails = 0;
  for (const row of rows) {
    const first = String(row.first_failure ?? row.firstFailure ?? "").toLowerCase();
    const n = rowCount(row);
    if (!first || first === "(passed/none)" || first.includes("passed")) continue;
    gateFails += n;
    if (first === "typecheck") typecheck += n;
  }
  if (gateFails === 0) return { value: null, note: "inga gate-fails i input" };
  return { value: (typecheck / gateFails) * 100, note: "från qualityGateFirstFailure" };
}

function deriveImportRelatedTypecheckPct(stats) {
  const explicit = numberOrNull(kpis(stats).importRelatedTypecheckErrorsPct);
  if (explicit !== null) return { value: explicit, note: "explicit" };
  return { value: null, note: "kräver error-log-aggregat" };
}

function deriveVerifierSkippedPct(stats) {
  const explicit = numberOrNull(kpis(stats).verifierSkippedPct);
  if (explicit !== null) return { value: explicit, note: "explicit", reasons: null };

  const rows = Array.isArray(stats?.verifierPhase) ? stats.verifierPhase : null;
  if (!rows || rows.length === 0) {
    return { value: null, note: "saknas i input", reasons: null };
  }
  let skipped = 0;
  let total = 0;
  const reasons = new Map();
  for (const row of rows) {
    const n = rowCount(row);
    total += n;
    const status = String(row.status ?? "").toLowerCase();
    const reason = String(row.reason ?? "").trim() || "(ingen reason)";
    const isSkipped =
      status === "skipped" ||
      status === "skip" ||
      status.includes("skipped") ||
      status.includes("skip");
    if (isSkipped) {
      skipped += n;
      reasons.set(reason, (reasons.get(reason) ?? 0) + n);
    }
  }
  if (total === 0) return { value: null, note: "tom verifierPhase", reasons: null };
  return {
    value: (skipped / total) * 100,
    note: "från verifierPhase",
    reasons: formatMap(reasons),
  };
}

function deriveRepairRescueRatePct(stats) {
  const explicit = numberOrNull(kpis(stats).repairRescueRatePct);
  if (explicit !== null) {
    const rescued = numberOrNull(kpis(stats).repairRescuedGateFailedVersions);
    const failed = numberOrNull(kpis(stats).repairGateFailedVersions);
    return {
      value: explicit,
      note: rescued !== null && failed !== null ? `${rescued}/${failed}` : "explicit",
    };
  }

  const rows = Array.isArray(stats?.serverRepairOutcomes)
    ? stats.serverRepairOutcomes
    : null;
  if (!rows || rows.length === 0) return { value: null, note: "saknas i input" };
  let repaired = 0;
  let total = 0;
  let usedVersions = false;
  for (const row of rows) {
    const count = numberOrNull(row.versions) ?? rowCount(row);
    if (numberOrNull(row.versions) !== null) usedVersions = true;
    total += count;
    if (String(row.outcome ?? "").toLowerCase() === "repaired") repaired += count;
  }
  if (total === 0) return { value: null, note: "tom serverRepairOutcomes" };
  return {
    value: (repaired / total) * 100,
    note: `${repaired}/${total}${usedVersions ? " versioner" : " rader"}`,
  };
}

function deriveFailedVersionsPct(stats) {
  const explicit = numberOrNull(kpis(stats).failedVersionsPct);
  if (explicit !== null) return { value: explicit, note: "explicit" };

  const rows = Array.isArray(stats?.versionStates) ? stats.versionStates : null;
  if (!rows || rows.length === 0) return { value: null, note: "saknas i input" };
  let failed = 0;
  let total = 0;
  for (const row of rows) {
    const n = rowCount(row);
    total += n;
    if (String(row.verification_state ?? "").toLowerCase() === "failed") {
      failed += n;
    }
  }
  if (total === 0) return { value: null, note: "tom versionStates" };
  return { value: (failed / total) * 100, note: `${failed}/${total} versioner` };
}

function formatMap(map) {
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "n/a";
  return entries.map(([key, value]) => `${key}:${value}`).join(", ");
}

function formatDistribution(rows, keyField, countField = "n", limit = 8) {
  if (!Array.isArray(rows) || rows.length === 0) return "n/a";
  return [...rows]
    .sort((a, b) => rowCount(b, countField) - rowCount(a, countField))
    .slice(0, limit)
    .map((row) => {
      const key = row?.[keyField] ?? "(saknas)";
      const n = rowCount(row, countField);
      const versions = numberOrNull(row?.versions);
      return versions !== null ? `${key}:${n} (${versions}v)` : `${key}:${n}`;
    })
    .join(", ");
}

function valueWithNote(derived, formatter = fixedPct) {
  const value = formatter(derived.value);
  if (!derived.note || derived.note === "explicit") return value;
  return `${value} (${derived.note})`;
}

function buildComparisonRows(baseline, current) {
  const baseQuality = deriveQualityGatePassPct(baseline);
  const currentQuality = deriveQualityGatePassPct(current);
  const baseTypecheck = deriveTypecheckFirstFailurePct(baseline);
  const currentTypecheck = deriveTypecheckFirstFailurePct(current);
  const baseImport = deriveImportRelatedTypecheckPct(baseline);
  const currentImport = deriveImportRelatedTypecheckPct(current);
  const baseVerifier = deriveVerifierSkippedPct(baseline);
  const currentVerifier = deriveVerifierSkippedPct(current);
  const baseRepair = deriveRepairRescueRatePct(baseline);
  const currentRepair = deriveRepairRescueRatePct(current);
  const baseFailed = deriveFailedVersionsPct(baseline);
  const currentFailed = deriveFailedVersionsPct(current);

  return [
    {
      metric: "Quality gate pass",
      baseline: valueWithNote(baseQuality),
      current: valueWithNote(currentQuality),
      delta: deltaPct(baseQuality.value, currentQuality.value),
    },
    {
      metric: "Typecheck first-failure av gate-fails",
      baseline: valueWithNote(baseTypecheck),
      current: valueWithNote(currentTypecheck),
      delta: deltaPct(baseTypecheck.value, currentTypecheck.value),
    },
    {
      metric: "Importrelaterade typecheck-fel",
      baseline: valueWithNote(baseImport),
      current: valueWithNote(currentImport),
      delta: deltaPct(baseImport.value, currentImport.value),
    },
    {
      metric: "Verifier skip",
      baseline: valueWithNote(baseVerifier),
      current:
        valueWithNote(currentVerifier) +
        (currentVerifier.reasons ? `; reasons: ${currentVerifier.reasons}` : ""),
      delta: deltaPct(baseVerifier.value, currentVerifier.value),
    },
    {
      metric: "Repair-räddningsgrad",
      baseline: valueWithNote(baseRepair),
      current: valueWithNote(currentRepair),
      delta: deltaPct(baseRepair.value, currentRepair.value),
    },
    {
      metric: "Versioner som slutar failed",
      baseline: valueWithNote(baseFailed),
      current: valueWithNote(currentFailed),
      delta: deltaPct(baseFailed.value, currentFailed.value),
    },
    {
      metric: "Server repair outcomes",
      baseline: formatDistribution(baseline.serverRepairOutcomes, "outcome"),
      current: formatDistribution(current.serverRepairOutcomes, "outcome"),
      delta: "n/a",
    },
    {
      metric: "Deploy outcomes",
      baseline: formatDistribution(baseline.deployOutcomes, "deploy_result"),
      current: formatDistribution(current.deployOutcomes, "deploy_result"),
      delta: "n/a",
    },
    {
      metric: "Dossier usage top",
      baseline: formatDistribution(baseline.dossierUsage, "dossier_id", "n", 5),
      current: formatDistribution(current.dossierUsage, "dossier_id", "n", 5),
      delta: "n/a",
    },
  ];
}

function markdownTable(rows) {
  const lines = [
    "| KPI | Baslinje | Aktuell | Delta |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.metric} | ${row.baseline} | ${row.current} | ${row.delta} |`);
  }
  return `${lines.join("\n")}\n`;
}

function plainTable(rows) {
  const widths = {
    metric: Math.max("KPI".length, ...rows.map((row) => row.metric.length)),
    baseline: Math.max("Baslinje".length, ...rows.map((row) => row.baseline.length)),
    current: Math.max("Aktuell".length, ...rows.map((row) => row.current.length)),
    delta: Math.max("Delta".length, ...rows.map((row) => row.delta.length)),
  };
  const pad = (value, width) => String(value).padEnd(width, " ");
  const lines = [
    `${pad("KPI", widths.metric)}  ${pad("Baslinje", widths.baseline)}  ${pad(
      "Aktuell",
      widths.current,
    )}  ${pad("Delta", widths.delta)}`,
    `${"-".repeat(widths.metric)}  ${"-".repeat(widths.baseline)}  ${"-".repeat(
      widths.current,
    )}  ${"-".repeat(widths.delta)}`,
  ];
  for (const row of rows) {
    lines.push(
      `${pad(row.metric, widths.metric)}  ${pad(row.baseline, widths.baseline)}  ${pad(
        row.current,
        widths.current,
      )}  ${pad(row.delta, widths.delta)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTest() {
  const baseline = {
    derivedKpis: {
      qualityGatePassPct: 84,
      typecheckFirstFailureOfGateFailsPct: 99,
      importRelatedTypecheckErrorsPct: 84,
      verifierSkippedPct: 69,
      repairRescueRatePct: 3.6,
      repairRescuedGateFailedVersions: 1,
      repairGateFailedVersions: 28,
      failedVersionsPct: 38,
    },
    serverRepairOutcomes: null,
    deployOutcomes: null,
    dossierUsage: null,
  };
  const current = {
    qualityGateResults: [
      { result: "passed", n: 93 },
      { result: "verifier_failed", n: 7 },
    ],
    qualityGateFirstFailure: [
      { first_failure: "typecheck", n: 12 },
      { first_failure: "build", n: 8 },
      { first_failure: "(passed/none)", n: 80 },
    ],
    verifierPhase: [
      { status: "skipped", reason: "safe_fixes_only", n: 30 },
      { status: "skipped", reason: "autofix_heavy_load", n: 5 },
      { status: "ran", reason: "risky_fixes", n: 65 },
    ],
    serverRepairOutcomes: [
      { outcome: "repaired", level: "info", n: 8, versions: 8 },
      { outcome: "syntax_clean_gate_failed", level: "error", n: 12, versions: 12 },
    ],
    deployOutcomes: [
      { deploy_result: "production:ready", n: 4 },
      { deploy_result: "(ingen deploy)", n: 96 },
    ],
    dossierUsage: [
      { dossier_id: "stripe-checkout", n: 7 },
      { dossier_id: "clerk-auth", n: 3 },
    ],
    versionStates: [
      { verification_state: "passed", release_state: "promoted", n: 75 },
      { verification_state: "failed", release_state: "draft", n: 25 },
    ],
  };
  const rows = buildComparisonRows(baseline, current);
  const md = markdownTable(rows);
  assert(md.includes("Quality gate pass"), "expected quality gate row");
  assert(md.includes("93 %"), "expected derived current quality gate pass");
  assert(md.includes("safe_fixes_only:30"), "expected verifier skip reason");
  assert(md.includes("40 %"), "expected repair rescue rate from serverRepairOutcomes");
  assert(md.includes("kräver error-log-aggregat"), "expected import aggregate note");
  console.log("[compare-control-stats] self-test OK");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    runSelfTest();
    return;
  }
  if (!args.current) {
    fail("Missing --current <path> (or positional current.json).");
  }
  let baseline;
  let current;
  try {
    baseline = readJsonFile(args.baseline);
    current = readJsonFile(args.current);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  const rows = buildComparisonRows(baseline, current);
  process.stdout.write(args.md ? markdownTable(rows) : plainTable(rows));
}

main();
