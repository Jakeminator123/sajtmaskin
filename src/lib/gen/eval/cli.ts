import { runEval } from "./runner";
import { formatEvalReport } from "./report";
import { loadBaseline, saveBaseline, compareWithBaseline } from "./baseline";

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

  if (comparison.improvements.length > 0) {
    lines.push("### Improvements", "");
    for (const r of comparison.improvements) {
      lines.push(
        `- **${r.promptId}**: ${pct(r.baselineScore)} → ${pct(r.currentScore)} (+${pct(r.delta)})`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldSaveBaseline = args.includes("--save-baseline");
  const gateMode = args.includes("--gate");

  console.log("Running eval suite...");
  const report = await runEval();
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
