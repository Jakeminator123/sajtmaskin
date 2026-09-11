import { extractToolSummaries, resolveToolLabels } from "./tooling/output-parsers";
import type { ToolPart } from "./tooling/types";

/** Reviews belong in the shared detail drawer; user decisions stay visible. */
export function isGenerationReviewPart(part: ToolPart): boolean {
  if (part.tool.state === "approval-requested") return false;
  const { toolType } = resolveToolLabels(part.tool);
  return ["tool-post-check", "tool-quality-gate", "tool-live-review"].includes(toolType);
}

/** Presentation only. Never turns a finished stream into a readiness verdict. */
export function hasGenerationWarnings(toolParts: ToolPart[]): boolean {
  return toolParts.some(({ tool }) => {
    if (tool.state === "output-error") return true;
    if (tool.state !== "output-available") return false;
    const { toolType } = resolveToolLabels(tool);
    const { postCheck, qualityGate, liveReview } = extractToolSummaries(toolType, tool.output);
    return (
      (postCheck?.warnings ?? 0) > 0 ||
      postCheck?.autoFixQueued === true ||
      qualityGate?.retryPending === true ||
      Boolean(
        qualityGate &&
        !qualityGate.skipped &&
        (!qualityGate.passed || qualityGate.designAdvisory || qualityGate.qualityGateAdvisory),
      ) ||
      (liveReview?.status === "completed" && liveReview.decision.verdict !== "pass")
    );
  });
}
