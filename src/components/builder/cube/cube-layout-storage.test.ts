import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CUBE_LAYOUT_STORAGE_KEY,
  CUBE_LAYOUT_WRITE_DELAY_MS,
  defaultCubeLayout,
  parseCubeLayout,
  useCubeLayout,
} from "./cube-layout-storage";
import { CUBE_LIMITS } from "./card-layout";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("parseCubeLayout", () => {
  it("rejects missing or corrupt data", () => {
    expect(parseCubeLayout(null)).toBeNull();
    expect(parseCubeLayout("{nope")).toBeNull();
    expect(parseCubeLayout("42")).toBeNull();
  });

  it("clamps sizes and coordinates and drops unknown faces", () => {
    const parsed = parseCubeLayout(
      JSON.stringify({
        mode: "cards",
        cube: { x: -40, y: 99999, width: 5, height: 99999 },
        cards: { chat: { x: 10, y: 10, width: 300, height: 300 }, bogus: { x: 1, y: 1, width: 1, height: 1 }, tools: { x: "a" } },
        folded: ["avatar", "avatar", "x"],
        order: ["tools"],
      }),
    );
    expect(parsed?.mode).toBe("cards");
    expect(parsed?.cube).toEqual({ x: 0, y: 20000, width: CUBE_LIMITS.min.width, height: CUBE_LIMITS.max.height });
    expect(Object.keys(parsed?.cards ?? {})).toEqual(["chat"]);
    expect(parsed?.folded).toEqual(["avatar"]);
    expect(parsed?.order[0]).toBe("tools");
    expect(parsed?.order).toHaveLength(6);
  });
});

describe("useCubeLayout", () => {
  it("hydrates from storage, debounces writes and flushes on pagehide", () => {
    localStorage.setItem(CUBE_LAYOUT_STORAGE_KEY, JSON.stringify({ ...defaultCubeLayout(), cube: { x: 80, y: 90, width: 420, height: 600 } }));
    vi.useFakeTimers();
    const { result } = renderHook(() => useCubeLayout());
    expect(result.current.layout.cube.x).toBe(80);
    act(() => result.current.setLayout((l) => ({ ...l, cube: { ...l.cube, x: 200 } })));
    expect(JSON.parse(localStorage.getItem(CUBE_LAYOUT_STORAGE_KEY)!).cube.x).toBe(80);
    act(() => result.current.setLayout((l) => ({ ...l, cube: { ...l.cube, x: 210 } })));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(JSON.parse(localStorage.getItem(CUBE_LAYOUT_STORAGE_KEY)!).cube.x).toBe(210);
    act(() => result.current.setLayout((l) => ({ ...l, cube: { ...l.cube, x: 220 } })));
    act(() => {
      vi.advanceTimersByTime(CUBE_LAYOUT_WRITE_DELAY_MS + 1);
    });
    expect(JSON.parse(localStorage.getItem(CUBE_LAYOUT_STORAGE_KEY)!).cube.x).toBe(220);
  });

  it("survives a throwing storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useCubeLayout());
    expect(result.current.layout).toEqual(defaultCubeLayout());
    spy.mockRestore();
  });

  it("reset clears storage and restores defaults", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCubeLayout());
    act(() => result.current.setLayout((l) => ({ ...l, cube: { ...l.cube, x: 300 } })));
    act(() => {
      vi.advanceTimersByTime(CUBE_LAYOUT_WRITE_DELAY_MS + 1);
    });
    act(() => result.current.resetLayout());
    expect(localStorage.getItem(CUBE_LAYOUT_STORAGE_KEY)).toBeNull();
    expect(result.current.layout.cube).toEqual(defaultCubeLayout().cube);
  });
});
