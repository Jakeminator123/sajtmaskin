/**
 * Structured plan schema for the builder plan execution mode.
 *
 * When the user clicks "Plan", the planner pass produces a PlanArtifact
 * instead of code.  The executor then runs the plan in phases.
 */

export type PlanPhase = "plan" | "build" | "polish" | "verify" | "done";

export type PlanStepStatus = "pending" | "active" | "done" | "skipped";

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  status: PlanStepStatus;
  phase: PlanPhase;
};

export type PlanBlocker = {
  id: string;
  kind: "integration" | "env" | "database" | "auth" | "payment" | "unclear";
  question: string;
  options?: string[];
  resolved?: boolean;
  answer?: string;
};

export type PlanAssumption = {
  id: string;
  description: string;
  defaultValue: string;
};

export type PlanArtifact = {
  id: string;
  goal: string;
  scope: string[];
  steps: PlanStep[];
  blockers: PlanBlocker[];
  assumptions: PlanAssumption[];
  currentPhase: PlanPhase;
  createdAt: number;
  updatedAt: number;
};

export function createEmptyPlan(id: string, goal: string): PlanArtifact {
  return {
    id,
    goal,
    scope: [],
    steps: [],
    blockers: [],
    assumptions: [],
    currentPhase: "plan",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function hasUnresolvedBlockers(plan: PlanArtifact): boolean {
  return plan.blockers.some((b) => !b.resolved);
}

export function unresolvedBlockers(plan: PlanArtifact): PlanBlocker[] {
  return plan.blockers.filter((b) => !b.resolved);
}

export function advancePhase(plan: PlanArtifact): PlanPhase {
  const order: PlanPhase[] = ["plan", "build", "polish", "verify", "done"];
  const idx = order.indexOf(plan.currentPhase);
  return idx < order.length - 1 ? order[idx + 1] : "done";
}

export function isPlanComplete(plan: PlanArtifact): boolean {
  return plan.currentPhase === "done";
}

/**
 * Serialize a plan artifact into a compact context string that can be
 * injected into subsequent generation prompts.
 */
export function serializePlanForPrompt(plan: PlanArtifact): string {
  const lines: string[] = [
    `## Plan: ${plan.goal}`,
    "",
    "### Scope",
    ...plan.scope.map((s) => `- ${s}`),
    "",
    "### Steps",
    ...plan.steps.map(
      (s) => `- [${s.status}] (${s.phase}) ${s.title}: ${s.description}`,
    ),
  ];

  if (plan.assumptions.length > 0) {
    lines.push("", "### Assumptions (auto-resolved)");
    for (const a of plan.assumptions) {
      lines.push(`- ${a.description} → ${a.defaultValue}`);
    }
  }

  const resolved = plan.blockers.filter((b) => b.resolved);
  if (resolved.length > 0) {
    lines.push("", "### Resolved decisions");
    for (const b of resolved) {
      lines.push(`- ${b.question} → ${b.answer ?? "(accepted)"}`);
    }
  }

  return lines.join("\n");
}
