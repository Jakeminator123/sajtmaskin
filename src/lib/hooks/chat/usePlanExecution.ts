/**
 * Client-side plan execution hook.
 *
 * Manages the phase loop: when a plan artifact is received, the hook
 * automatically triggers subsequent phases (build -> polish -> verify)
 * by sending phase-specific follow-up messages.
 */

import { useCallback, useRef, useState } from "react";
import type {
  PlanArtifact,
  PlanPhase,
} from "@/lib/gen/plan-schema";
import {
  hasUnresolvedBlockers,
  advancePhase,
  serializePlanForPrompt,
} from "@/lib/gen/plan-schema";
import {
  type PlanRunState,
  type PhaseResult,
  createPlanRun,
  recordPhaseResult,
  canAdvance,
  buildPhasePrompt,
} from "@/lib/gen/plan-execution";
import { debugLog } from "@/lib/utils/debug";

type PlanExecutionCallbacks = {
  sendMessage: (text: string) => Promise<void>;
};

export type PlanExecutionState = {
  isActive: boolean;
  currentPhase: PlanPhase | null;
  plan: PlanArtifact | null;
  phaseResults: PhaseResult[];
};

export function usePlanExecution(callbacks: PlanExecutionCallbacks) {
  const [executionState, setExecutionState] = useState<PlanExecutionState>({
    isActive: false,
    currentPhase: null,
    plan: null,
    phaseResults: [],
  });
  const runStateRef = useRef<PlanRunState | null>(null);
  const originalPromptRef = useRef<string>("");
  const phaseInFlightRef = useRef(false);

  const startPlanExecution = useCallback(
    async (plan: PlanArtifact, originalPrompt: string) => {
      if (hasUnresolvedBlockers(plan)) {
        debugLog("plan", "Plan has unresolved blockers, waiting for user input");
        const run = createPlanRun(plan);
        runStateRef.current = run;
        originalPromptRef.current = originalPrompt;
        setExecutionState({
          isActive: true,
          currentPhase: "plan",
          plan,
          phaseResults: [],
        });
        return;
      }

      const run = createPlanRun(plan);
      const advancedPlan: PlanArtifact = { ...plan, currentPhase: "build" };
      const advancedRun: PlanRunState = { ...run, plan: advancedPlan };
      runStateRef.current = advancedRun;
      originalPromptRef.current = originalPrompt;
      setExecutionState({
        isActive: true,
        currentPhase: "build",
        plan: advancedPlan,
        phaseResults: [],
      });

      await executeNextPhase(advancedRun, originalPrompt);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callbacks.sendMessage],
  );

  const executeNextPhase = useCallback(
    async (run: PlanRunState, prompt: string) => {
      if (phaseInFlightRef.current) return;
      if (!canAdvance(run)) {
        debugLog("plan", "Cannot advance, plan is done or has blockers");
        return;
      }

      phaseInFlightRef.current = true;
      const phase = run.plan.currentPhase;

      debugLog("plan", `Executing phase: ${phase}`, {
        priorPhases: run.phaseResults.length,
      });

      const planContext = serializePlanForPrompt(run.plan);
      const phasePrompt = buildPhasePrompt(run, prompt);
      const fullMessage = `${planContext}\n\n---\n\n${phasePrompt}`;

      try {
        await callbacks.sendMessage(fullMessage);
      } finally {
        phaseInFlightRef.current = false;
      }
    },
    [callbacks.sendMessage],
  );

  const reportPhaseComplete = useCallback(
    (phase: PlanPhase, success: boolean, summary: string, filesGenerated?: number) => {
      const run = runStateRef.current;
      if (!run) return;

      const result: PhaseResult = {
        phase,
        success,
        summary,
        filesGenerated,
      };

      const updatedRun = recordPhaseResult(run, result);
      runStateRef.current = updatedRun;

      setExecutionState((prev) => ({
        ...prev,
        currentPhase: updatedRun.plan.currentPhase,
        plan: updatedRun.plan,
        phaseResults: updatedRun.phaseResults,
        isActive: updatedRun.plan.currentPhase !== "done",
      }));

      if (canAdvance(updatedRun)) {
        void executeNextPhase(updatedRun, originalPromptRef.current);
      }
    },
    [executeNextPhase],
  );

  const advanceAfterBlockersResolved = useCallback(async () => {
    const run = runStateRef.current;
    if (!run || hasUnresolvedBlockers(run.plan)) return;

    const advancedPlan: PlanArtifact = { ...run.plan, currentPhase: "build" };
    const advancedRun: PlanRunState = { ...run, plan: advancedPlan, awaitingBlockerAnswers: false };
    runStateRef.current = advancedRun;

    setExecutionState((prev) => ({
      ...prev,
      currentPhase: "build",
      plan: advancedPlan,
    }));

    await executeNextPhase(advancedRun, originalPromptRef.current);
  }, [executeNextPhase]);

  const cancelExecution = useCallback(() => {
    runStateRef.current = null;
    phaseInFlightRef.current = false;
    originalPromptRef.current = "";
    setExecutionState({
      isActive: false,
      currentPhase: null,
      plan: null,
      phaseResults: [],
    });
  }, []);

  return {
    executionState,
    startPlanExecution,
    reportPhaseComplete,
    advanceAfterBlockersResolved,
    cancelExecution,
  };
}
