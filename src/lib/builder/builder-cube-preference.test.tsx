import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILDER_CUBE_ENABLED_STORAGE_KEY,
  resetBuilderCubePreferenceForTests,
  setBuilderCubeEnabled,
  useBuilderCubeEnabled,
} from "./builder-cube-preference";

function Probe() {
  return <span data-testid="cube-enabled">{useBuilderCubeEnabled() ? "on" : "off"}</span>;
}

beforeEach(() => {
  resetBuilderCubePreferenceForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetBuilderCubePreferenceForTests();
});

describe("builder cube preference", () => {
  it("is off until chosen, follows the choice and remembers it per browser", () => {
    render(<Probe />);
    expect(screen.getByTestId("cube-enabled").textContent).toBe("off");

    act(() => setBuilderCubeEnabled(true));
    expect(screen.getByTestId("cube-enabled").textContent).toBe("on");
    expect(window.localStorage.getItem(BUILDER_CUBE_ENABLED_STORAGE_KEY)).toBe("1");

    act(() => setBuilderCubeEnabled(false));
    expect(screen.getByTestId("cube-enabled").textContent).toBe("off");
    expect(window.localStorage.getItem(BUILDER_CUBE_ENABLED_STORAGE_KEY)).toBeNull();
  });

  it("reads a stored choice on a later visit", () => {
    window.localStorage.setItem(BUILDER_CUBE_ENABLED_STORAGE_KEY, "1");
    render(<Probe />);
    expect(screen.getByTestId("cube-enabled").textContent).toBe("on");
  });

  it("keeps the choice for this visit when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    render(<Probe />);
    act(() => setBuilderCubeEnabled(true));
    expect(screen.getByTestId("cube-enabled").textContent).toBe("on");
  });
});
