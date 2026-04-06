import { looksDesignHeavyMessage } from "@/lib/builder/promptOrchestration";
import type { BuildSpec } from "@/lib/gen/build-spec";

/**
 * Tool-calling budget for own-engine codegen. Follow-ups that are design-heavy or
 * broad-scope get an extra step so the model can finish structured edits.
 */
export function resolveOwnEngineMaxSteps(input: {
  buildSpec: BuildSpec;
  userMessage: string;
  isFollowUp: boolean;
}): number {
  if (!input.isFollowUp) return 4;
  const trimmed = input.userMessage.trim();
  if (input.buildSpec.contextPolicy === "heavy") return 5;
  if (looksDesignHeavyMessage(trimmed)) return 5;
  const scope = input.buildSpec.changeScope;
  if (scope === "redesign" || scope === "integration" || scope === "page-addition") {
    return 5;
  }
  return 4;
}
