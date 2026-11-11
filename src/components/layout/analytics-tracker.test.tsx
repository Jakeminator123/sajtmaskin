import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsTracker } from "./analytics-tracker";
import { dispatchCookieConsentChange } from "@/lib/ads/fire-google-ads-conversion";

const state = vi.hoisted(() => ({ path: "/faq", analytics: vi.fn(), speed: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: (props: unknown) => { state.analytics(props); return null; } }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: (props: unknown) => { state.speed(props); return null; } }));

function consent(value: "accepted" | "declined") {
  act(() => {
    localStorage.setItem("cookie-consent", value);
    dispatchCookieConsentChange(value);
  });
}

describe("analytics consent", () => {
  beforeEach(() => {
    localStorage.clear();
    state.path = "/faq";
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each([null, "declined", "invalid"])("does not send or mount SDKs for consent %s", (value) => {
    if (value) localStorage.setItem("cookie-consent", value);
    render(<AnalyticsTracker />);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.analytics).not.toHaveBeenCalled();
    expect(state.speed).not.toHaveBeenCalled();
  });

  it("tracks on acceptance and rejects already-mounted SDK events after revocation", () => {
    const { rerender, unmount } = render(<AnalyticsTracker />);
    consent("accepted");
    expect(fetch).toHaveBeenCalledTimes(1);
    const analyticsBeforeSend = state.analytics.mock.lastCall?.[0].beforeSend;
    const speedBeforeSend = state.speed.mock.lastCall?.[0].beforeSend;
    const event = { type: "pageview", url: "https://example.com/faq" };
    expect(analyticsBeforeSend(event)).toBe(event);
    expect(speedBeforeSend(event)).toBe(event);
    consent("declined");
    state.path = "/privacy";
    rerender(<AnalyticsTracker />);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(analyticsBeforeSend(event)).toBeNull();
    expect(speedBeforeSend(event)).toBeNull();
    const removeListener = vi.spyOn(window, "removeEventListener");
    unmount();
    expect(removeListener).toHaveBeenCalledWith("sajtmaskin:cookie-consent", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("storage", expect.any(Function));
  });

  it("reacts to consent changes from another tab", () => {
    render(<AnalyticsTracker />);
    act(() => {
      localStorage.setItem("cookie-consent", "accepted");
      window.dispatchEvent(new StorageEvent("storage", { key: "cookie-consent", newValue: "accepted" }));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["/admin/users", "/api/status"])("excludes %s even with consent", (path) => {
    state.path = path;
    localStorage.setItem("cookie-consent", "accepted");
    render(<AnalyticsTracker />);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.analytics).not.toHaveBeenCalled();
  });
});
