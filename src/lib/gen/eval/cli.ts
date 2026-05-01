import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { compareWithBaseline as compareWithBaselineFn } from "./baseline";
import type { EvalDumpMode } from "./artifact-dump";
import type { EVAL_PROMPTS as EVAL_PROMPTS_TYPE } from "./prompts";

const SMOKE_PROMPT_IDS = ["coffee-shop", "restaurant", "portfolio"] as const;
type BaselineComparison = ReturnType<typeof compareWithBaselineFn>;
type EvalPrompts = typeof EVAL_PROMPTS_TYPE;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatComparison(
  comparison: BaselineComparison,
): string {
  const lines: string[] = [
    "",
    "## Baseline comparison",
    "",
    `Overall avg score delta: ${pct(comparison.overallDelta)}`,
    `Gate result: ${comparison.gateResult.toUpperCase()}`,
    "",
  ];

  if (comparison.regressions.length > 0) {
    lines.push("### Regressions", "");
    for (const r of comparison.regressions) {
      lines.push(
        `- **${r.promptId}**: ${pct(r.baselineScore)} → ${pct(r.currentScore)} (${pct(r.delta)})`,
      );
    }
    lines.push("");
  }

  if (comparison.passRegressions.length > 0) {
    lines.push("### PASS → FAIL", "");
    for (const r of comparison.passRegressions) {
      lines.push(`- **${r.promptId}**: PASS → FAIL`);
    }
    lines.push("");
  }

  if (comparison.blockingCheckRegressions.length > 0) {
    lines.push("### New Blocking Checks", "");
    for (const r of comparison.blockingCheckRegressions) {
      lines.push(`- **${r.promptId}**: +${r.added.join(", ")}`);
    }
    lines.push("");
  }

  if (comparison.improvements.length > 0) {
    lines.push("### Improvements", "");
    for (const r of comparison.improvements) {
      lines.push(
        `- **${r.promptId}**: ${pct(r.baselineScore)} → ${pct(r.currentScore)} (+${pct(r.delta)})`,
      );
    }
    lines.push("");
  }

  if (comparison.passImprovements.length > 0) {
    lines.push("### FAIL → PASS", "");
    for (const r of comparison.passImprovements) {
      lines.push(`- **${r.promptId}**: FAIL → PASS`);
    }
    lines.push("");
  }

  if (comparison.blockingCheckImprovements.length > 0) {
    lines.push("### Removed Blocking Checks", "");
    for (const r of comparison.blockingCheckImprovements) {
      lines.push(`- **${r.promptId}**: -${r.removed.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function loadDotEnvLocal(): void {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [rawKey, ...valueParts] = line.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

function parsePromptFilter(args: string[]): string[] | null {
  const idx = args.findIndex((a) => a === "--prompts" || a.startsWith("--prompts="));
  if (idx === -1) return null;
  const flag = args[idx];
  const rawValue = flag.includes("=") ? flag.slice(flag.indexOf("=") + 1) : args[idx + 1];
  if (!rawValue) return null;
  return rawValue
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseDumpModeFlag(args: string[]): EvalDumpMode | null {
  const flag = args.find((arg) => arg === "--dump-files" || arg.startsWith("--dump-files="));
  if (!flag) return null;
  if (flag === "--dump-files") return "failed";

  const value = flag.slice(flag.indexOf("=") + 1).trim().toLowerCase();
  if (value === "all") return "all";
  if (value === "failed" || value === "1" || value === "true") return "failed";
  if (value === "off" || value === "0" || value === "false") return "off";
  console.error("Invalid --dump-files value. Use --dump-files, --dump-files=failed, or --dump-files=all.");
  process.exit(2);
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const [
    { runEval },
    { formatEvalReport },
    { loadBaseline, saveBaseline, compareWithBaseline },
    { EVAL_PROMPTS },
  ] = await Promise.all([
    import("./runner"),
    import("./report"),
    import("./baseline"),
    import("./prompts"),
  ]);

  const args = process.argv.slice(2);
  const shouldSaveBaseline = args.includes("--save-baseline");
  const gateMode = args.includes("--gate");
  const smokeMode = args.includes("--smoke");
  const dumpMode = parseDumpModeFlag(args);
  const promptFilter = smokeMode ? [...SMOKE_PROMPT_IDS] : parsePromptFilter(args);

  let prompts: EvalPrompts[number][] = EVAL_PROMPTS;
  if (promptFilter && promptFilter.length > 0) {
    const wanted = new Set(promptFilter);
    prompts = EVAL_PROMPTS.filter((p) => wanted.has(p.id));
    const missing = [...wanted].filter(
      (id) => !EVAL_PROMPTS.some((p) => p.id === id),
    );
    if (missing.length > 0) {
      console.error(
        `Unknown prompt id(s): ${missing.join(", ")}. Available: ${EVAL_PROMPTS.map((p) => p.id).join(", ")}`,
      );
      process.exit(2);
    }
    console.log(
      `${smokeMode ? "Running realistic smoke subset" : "Running subset"}: ${prompts.map((p) => p.id).join(", ")}`,
    );
  } else {
    console.log("Running eval suite...");
  }

  const report = await runEval({ prompts, dumpMode: dumpMode ?? undefined });
  console.log(formatEvalReport(report));
  console.log("Structured eval summary written to data/eval-runs/latest/summary.json");

  const baseline = await loadBaseline();
  if (baseline) {
    const comparison = compareWithBaseline(report, baseline);
    console.log(formatComparison(comparison));

    if (gateMode && comparison.gateResult === "fail") {
      console.error("Gate failed: regression detected.");
      process.exit(1);
    }
  } else if (gateMode) {
    console.warn("No baseline found. Run with --save-baseline to create one.");
  }

  if (shouldSaveBaseline) {
    await saveBaseline(report);
    console.log("Baseline saved to src/lib/gen/eval/eval-baseline.json");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
