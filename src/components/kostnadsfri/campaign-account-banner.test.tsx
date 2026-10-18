// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_CLAIM_MARKER_COOKIE,
  readCampaignClaimPending,
  writeCampaignClaimPending,
} from "@/lib/kostnadsfri/campaign-account";

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

function pendingStillSet(): boolean {
  return readCampaignClaimPending() !== null;
}

beforeEach(() => {
  writeCampaignClaimPending({ slug: "inbjudan-a", campaignUserId: "user_campaign" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("CampaignAccountBanner — slutför sparandet", () => {
  it.each([
    ["nätverksfel", () => Promise.reject(new TypeError("Failed to fetch")), "Kontot kunde inte sparas just nu."],
    ["500", () => Promise.resolve(respond(500, { error: "Kontot kunde inte sparas just nu." })), "Kontot kunde inte sparas just nu."],
    [
      "pågående generering",
      () =>
        Promise.resolve(
          respond(503, {
            error: "En generering pågår fortfarande. Försök igen när den är klar.",
            code: "generation_in_progress",
          }),
        ),
      "En generering pågår fortfarande. Försök igen när den är klar.",
    ],
  ])("behåller sparandet och låter kunden försöka igen efter %s", async (_label, firstAttempt, message) => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(firstAttempt)
      .mockResolvedValueOnce(respond(200, { success: true, projects: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignAccountBanner />);

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0]?.[0]).toBe(message);
    expect(pendingStillSet()).toBe(true);
    const [, options] = toast.error.mock.calls[0] as [string, { action: { onClick: () => void } }];
    act(() => options.action.onClick());

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pendingStillSet()).toBe(false);
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
    expect(pendingStillSet()).toBe(false);
  });

  it("behåller sparandet efter 401 så att inloggningen kan försöka igen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(401, { error: "Du måste vara inloggad." })));

    render(<CampaignAccountBanner />);

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(pendingStillSet()).toBe(true);
    expect(toast.error.mock.calls[0]?.[1]).toMatchObject({ action: { label: "Försök igen" } });
  });

  it("anropar complete från serverns markörcookie när localStorage saknas", async () => {
    window.localStorage.clear();
    document.cookie = `${CAMPAIGN_CLAIM_MARKER_COOKIE}=1; path=/`;
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { success: true, projects: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignAccountBanner />);

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.cookie).not.toContain(CAMPAIGN_CLAIM_MARKER_COOKIE);
  });
});
