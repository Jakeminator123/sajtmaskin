/**
 * Låser att auditsaldot efter debitering kommer från servern.
 * Klientens hämtade prislista får inte användas för att räkna baklänges.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CREDIT_ACTION_PRICES } from "@/lib/credits/pricing";
import { useAuth } from "@/lib/auth/auth-store";
import { usePublicPricing } from "@/lib/credits/use-public-pricing";
import { SiteAuditSection } from "./site-audit-section";

const updateDiamonds = vi.fn();
const fetchUser = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/credits/use-public-pricing", () => ({
  usePublicPricing: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "user_1",
      email: "user@example.com",
      name: "Test",
      image: null,
      diamonds: 30,
      provider: "email",
      github_token: null,
      github_username: null,
    },
    guest: null,
    isLoading: false,
    isInitialized: true,
    isAuthenticated: true,
    diamonds: 30,
    hasGitHub: false,
    logout: vi.fn(),
    fetchUser,
    refreshUser: vi.fn(),
    updateDiamonds,
  });
  vi.mocked(usePublicPricing).mockReturnValue({
    pricing: {
      credits: {
        ...DEFAULT_CREDIT_ACTION_PRICES,
        auditBasic: 15,
        auditAdvanced: 25,
      },
    },
    breakdown: {
      generatePremium: DEFAULT_CREDIT_ACTION_PRICES.promptCreate.premium,
      generatePro: DEFAULT_CREDIT_ACTION_PRICES.promptCreate.pro,
      generateMax: DEFAULT_CREDIT_ACTION_PRICES.promptCreate.max,
      refinePremium: DEFAULT_CREDIT_ACTION_PRICES.promptRefine.premium,
      refinePro: DEFAULT_CREDIT_ACTION_PRICES.promptRefine.pro,
      refineMax: DEFAULT_CREDIT_ACTION_PRICES.promptRefine.max,
      wizard: DEFAULT_CREDIT_ACTION_PRICES.wizard,
      auditBasic: 15,
      auditAdvanced: 25,
      deploy: DEFAULT_CREDIT_ACTION_PRICES.deployProduction,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function runBasicAudit() {
  render(
    <SiteAuditSection
      url="https://example.se"
      hideUrlInput
      onAuditComplete={vi.fn()}
      onRequireAuth={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /välj analysnivå/i }));
  fireEvent.click(screen.getByRole("button", { name: /vanlig analys/i }));
}

describe("SiteAuditSection balance after debit", () => {
  it("shows the server remaining balance when the client price is stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          result: { overall_score: 80 },
          creditsRemaining: 5,
        }),
      }),
    );

    await runBasicAudit();

    await waitFor(() => {
      expect(updateDiamonds).toHaveBeenCalledWith(5);
    });
    expect(updateDiamonds).not.toHaveBeenCalledWith(15);
    expect(updateDiamonds).not.toHaveBeenCalledWith(30 - 15);
  });

  it("refetches the user instead of subtracting the client price when the server omits remaining", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          result: { overall_score: 80 },
        }),
      }),
    );

    await runBasicAudit();

    await waitFor(() => {
      expect(fetchUser).toHaveBeenCalled();
    });
    expect(updateDiamonds).not.toHaveBeenCalled();
  });
});
