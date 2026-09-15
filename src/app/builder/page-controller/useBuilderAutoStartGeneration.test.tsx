// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INIT_BUILD_CHOICES,
  MAX_PAGE_COUNT_CHOICE,
  getCurrentInitBuildChoices,
  resetInitBuildChoices,
  setCurrentInitBuildChoices,
} from "@/lib/builder/init-build-choices";
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
    resetInitBuildChoices();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetInitBuildChoices();
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

  // Ägarbeslut 2026-09-14: kampanjsajter följer produktens sidtak, och talet
  // reser strukturerat (meta.pageCountHint) i stället för i prompttexten.
  it("fills the campaign page count into byggvalen before the create call", () => {
    const requestCreateChat = vi.fn();
    const { rerender } = renderHook(
      (props: HookProps) => useBuilderAutoStartGeneration(props),
      { initialProps: baseProps({ promptActions: { requestCreateChat } }) },
    );

    expect(getCurrentInitBuildChoices().pageCount).toBe(0);

    rerender(
      baseProps({
        resolvedPrompt: "Bygg en sajt",
        promptId: null,
        promptActions: { requestCreateChat },
      }),
    );

    expect(getCurrentInitBuildChoices().pageCount).toBe(MAX_PAGE_COUNT_CHOICE);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(requestCreateChat).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2])("leaves an explicit page-count choice of %i alone", (pageCount) => {
    setCurrentInitBuildChoices({ ...DEFAULT_INIT_BUILD_CHOICES, pageCount });
    const requestCreateChat = vi.fn();
    const { rerender } = renderHook(
      (props: HookProps) => useBuilderAutoStartGeneration(props),
      { initialProps: baseProps({ promptActions: { requestCreateChat } }) },
    );

    rerender(
      baseProps({
        resolvedPrompt: "Bygg en sajt",
        promptId: null,
        promptActions: { requestCreateChat },
      }),
    );

    expect(getCurrentInitBuildChoices().pageCount).toBe(pageCount);
  });

  it("does not touch byggvalen when auto-start is refused", () => {
    renderHook(() =>
      useBuilderAutoStartGeneration(
        baseProps({
          promptId: null,
          resolvedPrompt: "attacker-controlled",
          promptActions: { requestCreateChat: vi.fn() },
        }),
      ),
    );

    expect(getCurrentInitBuildChoices().pageCount).toBe(0);
  });
});
