import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DossierEntry } from "@/lib/gen/dossiers/types";

const getAllDossiers = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/dossiers/registry", () => ({
  getAllDossiers,
}));

import { GET } from "./route";
import type { DossierCatalogResponse } from "@/lib/builder/dossier-catalog";

function dossier(overrides: Partial<DossierEntry> = {}): DossierEntry {
  return {
    class: "hard",
    id: "stripe-checkout",
    label: "Stripe Checkout",
    capability: "payments",
    codeFidelity: "verbatim",
    complexity: "medium",
    defaultForCapability: true,
    summary: "Stripe Checkout-integration.",
    envVars: [{ key: "STRIPE_SECRET_KEY", required: true, purpose: "API-nyckel" }],
    lastVerified: "2026-01-01",
    ...overrides,
  };
}

describe("GET /api/dossiers/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups every registry dossier by its presentation capability group", async () => {
    getAllDossiers.mockReturnValue([
      dossier(),
      dossier({
        id: "klarna-checkout",
        label: "Klarna Checkout",
        capability: "payments",
        class: "hard",
        envVars: [],
      }),
      dossier({
        id: "local-site-search",
        label: "Sök på sajten (lokal)",
        capability: "site-search",
        class: "soft",
        complexity: "simple",
        summary: "Lokal sökfunktion utan nycklar.",
        envVars: [],
      }),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierCatalogResponse;

    expect(body.success).toBe(true);
    expect(body.total).toBe(3);

    const commerce = body.groups.find((group) => group.id === "commerce");
    expect(commerce).toBeTruthy();
    expect(commerce?.label).toBe("Betalning & handel");
    expect(commerce?.dossiers.map((d) => d.id).sort()).toEqual([
      "klarna-checkout",
      "stripe-checkout",
    ]);

    const stripe = commerce?.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe?.class).toBe("hard");
    expect(stripe?.envVarCount).toBe(1);
    expect(stripe?.groupLabel).toBe("Betalning & handel");

    const searchMaps = body.groups.find((group) => group.id === "search-maps");
    expect(searchMaps?.dossiers).toHaveLength(1);
    expect(searchMaps?.dossiers[0]?.id).toBe("local-site-search");
  });

  it("omits empty groups and returns an empty catalog when the registry is empty", async () => {
    getAllDossiers.mockReturnValue([]);

    const res = await GET();
    const body = (await res.json()) as DossierCatalogResponse;

    expect(body.total).toBe(0);
    expect(body.groups).toEqual([]);
  });

  it("sets a cache-friendly response header (static filesystem data)", async () => {
    getAllDossiers.mockReturnValue([dossier()]);
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });
});
