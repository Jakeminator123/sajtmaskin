import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@/lib/builder/prompt-assist", () => ({
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
import { BuilderAuthRequiredError } from "./chat/helpers-errors";
import { INIT_BRIEF_STATUS_EVENT, useInitBrief, type InitBriefStatusDetail } from "./useInitBrief";

beforeEach(() => {
  vi.clearAllMocks();
});

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
    ).resolves.toEqual({});

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

    expect(statuses[0]).toBe("Skapar brief innan own-engine startar…");
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

describe("useInitBrief — B1: returnerar briefen, ingen addendum-sträng", () => {
  it("returns the brief object and never a client addendum string", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    const brief = { projectTitle: "Salong", domainProfile: "spa-salon" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => brief,
    });
    vi.stubGlobal("fetch", fetchMock);

    let returned: unknown;
    try {
      returned = await result.current.generateDynamicInstructions("hej", {
        forceDeepBrief: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(returned).toEqual(brief);
    expect(typeof returned).not.toBe("string");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on brief failure instead of building an addendum string", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "down" }),
      }),
    );

    let returned: unknown;
    try {
      returned = await result.current.generateDynamicInstructions("hej", {
        forceDeepBrief: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(returned).toBeNull();
  });
});

describe("useInitBrief — auth refusal", () => {
  it("throws BuilderAuthRequiredError on brief 401 without the generic brief toast", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          requiresAuth: true,
          error: "Skapa ett konto eller logga in för att generera.",
        }),
      }),
    );

    try {
      await expect(
        result.current.generateDynamicInstructions("hej", { forceDeepBrief: true }),
      ).rejects.toBeInstanceOf(BuilderAuthRequiredError);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("throws BuilderAuthRequiredError on brief auth_required 401 without the generic toast", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: "auth_required" }),
      }),
    );

    try {
      await expect(
        result.current.generateDynamicInstructions("hej", { forceDeepBrief: true }),
      ).rejects.toBeInstanceOf(BuilderAuthRequiredError);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("treats the legacy brief { error: unauthorized } 401 as login", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" }),
      }),
    );

    try {
      await expect(
        result.current.generateDynamicInstructions("hej", { forceDeepBrief: true }),
      ).rejects.toBeInstanceOf(BuilderAuthRequiredError);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("treats a missing OpenAI API-key 401 as a provider error, not login", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: "Missing OpenAI API key",
          setup: "Set OPENAI_API_KEY. Deep brief calls OpenAI directly via createDirectModel().",
        }),
      }),
    );

    let returned: unknown;
    try {
      returned = await result.current.generateDynamicInstructions("hej", {
        forceDeepBrief: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(returned).toBeNull();
    expect(toast.error).toHaveBeenCalled();
    expect(String(vi.mocked(toast.error).mock.calls[0]?.[0])).toMatch(
      /Missing OpenAI API key/i,
    );
  });

  it("treats an empty brief 401 body as login without the generic toast", async () => {
    const { result } = renderHook(() =>
      useInitBrief({
        model: "openai/gpt-4.1",
        deep: true,
        imageGenerations: false,
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => {
          throw new Error("no body");
        },
      }),
    );

    try {
      await expect(
        result.current.generateDynamicInstructions("hej", { forceDeepBrief: true }),
      ).rejects.toBeInstanceOf(BuilderAuthRequiredError);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(toast.error).not.toHaveBeenCalled();
  });
});
