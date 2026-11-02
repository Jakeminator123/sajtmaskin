/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  fetchUser: vi.fn(),
  noteOrder: vi.fn(),
  noteSignup: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/buy-credits",
  useSearchParams: () => mocks.params,
}));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isInitialized: true,
    diamonds: 0,
    fetchUser: mocks.fetchUser,
  }),
}));
vi.mock("@/lib/credits/use-public-pricing", () => ({
  usePublicPricing: () => ({ breakdown: {} }),
}));
vi.mock("@/lib/ads/fire-google-ads-conversion", () => ({
  noteAccountCreatedIfSignup: vi.fn(),
}));
vi.mock("@/lib/ads/fire-openai-ads", () => ({
  noteOpenAiOrderCreated: mocks.noteOrder,
  noteOpenAiRegistrationIfSignup: mocks.noteSignup,
}));
vi.mock("@/components/layout/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/layout/shader-background", () => ({ ShaderBackground: () => null }));
vi.mock("@/components/auth/auth-modal", () => ({ AuthModal: () => null }));
vi.mock("@/components/billing/CreditPackageGrid", () => ({ CreditPackageGrid: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import BuyCreditsPage from "./page";

describe("checkout return recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/buy-credits?success=true&session_id=cs_slow&keep=1");
    mocks.params = new URLSearchParams(window.location.search);
    mocks.replace.mockImplementation((url: string) => {
      window.history.replaceState({}, "", url);
      mocks.params = new URLSearchParams(window.location.search);
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recovers a slow checkout after reload without duplicate events", async () => {
    const fetchMock = vi.fn(async () => Response.json({ credited: false }));
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<BuyCreditsPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(screen.getByText(/Vi väntar fortfarande på bekräftelse/)).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("session_id")).toBe("cs_slow");
    expect(new URLSearchParams(window.location.search).get("success")).toBe("true");
    expect(mocks.noteOrder).not.toHaveBeenCalled();
    first.unmount();

    fetchMock.mockImplementation(async () =>
      Response.json({ credited: true, amount: 9900, currency: "SEK" }),
    );
    const resumed = render(<BuyCreditsPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.noteOrder).toHaveBeenCalledExactlyOnceWith({
      eventId: "cs_slow",
      amount: 9900,
      currency: "SEK",
      contents: undefined,
    });
    expect(window.location.search).toBe("?keep=1");
    expect(screen.getByText(/Tack för ditt köp/)).toBeTruthy();
    resumed.unmount();
    render(<BuyCreditsPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.noteOrder).toHaveBeenCalledTimes(1);
  });

  it("captures OAuth signup before clearing its callback parameters", () => {
    window.history.replaceState({}, "", "/buy-credits?signup=1");
    mocks.params = new URLSearchParams(window.location.search);
    vi.stubGlobal("fetch", vi.fn());
    render(<BuyCreditsPage />);
    expect(mocks.noteSignup).toHaveBeenCalledWith("1");
    expect(mocks.noteSignup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.replace.mock.invocationCallOrder[0],
    );
    expect(window.location.search).toBe("");
  });
});
