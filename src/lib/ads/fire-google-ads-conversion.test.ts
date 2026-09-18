// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_KEY,
  dispatchCookieConsentChange,
  fireGoogleAdsConversion,
  flushPendingGoogleAdsConversions,
  hasAcceptedCookieConsent,
  isGoogleAdsClaimed,
  isGoogleAdsPending,
  noteAccountCreatedFromLocation,
  noteAccountCreatedIfSignup,
  noteBuilderStartFromLocation,
  noteGoogleAdsConversion,
  subscribeCookieConsent,
} from "./fire-google-ads-conversion";

function acceptConsent() {
  localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
}

function enableAds() {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "AW-123456789");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START_LABEL", "builder_lbl");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ACCOUNT_CREATED_LABEL", "account_lbl");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_FIRST_GENERATION_LABEL", "first_lbl");
}

describe("fireGoogleAdsConversion", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.gtag = undefined;
    window.dataLayer = [];
    window.history.replaceState({}, "", "/builder");
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.gtag = undefined;
  });

  it("no-ops when the account tag is unset", () => {
    acceptConsent();
    const gtag = vi.fn();
    window.gtag = gtag;
    noteGoogleAdsConversion("builder_start");
    expect(gtag).not.toHaveBeenCalled();
    expect(isGoogleAdsClaimed("builder_start")).toBe(false);
  });

  it("no-ops without accepted cookie consent and does not claim the event", () => {
    enableAds();
    const gtag = vi.fn();
    window.gtag = gtag;
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    noteGoogleAdsConversion("builder_start");
    expect(gtag).not.toHaveBeenCalled();
    expect(isGoogleAdsPending("builder_start")).toBe(true);
    expect(isGoogleAdsClaimed("builder_start")).toBe(false);
  });

  it("no-ops when gtag is missing so a later flush can send", () => {
    enableAds();
    acceptConsent();
    noteGoogleAdsConversion("account_created");
    expect(isGoogleAdsPending("account_created")).toBe(true);
    expect(isGoogleAdsClaimed("account_created")).toBe(false);

    const gtag = vi.fn();
    window.gtag = gtag;
    flushPendingGoogleAdsConversions();
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-123456789/account_lbl",
    });
    expect(isGoogleAdsClaimed("account_created")).toBe(true);
  });

  it("fires builder_start once per session even if note is repeated", () => {
    enableAds();
    acceptConsent();
    const gtag = vi.fn();
    window.gtag = gtag;
    noteGoogleAdsConversion("builder_start");
    noteGoogleAdsConversion("builder_start");
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("sajtmaskin:ads:claimed:builder_start")).toBe("1");
    expect(localStorage.getItem("sajtmaskin:ads:claimed:builder_start")).toBeNull();
  });

  it("stores first_generation on localStorage so follow-ups do not fire again", () => {
    enableAds();
    acceptConsent();
    const gtag = vi.fn();
    window.gtag = gtag;
    noteGoogleAdsConversion("first_generation");
    expect(fireGoogleAdsConversion("first_generation")).toBe(false);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("sajtmaskin:ads:claimed:first_generation")).toBe("1");
  });

  it("does not fire on /admin even with consent and gtag", () => {
    enableAds();
    acceptConsent();
    const gtag = vi.fn();
    window.gtag = gtag;
    window.history.replaceState({}, "", "/admin/users");
    noteGoogleAdsConversion("builder_start");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("notes builder_start only for /builder?new=1", () => {
    enableAds();
    acceptConsent();
    const gtag = vi.fn();
    window.gtag = gtag;
    window.history.replaceState({}, "", "/builder");
    noteBuilderStartFromLocation("/builder", "");
    expect(gtag).not.toHaveBeenCalled();
    noteBuilderStartFromLocation("/builder", "?new=1");
    expect(gtag).toHaveBeenCalledTimes(1);
    noteBuilderStartFromLocation("/faq", "?new=1");
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("notes account_created from signup=1", () => {
    enableAds();
    acceptConsent();
    const gtag = vi.fn();
    window.gtag = gtag;
    noteAccountCreatedFromLocation("?login=success");
    expect(gtag).not.toHaveBeenCalled();
    noteAccountCreatedFromLocation("?login=success&signup=1");
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-123456789/account_lbl",
    });
  });

  it("remembers Google signup without consent and fires once after accept", () => {
    enableAds();
    const gtag = vi.fn();
    window.gtag = gtag;
    window.history.replaceState({}, "", "/?login=success&signup=1");

    noteAccountCreatedIfSignup("1");
    expect(isGoogleAdsPending("account_created")).toBe(true);
    expect(gtag).not.toHaveBeenCalled();

    window.history.replaceState({}, "", "/");
    noteAccountCreatedFromLocation(window.location.search);
    expect(isGoogleAdsPending("account_created")).toBe(true);
    expect(gtag).not.toHaveBeenCalled();

    acceptConsent();
    flushPendingGoogleAdsConversions();
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-123456789/account_lbl",
    });

    flushPendingGoogleAdsConversions();
    noteAccountCreatedIfSignup("1");
    expect(gtag).toHaveBeenCalledTimes(1);
  });
});

describe("cookie consent helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("treats missing and declined as not accepted", () => {
    expect(hasAcceptedCookieConsent()).toBe(false);
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    expect(hasAcceptedCookieConsent()).toBe(false);
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    expect(hasAcceptedCookieConsent()).toBe(true);
  });

  it("notifies subscribers on the same-tab consent event", () => {
    const seen: boolean[] = [];
    const stop = subscribeCookieConsent((accepted) => {
      seen.push(accepted);
    });
    dispatchCookieConsentChange("accepted");
    dispatchCookieConsentChange("declined");
    stop();
    expect(seen).toEqual([true, false]);
  });
});
