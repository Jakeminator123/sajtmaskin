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
    for (const option of MODEL_TIER_OPTIONS) {
      if (option.value === "anthropic") {
        expect(option.description).not.toContain("GPT-5.6 Sol");
      } else {
        expect(option.description).toContain("GPT-5.6 Sol");
      }
    }
  });

  it("offers every GPT-5.6 family variant for prompt assist", () => {
    const values = PROMPT_ASSIST_MODEL_OPTIONS.map((option) => option.value);
    expect(values).toEqual(
      expect.arrayContaining(["openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5.6-luna"]),
    );
  });
});
