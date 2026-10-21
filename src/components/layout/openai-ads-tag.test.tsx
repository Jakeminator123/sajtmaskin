import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

const script = () => document.getElementById("sajtmaskin-openai-ads")!;
const queued = () =>
  (window.oaiq?.q ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));

describe("OpenAiAdsTag real loader (no external network)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    document.getElementById("sajtmaskin-openai-ads")?.remove();
    window.oaiq = undefined;
    window.sajtmaskinOpenAiAdsTagLoaded = false;
    window.sajtmaskinOpenAiAdsInitializedId = undefined;
    delete window.sajtmaskinOpenAiAdsTransientState;
    state.pathname = "/";
    window.history.replaceState({}, "", "/");
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID", "TestPixelId123");
    localStorage.setItem("cookie-consent", "accepted");
  });

  afterEach(async () => {
    cleanup();
    await vi.runOnlyPendingTimersAsync();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("injects the SDK once, denies consent before init, and never sets debug", async () => {
    const { OpenAiAdsTag } = await import("./openai-ads-tag");
    render(<OpenAiAdsTag nonce="nonce-test" />);
    expect(script().getAttribute("nonce")).toBe("nonce-test");
    expect(script().getAttribute("src")).toBe("https://bzrcdn.openai.com/sdk/oaiq.min.js");
    const commands = queued();
    const consentIdx = commands.findIndex((entry) => entry[0] === "consent");
    const initIdx = commands.findIndex((entry) => entry[0] === "init");
    expect(consentIdx).toBeGreaterThanOrEqual(0);
    expect(initIdx).toBeGreaterThan(consentIdx);
    expect(commands[consentIdx]).toEqual(["consent", false]);
    expect(commands[initIdx]).toEqual(["init", { pixelId: "TestPixelId123" }]);
    expect(commands.some((entry) => JSON.stringify(entry).includes("debug"))).toBe(false);
    await act(async () => {
      script().dispatchEvent(new Event("load"));
    });
    expect(document.querySelectorAll("#sajtmaskin-openai-ads")).toHaveLength(1);
  });

  it("retries a failed load then flushes a pending registration once", async () => {
    const { OpenAiAdsTag } = await import("./openai-ads-tag");
    const ads = await import("@/lib/ads/fire-openai-ads");
    render(<OpenAiAdsTag />);
    ads.noteOpenAiRegistrationCompleted("user_9");
    expect(ads.isOpenAiRegistrationPending()).toBe(true);
    await act(async () => {
      script().dispatchEvent(new Event("error"));
    });
    expect(document.getElementById("sajtmaskin-openai-ads")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await act(async () => {
      script().dispatchEvent(new Event("load"));
    });
    expect(ads.isOpenAiRegistrationClaimed()).toBe(true);
    expect(queued().filter((entry) => entry[1] === "registration_completed")).toHaveLength(1);
  });

  it("does not inject on admin routes", async () => {
    state.pathname = "/admin/users";
    const { OpenAiAdsTag } = await import("./openai-ads-tag");
    render(<OpenAiAdsTag />);
    expect(document.getElementById("sajtmaskin-openai-ads")).toBeNull();
  });

  it("does not inject when the kill-switch is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_ENABLED", "0");
    const { OpenAiAdsTag } = await import("./openai-ads-tag");
    render(<OpenAiAdsTag />);
    expect(document.getElementById("sajtmaskin-openai-ads")).toBeNull();
  });
});
