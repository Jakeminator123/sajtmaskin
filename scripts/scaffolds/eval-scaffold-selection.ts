import fs from "node:fs/promises";
import path from "node:path";
import {
  loadScaffoldEvalCasesFromFile,
  resolveDefaultScaffoldEvalPath,
  runScaffoldSelectionEval,
} from "@/lib/gen/scaffolds/scaffold-eval";

async function main() {
  const repoRoot = process.cwd();
  const evalPath = process.argv[2]
    ? path.resolve(repoRoot, process.argv[2])
    : resolveDefaultScaffoldEvalPath(repoRoot);
  const evalCases = await loadScaffoldEvalCasesFromFile(evalPath);
  const report = await runScaffoldSelectionEval(evalCases);

  const reportDir = path.join(repoRoot, "data", "scaffold-eval", "reports");
  const latestPath = path.join(reportDir, "scaffold-selection-latest.json");
  const timestampPath = path.join(
    reportDir,
    `scaffold-selection-${report.timestamp.replace(/[:.]/g, "-")}.json`,
  );

  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(latestPath, JSON.stringify(report, null, 2), "utf-8");
  await fs.writeFile(timestampPath, JSON.stringify(report, null, 2), "utf-8");

  console.info(`[scaffold-eval] cases=${report.summary.total}`);
  console.info(
    `[scaffold-eval] keyword_top1=${report.summary.keywordTop1Accuracy}% semantic_top1=${report.summary.semanticTop1Accuracy}% semantic_top3=${report.summary.semanticTop3Accuracy}%`,
  );
  console.info(
    `[scaffold-eval] generic_fallback=${report.summary.genericFallbackRate}% semantic_unavailable=${report.summary.semanticUnavailableRate}% app_auth_misclassification=${report.summary.appAuthMisclassificationRate}%`,
  );
  if (report.summary.previewWhiteRate !== null) {
    console.info(`[scaffold-eval] preview_white_rate=${report.summary.previewWhiteRate}%`);
  } else {
    console.info("[scaffold-eval] preview_white_rate=n/a (no labeled outcomes in dataset)");
  }
  console.info(`[scaffold-eval] wrote ${latestPath}`);
}

main().catch((error) => {
  console.error("[scaffold-eval] failed:", error);
  process.exitCode = 1;
});
