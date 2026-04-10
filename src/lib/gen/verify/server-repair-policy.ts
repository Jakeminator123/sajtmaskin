export function resolveServerRepairEarlyStopReason(params: {
  fixerProducedOutput: boolean;
  errorsBefore: number;
  errorsAfter: number;
}): "continue" | "fixer_noop" | "no_improvement" {
  const { fixerProducedOutput, errorsBefore, errorsAfter } = params;
  if (!fixerProducedOutput) return "fixer_noop";
  if (errorsAfter >= errorsBefore) return "no_improvement";
  return "continue";
}
