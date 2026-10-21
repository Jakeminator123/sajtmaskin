// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_CONSENT_KEY } from "./fire-google-ads-conversion";
import {
  fireOpenAiOrderCreated,
  fireOpenAiRegistrationCompleted,
  flushPendingOpenAiAdsEvents,
  isOpenAiOrderClaimed,
  isOpenAiOrderPending,
  isOpenAiRegistrationClaimed,
  isOpenAiRegistrationPending,
  noteOpenAiOrderCreated,
  noteOpenAiRegistrationCompleted,
  noteOpenAiRegistrationFromLocation,
  syncOpenAiAdsConsent,
} from "./fire-openai-ads";

function acceptConsent() {
  localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
}

function enablePixel() {
  vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_ENABLED", "1");
  vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID", "TestPixelId123");
  window.sajtmaskinOpenAiAdsTagLoaded = true;
}

function oaiqCommands(): unknown[][] {
  return (window.oaiq?.q ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

describe("fireOpenAiAds", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete window.sajtmaskinOpenAiAdsTransientState;
    window.sajtmaskinOpenAiAdsTagLoaded = false;
    window.sajtmaskinOpenAiAdsInitializedId = undefined;
    const q = function oaiq() {
      // eslint-disable-next-line prefer-rest-params
      q.q.push(arguments);
    } as typeof window.oaiq & { q: IArguments[] };
    q.q = [];
    window.oaiq = q;
    window.history.replaceState({}, "", "/");
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("no-ops when the kill-switch is off", () => {
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_ENABLED", "0");
    window.sajtmaskinOpenAiAdsTagLoaded = true;
    acceptConsent();
    noteOpenAiRegistrationCompleted("user_1");
    expect(oaiqCommands().some((entry) => entry[1] === "registration_completed")).toBe(false);
    expect(isOpenAiRegistrationClaimed()).toBe(false);
  });

  it("queues registration without consent and does not claim it", () => {
    enablePixel();
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    noteOpenAiRegistrationCompleted("user_1");
    expect(oaiqCommands().some((entry) => entry[1] === "registration_completed")).toBe(false);
    expect(isOpenAiRegistrationPending()).toBe(true);
    expect(isOpenAiRegistrationClaimed()).toBe(false);
  });

  it("fires registration_completed once with event_id after consent", () => {
    enablePixel();
    acceptConsent();
    noteOpenAiRegistrationCompleted("user_1");
    expect(fireOpenAiRegistrationCompleted("user_1")).toBe(false);
    const measure = oaiqCommands().find((entry) => entry[1] === "registration_completed");
    expect(measure).toEqual([
      "measure",
      "registration_completed",
      { type: "customer_action" },
      { event_id: "user_1" },
    ]);
    expect(isOpenAiRegistrationClaimed()).toBe(true);
  });

  it("notes OAuth signup=1 from the location and ignores login-only", () => {
    enablePixel();
    acceptConsent();
    noteOpenAiRegistrationFromLocation("?login=success");
    expect(isOpenAiRegistrationPending()).toBe(false);
    noteOpenAiRegistrationFromLocation("?login=success&signup=1");
    expect(isOpenAiRegistrationClaimed()).toBe(true);
  });

  it("fires order_created per session id and ignores reload of the same session", () => {
    enablePixel();
    acceptConsent();
    const order = {
      eventId: "cs_test_1",
      amount: 9900,
      currency: "SEK",
      contents: [
        { id: "popular", name: "Popular", content_type: "product" as const, quantity: 1 },
      ],
    };
    noteOpenAiOrderCreated(order);
    noteOpenAiOrderCreated(order);
    expect(fireOpenAiOrderCreated(order)).toBe(false);
    const measures = oaiqCommands().filter((entry) => entry[1] === "order_created");
    expect(measures).toHaveLength(1);
    expect(measures[0]).toEqual([
      "measure",
      "order_created",
      {
        type: "contents",
        amount: 9900,
        currency: "SEK",
        contents: order.contents,
      },
      { event_id: "cs_test_1" },
    ]);
    expect(isOpenAiOrderClaimed("cs_test_1")).toBe(true);
  });

  it("allows a second credit purchase with a new session id", () => {
    enablePixel();
    acceptConsent();
    noteOpenAiOrderCreated({ eventId: "cs_a", amount: 4900, currency: "SEK" });
    noteOpenAiOrderCreated({ eventId: "cs_b", amount: 17900, currency: "SEK" });
    expect(oaiqCommands().filter((entry) => entry[1] === "order_created")).toHaveLength(2);
  });

  it("remembers an order without consent and flushes it once after accept", () => {
    enablePixel();
    noteOpenAiOrderCreated({ eventId: "cs_wait", amount: 4900, currency: "SEK" });
    expect(isOpenAiOrderPending("cs_wait")).toBe(true);
    expect(oaiqCommands().some((entry) => entry[1] === "order_created")).toBe(false);
    acceptConsent();
    flushPendingOpenAiAdsEvents();
    expect(oaiqCommands().filter((entry) => entry[1] === "order_created")).toHaveLength(1);
    flushPendingOpenAiAdsEvents();
    expect(oaiqCommands().filter((entry) => entry[1] === "order_created")).toHaveLength(1);
  });

  it("syncs oaiq consent to the stored cookie choice", () => {
    enablePixel();
    syncOpenAiAdsConsent();
    expect(oaiqCommands().at(-1)).toEqual(["consent", false]);
    acceptConsent();
    syncOpenAiAdsConsent();
    expect(oaiqCommands().at(-1)).toEqual(["consent", true]);
  });
});
