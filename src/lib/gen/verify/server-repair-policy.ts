export function resolveServerRepairEarlyStopReason(params: {
  fixerProducedOutput: boolean;
  errorsBefore: number;
  errorsAfter: number;
  timedOut?: boolean;
}): "continue" | "fixer_noop" | "no_improvement" | "time_budget_exceeded" {
  const { fixerProducedOutput, errorsBefore, errorsAfter, timedOut } = params;
  if (timedOut) return "time_budget_exceeded";
  if (!fixerProducedOutput) return "fixer_noop";
  if (errorsAfter >= errorsBefore) return "no_improvement";
  return "continue";
}
