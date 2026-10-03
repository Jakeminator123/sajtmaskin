import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
const script = () => document.getElementById("sajtmaskin-google-ads")!;
const conversions = () =>
  window.dataLayer?.filter(
    (entry) => Array.isArray(entry) && entry[0] === "event" && entry[1] === "conversion",
  ) ?? [];

describe("GoogleAdsTag real loader (no external network)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    document.getElementById("sajtmaskin-google-ads")?.remove();
    window.gtag = undefined;
    window.dataLayer = [];
    window.sajtmaskinAdsTagLoaded = false;
    window.sajtmaskinAdsConfiguredIds = [];
    state.pathname = "/";
    window.history.replaceState({}, "", "/");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "AW-123456789");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ACCOUNT_CREATED_LABEL", "account_lbl");
    localStorage.setItem("cookie-consent", "accepted");
  });
  afterEach(async () => {
    cleanup();
    await vi.runOnlyPendingTimersAsync();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each(["error", "timeout"])(
    "retains pending and retries a %s load, then sends exactly once",
    async (failure) => {
      const { GoogleAdsTag } = await import("./google-ads-tag");
      const ads = await import("@/lib/ads/fire-google-ads-conversion");
      render(<GoogleAdsTag nonce="nonce-test" />);
      ads.noteGoogleAdsConversion("account_created");
      expect(script().getAttribute("nonce")).toBe("nonce-test");
      expect(ads.isGoogleAdsPending("account_created")).toBe(true);
      expect(ads.isGoogleAdsClaimed("account_created")).toBe(false);
      expect(conversions()).toHaveLength(0);
      if (failure === "error")
        await act(async () => {
          script().dispatchEvent(new Event("error"));
        });
      else
        await act(async () => {
          await vi.advanceTimersByTimeAsync(15_000);
        });
      expect(document.getElementById("sajtmaskin-google-ads")).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(script()).not.toBeNull();
      expect(window.dataLayer?.filter((entry) => Array.isArray(entry) && entry[0] === "config")).toHaveLength(1);
      await act(async () => {
        script().dispatchEvent(new Event("load"));
      });
      expect(ads.isGoogleAdsPending("account_created")).toBe(false);
      expect(ads.isGoogleAdsClaimed("account_created")).toBe(true);
      ads.flushPendingGoogleAdsConversions();
      expect(conversions()).toHaveLength(1);
    },
  );

  it("shares the in-flight script under StrictMode without double submissions", async () => {
    const { GoogleAdsTag } = await import("./google-ads-tag");
    const ads = await import("@/lib/ads/fire-google-ads-conversion");
    render(
      <StrictMode>
        <GoogleAdsTag />
      </StrictMode>,
    );
    ads.noteGoogleAdsConversion("account_created");
    expect(document.querySelectorAll("#sajtmaskin-google-ads")).toHaveLength(1);
    await act(async () => {
      script().dispatchEvent(new Event("load"));
    });
    expect(conversions()).toHaveLength(1);
  });

  it("keeps configuration queued once across failed loads and module reloads", async () => {
    const firstLoader = await import("@/lib/ads/load-google-ads-tag");
    const first = firstLoader.loadGoogleAdsTag("AW-123456789");
    script().dispatchEvent(new Event("error"));
    expect(await first).toBe(false);
    vi.resetModules();
    const retryLoader = await import("@/lib/ads/load-google-ads-tag");
    const retry = retryLoader.loadGoogleAdsTag("AW-123456789");
    script().dispatchEvent(new Event("load"));
    expect(await retry).toBe(true);
    for (const command of ["js", "config"]) {
      expect(window.dataLayer?.filter((entry) => Array.isArray(entry) && entry[0] === command)).toHaveLength(1);
    }
  });

  it("does not flush or retry after consent is revoked during a load", async () => {
    const { GoogleAdsTag } = await import("./google-ads-tag");
    const ads = await import("@/lib/ads/fire-google-ads-conversion");
    render(<GoogleAdsTag />);
    ads.noteGoogleAdsConversion("account_created");
    await act(async () => {
      localStorage.setItem("cookie-consent", "declined");
      ads.dispatchCookieConsentChange("declined");
    });
    await act(async () => {
      script().dispatchEvent(new Event("load"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(conversions()).toHaveLength(0);
    expect(ads.isGoogleAdsPending("account_created")).toBe(true);
  });

  it("never injects a tag in admin", async () => {
    state.pathname = "/admin";
    window.history.replaceState({}, "", "/admin");
    const { GoogleAdsTag } = await import("./google-ads-tag");
    render(<GoogleAdsTag />);
    expect(document.getElementById("sajtmaskin-google-ads")).toBeNull();
  });
  it("does not retry a pending event whose label is unset after tag load", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_FIRST_GENERATION_LABEL", "");
    const { GoogleAdsTag } = await import("./google-ads-tag");
    const ads = await import("@/lib/ads/fire-google-ads-conversion");
    const timers = vi.spyOn(globalThis, "setTimeout");
    render(<GoogleAdsTag />);
    ads.noteGoogleAdsConversion("first_generation");
    await act(async () => {
      script().dispatchEvent(new Event("load"));
    });
    expect(conversions()).toHaveLength(0);
    expect(timers.mock.calls.filter((call) => call[1] === 1_000)).toHaveLength(0);
  });
});
