// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LanyardExperience } from "./lanyard-experience";

vi.mock("next/dynamic", () => ({
  default: () =>
    function LanyardPhysicsStub() {
      return <div data-testid="lanyard-physics" />;
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

describe("LanyardExperience", () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;

  afterEach(() => {
    cleanup();
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(CONSENT_DATE_KEY);
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
      originalMatchMedia = undefined;
    }
  });

  it("shows the static card for a returning visitor who prefers reduced motion", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    originalMatchMedia = stubMatchMedia(true);
    render(<LanyardExperience />);
    await waitFor(() => {
      expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    });
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
});
