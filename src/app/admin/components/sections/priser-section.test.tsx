/**
 * Låser att PriserSection skickar partiella patchar — inte hela prislistan.
 * Assertions använder vanliga DOM-egenskaper; repo saknar jest-dom.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CREDIT_ACTION_PRICES } from "@/lib/credits/pricing";
import {
  applyMarkupSek,
  DEFAULT_DOMAIN_PRICING,
  referenceWholesaleSek,
} from "@/lib/domains/pricing";
import { useAdminResource } from "../../lib/use-admin-resource";
import type { PricingSettingsAdminPayload } from "../types";
import { PriserSection } from "./priser-section";

vi.mock("../../lib/use-admin-resource", () => ({
  useAdminResource: vi.fn(),
}));

const reload = vi.fn().mockResolvedValue(undefined);

function pricingPayload(): PricingSettingsAdminPayload {
  return {
    success: true,
    settings: {
      domainMarkupBasisPoints: 50_000,
      domainUsdToSekOre: 1_100,
      domain: { ...DEFAULT_DOMAIN_PRICING },
      creditActionPrices: {},
      updatedAt: "2026-09-11T00:00:00.000Z",
      updatedBy: "admin_1",
    },
    defaults: {
      domain: { ...DEFAULT_DOMAIN_PRICING },
      creditActionPrices: DEFAULT_CREDIT_ACTION_PRICES,
    },
    effective: {
      domain: { ...DEFAULT_DOMAIN_PRICING },
      creditActionPrices: DEFAULT_CREDIT_ACTION_PRICES,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const payload = pricingPayload();
  vi.mocked(useAdminResource).mockImplementation((url) => {
    if (String(url).includes("generation-billing")) {
      return { data: null, loading: false, error: null, status: 200, reload };
    }
    return { data: payload, loading: false, error: null, status: 200, reload };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PriserSection", () => {
  it("saves one credit field as a partial patch", async () => {
    render(<PriserSection />);

    const wizard = screen.getByLabelText("Wizard");
    fireEvent.change(wizard, { target: { value: "14" } });

    const row = wizard.closest(".border-border");
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Spara" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/admin/pricing-settings",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      creditActionPrices: { wizard: 14 },
    });
  });

  it("labels domain reset as a stored default, never as code takeover", () => {
    render(<PriserSection />);

    expect(screen.getAllByRole("button", { name: "Återställ till standardvärde" })).toHaveLength(2);
    expect(screen.queryByText("Återställ till kod")).toBeNull();

    const markup = document.getElementById("domain-markup");
    const field = markup?.closest(".space-y-2");
    expect(field).toBeTruthy();
    expect(within(field as HTMLElement).getByText("Databas")).toBeTruthy();
    expect(within(field as HTMLElement).queryByText("Kod")).toBeNull();
    expect(
      within(field as HTMLElement).getByText(
        new RegExp(`Standardvärde: X${DEFAULT_DOMAIN_PRICING.markup}`),
      ),
    ).toBeTruthy();
    const seCustomer = applyMarkupSek(referenceWholesaleSek("se"), DEFAULT_DOMAIN_PRICING);
    expect(screen.getByText(/Uppskattat \.se/)).toBeTruthy();
    expect(screen.getByText(`${seCustomer.toLocaleString("sv-SE")} kr`)).toBeTruthy();
  });
});
