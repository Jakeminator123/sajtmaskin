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
    state.pathname = "/";
    window.history.replaceState({}, "", "/");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "AW-123456789");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ACCOUNT_CREATED_LABEL", "account_lbl");
    localStorage.setItem("cookie-consent", "accepted");
  });
  afterEach(async () => {
    cleanup();
    await vi.runOnlyPendingTimersAsync();
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
});
