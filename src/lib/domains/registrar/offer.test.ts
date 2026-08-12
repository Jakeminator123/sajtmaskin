/**
 * Offer resolution: the rules that decide whether a domain may be sold.
 *
 * The single most important assertion here is that an ESTIMATED price can
 * never make a domain purchasable. That is the difference between showing a
 * customer "ungefär 495 kr" and charging their card 495 kr for a number no
 * registrar ever quoted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const loopiaState = { configured: true, status: "OK" as string };
const vercelState = {
  configured: true,
  priceUsd: 10 as number | null,
  available: true as boolean | null,
  purchaseEnabled: true,
  throwOnPrice: false,
};

vi.mock("@/lib/loopia/loopia-client", () => ({
  isLoopiaConfigured: () => loopiaState.configured,
  domainIsFree: async () => loopiaState.status,
}));

vi.mock("@/lib/vercel/vercel-client", () => ({
  isVercelConfigured: () => vercelState.configured,
  getDomainPrice: async () => {
    if (vercelState.throwOnPrice || vercelState.priceUsd === null) {
      throw new Error("no price");
    }
    return { name: "x", price: vercelState.priceUsd, period: 1 };
  },
  checkDomainAvailability: async () => {
    if (vercelState.available === null) throw new Error("no availability");
    return { name: "x", available: vercelState.available };
  },
  buyDomain: async () => ({ domain: "x", orderId: "order_1" }),
  addDomainToProject: async () => ({ name: "x", apexName: "x", verified: true }),
}));

vi.mock("@/lib/config", () => ({
  get FEATURES() {
    return { useDomainPurchase: vercelState.purchaseEnabled };
  },
  SECRETS: { stripeSecretKey: "sk_test" },
  URLS: { baseUrl: "https://example.test" },
}));

vi.mock("@/lib/domains/dns-availability", () => ({
  checkAvailabilityViaDns: async () => null,
}));

const { resolveDomainOffer } = await import("./index");

beforeEach(() => {
  loopiaState.configured = true;
  loopiaState.status = "OK";
  vercelState.configured = true;
  vercelState.priceUsd = 10;
  vercelState.available = true;
  vercelState.purchaseEnabled = true;
  vercelState.throwOnPrice = false;
});

describe("resolveDomainOffer", () => {
  it("sells a free .com on a binding registrar quote", async () => {
    const offer = await resolveDomainOffer("mitt-bygge.com");
    expect(offer.available).toBe(true);
    expect(offer.quote.binding).toBe(true);
    expect(offer.purchasable).toBe(true);
    expect(offer.purchaseBlockedReason).toBeNull();
    expect(offer.fulfilmentRegistrar).toBe("vercel");
  });

  it("refuses to sell on an estimated price", async () => {
    vercelState.throwOnPrice = true;
    const offer = await resolveDomainOffer("mitt-bygge.com");
    // Availability still resolved, so the domain looks free — but the price is
    // a per-TLD reference figure and must not become a charge.
    expect(offer.available).toBe(true);
    expect(offer.quote.binding).toBe(false);
    expect(offer.quote.customerSek).not.toBeNull();
    expect(offer.purchasable).toBe(false);
    expect(offer.purchaseBlockedReason).toBe("no_binding_price");
    expect(offer.fulfilmentRegistrar).toBeNull();
  });

  it("prefers the TLD specialist for availability on .se", async () => {
    loopiaState.status = "DOMAIN_OCCUPIED";
    vercelState.available = true;
    const offer = await resolveDomainOffer("upptagen.se");
    expect(offer.availabilitySource).toBe("loopia");
    expect(offer.available).toBe(false);
    expect(offer.purchasable).toBe(false);
    expect(offer.purchaseBlockedReason).toBe("not_available");
  });

  it("does not let the specialist's missing price veto a registrar quote", async () => {
    // Loopia answers availability but never a price. The .se must still be
    // sellable when the generalist priced it — otherwise adding a specialist
    // for a TLD would silently remove the ability to sell that TLD.
    loopiaState.status = "OK";
    vercelState.priceUsd = 12;
    const offer = await resolveDomainOffer("ledig.se");
    expect(offer.availabilitySource).toBe("loopia");
    expect(offer.quote.binding).toBe(true);
    expect(offer.purchasable).toBe(true);
  });

  it("blocks the sale when purchases are switched off, and says so", async () => {
    vercelState.purchaseEnabled = false;
    const offer = await resolveDomainOffer("mitt-bygge.com");
    expect(offer.quote.binding).toBe(true);
    expect(offer.purchasable).toBe(false);
    expect(offer.purchaseBlockedReason).toBe("purchase_disabled");
  });

  it("does not guess when availability is unknown", async () => {
    loopiaState.configured = false;
    vercelState.available = null;
    const offer = await resolveDomainOffer("okant.com");
    expect(offer.available).toBeNull();
    expect(offer.purchasable).toBe(false);
    expect(offer.purchaseBlockedReason).toBe("unknown_availability");
  });

  it("normalises the domain before answering", async () => {
    const offer = await resolveDomainOffer("  MittBygge.COM  ");
    expect(offer.domain).toBe("mittbygge.com");
    expect(offer.tld).toBe("com");
  });
});
