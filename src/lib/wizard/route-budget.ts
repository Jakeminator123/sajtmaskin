import {
  createWizardRouteDeadline,
  type WizardRouteDeadline,
} from "@/lib/wizard/route-deadline";
import {
  createWizardStageClock,
  emitWizardRouteTerminal,
  wizardRequestId,
  type WizardRouteName,
  type WizardRouteOutcome,
  type WizardStageClock,
} from "@/lib/wizard/route-telemetry";

export type WizardRouteBudgetContext = {
  deadline: WizardRouteDeadline;
  stages: WizardStageClock;
  setOutcome: (outcome: WizardRouteOutcome) => void;
};

/**
 * Owns the shared deadline and the unconditional terminal event.
 * Callers set the HTTP shape; this wrapper always emits, even on throw.
 */
export async function withWizardRouteBudget(
  req: Request,
  spec: {
    route: WizardRouteName;
    maxDurationSeconds: number;
  },
  run: (ctx: WizardRouteBudgetContext) => Promise<Response>,
): Promise<Response> {
  const deadline = createWizardRouteDeadline(spec.maxDurationSeconds, {
    signal: req.signal,
  });
  const stages = createWizardStageClock();
  let outcome: WizardRouteOutcome = "error";

  try {
    return await run({
      deadline,
      stages,
      setOutcome(next) {
        outcome = next;
      },
    });
  } finally {
    deadline.dispose();
    emitWizardRouteTerminal({
      route: spec.route,
      outcome,
      dominantStage: stages.dominant(),
      durationMs: Math.max(0, Date.now() - deadline.startedAt),
      requestId: wizardRequestId(req),
      aborted: deadline.signal.aborted,
    });
  }
}
