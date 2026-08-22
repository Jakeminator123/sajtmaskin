import { describe, expect, it } from "vitest";

import { buildPromptSourceMessage } from "./prompt-builder";

describe("approved plan prompt source", () => {
  it("carries the displayed plan's design-authority lineage into request meta", () => {
    const built = buildPromptSourceMessage({
      kind: "approved-plan",
      rawPlan: {
        goal: "Bygg startsidan",
        scope: ["hero"],
        designAuthority: { lineageHash: " plan-lineage-123 " },
      },
    });

    expect(built.meta).toMatchObject({
      sourceKind: "approved-plan",
      isTechnical: true,
      preservePayload: true,
      planDesignLineageHash: "plan-lineage-123",
    });
  });
});
