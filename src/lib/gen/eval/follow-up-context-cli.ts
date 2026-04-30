import {
  formatFollowUpContextEvalReport,
  runFollowUpContextEval,
} from "./follow-up-context";

runFollowUpContextEval()
  .then((results) => {
    console.info(formatFollowUpContextEvalReport(results));
    if (results.some((result) => !result.passed)) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
