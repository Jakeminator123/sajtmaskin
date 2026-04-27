import { runEval } from "./runner";
import { formatEvalReport } from "./report";
import { loadBaseline, saveBaseline, compareWithBaseline } from "./baseline";
import { EVAL_PROMPTS } from "./prompts";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatComparison(
  comparison: ReturnType<typeof compareWithBaseline>,
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldSaveBaseline = args.includes("--save-baseline");
  const gateMode = args.includes("--gate");
  const promptFilter = parsePromptFilter(args);

  let prompts = EVAL_PROMPTS;
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
    console.log(`Running subset: ${prompts.map((p) => p.id).join(", ")}`);
  } else {
    console.log("Running eval suite...");
  }

  const report = await runEval({ prompts });
  console.log(formatEvalReport(report));

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
