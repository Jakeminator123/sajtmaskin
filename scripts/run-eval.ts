import { writeFileSync, mkdirSync, existsSync } from "fs";

import { runEval } from "../src/lib/gen/eval/runner";
import { formatEvalReport } from "../src/lib/gen/eval/report";

async function main() {
  console.log("Starting eval run...");

  const report = await runEval();
  const md = formatEvalReport(report);

  const dir = "EGEN_MOTOR_V2";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filename = `${dir}/eval-report-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(filename, md, "utf-8");
  console.log(`Report written to ${filename}\n`);
  console.log(md);

  process.exit(report.summary.passed === report.summary.total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
