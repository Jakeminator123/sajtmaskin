/**
 * Plan execution state management.
 *
 * Tracks in-memory state for a plan run across multiple generation phases.
 * This is intentionally lightweight — plan state lives in the client and is
 * forwarded to the server on each phase transition.
 */

import type {
  PlanArtifact,
  PlanBlocker,
  PlanPhase,
} from "./plan-schema";
import {
  advancePhase,
  hasUnresolvedBlockers,
} from "./plan-schema";

export type PhaseResult = {
  phase: PlanPhase;
  success: boolean;
  summary: string;
  filesGenerated?: number;
  errors?: string[];
};

export type PlanRunState = {
  planId: string;
  plan: PlanArtifact;
  phaseResults: PhaseResult[];
  awaitingBlockerAnswers: boolean;
};

export function createPlanRun(plan: PlanArtifact): PlanRunState {
  return {
    planId: plan.id,
    plan,
    phaseResults: [],
    awaitingBlockerAnswers: hasUnresolvedBlockers(plan),
  };
}

export function resolveBlocker(
  state: PlanRunState,
  blockerId: string,
  answer: string,
): PlanRunState {
  const updatedBlockers = state.plan.blockers.map((b) =>
    b.id === blockerId ? { ...b, resolved: true, answer } : b,
  );
  const updatedPlan: PlanArtifact = {
    ...state.plan,
    blockers: updatedBlockers,
    updatedAt: Date.now(),
  };
  return {
    ...state,
    plan: updatedPlan,
    awaitingBlockerAnswers: hasUnresolvedBlockers(updatedPlan),
  };
}

export function recordPhaseResult(
  state: PlanRunState,
  result: PhaseResult,
): PlanRunState {
  const nextPhase = advancePhase(state.plan);
  const updatedPlan: PlanArtifact = {
    ...state.plan,
    currentPhase: nextPhase,
    updatedAt: Date.now(),
    steps: state.plan.steps.map((s) =>
      s.phase === result.phase ? { ...s, status: "done" as const } : s,
    ),
  };
  return {
    ...state,
    plan: updatedPlan,
    phaseResults: [...state.phaseResults, result],
    awaitingBlockerAnswers: false,
  };
}

export function canAdvance(state: PlanRunState): boolean {
  return !state.awaitingBlockerAnswers && state.plan.currentPhase !== "done";
}

export function buildPhasePrompt(
  state: PlanRunState,
  userMessage: string,
): string {
  const phase = state.plan.currentPhase;
  const priorSummaries = state.phaseResults
    .map((r) => `[${r.phase}] ${r.success ? "OK" : "FAILED"}: ${r.summary}`)
    .join("\n");

  const resolvedBlockers = state.plan.blockers
    .filter((b): b is PlanBlocker & { resolved: true } => !!b.resolved)
    .map((b) => `- ${b.question} → ${b.answer ?? "(accepted)"}`)
    .join("\n");

  const sections: string[] = [];

  if (phase === "build") {
    sections.push(
      "Execute the BUILD phase of the plan below.",
      "Generate the complete site code based on the approved plan.",
      "Focus on core structure, pages, and primary functionality.",
    );
  } else if (phase === "polish") {
    sections.push(
      "Execute the POLISH phase.",
      "Improve accessibility, responsive design, copy quality, performance, and visual consistency.",
      "Do not change the core structure from the build phase.",
    );
  } else if (phase === "verify") {
    sections.push(
      "Execute the VERIFY phase.",
      "Review the generated code for correctness, completeness, and quality.",
      "Fix any remaining issues. Ensure all plan steps are addressed.",
    );
  }

  if (priorSummaries) {
    sections.push("", "Prior phase results:", priorSummaries);
  }

  if (resolvedBlockers) {
    sections.push("", "User decisions:", resolvedBlockers);
  }

  sections.push("", "User prompt:", userMessage);

  return sections.join("\n");
}
