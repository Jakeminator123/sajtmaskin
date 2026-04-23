import { describe, expect, it } from "vitest";

import { buildPostGenerationAdvisorMessage } from "./post-generation-advisor";

describe("post-generation-advisor", () => {
  it("creates a single actionable advisor follow-up with quick replies", () => {
    const message = buildPostGenerationAdvisorMessage(
      [
        {
          id: "user-1",
          role: "user",
          content: "Jag vill ha en restaurangsajt med meny och bokning.",
        },
      ],
      "version_123",
    );

    expect(message.id).toBe("advisor-version_123");
    expect(message.isHelpMessage).toBe(true);
    expect(message.uiParts?.[0]).toMatchObject({
      type: "tool:awaiting-input",
      kind: "advisor-follow-up",
    });
    expect(message.content).toContain("Din sajt är redo");
  });
});
