// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanyardExperience } from "./lanyard-experience";

let physicsStubThrows = false;

vi.mock("next/dynamic", () => ({
  default: () =>
    function LanyardPhysicsStub({ onReady }: { onReady?: () => void }) {
      if (physicsStubThrows) throw new Error("WebGL unavailable");
      return <button type="button" data-testid="lanyard-physics" onClick={onReady} />;
    },
}));

const CONSENT_KEY = "cookie-consent";

function stubMatchMedia(
  options: boolean | { reducedMotion?: boolean; narrow?: boolean } = false,
): typeof window.matchMedia {
  const reducedMotion = typeof options === "boolean" ? options : Boolean(options.reducedMotion);
  const narrow = typeof options === "boolean" ? false : Boolean(options.narrow);
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? reducedMotion
      : query.includes("max-width")
        ? narrow
        : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return original;
}

type ConnectionStub = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};

function stubConnection(connection: ConnectionStub | undefined): () => void {
  const nav = navigator as Navigator & { connection?: ConnectionStub };
  const previous = nav.connection;
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: connection,
  });
  return () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: previous,
    });
  };
}

describe("LanyardExperience", () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let restoreConnection: (() => void) | undefined;

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    localStorage.removeItem(CONSENT_KEY);
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
      originalMatchMedia = undefined;
    }
    restoreConnection?.();
    restoreConnection = undefined;
  });

  it("never renders a cookie dialog: consent belongs to the global cookie strip (V-05)", async () => {
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);

    expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("lanyard-physics")).toBeTruthy();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Acceptera alla" })).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("loads the physics card for a first-time desktop visitor without waiting for consent", async () => {
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);

    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    const stage = await waitFor(() => screen.getByTestId("lanyard-stage-3d"));
    expect(stage.className).toContain("-translate-y-[120%]");
    fireEvent.click(screen.getByTestId("lanyard-physics"));
    expect(stage.className).toContain("translate-y-0");
    expect(screen.queryByTestId("lanyard-static")).toBeNull();
  });

  it("keeps the static card on a narrow viewport and skips the physics chunk", () => {
    vi.useFakeTimers();
    originalMatchMedia = stubMatchMedia({ narrow: true });
    render(<LanyardExperience />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    expect(screen.queryByTestId("lanyard-physics")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the static card for a visitor who prefers reduced motion", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(true);
    render(<LanyardExperience />);
    await waitFor(() => {
      expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    });
    expect(screen.getByTestId("lanyard-static").className).toContain("overflow-visible");
    expect(screen.getByTestId("lanyard-static").querySelector("img")).toBeTruthy();
    expect(screen.queryByTestId("lanyard-physics")).toBeNull();
  });

  it("shows the static card on first paint on save-data", () => {
    originalMatchMedia = stubMatchMedia(false);
    restoreConnection = stubConnection({ saveData: true });
    render(<LanyardExperience />);
    expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    expect(screen.queryByTestId("lanyard-physics")).toBeNull();
  });

  it("parks the card above the stage until physics is ready, then drops it in", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);
    expect(screen.getByTestId("lanyard-static")).toBeTruthy();

    const stage = await waitFor(() => screen.getByTestId("lanyard-stage-3d"));
    expect(stage.className).toContain("-translate-y-[120%]");
    expect(stage.className).toContain("pointer-events-none");

    fireEvent.click(screen.getByTestId("lanyard-physics"));
    expect(stage.className).toContain("translate-y-0");
    expect(stage.className).toContain("transition-transform");
    expect(stage.className).not.toContain("pointer-events-none");
    expect(screen.queryByTestId("lanyard-static")).toBeNull();
  });

  it("drops the card in anyway if physics never reports ready", () => {
    vi.useFakeTimers();
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const stage = screen.getByTestId("lanyard-stage-3d");
    expect(stage.className).toContain("-translate-y-[120%]");
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(stage.className).toContain("translate-y-0");
  });

  it("releases the static fallback immediately when the 3D card fails before ready", async () => {
    physicsStubThrows = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      originalMatchMedia = stubMatchMedia(false);
      render(<LanyardExperience />);
      const stage = await waitFor(() => screen.getByTestId("lanyard-stage-3d"));
      expect(screen.getByTestId("lanyard-static")).toBeTruthy();
      expect(stage.className).toContain("translate-y-0");
      expect(stage.className).not.toContain("-translate-y-[120%]");
    } finally {
      physicsStubThrows = false;
      consoleError.mockRestore();
    }
  });
});
