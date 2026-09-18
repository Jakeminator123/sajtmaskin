// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  id: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
  enabled: process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED,
};

async function loadGoogleAds() {
  vi.resetModules();
  return import("./google-ads");
}

function asCallList(): unknown[][] {
  const layer = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
  return layer.map((entry) => Array.from(entry as ArrayLike<unknown>));
}

function restoreEnv() {
  if (ORIGINAL_ENV.id === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  else process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = ORIGINAL_ENV.id;
  if (ORIGINAL_ENV.enabled === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED = ORIGINAL_ENV.enabled;
}

describe("google ads config", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED;
    localStorage.clear();
    document.head.innerHTML = "";
  });

  afterEach(async () => {
    const { resetGoogleAdsTagForTests } = await import("./google-ads");
    resetGoogleAdsTagForTests();
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("enables only on first-party production hosts unless forced", async () => {
    const {
      isGoogleAdsEnabled,
      isGoogleAdsProductionHost,
      GOOGLE_ADS_DEFAULT_ID,
    } = await loadGoogleAds();

    expect(GOOGLE_ADS_DEFAULT_ID).toBe("AW-18458823435");
    expect(isGoogleAdsProductionHost("sajtmaskin.se")).toBe(true);
    expect(isGoogleAdsProductionHost("preview.sajtmaskin.se")).toBe(false);
    expect(isGoogleAdsEnabled("sajtmaskin.se")).toBe(true);
    expect(isGoogleAdsEnabled("preview.sajtmaskin.se")).toBe(false);
    expect(isGoogleAdsEnabled("localhost")).toBe(false);

    process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED = "1";
    const forced = await loadGoogleAds();
    expect(forced.isGoogleAdsEnabled("localhost")).toBe(true);

    process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED = "0";
    const disabled = await loadGoogleAds();
    expect(disabled.isGoogleAdsEnabled("sajtmaskin.se")).toBe(false);
  });

  it("installs gtag with denied consent and updates after accept", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED = "1";
    const { ensureGoogleAdsTag, resetGoogleAdsTagForTests } = await loadGoogleAds();
    const { persistCookieConsent } = await import("@/lib/consent/cookie-consent");

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "localhost" },
    });

    expect(ensureGoogleAdsTag({ nonce: "test-nonce" })).toBe(true);
    const script = document.querySelector(
      'script[src="https://www.googletagmanager.com/gtag/js?id=AW-18458823435"]',
    );
    expect(script).toBeTruthy();
    expect(script?.getAttribute("nonce")).toBe("test-nonce");

    const calls = asCallList();
    expect(calls.some((entry) => entry[0] === "consent" && entry[1] === "default")).toBe(true);

    persistCookieConsent("accepted");
    expect(asCallList().some((entry) => entry[0] === "consent" && entry[1] === "update")).toBe(true);

    resetGoogleAdsTagForTests();
  });

  it("fires each conversion once with the Ads send_to labels", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED = "1";
    const {
      ensureGoogleAdsTag,
      trackGoogleAdsConversion,
      GOOGLE_ADS_ACCOUNT_CREATED_SEND_TO,
      GOOGLE_ADS_BUILDER_START_SEND_TO,
    } = await loadGoogleAds();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "localhost" },
    });
    ensureGoogleAdsTag();

    expect(trackGoogleAdsConversion("account_created")).toBe(true);
    expect(trackGoogleAdsConversion("account_created")).toBe(false);
    expect(trackGoogleAdsConversion("builder_start")).toBe(true);
    expect(trackGoogleAdsConversion("builder_start")).toBe(false);

    const conversions = asCallList().filter((entry) => entry[0] === "event" && entry[1] === "conversion");
    expect(conversions).toHaveLength(2);
    expect(conversions[0]).toEqual([
      "event",
      "conversion",
      {
        send_to: GOOGLE_ADS_ACCOUNT_CREATED_SEND_TO,
        value: 1.0,
        currency: "SEK",
      },
    ]);
    expect(conversions[1]).toEqual([
      "event",
      "conversion",
      {
        send_to: GOOGLE_ADS_BUILDER_START_SEND_TO,
        value: 1.0,
        currency: "SEK",
      },
    ]);
  });
});
