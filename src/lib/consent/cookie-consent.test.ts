// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_DATE_KEY,
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_KEY,
  hasMarketingConsent,
  persistCookieConsent,
  readStoredCookieConsent,
  subscribeCookieConsent,
} from "./cookie-consent";

describe("cookie consent storage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reads only accepted/declined values", () => {
    expect(readStoredCookieConsent()).toBeNull();
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    expect(readStoredCookieConsent()).toBe("accepted");
    expect(hasMarketingConsent()).toBe(true);

    localStorage.setItem(COOKIE_CONSENT_KEY, "maybe");
    expect(readStoredCookieConsent()).toBeNull();
    expect(hasMarketingConsent()).toBe(false);
  });

  it("persists a choice and notifies subscribers", () => {
    const seen: Array<string | null> = [];
    const unsubscribe = subscribeCookieConsent((value) => seen.push(value));

    persistCookieConsent("accepted");
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe("accepted");
    expect(localStorage.getItem(COOKIE_CONSENT_DATE_KEY)).toBeTruthy();
    expect(seen).toEqual(["accepted"]);

    persistCookieConsent("declined");
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe("declined");
    expect(seen).toEqual(["accepted", "declined"]);

    unsubscribe();
    persistCookieConsent("accepted");
    expect(seen).toEqual(["accepted", "declined"]);
  });

  it("still notifies when storage is blocked", () => {
    const seen: Array<string | null> = [];
    const unsubscribe = subscribeCookieConsent((value) => seen.push(value));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    persistCookieConsent("accepted");
    expect(seen).toEqual(["accepted"]);
    unsubscribe();
  });

  it("exposes the event name used by marketing pixels", () => {
    expect(COOKIE_CONSENT_EVENT).toBe("sajtmaskin:cookie-consent");
  });
});
