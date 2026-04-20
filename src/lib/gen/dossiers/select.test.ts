/**
 * Sanity tests for the dossier selection pipeline.
 *
 * These tests do NOT call the real OpenAI API. They use the
 * recommendation-only fallback path (no API key passed → no embedding
 * call), which is deterministic and exercises the boost logic.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

import { selectDossiersForRequest } from "./select";
import * as registry from "./registry";
import type {
  DossierEmbeddingsFile,
  DossierEntry,
  ScaffoldRecommendationsFile,
} from "./types";

const STRIPE: DossierEntry = {
  id: "payments-stripe-checkout",
  kind: "integration",
  category: "payments",
  label: "Stripe Checkout",
  description: "Hosted checkout via Stripe.",
  summary: "One-time and subscription payments via Stripe Checkout.",
  dependencies: ["stripe", "@stripe/stripe-js"],
  files: [],
  scaffoldFit: { primary: ["ecommerce"], compatible: ["landing-page"] },
  complexity: "medium",
  qualityScore: 95,
  lastVerified: "2026-04-17",
  tags: ["payments", "stripe"],
  _source: "hand-curated",
};

const PRICING: DossierEntry = {
  id: "ui-pricing-tier-table",
  kind: "ui-section",
  category: "ui-marketing",
  label: "Pricing Tier Table",
  description: "Three-column pricing table with feature checklist.",
  summary: "Standard pricing-section pattern with 2-4 plans.",
  dependencies: ["lucide-react"],
  files: [],
  scaffoldFit: { primary: ["saas-landing"], compatible: ["landing-page"] },
  complexity: "simple",
  qualityScore: 90,
  lastVerified: "2026-04-17",
  tags: ["pricing", "marketing"],
  _source: "hand-curated",
};

const DRAFT: DossierEntry = {
  id: "draft-not-yet-active",
  kind: "integration",
  category: "auth",
  label: "Draft Auth Thing",
  description: "A draft, should never surface to runtime.",
  summary: "draft",
  dependencies: [],
  files: [],
  scaffoldFit: { primary: ["auth-pages"], compatible: [] },
  complexity: "simple",
  lastVerified: "2026-04-17",
  tags: ["auth"],
  _source: "vercel-enriched",
  _status: "draft",
};

describe("selectDossiersForRequest (recommendation-only fallback)", () => {
  beforeEach(() => {
    registry.clearDossierRegistryCache();
    vi.spyOn(registry, "getActiveDossiers").mockReturnValue([STRIPE, PRICING]);
    vi.spyOn(registry, "getDossierById").mockImplementation((id) =>
      [STRIPE, PRICING, DRAFT].find((d) => d.id === id) ?? null,
    );
    vi.spyOn(registry, "getDossierEmbeddings").mockReturnValue(null);
    vi.spyOn(registry, "getDossierInstructions").mockReturnValue("");
    delete process.env.OPENAI_API_KEY;
  });

  it("returns alwaysInclude dossiers regardless of any other signal", async () => {
    vi.spyOn(registry, "getScaffoldRecommendations").mockReturnValue({
      alwaysInclude: ["payments-stripe-checkout"],
      primaryRecommended: [],
      suggested: [],
    });

    const result = await selectDossiersForRequest({
      prompt: "build a portfolio site for a photographer",
      scaffoldId: "portfolio",
    });

    expect(result.selected.map((s) => s.entry.id)).toContain("payments-stripe-checkout");
    expect(result.selected.find((s) => s.entry.id === "payments-stripe-checkout")?.reason).toBe(
      "alwaysInclude",
    );
    expect(result.embeddingsUsed).toBe(false);
  });

  it("falls back to primaryRecommended + suggested when no embeddings + no API key", async () => {
    vi.spyOn(registry, "getScaffoldRecommendations").mockReturnValue({
      alwaysInclude: [],
      primaryRecommended: ["payments-stripe-checkout"],
      suggested: ["ui-pricing-tier-table"],
    });

    const result = await selectDossiersForRequest({
      prompt: "saas landing page",
      scaffoldId: "saas-landing",
    });

    expect(result.selected.length).toBe(2);
    expect(result.embeddingsUsed).toBe(false);

    const stripe = result.selected.find((s) => s.entry.id === "payments-stripe-checkout");
    const pricing = result.selected.find((s) => s.entry.id === "ui-pricing-tier-table");
    expect(stripe?.reason).toBe("recommendation-only");
    expect(pricing?.reason).toBe("recommendation-only");
    // primary > suggested in score
    expect(stripe!.score).toBeGreaterThan(pricing!.score);
  });

  it("never surfaces draft dossiers via getDossierById fallback", async () => {
    vi.spyOn(registry, "getScaffoldRecommendations").mockReturnValue({
      alwaysInclude: ["draft-not-yet-active"],
      primaryRecommended: [],
      suggested: [],
    });

    const result = await selectDossiersForRequest({
      prompt: "anything",
      scaffoldId: "auth-pages",
    });

    expect(result.selected.map((s) => s.entry.id)).not.toContain("draft-not-yet-active");
  });

  it("returns empty selection when no active dossiers in pool", async () => {
    vi.spyOn(registry, "getActiveDossiers").mockReturnValue([]);
    vi.spyOn(registry, "getScaffoldRecommendations").mockReturnValue(null);

    const result = await selectDossiersForRequest({
      prompt: "anything",
      scaffoldId: "ecommerce",
    });

    expect(result.selected).toEqual([]);
    expect(result.poolSize).toBe(0);
  });

  it("caps total selection per maxTotal option", async () => {
    vi.spyOn(registry, "getScaffoldRecommendations").mockReturnValue({
      alwaysInclude: [],
      primaryRecommended: ["payments-stripe-checkout", "ui-pricing-tier-table"],
      suggested: [],
    });

    const result = await selectDossiersForRequest({
      prompt: "saas landing",
      scaffoldId: "saas-landing",
      maxTotal: 1,
    });

    expect(result.selected.length).toBe(1);
  });
});

describe("selectDossiersForRequest with embeddings present but no API key", () => {
  beforeEach(() => {
    registry.clearDossierRegistryCache();
    vi.spyOn(registry, "getActiveDossiers").mockReturnValue([STRIPE]);
    vi.spyOn(registry, "getDossierById").mockReturnValue(STRIPE);
    vi.spyOn(registry, "getDossierInstructions").mockReturnValue("");
    vi.spyOn(registry, "getDossierEmbeddings").mockReturnValue({
      _meta: { model: "text-embedding-3-small", dimensions: 1536, generated: "x", sourceMasterGenerated: "x", count: 1 },
      embeddings: [{ id: STRIPE.id, kind: "integration", category: "payments", embedding: new Array(1536).fill(0.1) }],
    } as DossierEmbeddingsFile);
    vi.spyOn(registry, "getScaffoldRecommendations").mockReturnValue({
      alwaysInclude: [],
      primaryRecommended: [STRIPE.id],
      suggested: [],
    } as ScaffoldRecommendationsFile["scaffolds"][string]);
    delete process.env.OPENAI_API_KEY;
  });

  it("falls back gracefully to recommendation-only when API key is missing", async () => {
    const result = await selectDossiersForRequest({
      prompt: "anything",
      scaffoldId: "ecommerce",
    });
    expect(result.embeddingsUsed).toBe(false);
    expect(result.selected.map((s) => s.entry.id)).toContain(STRIPE.id);
    expect(result.selected[0]?.reason).toBe("recommendation-only");
  });
});
