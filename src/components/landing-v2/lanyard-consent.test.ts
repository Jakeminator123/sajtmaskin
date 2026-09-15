// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LANYARD_CONSENT_KEY,
  preloadReturningLanyard,
  readStoredCookieConsent,
  shouldPreloadLanyardCard,
} from "@/components/landing-v2/lanyard-consent";

function stubMatchMedia(reducedMotion: boolean): typeof window.matchMedia {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return original;
}

type ConnectionStub = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};

function stubConnection(connection: ConnectionStub | undefined): () => void {
  const nav = navigator as Navigator & { connection?: ConnectionStub };
  const previous = nav.connection;
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: connection,
  });
  return () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: previous,
    });
  };
}

describe("lanyard consent helpers", () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let restoreConnection: (() => void) | undefined;

  afterEach(() => {
    localStorage.removeItem(LANYARD_CONSENT_KEY);
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
      originalMatchMedia = undefined;
    }
    restoreConnection?.();
    restoreConnection = undefined;
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

  it("preloads the 3D card only with consent and without staticOnly", () => {
    originalMatchMedia = stubMatchMedia(false);
    restoreConnection = stubConnection(undefined);

    expect(shouldPreloadLanyardCard()).toBe(false);

    localStorage.setItem(LANYARD_CONSENT_KEY, "accepted");
    expect(shouldPreloadLanyardCard()).toBe(true);

    window.matchMedia = originalMatchMedia;
    originalMatchMedia = stubMatchMedia(true);
    expect(shouldPreloadLanyardCard()).toBe(false);

    window.matchMedia = originalMatchMedia;
    originalMatchMedia = stubMatchMedia(false);
    restoreConnection();
    restoreConnection = stubConnection({ saveData: true });
    expect(shouldPreloadLanyardCard()).toBe(false);

    restoreConnection();
    restoreConnection = stubConnection({ effectiveType: "2g" });
    expect(shouldPreloadLanyardCard()).toBe(false);
  });

  it("keeps experience preload and gates the physics chunk in source", async () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/lanyard-consent.ts"),
      "utf8",
    );
    expect(source).toContain("lanyard-experience");
    expect(source).toContain("lanyard-card");
    expect(source).toContain("shouldPreloadLanyardCard");
    expect(source).toContain("readLanyardStaticOnly");
    expect(() => preloadReturningLanyard()).not.toThrow();
    await expect(import("@/components/landing-v2/lanyard-experience")).resolves.toBeDefined();
  });
});
