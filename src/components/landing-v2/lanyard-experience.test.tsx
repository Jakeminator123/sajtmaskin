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
const CONSENT_DATE_KEY = "cookie-consent-date";

function stubMatchMedia(reducedMotion: boolean): typeof window.matchMedia {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
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
    localStorage.removeItem(CONSENT_DATE_KEY);
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
      originalMatchMedia = undefined;
    }
    restoreConnection?.();
    restoreConnection = undefined;
  });

  it("uses the welcome card as the cookie dialog for a first-time visitor", () => {
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);

    const dialog = screen.getByRole("dialog", { name: "Cookie-inställningar" });
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain("bg-[#05070a]");
    expect(dialog.className).toContain("z-[200]");
    expect(dialog.className).not.toContain("bg-background/55");
    expect(dialog.className).not.toContain("bg-background/70");
    expect(dialog.className).not.toContain("bg-background ");
    expect(screen.getByRole("button", { name: "Acceptera alla" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Endast nödvändiga" })).toBeTruthy();
  });

  it.each([
    ["Acceptera alla", "accepted", true],
    ["Endast nödvändiga", "declined", false],
  ] as const)("persists %s from the welcome card", (buttonName, value, storesDate) => {
    vi.useFakeTimers();
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(localStorage.getItem(CONSENT_KEY)).toBe(value);
    expect(Boolean(localStorage.getItem(CONSENT_DATE_KEY))).toBe(storesDate);
  });

  it("shows the static card for a returning visitor who prefers reduced motion", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(true);
    render(<LanyardExperience />);
    expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    expect(screen.queryByTestId("lanyard-physics")).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    });
    expect(screen.getByTestId("lanyard-static").className).toContain("overflow-visible");
    expect(screen.getByTestId("lanyard-static").querySelector("img")).toBeTruthy();
    expect(screen.queryByTestId("lanyard-physics")).toBeNull();
  });

  it("shows the static card on first paint for a returning visitor on save-data", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(false);
    restoreConnection = stubConnection({ saveData: true });
    render(<LanyardExperience />);
    expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    expect(screen.queryByTestId("lanyard-physics")).toBeNull();
  });

  it("shows the physics card for a returning visitor when motion is allowed", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);
    await waitFor(() => {
      expect(screen.getByTestId("lanyard-physics")).toBeTruthy();
    });
    expect(screen.queryByTestId("lanyard-static")).toBeNull();
  });

  it("parks the returning-visitor card above the stage until physics is ready, then drops it in", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);
    expect(screen.queryByRole("dialog", { name: "Cookie-inställningar" })).toBeNull();
    expect(screen.queryByTestId("lanyard-static")).toBeNull();

    const stage = screen.getByTestId("lanyard-stage-3d");
    expect(stage.className).toContain("-translate-y-[120%]");
    expect(stage.className).toContain("pointer-events-none");

    fireEvent.click(screen.getByTestId("lanyard-physics"));
    expect(stage.className).toContain("translate-y-0");
    expect(stage.className).toContain("transition-transform");
    expect(stage.className).not.toContain("pointer-events-none");
  });

  it("drops the card in anyway if physics never reports ready", () => {
    vi.useFakeTimers();
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);
    const stage = screen.getByTestId("lanyard-stage-3d");
    expect(stage.className).toContain("-translate-y-[120%]");
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(stage.className).toContain("translate-y-0");
  });

  it("releases the static fallback immediately when the 3D card fails before ready", () => {
    physicsStubThrows = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      localStorage.setItem(CONSENT_KEY, "accepted");
      originalMatchMedia = stubMatchMedia(false);
      render(<LanyardExperience />);
      const stage = screen.getByTestId("lanyard-stage-3d");
      expect(screen.getByTestId("lanyard-static")).toBeTruthy();
      expect(stage.className).toContain("translate-y-0");
      expect(stage.className).not.toContain("-translate-y-[120%]");
    } finally {
      physicsStubThrows = false;
      consoleError.mockRestore();
    }
  });

  it("keeps the first-visit handoff on the opacity path, not the drop-in", () => {
    originalMatchMedia = stubMatchMedia(false);
    render(<LanyardExperience />);
    const stage = screen.getByTestId("lanyard-stage-3d");
    expect(stage.className).not.toContain("-translate-y-[120%]");
    expect(stage.className).toContain("opacity-0");
  });
});
