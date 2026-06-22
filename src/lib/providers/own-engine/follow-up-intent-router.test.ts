import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";

const getMatchStrategyMock = vi.hoisted(() =>
  vi.fn<() => "keyword" | "embedding" | "small-llm">(),
);
const llmClassifyMock = vi.hoisted(() =>
  vi.fn<(message: string) => Promise<FollowUpIntentMode>>(),
);

vi.mock("@/lib/ai-models/load-manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-models/load-manifest")>();
  return { ...actual, getMatchStrategy: getMatchStrategyMock };
});

vi.mock("./follow-up-intent-llm-classifier", () => ({
  llmClassifyFollowUpIntent: llmClassifyMock,
}));

import { classifyFollowUpIntentWithStrategy } from "./follow-up-intent-router";
import { classifyFollowUpIntent } from "./follow-up-clarification";

// Representative messages spanning every deterministic branch.
const SAMPLE_MESSAGES = [
  "gör om designen",
  "byt till mörkt tema",
  "Ändra rubriken till Hej",
  "Flytta CTA-knappen under rubriken",
  "lägg till en kontaktform",
  "byt ut bubblan mot en 3d-kaffekopp",
  "make it better",
  "ny hemsida, bygg den",
  "",
  "hej",
];

describe("classifyFollowUpIntentWithStrategy", () => {
  beforeEach(() => {
    getMatchStrategyMock.mockReset();
    llmClassifyMock.mockReset();
  });

  describe("default (keyword) strategy — regression: byte-for-byte unchanged", () => {
    beforeEach(() => {
      getMatchStrategyMock.mockReturnValue("keyword");
    });

    it("matches the deterministic classifier for every sample message", async () => {
      for (const message of SAMPLE_MESSAGES) {
        const viaStrategy = await classifyFollowUpIntentWithStrategy(message);
        const deterministic = classifyFollowUpIntent(message);
        expect(viaStrategy).toBe(deterministic);
      }
    });

    it("never calls the LLM classifier at default", async () => {
      for (const message of SAMPLE_MESSAGES) {
        await classifyFollowUpIntentWithStrategy(message);
      }
      expect(llmClassifyMock).not.toHaveBeenCalled();
    });
  });

  describe("embedding strategy (declared-only, no wired path) falls back to deterministic", () => {
    it("returns the deterministic result and does not call the LLM", async () => {
      getMatchStrategyMock.mockReturnValue("embedding");
      const message = "byt till mörkt tema";
      const result = await classifyFollowUpIntentWithStrategy(message);
      expect(result).toBe(classifyFollowUpIntent(message));
      expect(llmClassifyMock).not.toHaveBeenCalled();
    });
  });

  describe("small-llm strategy", () => {
    beforeEach(() => {
      getMatchStrategyMock.mockReturnValue("small-llm");
    });

    it("returns the LLM result when the LLM succeeds", async () => {
      // Deterministic classifier would return clear-refine for this edit.
      const message = "Ändra rubriken till Hej";
      expect(classifyFollowUpIntent(message)).toBe("clear-refine");

      llmClassifyMock.mockResolvedValue("capability-add");
      const result = await classifyFollowUpIntentWithStrategy(message);

      expect(llmClassifyMock).toHaveBeenCalledWith(message);
      expect(result).toBe("capability-add");
    });

    it("FAIL-SAFE: falls back to the deterministic result when the LLM throws", async () => {
      const message = "byt till mörkt tema";
      const deterministic = classifyFollowUpIntent(message);
      expect(deterministic).toBe("clear-redesign");

      llmClassifyMock.mockRejectedValue(new Error("provider exploded"));
      const result = await classifyFollowUpIntentWithStrategy(message);

      expect(result).toBe(deterministic);
    });

    it("FAIL-SAFE: falls back to the deterministic result on timeout/abort", async () => {
      const message = "lägg till en kontaktform";
      const deterministic = classifyFollowUpIntent(message);

      const abortErr = new Error("aborted");
      abortErr.name = "AbortError";
      llmClassifyMock.mockRejectedValue(abortErr);

      const result = await classifyFollowUpIntentWithStrategy(message);
      expect(result).toBe(deterministic);
    });
  });
});
