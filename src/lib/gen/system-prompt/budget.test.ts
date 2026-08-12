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

// Only `required` blocks are truncated under token pressure — everything else is
// dropped whole. These three carried the locked design direction, the user's
// explicit must-haves, and the one-owner-per-capability rule, yet were all
// droppable (the latter two sat at the default priority 60, i.e. first in line).
describe("splitContextIntoBudgetBlocks — brief and variant guardrails survive pruning", () => {
  it.each([
    ["## Scaffold Variant (this generation)\n\n- Tokens: dark", "scaffold variant (this generation)", 91],
    ["## Must Have\n\n- Bokningsformulär på startsidan", "must have", 88],
    [
      "## Capability Surface Ownership — one owner per capability\n\n- auth → supabase-auth",
      "capability surface ownership — one owner per capability",
      87,
    ],
  ])("keeps %s required", (context, title, priority) => {
    const [block] = splitContextIntoBudgetBlocks(context);
    expect(block?.title.toLowerCase()).toBe(title);
    expect(block?.required).toBe(true);
    expect(block?.priority).toBe(priority);
  });
});

describe("splitContextIntoBudgetBlocks — F3 build plan", () => {
  it("keeps the file-derived integration plan required under token pressure", () => {
    const [block] = splitContextIntoBudgetBlocks(
      "## Tier-3 Integration Build Plan\n\n- Stripe",
    );
    expect(block).toMatchObject({
      key: "tier_3_integration_build_plan",
      priority: 93,
      required: true,
    });
  });
});
