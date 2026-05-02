import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    setPromptAssistMode: vi.fn(),
    setDesignTheme: vi.fn(),
    setPaletteState: vi.fn(),
    generateDynamicInstructions: vi.fn(async () => ""),
    createNewChat: vi.fn(async () => true),
    cancelActiveGeneration: vi.fn(),
    resetBeforeCreateChat: vi.fn(),
    applyAppProjectId: vi.fn(),
    ...overrides,
  };
}

describe("useBuilderPromptActions", () => {
  it("does not start two Deep Brief requests for duplicate init submits", async () => {
    const brief = deferred<string>();
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

    brief.resolve("");
    await act(async () => {
      await first;
    });

    expect(createNewChat).toHaveBeenCalledTimes(1);
  });
});
