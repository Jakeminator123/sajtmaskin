// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LANYARD_CONSENT_KEY } from "@/components/landing-v2/lanyard-consent";
import { LanyardHeroLoading } from "@/components/landing-v2/lanyard-hero-loading";

describe("LanyardHeroLoading", () => {
  afterEach(() => {
    cleanup();
    localStorage.removeItem(LANYARD_CONSENT_KEY);
  });

  it("keeps the stage empty for a first-time visitor", () => {
    render(<LanyardHeroLoading />);
    expect(screen.getByTestId("lanyard-hero-loading")).toBeTruthy();
    expect(screen.queryByTestId("lanyard-static")).toBeNull();
  });

  it("fills the stage with the static card after mount for a returning visitor", async () => {
    localStorage.setItem(LANYARD_CONSENT_KEY, "accepted");
    render(<LanyardHeroLoading />);
    await waitFor(() => {
      expect(screen.getByTestId("lanyard-static")).toBeTruthy();
    });
    expect(screen.queryByTestId("lanyard-hero-loading")).toBeNull();
  });
});
