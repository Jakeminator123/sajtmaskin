// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COOKIE_CONSENT_CHANGE_EVENT } from "@/lib/ads/fire-google-ads-conversion";
import { APP_VIEWPORT_HEIGHT_CLASS, COOKIE_BANNER_HEIGHT_VAR } from "@/lib/app-viewport";
import { CompactCookieBanner, CookieBanner } from "./cookie-banner";

let pathname = "/builder";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const CONSENT_KEY = "cookie-consent";
const CONSENT_DATE_KEY = "cookie-consent-date";

function stubViewport(mobile: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 767px)" ? mobile : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe("CookieBanner", () => {
  let restoreViewport: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    pathname = "/builder";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    restoreViewport?.();
    restoreViewport = undefined;
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(CONSENT_DATE_KEY);
    document.documentElement.style.removeProperty(COOKIE_BANNER_HEIGHT_VAR);
  });

  function showBanner() {
    render(<CookieBanner />);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    return screen.getByRole("dialog", { name: "Cookie-inställningar" });
  }

  it("är en icke-modal remsa i nederkanten under md (V-05, SM-137)", () => {
    restoreViewport = stubViewport(true);
    render(<CookieBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(800);
    });

    const strip = screen.getByRole("dialog", { name: "Cookie-inställningar" });
    expect(strip.getAttribute("aria-modal")).toBe("false");
    expect(strip.className).toContain("inset-x-0");
    expect(strip.className).toContain("bottom-0");
    expect(strip.className).not.toContain("left-4");
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(strip.textContent).toContain(
      "För att förbättra din upplevelse, analysera trafik och visa relevant innehåll.",
    );
    expect(strip.textContent).not.toContain("Ditt val sparas");
    expect(screen.getByRole("link", { name: "integritetspolicy" }).getAttribute("href")).toBe(
      "/privacy",
    );
  });

  it("publicerar remsans höjd så app-skalen lämnar plats, och tar bort den efter valet", () => {
    restoreViewport = stubViewport(true);
    showBanner();
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toMatch(
      /^\d+px$/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Endast nödvändiga" }));
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe("");
  });

  it("är samma lilla kort nere till vänster som förut från md, och skalen krymper inte", () => {
    restoreViewport = stubViewport(false);
    const card = showBanner();

    expect(card.className).toBe(
      "fixed bottom-4 left-4 z-[80] w-[min(92vw,360px)] rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur",
    );
    expect(card.hasAttribute("aria-modal")).toBe(false);
    expect(screen.getByText("Vi använder cookies")).toBeTruthy();
    expect(card.textContent).not.toContain("Ditt val sparas");
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe("");
  });

  it("lämnar startsidan åt LanyardExperience (flip-kortet på desktop, remsan på mobil)", () => {
    pathname = "/";
    render(<CookieBanner />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("visas inte när besökaren redan har valt", () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    render(<CookieBanner />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    [true, "Acceptera alla", "accepted", true],
    [true, "Endast nödvändiga", "declined", false],
    [false, "Acceptera alla", "accepted", true],
    [false, "Endast nödvändiga", "declined", false],
  ] as const)(
    "mobil=%s: sparar %s, skickar samtyckeshändelsen och stänger bannern",
    (mobile, label, value, storesDate) => {
      restoreViewport = stubViewport(mobile);
      const listener = vi.fn();
      window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, listener);
      try {
        showBanner();
        fireEvent.click(screen.getByRole("button", { name: label }));

        expect(localStorage.getItem(CONSENT_KEY)).toBe(value);
        expect(Boolean(localStorage.getItem(CONSENT_DATE_KEY))).toBe(storesDate);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).toBeNull();
      } finally {
        window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, listener);
      }
    },
  );

  it("meddelar startsidans ägare när valet görs", () => {
    restoreViewport = stubViewport(true);
    const onConsent = vi.fn();
    render(<CompactCookieBanner delayMs={0} onConsent={onConsent} />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Acceptera alla" }));
    expect(onConsent).toHaveBeenCalledWith("accepted");
  });

  it("app-skalens höjdklass drar av remsans höjd", () => {
    expect(APP_VIEWPORT_HEIGHT_CLASS).toContain("100dvh");
    expect(APP_VIEWPORT_HEIGHT_CLASS).toContain(`var(${COOKIE_BANNER_HEIGHT_VAR},0px)`);
  });
});
