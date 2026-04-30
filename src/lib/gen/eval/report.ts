import type { EvalReport } from "./runner";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtTime(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function pad(s: string, len: number): string {
  return s.padEnd(len);
}

function fmtKChars(chars: number): string {
  return `${Math.round(chars / 100) / 10}k`;
}

function promptBudgetStatus(totalChars: number): string {
  if (totalChars > 90_000) return "over";
  if (totalChars > 75_000) return "warn";
  if (totalChars > 60_000) return "watch";
  return "ok";
}

export function formatEvalReport(report: EvalReport): string {
  const date = report.timestamp.slice(0, 10);
  const { summary } = report;

  const lines: string[] = [
    `# Eval Report — ${date}`,
    "",
    `Model: ${report.model} | Total: ${summary.total} | Passed: ${summary.passed} | Avg Score: ${pct(summary.avgScore)} | Avg Time: ${fmtTime(summary.avgTimeMs)}`,
    "",
  ];

  if (summary.blockingFailures > 0) {
    const blockerList = Object.entries(summary.blockingCheckCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} (${count})`)
      .join(", ");
    lines.push(
      `Blocking failures: ${summary.blockingFailures}/${summary.total}` +
        (blockerList ? ` | Top blockers: ${blockerList}` : ""),
      "",
    );
  }

  lines.push("| # | Prompt | Score | Files | Prompt | Preflight | Time | Status | Issues |");
  lines.push("|---|--------|-------|-------|--------|-----------|------|--------|--------|");

  for (let i = 0; i < report.results.length; i++) {
    const r = report.results[i];
    const status = r.passed ? "PASS" : "FAIL";
    const failedChecks = r.checks
      .filter((c) => !c.passed)
      .map((c) => `${c.name}: ${c.message}`)
      .join("; ");
    const blocking =
      r.blockingChecks.length > 0 ? ` blockers=${r.blockingChecks.join(",")}` : "";
    const budgetStatus = promptBudgetStatus(r.promptSize.totalChars);
    const promptSize = `${Math.round(r.promptSize.totalEstimatedTokens / 100) / 10}k tok/${budgetStatus}`;
    const preflight =
      r.preflight.errors > 0 || r.preflight.warnings > 0 || r.preflight.previewBlocked
        ? r.failureStage === "preflight_env"
          ? "failed_env"
          : `${r.preflight.errors}E/${r.preflight.warnings}W${r.preflight.previewBlocked ? " blocked" : ""}`
        : "ok";
    const time = r.generationStatus === "skipped" ? "skipped" : fmtTime(r.generationTimeMs);

    lines.push(
      `| ${pad(String(i + 1), 1)} ` +
        `| ${pad(r.promptId, 6)} ` +
        `| ${pad(pct(r.totalScore), 5)} ` +
        `| ${pad(`${r.generatedSurfaceFiles}/${r.finalProjectFiles}`, 5)} ` +
        `| ${pad(promptSize, 7)} ` +
        `| ${pad(preflight, 9)} ` +
        `| ${pad(time, 7)} ` +
        `| ${pad(status, 6)} ` +
        `| ${failedChecks}${blocking} |`,
    );
  }

  lines.push("");

  const failedResults = report.results.filter((r) => !r.passed);
  if (failedResults.length > 0) {
    lines.push("## Failed Prompts", "");
    for (const r of failedResults) {
      lines.push(`### ${r.promptId}`, "");
      if (r.blockingChecks.length > 0) {
        lines.push(`- **Blocking checks:** ${r.blockingChecks.join(", ")}`);
      }
      for (const c of r.checks.filter((ch) => !ch.passed)) {
        lines.push(`- **${c.name}** (${pct(c.score)}): ${c.message}`);
      }
      lines.push("");
    }
  }

  lines.push("## Prompt / Preflight Telemetry", "");
  for (const r of report.results) {
    const largest = r.promptSize.largestBlocks
      .slice(0, 5)
      .map((block) => {
        const flags = [
          block.kept ? "" : "dropped",
          block.required ? "required" : "",
        ].filter(Boolean);
        return `${block.title} ${block.chars}c/~${block.estimatedTokens}t${flags.length ? ` ${flags.join(",")}` : ""}`;
      })
      .join("; ");
    lines.push(
      `- **${r.promptId}**: scaffold=${r.scaffoldId ?? "none"}, variant=${r.variantId ?? "none"}, ` +
        `prompt=${r.promptSize.totalChars} chars/~${r.promptSize.totalEstimatedTokens} tokens (${promptBudgetStatus(r.promptSize.totalChars)}), ` +
        `static=${fmtKChars(r.promptSize.staticCoreChars)}c/~${r.promptSize.staticCoreEstimatedTokens}t, ` +
        `dynamic=${r.promptSize.dynamicContextChars} chars/~${r.promptSize.dynamicContextEstimatedTokens}t, ` +
        `budget=${r.promptSize.dynamicBudgetUsedTokens}/${r.promptSize.dynamicBudgetBudgetTokens}t, ` +
        `files=generatedSurface:${r.generatedSurfaceFiles}/finalProject:${r.finalProjectFiles}, ` +
        `droppedBlocks=${r.promptSize.droppedBlocks}, ` +
        `preflight=${r.preflight.errors}E/${r.preflight.warnings}W${r.preflight.previewBlocked ? " preview-blocked" : ""}` +
        (largest ? `, largest: ${largest}` : ""),
    );
  }

  return lines.join("\n");
}
