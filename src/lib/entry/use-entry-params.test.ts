import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEntryParams } from "./use-entry-params";

const state = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));

describe("entry company decoding", () => {
  afterEach(() => { window.history.replaceState({}, "", "/"); });
  it.each([
    ["100%", "100%"],
    ["%", "%"],
    ["%2F", "%2F"],
    ["Räksmörgås & Co", "Räksmörgås & Co"],
    ["alpha-rekrytering-ab", "Alpha Rekrytering AB"],
  ])("renders company %s with exactly one URL decode", (company, expected) => {
    state.query = new URLSearchParams({ company, mode: "audit" }).toString();
    window.history.replaceState({}, "", `/?${state.query}&keep=1`);
    const { result } = renderHook(() => useEntryParams());
    expect(result.current.company).toBe(expected);
    expect(result.current.showWelcome).toBe(true);
    expect(result.current.directAction).toBe("audit");
    expect(window.location.search).toBe("?keep=1");
  });
});
