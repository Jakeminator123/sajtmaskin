import { describe, expect, it } from "vitest";

import {
  buildNeedsAnalysisPrompt,
  buildNextNeedsAnalysisMessage,
  buildSeedNeedsAnalysisMessages,
  deriveNeedsAnalysisState,
} from "./needs-analysis";

describe("needs-analysis", () => {
  it("seeds a local intake question for freeform entry", () => {
    const messages = buildSeedNeedsAnalysisMessages("Jag vill bygga en sajt for min redovisningsbyra");

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.uiParts?.[0]).toMatchObject({
      type: "tool:awaiting-input",
      kind: "needs-analysis",
    });
  });

  it("marks the intake as ready when all fields are covered", () => {
    const messages = [
      {
        id: "1",
        role: "user" as const,
        content:
          "Jag driver en redovisningsbyra och vill ha en modern sajt for foretag. Den ska ge fler leads, visa priser, referenser och kontakt. Forsta versionen kan vara en landningssida.",
      },
      {
        id: "2",
        role: "user" as const,
        content: "Börja från noll, jag har ingen hemsida idag.",
      },
    ];

    const state = deriveNeedsAnalysisState(messages);

    expect(state.ready).toBe(true);
    expect(state.missingFields).toHaveLength(0);
  });

  it("builds a summarized prompt from the local intake transcript", () => {
    const messages = [
      {
        id: "1",
        role: "user" as const,
        content:
          "Jag driver en redovisningsbyra och vill ha en modern sajt for foretag. Den ska ge fler leads, visa priser, referenser och kontakt. Forsta versionen kan vara en landningssida.",
      },
    ];

    const prompt = buildNeedsAnalysisPrompt(messages);

    expect(prompt).toContain("## Sammanfattad behovsanalys");
    expect(prompt).toContain("Huvudmål");
    expect(prompt).toContain("landningssida");
  });

  it("continues with another question when the intake is incomplete", () => {
    const seed = buildSeedNeedsAnalysisMessages("Jag vill bygga en sajt for min studio");
    const next = buildNextNeedsAnalysisMessage([
      ...seed,
      {
        id: "reply",
        role: "user" as const,
        content: "Malet ar fler bokningar fran lokala kunder.",
      },
    ]);

    expect(next?.uiParts?.[0]).toMatchObject({
      type: "tool:awaiting-input",
      kind: "needs-analysis",
    });
  });
});
