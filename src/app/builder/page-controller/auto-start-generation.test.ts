import { describe, expect, it } from "vitest";
import { canAutoStartKostnadsfriGeneration } from "./auto-start-generation";

const base = {
  isAuthenticated: true,
  templateId: null,
  buildMethod: "kostnadsfri" as const,
  resolvedPrompt: "Bygg en sajt",
  chatId: null,
  promptId: "prompt_1",
  promptParam: null,
};

describe("canAutoStartKostnadsfriGeneration", () => {
  it("allows the landing-page promptId handoff", () => {
    expect(canAutoStartKostnadsfriGeneration(base)).toBe(true);
  });

  it("rejects a raw query prompt even when buildMethod is kostnadsfri", () => {
    expect(
      canAutoStartKostnadsfriGeneration({
        ...base,
        promptId: null,
        promptParam: "attacker-controlled",
        resolvedPrompt: "attacker-controlled",
      }),
    ).toBe(false);
  });

  it("rejects a combined promptId + raw prompt race", () => {
    expect(
      canAutoStartKostnadsfriGeneration({
        ...base,
        promptParam: "attacker-controlled",
        resolvedPrompt: "attacker-controlled",
      }),
    ).toBe(false);
  });

  it("rejects freeform and logged-out visitors", () => {
    expect(canAutoStartKostnadsfriGeneration({ ...base, buildMethod: "freeform" })).toBe(false);
    expect(canAutoStartKostnadsfriGeneration({ ...base, isAuthenticated: false })).toBe(false);
  });
});
