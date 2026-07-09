import { describe, expect, it } from "vitest";

import { splitContextIntoBudgetBlocks } from "./budget";

// Fix 8 (review round 2): the AI-SDK guardrail section is only rendered when
// an AI dossier is selected — and must then survive budget pruning. An
// unregistered section defaults to priority 60 / required:false and can be
// silently dropped under a tight budget, reintroducing the v4-drift build
// breaks the section prevents.
describe("splitContextIntoBudgetBlocks — AI SDK version contract", () => {
  it("marks the guardrail block required with elevated priority", () => {
    const context = [
      "## AI SDK version contract (ai@^7 / v5+)",
      "",
      "- Do NOT import or use `CoreMessage`.",
      "",
      "## Imagery",
      "",
      "Optional imagery guidance.",
    ].join("\n");

    const blocks = splitContextIntoBudgetBlocks(context);
    const guardrail = blocks.find((block) =>
      block.title.toLowerCase().startsWith("ai sdk version contract"),
    );
    expect(guardrail).toBeDefined();
    expect(guardrail?.required).toBe(true);
    expect(guardrail?.priority).toBe(88);

    // Unregistered sections keep the default (droppable) budget profile.
    const imagery = blocks.find((block) => block.title.toLowerCase() === "imagery");
    expect(imagery?.required).toBe(false);
  });
});
