// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_CLAIM_PENDING_STORAGE_KEY } from "@/lib/kostnadsfri/campaign-account";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const store = vi.hoisted(() => ({
  user: { id: "user_own", provider: "google" } as unknown,
  fetchUser: vi.fn(async () => undefined),
}));
const mutate = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast }));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate }) }));
vi.mock("@/components/auth/auth-modal", () => ({ AuthModal: () => null }));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: (selector: (state: typeof store) => unknown) => selector(store),
}));
vi.mock("@/lib/builder/pending-builder-draft", () => ({
  currentBuilderReturnTo: () => "/builder",
}));

import { CampaignAccountBanner } from "./campaign-account-banner";

function respond(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function pendingFlag() {
  return window.localStorage.getItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY);
}

beforeEach(() => {
  window.localStorage.setItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY, "1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("CampaignAccountBanner — slutför sparandet", () => {
  it.each([
    ["nätverksfel", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["500", () => Promise.resolve(respond(500, { error: "Kontot kunde inte sparas just nu." }))],
  ])("behåller sparandet och låter kunden försöka igen efter %s", async (_label, firstAttempt) => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(firstAttempt)
      .mockResolvedValueOnce(respond(200, { success: true, projects: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignAccountBanner />);

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(pendingFlag()).toBe("1");
    const [, options] = toast.error.mock.calls[0] as [string, { action: { onClick: () => void } }];
    act(() => options.action.onClick());

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pendingFlag()).toBeNull();
    expect(store.fetchUser).toHaveBeenCalled();
  });

  it("släpper sparandet när servern nekar det", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond(409, { error: "Inbjudan är redan sparad till ett konto." })),
    );

    render(<CampaignAccountBanner />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Inbjudan är redan sparad till ett konto."),
    );
    expect(pendingFlag()).toBeNull();
  });
});
