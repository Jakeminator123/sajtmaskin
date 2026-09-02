// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBuilderAutoStartGeneration } from "./useBuilderAutoStartGeneration";

type HookProps = Parameters<typeof useBuilderAutoStartGeneration>[0];

function baseProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    isAuthenticated: true,
    templateId: null,
    buildMethod: "kostnadsfri",
    resolvedPrompt: null,
    chatId: null,
    promptId: "prompt_1",
    promptParam: null,
    setSelectedModelTier: vi.fn(),
    promptActions: { requestCreateChat: vi.fn() },
    ...overrides,
  };
}

describe("useBuilderAutoStartGeneration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-starts exactly once after hydration strips promptId from the URL", () => {
    const requestCreateChat = vi.fn();
    const { rerender } = renderHook(
      (props: HookProps) => useBuilderAutoStartGeneration(props),
      {
        initialProps: baseProps({
          promptActions: { requestCreateChat },
        }),
      },
    );

    rerender(
      baseProps({
        resolvedPrompt: "Bygg en sajt",
        promptId: null,
        promptActions: { requestCreateChat },
      }),
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(requestCreateChat).toHaveBeenCalledTimes(1);
    expect(requestCreateChat).toHaveBeenCalledWith("Bygg en sajt");

    rerender(
      baseProps({
        resolvedPrompt: "Bygg en sajt",
        promptId: null,
        promptActions: { requestCreateChat },
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(requestCreateChat).toHaveBeenCalledTimes(1);
  });

  it("does not auto-start when hydration never had a promptId", () => {
    const requestCreateChat = vi.fn();
    renderHook(() =>
      useBuilderAutoStartGeneration(
        baseProps({
          promptId: null,
          resolvedPrompt: "attacker-controlled",
          promptActions: { requestCreateChat },
        }),
      ),
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(requestCreateChat).not.toHaveBeenCalled();
  });
});
