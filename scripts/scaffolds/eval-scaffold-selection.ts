import path from "node:path";
import {
  loadScaffoldEvalCasesFromFile,
  resolveDefaultScaffoldEvalPath,
  runScaffoldSelectionEval,
  writeScaffoldSelectionReport,
} from "@/lib/gen/scaffolds/scaffold-eval";

/**
 * @deprecated Use `npm run eval` (canonical). Kept until the cleanup PR
 * deletes this wrapper. Writes the same report path Backoffice already reads.
 */
async function main() {
  const repoRoot = process.cwd();
  const evalPath = process.argv[2]
    ? path.resolve(repoRoot, process.argv[2])
    : resolveDefaultScaffoldEvalPath(repoRoot);
  const evalCases = await loadScaffoldEvalCasesFromFile(evalPath);
  const report = await runScaffoldSelectionEval(evalCases);
  const { latestPath } = await writeScaffoldSelectionReport(report, repoRoot);

  console.info(`[scaffold-eval] cases=${report.summary.total}`);
  console.info(
    `[scaffold-eval] keyword_top1=${report.summary.keywordTop1Accuracy}% semantic_top1=${report.summary.semanticTop1Accuracy}% semantic_top3=${report.summary.semanticTop3Accuracy}%`,
  );
  console.info(`[scaffold-eval] wrote ${latestPath}`);
  console.info("[scaffold-eval] deprecated wrapper — prefer `npm run eval`.");
}

main().catch((error) => {
  console.error("[scaffold-eval] failed:", error);
  process.exitCode = 1;
});
