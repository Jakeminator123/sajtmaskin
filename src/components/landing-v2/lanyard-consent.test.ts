// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LANYARD_CONSENT_KEY,
  preloadReturningLanyard,
  readStoredCookieConsent,
} from "@/components/landing-v2/lanyard-consent";

describe("lanyard consent helpers", () => {
  afterEach(() => {
    localStorage.removeItem(LANYARD_CONSENT_KEY);
    vi.restoreAllMocks();
  });

  it("reads stored consent and ignores blocked storage", () => {
    expect(readStoredCookieConsent()).toBeNull();
    localStorage.setItem(LANYARD_CONSENT_KEY, "accepted");
    expect(readStoredCookieConsent()).toBe("accepted");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredCookieConsent()).toBeNull();
  });

  it("preloads the 3D chunk only when consent already exists", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/lanyard-consent.ts"),
      "utf8",
    );
    expect(source).toContain("lanyard-experience");
    expect(source).toContain("lanyard-card");
    expect(source).toMatch(/if \(readStoredCookieConsent\(\)\)/);
    expect(() => preloadReturningLanyard()).not.toThrow();
  });
});
