// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COOKIE_CONSENT_CHANGE_EVENT } from "@/lib/ads/fire-google-ads-conversion";
import { APP_VIEWPORT_HEIGHT_CLASS, COOKIE_BANNER_HEIGHT_VAR } from "@/lib/app-viewport";
import { CookieBanner } from "./cookie-banner";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const CONSENT_KEY = "cookie-consent";
const CONSENT_DATE_KEY = "cookie-consent-date";

describe("CookieBanner — kompakt remsa i nederkanten (V-05, SM-137)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pathname = "/";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it("visas på startsidan som en icke-modal remsa i nederkanten, inte som helskärmskort", () => {
    render(<CookieBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(800);
    });

    const strip = screen.getByRole("dialog", { name: "Cookie-inställningar" });
    expect(strip.getAttribute("aria-modal")).toBe("false");
    expect(strip.className).toContain("fixed");
    expect(strip.className).toContain("inset-x-0");
    expect(strip.className).toContain("bottom-0");
    expect(strip.className).not.toContain("inset-0 ");
    expect(strip.className).not.toContain("z-[200]");
    expect(strip.className).not.toContain("bg-[#05070a]");
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(strip.textContent).toContain("Vi använder cookies.");
    expect(strip.textContent).toContain(
      "För att förbättra din upplevelse, analysera trafik och visa relevant innehåll.",
    );
    expect(screen.getByRole("link", { name: "integritetspolicy" }).getAttribute("href")).toBe(
      "/privacy",
    );
  });

  it("visas på andra rutter också", () => {
    pathname = "/builder";
    expect(showBanner()).toBeTruthy();
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
    ["Acceptera alla", "accepted", true],
    ["Endast nödvändiga", "declined", false],
  ] as const)("sparar %s, skickar samtyckeshändelsen och stänger remsan", (label, value, storesDate) => {
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
  });

  it("publicerar sin höjd så app-skalen lämnar plats, och tar bort den efter valet", () => {
    showBanner();
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toMatch(
      /^\d+px$/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Endast nödvändiga" }));
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe("");
  });

  it("app-skalens höjdklass drar av remsans höjd", () => {
    expect(APP_VIEWPORT_HEIGHT_CLASS).toContain("var(--cookie-banner-h,0px)");
    expect(APP_VIEWPORT_HEIGHT_CLASS).toContain("100dvh");
    expect(APP_VIEWPORT_HEIGHT_CLASS).toContain(`var(${COOKIE_BANNER_HEIGHT_VAR},0px)`);
  });
});
