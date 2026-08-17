import { describe, expect, it } from "vitest";
import {
  PROMPT_SOURCE_UI_PART_TYPE,
  isAutoRepairPromptMessage,
  isF3KickPromptMessage,
} from "./types";

describe("isF3KickPromptMessage", () => {
  it("matches a user row with the f3-kick uiPart marker", () => {
    expect(
      isF3KickPromptMessage({
        role: "user",
        content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "f3-kick" }],
      }),
    ).toBe(true);
  });

  it("matches a legacy user row whose content starts with the kick prefix", () => {
    expect(
      isF3KickPromptMessage({
        role: "user",
        content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
      }),
    ).toBe(true);
  });

  it("ignores leading whitespace on the legacy prefix", () => {
    expect(
      isF3KickPromptMessage({
        role: "user",
        content: "  Bygg integrationer nu utifrån den finaliserade designversionen.",
      }),
    ).toBe(true);
  });

  it("does not match a free-text follow-up that only mentions integrationer", () => {
    expect(
      isF3KickPromptMessage({
        role: "user",
        content: "Bygg integrationer nu.",
      }),
    ).toBe(false);
  });

  it("does not match an autofix marker or an assistant row", () => {
    expect(
      isF3KickPromptMessage({
        role: "user",
        content: "AUTO-FIX REQUEST — TARGETED REPAIR",
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }],
      }),
    ).toBe(false);
    expect(
      isF3KickPromptMessage({
        role: "assistant",
        content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
      }),
    ).toBe(false);
  });

  it("does not collide with isAutoRepairPromptMessage", () => {
    const kick = {
      role: "user" as const,
      content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
      uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "f3-kick" }],
    };
    expect(isF3KickPromptMessage(kick)).toBe(true);
    expect(isAutoRepairPromptMessage(kick)).toBe(false);
  });
});
