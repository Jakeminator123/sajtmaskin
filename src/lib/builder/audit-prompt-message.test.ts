import { describe, expect, it } from "vitest";
import {
  getAuditPromptDomain,
  isAuditPromptMessage,
  PROMPT_SOURCE_UI_PART_TYPE,
} from "./types";

describe("audit prompt-source marker", () => {
  it("classifies a user row with an audit uiPart", () => {
    const message = {
      role: "user" as const,
      content: "Bygg en förbättrad sajt för granit.se",
      uiParts: [
        { type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "audit", domain: "granit.se" },
      ],
    };
    expect(isAuditPromptMessage(message)).toBe(true);
    expect(getAuditPromptDomain(message)).toBe("granit.se");
  });

  it("does not classify ordinary user text as audit", () => {
    expect(
      isAuditPromptMessage({
        role: "user",
        uiParts: [],
      }),
    ).toBe(false);
  });
});
