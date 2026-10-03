// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categories,
  homepageCreditFaq,
  homepageHeroCopy,
  homepageTrustPoints,
  landingJourneySteps,
} from "./landing-chat-data";

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="lanyard-stub" />,
}));
vi.mock("@/components/forms/voice-recorder", () => ({
  VoiceRecorder: () => null,
}));
vi.mock("sonner", () => ({ toast: { message: vi.fn() } }));

import { LandingHero } from "./landing-hero";
import { LandingPricingExplainer } from "./landing-pricing-explainer";
import { LandingTrustStrip } from "./landing-trust-strip";

const heroProps = {
  expandedContent: null,
  onPlayIntro: undefined,
  selectedCategory: "fritext",
  pickCategory: vi.fn(),
  showVoiceRecorder: false,
  setShowVoiceRecorder: vi.fn(),
  inputValue: "",
  setInputValue: vi.fn(),
  isSubmitting: false,
  headlineTilt: { ref: { current: null }, handleMove: vi.fn(), handleLeave: vi.fn() },
  rotatingType: { text: "Frisörsajt", visible: true },
  activeCategory: categories[0],
  isAuditMode: false,
  currentAuditUrl: "",
  handleAuditUrlChange: vi.fn(),
  submitPrimaryInput: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("homepage CRO invariants", () => {
  it("renders one stable product H1 and keeps the rotating industry word out of it", () => {
    const { container } = render(<LandingHero {...heroProps} />);
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(homepageHeroCopy.h1);
    expect(headings[0]?.textContent).not.toContain("Frisörsajt");
    expect(headings[0]?.textContent).not.toMatch(/30 sekunder/);
    expect(screen.getByText(homepageHeroCopy.valueProposition)).toBeTruthy();
    expect(screen.getByText("Frisörsajt")).toBeTruthy();
  });

  it("exposes one labeled primary CTA that starts the build", () => {
    render(<LandingHero {...heroProps} />);
    const primary = screen.getByRole("button", { name: homepageHeroCopy.primaryCta });
    expect(primary.getAttribute("data-homepage-cta")).toBe("primary");
    fireEvent.click(primary);
    expect(heroProps.submitPrimaryInput).toHaveBeenCalledTimes(1);
  });

  it("keeps build-method targets available without making them the H1", () => {
    render(<LandingHero {...heroProps} />);
    expect(screen.getByRole("button", { name: /Beskriv själv/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Svara på frågor/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Template/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Analysera sajt/ })).toBeTruthy();
  });

  it("states verifiable credit and start-threshold facts", () => {
    render(<LandingPricingExplainer />);
    expect(screen.getAllByText(/1 kr = 1 credit/).length).toBeGreaterThan(0);
    for (const item of homepageCreditFaq) {
      expect(screen.getByText(item.q)).toBeTruthy();
    }
    expect(screen.getByText(homepageCreditFaq[0].a)).toBeTruthy();
    expect(screen.queryByText(/prompts per credit/i)).toBeNull();
    expect(screen.queryByText(/räcker till \d+ sidor/i)).toBeNull();
  });

  it("does not present big tech brands as customers or partners", () => {
    render(<LandingTrustStrip />);
    expect(screen.getByText("Inga påhittade kunder. Bara produktens villkor.")).toBeTruthy();
    for (const point of homepageTrustPoints) {
      expect(screen.getByText(point.title)).toBeTruthy();
    }
    expect(screen.queryByText("Netflix")).toBeNull();
    expect(screen.queryByText("Spotify")).toBeNull();
    expect(screen.queryByText("Nike")).toBeNull();
    expect(screen.queryByText("OpenAI")).toBeNull();
    expect(screen.queryByText(/litar på/i)).toBeNull();
  });

  it("keeps the journey on the customer outcome, not company registration", () => {
    expect(landingJourneySteps.map((step) => step.title)).toEqual([
      "Beskriv företaget",
      "Välj hur du vill börja",
      "Se ett första utkast",
      "Publicera när det känns rätt",
      "Använd sajten i verksamheten",
    ]);
    expect(JSON.stringify(landingJourneySteps)).not.toMatch(/Skatteverket|Bolagsstart|v0-templates/);
  });
});
