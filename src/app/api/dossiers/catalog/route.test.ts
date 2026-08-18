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
    expect(stripe?.envVars).toEqual([{ key: "STRIPE_SECRET_KEY", required: true }]);
    expect(stripe?.groupLabel).toBe("Betalning & handel");

    const searchMaps = body.groups.find((group) => group.id === "search-maps");
    expect(searchMaps?.dossiers).toHaveLength(1);
    expect(searchMaps?.dossiers[0]?.id).toBe("local-site-search");
  });

  // Katalogen är en VALYTA: användaren måste kunna se att den riktiga
  // integrationen byggs i F3 innan hen väljer byggblocket. hard/soft svarar
  // inte på den frågan — `dossierRequiresF3()` gör det (build-nyckel ELLER
  // serverfil), och routen får aldrig re-implementera den regeln.
  it("carries the derived F3 requirement and the demo mode per entry", async () => {
    getAllDossiers.mockReturnValue([
      // Build-enforced key ⇒ kräver F3 via env-vägen.
      dossier({
        id: "clerk-auth",
        capability: "auth",
        mock: "visual",
        envVars: [
          { key: "CLERK_SECRET_KEY", required: true, purpose: "auth", enforcement: "build" },
        ],
      }),
      // Inga build-nycklar men en serverfil ⇒ kräver F3 via server-vägen.
      dossier({
        id: "resend-contact-form",
        capability: "contact-form",
        mock: "success",
        envVars: [
          { key: "RESEND_API_KEY", required: true, purpose: "mail", enforcement: "feature-runtime" },
        ],
        files: [{ path: "components/api/contact/route.ts", role: "server" }],
      }),
      // Kopplad, men klientfil + feature-runtime ⇒ klar redan i F2.
      dossier({
        id: "vercel-analytics",
        capability: "analytics",
        envVars: [
          { key: "ANALYTICS_ID", required: false, purpose: "id", enforcement: "warn-only" },
        ],
        files: [{ path: "components/analytics.tsx", role: "client" }],
      }),
    ]);

    const body = (await (await GET()).json()) as DossierCatalogResponse;
    const byId = new Map(
      body.groups.flatMap((group) => group.dossiers).map((entry) => [entry.id, entry]),
    );

    expect(byId.get("clerk-auth")?.requiresF3).toBe(true);
    expect(byId.get("resend-contact-form")?.requiresF3).toBe(true);
    expect(byId.get("vercel-analytics")?.requiresF3).toBe(false);
    expect(byId.get("resend-contact-form")?.mock).toBe("success");
    // Utelämnat manifestfält lämnas utelämnat — konsumenten tolkar det som
    // `none`, precis som runtime gör.
    expect(byId.get("vercel-analytics")?.mock).toBeUndefined();
    expect(byId.get("clerk-auth")?.envVars).toEqual([
      { key: "CLERK_SECRET_KEY", required: true },
    ]);
    expect(byId.get("resend-contact-form")?.envVars).toEqual([
      { key: "RESEND_API_KEY", required: true },
    ]);
  });

  it("forwards setupUrl on catalog envVars and never includes values or purpose", async () => {
    getAllDossiers.mockReturnValue([
      dossier({
        envVars: [
          {
            key: "STRIPE_SECRET_KEY",
            required: true,
            purpose: "secret — must not leak",
            setupUrl: "https://dashboard.stripe.com/apikeys",
          },
        ],
      }),
    ]);

    const body = (await (await GET()).json()) as DossierCatalogResponse;
    const stripe = body.groups.flatMap((group) => group.dossiers)[0];
    expect(stripe?.envVars).toEqual([
      {
        key: "STRIPE_SECRET_KEY",
        required: true,
        setupUrl: "https://dashboard.stripe.com/apikeys",
      },
    ]);
    expect(JSON.stringify(stripe)).not.toContain("secret — must not leak");
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
