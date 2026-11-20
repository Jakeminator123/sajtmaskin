import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStalledFlag } from "./useStalledFlag";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useStalledFlag", () => {
  it("turns true only after the threshold and starts over on a new key or when inactive", () => {
    const { result, rerender } = renderHook(
      ({ active, key }) => useStalledFlag(active, key, 1_000),
      { initialProps: { active: true, key: "a" } },
    );
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(999));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);

    // A restart request changes the key: the hint goes away and the clock restarts.
    rerender({ active: true, key: "b" });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(true);

    // Shown on screen: no hint; starting again later does not reuse the old verdict.
    rerender({ active: false, key: "b" });
    expect(result.current).toBe(false);
    rerender({ active: true, key: "b" });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(true);
  });
});
