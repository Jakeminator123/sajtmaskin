import { describe, expect, it } from "vitest";

import { MODEL_TIER_OPTIONS, PROMPT_ASSIST_MODEL_OPTIONS } from "./defaults";
import { SELECTABLE_MODEL_IDS } from "@/lib/models/catalog";

describe("builder model options", () => {
  it("exposes selectable tiers in slider order and drops the cheap fast lane", () => {
    expect(MODEL_TIER_OPTIONS.map((option) => option.value)).toEqual([...SELECTABLE_MODEL_IDS]);
    expect(MODEL_TIER_OPTIONS[0]?.value).toBe("pro");
    expect(MODEL_TIER_OPTIONS.some((option) => option.value === "premium")).toBe(true);
    expect(MODEL_TIER_OPTIONS.some((option) => (option.value as string) === "fast")).toBe(false);
    expect(MODEL_TIER_OPTIONS.some((option) => option.value === "codex")).toBe(false);
    expect(MODEL_TIER_OPTIONS.some((option) => option.value === "anthropic")).toBe(false);
    expect(MODEL_TIER_OPTIONS.at(-1)?.value).toBe("ultra");
    for (const option of MODEL_TIER_OPTIONS) {
      expect(option.description).toContain(option.value === "ultra" ? "GPT-6 Astra" : "GPT-6.1 Sol");
    }
  });

  it("offers GPT-6.1 Sol, GPT-6 Luna and the retained GPT-5.6 family for prompt assist", () => {
    const values = PROMPT_ASSIST_MODEL_OPTIONS.map((option) => option.value);
    expect(values).toEqual(
      expect.arrayContaining([
        "openai/gpt-6.1-sol",
        "openai/gpt-6-luna",
        "openai/gpt-5.6-sol",
        "openai/gpt-5.6-terra",
        "openai/gpt-5.6-luna",
      ]),
    );
    expect(values).not.toContain("openai/gpt-5.3-codex");
  });
});
