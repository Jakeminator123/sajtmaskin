/**
 * Init vs follow-up mode resolution — moved verbatim from
 * `src/lib/gen/orchestrate.ts` (structural split, no behavior change).
 */
import { deriveFollowUpStateFromInputs } from "../follow-up-predicate";
import type { OrchestrationInput } from "./types";

/**
 * BUG-SWARM B15 — single source for init vs follow-up mode resolution.
 * `finalizeOrchestrationPrompts` previously fell back to a stale
 * `persistedScaffoldId ? "followUp" : "init"` check while `resolveOrchestrationBase`
 * used the unified `deriveFollowUpStateFromInputs` predicate, so the two
 * diverged in the P26 edge case (scaffold pinned, `previousFilesCount === 0`)
 * whenever no explicit `generationMode` was supplied. This mirrors the base
 * derivation exactly; `resolveOrchestrationBase` keeps its inline copy (the core
 * path is left untouched) and must stay in sync with this helper.
 */
export function resolveGenerationMode(
  input: Pick<OrchestrationInput, "generationMode" | "persistedScaffoldId" | "previousFilesCount">,
): "init" | "followUp" {
  if (input.generationMode) return input.generationMode;
  const { isOrchestrationFollowUp } = deriveFollowUpStateFromInputs({
    persistedScaffoldId: input.persistedScaffoldId ?? null,
    previousFilesCount: input.previousFilesCount ?? (input.persistedScaffoldId ? 1 : 0),
  });
  return isOrchestrationFollowUp ? "followUp" : "init";
}
