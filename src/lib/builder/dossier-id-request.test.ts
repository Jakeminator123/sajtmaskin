import { describe, expect, it } from "vitest";
import {
  buildAddDossierMessage,
  detectRequestedDossierIds,
  mergeDossierIdCapabilities,
} from "./dossier-id-request";
import { detectFollowUpCapabilities } from "./follow-up-capability-detection";
import { getDossierById } from "@/lib/gen/dossiers/registry";

const EMPTY_DETECTION = {
  capabilities: [],
  capabilityIds: [],
  tierByCapability: {},
  wordCount: 0,
  referencesExistingCapability: false,
  modifyReferenceMatches: [],
};

describe("buildAddDossierMessage", () => {
  it("produces the deterministic catalog format with label + id", () => {
    expect(
      buildAddDossierMessage({ id: "stripe-checkout", label: "Stripe Checkout" }),
    ).toBe('Lägg till byggblocket "Stripe Checkout" (id: stripe-checkout)');
  });
});

describe("detectRequestedDossierIds", () => {
  it("extracts the id from a catalog-generated message", () => {
    expect(
      detectRequestedDossierIds('Lägg till byggblocket "Besöksstatistik" (id: vercel-analytics)'),
    ).toEqual(["vercel-analytics"]);
  });

  it("matches the indefinite form 'byggblock' too", () => {
    expect(
      detectRequestedDossierIds("Jag vill ha ett byggblock (id: gallery-lightbox) på sidan"),
    ).toEqual(["gallery-lightbox"]);
  });

  it("returns nothing without the byggblock keyword", () => {
    expect(detectRequestedDossierIds("Lägg till modulen (id: stripe-checkout)")).toEqual([]);
  });

  it("returns nothing when the id-marker is too far from the keyword", () => {
    const filler = "x".repeat(120);
    expect(
      detectRequestedDossierIds(`Lägg till byggblocket ${filler} (id: stripe-checkout)`),
    ).toEqual([]);
  });

  it("does not match inside a larger word (unicode boundary)", () => {
    expect(detectRequestedDossierIds("husbyggblocket (id: stripe-checkout)")).toEqual([]);
  });

  it("dedupes and lowercases multiple ids", () => {
    expect(
      detectRequestedDossierIds(
        'Lägg till byggblocket "A" (id: stripe-checkout) och byggblocket "B" (id: STRIPE-CHECKOUT) och byggblocket "C" (id: gallery-lightbox)',
      ),
    ).toEqual(["stripe-checkout", "gallery-lightbox"]);
  });
});

describe("mergeDossierIdCapabilities", () => {
  const resolver = (id: string) =>
    id === "stripe-checkout" ? "payments" : id === "gallery-lightbox" ? "gallery-lightbox" : null;

  it("maps (id: stripe-checkout) to the payments capability", () => {
    const merged = mergeDossierIdCapabilities(
      EMPTY_DETECTION,
      'Lägg till byggblocket "Stripe Checkout" (id: stripe-checkout)',
      resolver,
    );
    expect(merged.capabilityIds).toEqual(["payments"]);
    expect(merged.tierByCapability.payments).toBe("generic");
    expect(merged.capabilities[0]?.matchedKeywords).toEqual(["(id: stripe-checkout)"]);
  });

  it("ignores unknown ids (fail-safe: no capability)", () => {
    const merged = mergeDossierIdCapabilities(
      EMPTY_DETECTION,
      'Lägg till byggblocket "Okänt" (id: does-not-exist)',
      resolver,
    );
    expect(merged).toBe(EMPTY_DETECTION);
  });

  it("keeps the vocabulary tier when the capability was already detected", () => {
    const detection = {
      ...EMPTY_DETECTION,
      capabilities: [
        { capability: "payments", tier: "specific" as const, matchedKeywords: ["stripe"] },
      ],
      capabilityIds: ["payments"],
      tierByCapability: { payments: "specific" as const },
    };
    const merged = mergeDossierIdCapabilities(
      detection,
      'Lägg till byggblocket "Stripe Checkout" (id: stripe-checkout)',
      resolver,
    );
    expect(merged.capabilityIds).toEqual(["payments"]);
    expect(merged.tierByCapability.payments).toBe("specific");
  });

  it("does not recompute referencesExistingCapability (an id-request is an ADD)", () => {
    const detection = {
      ...EMPTY_DETECTION,
      modifyReferenceMatches: ["pricken"],
    };
    const merged = mergeDossierIdCapabilities(
      detection,
      'Lägg till byggblocket "Bildgalleri" (id: gallery-lightbox)',
      resolver,
    );
    expect(merged.capabilityIds).toEqual(["gallery-lightbox"]);
    expect(merged.referencesExistingCapability).toBe(false);
  });
});

describe("catalog prompt end-to-end (detectFollowUpCapabilities + pre-detector + real registry)", () => {
  const realResolver = (id: string) => getDossierById(id)?.capability ?? null;

  it("a label that matches no vocabulary still produces its capability via the id", () => {
    // "Besöksstatistik" alone hits the analytics vocabulary — but e.g.
    // "FAQ Accordion" (English label) matches nothing. The id carries it.
    const message = buildAddDossierMessage({
      id: "three-fiber-physics",
      label: "React Three Fiber Physics",
    });
    const merged = mergeDossierIdCapabilities(
      detectFollowUpCapabilities(message),
      message,
      realResolver,
    );
    expect(merged.capabilityIds).toContain("physics-3d");
  });

  it("stripe-checkout catalog pick produces payments", () => {
    const message = buildAddDossierMessage({ id: "stripe-checkout", label: "Stripe Checkout" });
    const merged = mergeDossierIdCapabilities(
      detectFollowUpCapabilities(message),
      message,
      realResolver,
    );
    expect(merged.capabilityIds).toContain("payments");
  });

  it("the renamed Besöksstatistik pick produces analytics deterministically via the id", () => {
    const message = buildAddDossierMessage({
      id: "vercel-analytics",
      label: "Besöksstatistik",
    });
    const merged = mergeDossierIdCapabilities(
      detectFollowUpCapabilities(message),
      message,
      realResolver,
    );
    expect(merged.capabilityIds).toContain("analytics");
  });
});
