import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderAuthRequiredError } from "@/lib/hooks/chat/helpers-errors";
import { readPendingBuilderDraft } from "@/lib/builder/pending-builder-draft";
import { useBuilderPromptActions } from "./useBuilderPromptActions";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
  }),
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeArgs(
  overrides: Partial<Parameters<typeof useBuilderPromptActions>[0]> = {},
): Parameters<typeof useBuilderPromptActions>[0] {
  return {
    chatId: null,
    templateId: null,
    scaffoldMode: "auto",
    customInstructions: "",
    applyInstructionsOnce: false,
    promptAssistModel: "openai/gpt-5.4",
    themeColors: null,
    paletteState: { selections: [] },
    selectedModelTier: "max",
    isCreatingChat: false,
    isAnyStreaming: false,
    isTemplateLoading: false,
    isPreparingPrompt: false,
    buildMethod: "freeform",
    designTheme: "off",
    appProjectId: null,
    pendingBriefRef: { current: null },
    pendingInstructionsRef: { current: null },
    pendingInstructionsOnceRef: { current: null },
    templateInitAttemptKeyRef: { current: null },
    router: { replace: vi.fn(), push: vi.fn() },
    searchParams: new URLSearchParams(),
    setChatId: vi.fn(),
    setMessages: vi.fn(),
    setCurrentPreviewUrl: vi.fn(),
    setSelectedVersionId: vi.fn(),
    setEntryIntentActive: vi.fn(),
    setIsPreparingPrompt: vi.fn(),
    setCustomInstructions: vi.fn(),
    setDesignTheme: vi.fn(),
    setPaletteState: vi.fn(),
    generateDynamicInstructions: vi.fn(async () => null),
    createNewChat: vi.fn(async () => true),
    cancelActiveGeneration: vi.fn(),
    resetBeforeCreateChat: vi.fn(),
    applyAppProjectId: vi.fn(),
    ...overrides,
  };
}

describe("useBuilderPromptActions", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("does not start two Deep Brief requests for duplicate init submits", async () => {
    const brief = deferred<Record<string, unknown> | null>();
    const generateDynamicInstructions = vi.fn(() => brief.promise);
    const createNewChat = vi.fn(async () => true);

    const { result } = renderHook(() =>
      useBuilderPromptActions(
        makeArgs({
          generateDynamicInstructions,
          createNewChat,
        }),
      ),
    );

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.requestCreateChat("En sajt för pizzaälskare");
    });

    await waitFor(() => {
      expect(generateDynamicInstructions).toHaveBeenCalledTimes(1);
    });

    let second: unknown;
    await act(async () => {
      second = await result.current.requestCreateChat("En sajt för pizzaälskare");
    });

    expect(second).toBe(false);
    expect(generateDynamicInstructions).toHaveBeenCalledTimes(1);
    expect(createNewChat).not.toHaveBeenCalled();

    brief.resolve(null);
    await act(async () => {
      await first;
    });

    expect(createNewChat).toHaveBeenCalledTimes(1);
  });

  it("blocks a blank init while a template entry has no chat yet (template import owns chat creation)", async () => {
    const createNewChat = vi.fn(async () => true);
    const generateDynamicInstructions = vi.fn(async () => null);

    const { result } = renderHook(() =>
      useBuilderPromptActions(
        makeArgs({
          templateId: "some-v0-template",
          chatId: null,
          createNewChat,
          generateDynamicInstructions,
        }),
      ),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.requestCreateChat("Gör hero-sektionen blå");
    });

    // A template's chat comes from POST /api/template, never a from-scratch
    // init here — so the guard must short-circuit before any init work.
    expect(outcome).toBe(false);
    expect(createNewChat).not.toHaveBeenCalled();
    expect(generateDynamicInstructions).not.toHaveBeenCalled();
  });

  it("skips client Deep Brief for an audit handoff so the server brief runs once", async () => {
    const generateDynamicInstructions = vi.fn(async () => ({ projectTitle: "should not run" }));
    const createNewChat = vi.fn(async () => true);

    const { result } = renderHook(() =>
      useBuilderPromptActions(
        makeArgs({
          promptHandoffId: "handoff_audit",
          auditHandoff: { payloadKind: "audit", domain: "example.se" },
          generateDynamicInstructions,
          createNewChat,
        }),
      ),
    );

    await act(async () => {
      await result.current.requestCreateChat("Bygg en förbättrad sajt för example.se");
    });

    expect(generateDynamicInstructions).not.toHaveBeenCalled();
    expect(createNewChat).toHaveBeenCalledTimes(1);
  });

  it("still runs client Deep Brief for a non-audit prompt handoff", async () => {
    const generateDynamicInstructions = vi.fn(async () => ({ projectTitle: "wizard brief" }));
    const createNewChat = vi.fn(async () => true);

    const { result } = renderHook(() =>
      useBuilderPromptActions(
        makeArgs({
          promptHandoffId: "handoff_kostnadsfri",
          generateDynamicInstructions,
          createNewChat,
        }),
      ),
    );

    await act(async () => {
      await result.current.requestCreateChat("Bygg en sajt för IKEA");
    });

    expect(generateDynamicInstructions).toHaveBeenCalledTimes(1);
    expect(createNewChat).toHaveBeenCalledTimes(1);
  });

  it("still creates a chat for a non-template entry with no chat", async () => {
    const createNewChat = vi.fn(async () => true);

    const { result } = renderHook(() =>
      useBuilderPromptActions(
        makeArgs({
          templateId: null,
          chatId: null,
          createNewChat,
        }),
      ),
    );

    await act(async () => {
      await result.current.requestCreateChat("En sajt för pizzaälskare");
    });

    expect(createNewChat).toHaveBeenCalledTimes(1);
  });

  it("opens generation login before Deep Brief when the client knows the user is logged out", async () => {
    const generateDynamicInstructions = vi.fn(async () => ({ projectTitle: "should not run" }));
    const createNewChat = vi.fn(async () => true);
    const onAuthRequired = vi.fn();

    const { result } = renderHook(() =>
      useBuilderPromptActions(
        makeArgs({
          isAuthReady: true,
          isAuthenticated: false,
          onAuthRequired,
          generateDynamicInstructions,
          createNewChat,
        }),
      ),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.requestCreateChat("Bygg en pizzeria");
    });

    expect(outcome).toBe(false);
    expect(onAuthRequired).toHaveBeenCalledWith("generation");
    expect(generateDynamicInstructions).not.toHaveBeenCalled();
    expect(createNewChat).not.toHaveBeenCalled();
    expect(readPendingBuilderDraft()?.text).toBe("Bygg en pizzeria");
  });

  it("opens generation login on a stale-session brief 401 without creating a chat", async () => {
    const generateDynamicInstructions = vi.fn(async () => {
      throw new BuilderAuthRequiredError("unauthorized");
    });
    const createNewChat = vi.fn(async () => true);
    const onAuthRequired = vi.fn();

    const { result } = renderHook(() =>
      useBuilderPromptActions(
        makeArgs({
          isAuthReady: true,
          isAuthenticated: true,
          onAuthRequired,
          generateDynamicInstructions,
          createNewChat,
        }),
      ),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.requestCreateChat("Bygg en pizzeria");
    });

    expect(outcome).toBe(false);
    expect(onAuthRequired).toHaveBeenCalledWith("generation");
    expect(generateDynamicInstructions).toHaveBeenCalledTimes(1);
    expect(createNewChat).not.toHaveBeenCalled();
    expect(readPendingBuilderDraft()?.text).toBe("Bygg en pizzeria");
  });
});
