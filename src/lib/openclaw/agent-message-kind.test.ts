import { describe, expect, it } from "vitest";
import { classifyAgentMessage, describeInternalAgentTurn } from "./agent-message-kind";

describe("classifyAgentMessage", () => {
  it("litar på ett uttryckligt kind-fält", () => {
    expect(classifyAgentMessage({ role: "user", content: "hej", kind: "internal" })).toBe(
      "internal",
    );
    expect(
      classifyAgentMessage({ role: "user", content: "[Automatisk väckning] x", kind: "chat" }),
    ).toBe("chat");
  });

  it("känner igen interna prefix på persisterade user-rader utan kind", () => {
    expect(
      classifyAgentMessage({ role: "user", content: "[Automatisk fortsättning] Builderturen är klar." }),
    ).toBe("internal");
    expect(classifyAgentMessage({ role: "user", content: "  [Byggresultat] status ready" })).toBe(
      "internal",
    );
  });

  it("behandlar vanliga meddelanden och assistentsvar som samtal", () => {
    expect(classifyAgentMessage({ role: "user", content: "Vad tycker du?" })).toBe("chat");
    expect(
      classifyAgentMessage({ role: "assistant", content: "[Automatisk väckning] citat" }),
    ).toBe("chat");
  });
});

describe("describeInternalAgentTurn", () => {
  it("ger en svensk statusrad per prefix och en fallback", () => {
    expect(describeInternalAgentTurn("[Automatisk fortsättning] …")).toBe(
      "Sajtagenten läser byggresultatet",
    );
    expect(describeInternalAgentTurn("[Automatisk väckning] …")).toBe(
      "Sajtagenten förbereder nästa steg",
    );
    expect(describeInternalAgentTurn("[Byggresultat] …")).toBe(
      "Sajtagenten tittar på den nya versionen",
    );
    expect(describeInternalAgentTurn("något annat")).toBe("Sajtagenten arbetar vidare");
  });
});
