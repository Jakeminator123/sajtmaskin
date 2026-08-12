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

import { toast } from "sonner";
import { INIT_BRIEF_STATUS_EVENT, useInitBrief, type InitBriefStatusDetail } from "./useInitBrief";

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

describe("useInitBrief — A2: flödesstatus går via window-event, inte toast", () => {
  it("dispatchar in-progress-status och nollställer den, utan toast.loading/toast.success", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: false,
        imageGenerations: false,
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ brief: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const statuses: Array<string | null> = [];
    const handler = (event: Event) => {
      statuses.push((event as CustomEvent<InitBriefStatusDetail>).detail.status);
    };
    window.addEventListener(INIT_BRIEF_STATUS_EVENT, handler);

    try {
      await result.current.generateDynamicInstructions("hej", {
        chatId: null,
        forceDeepBrief: true,
      });
    } finally {
      window.removeEventListener(INIT_BRIEF_STATUS_EVENT, handler);
      vi.unstubAllGlobals();
    }

    expect(statuses[0]).toBe("Skapar brief och dynamiska instruktioner innan own-engine startar…");
    expect(statuses.at(-1)).toBeNull();
    expect(statuses).toHaveLength(2);
    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("behåller fel i toast (A3) och nollställer statusen igen", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: false,
        imageGenerations: false,
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const statuses: Array<string | null> = [];
    const handler = (event: Event) => {
      statuses.push((event as CustomEvent<InitBriefStatusDetail>).detail.status);
    };
    window.addEventListener(INIT_BRIEF_STATUS_EVENT, handler);

    try {
      await result.current.generateDynamicInstructions("hej", {
        chatId: null,
        forceDeepBrief: true,
      });
    } finally {
      window.removeEventListener(INIT_BRIEF_STATUS_EVENT, handler);
      vi.unstubAllGlobals();
    }

    expect(statuses.at(-1)).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
