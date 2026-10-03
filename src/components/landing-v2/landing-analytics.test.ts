import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());

vi.mock("@vercel/analytics", () => ({
  track,
}));

import { HOMEPAGE_ANALYTICS_EVENTS, trackHomepageEvent } from "./landing-analytics";

describe("trackHomepageEvent", () => {
  beforeEach(() => {
    track.mockClear();
  });

  it("forwards allowed funnel events without free-text payloads", () => {
    trackHomepageEvent(HOMEPAGE_ANALYTICS_EVENTS.cta, {
      location: "hero",
      method: "fritext",
    });
    expect(track).toHaveBeenCalledWith("homepage_cta", {
      location: "hero",
      method: "fritext",
    });
  });

  it("drops prompt-like values so user text is never sent", () => {
    trackHomepageEvent(HOMEPAGE_ANALYTICS_EVENTS.cta, {
      location: "hero",
      prompt: "Jag driver en frisörsalong i Göteborg",
    });
    expect(track).toHaveBeenCalledWith("homepage_cta", { location: "hero" });
  });

  it("swallows tracker failures", () => {
    track.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(() => trackHomepageEvent("homepage_auth", { mode: "login" })).not.toThrow();
  });
});
