import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@/lib/builder/prompt-assist", () => ({
  buildDynamicInstructionAddendumFromBrief: () => "",
  buildDynamicInstructionAddendumFromPrompt: () => "",
  isOpenAIAssistModel: () => true,
  isPromptAssistModelAllowed: () => true,
  isPromptAssistOff: () => false,
  normalizeAssistModel: (value: string | undefined) => value ?? "openai/gpt-4.1",
  resolvePromptAssistProvider: () => "openai" as const,
}));

vi.mock("@/lib/gen/defaults", () => ({
  ASSIST_MODEL: "openai/gpt-4.1",
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: () => {},
}));

import { useInitBrief } from "./useInitBrief";

describe("useInitBrief — follow-up guard (P22)", () => {
  it("throws when chatId is set and forceDeepBrief is true", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    await expect(
      result.current.generateDynamicInstructions("hej", {
        chatId: "x",
        forceDeepBrief: true,
      }),
    ).rejects.toThrow("forceDeepBrief is init-only — use shallow brief on follow-ups");
  });

  it("does not throw when chatId is null even if forceDeepBrief is true", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: false,
        imageGenerations: false,
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      result.current.generateDynamicInstructions("hej", {
        chatId: null,
        forceDeepBrief: true,
      }),
    ).resolves.toBeTypeOf("string");

    vi.unstubAllGlobals();
  });
});
