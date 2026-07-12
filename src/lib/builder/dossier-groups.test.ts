import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOSSIER_GROUPS,
  DOSSIER_GROUP_ORDER,
  resolveDossierGroup,
} from "./dossier-groups";

function readCapabilityMapCapabilities(): string[] {
  const path = join(process.cwd(), "data", "dossiers", "_index", "capability-map.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    capabilities?: Record<string, unknown>;
  };
  return Object.keys(parsed.capabilities ?? {});
}

describe("resolveDossierGroup", () => {
  it("assigns every capability in capability-map.json to a real (non-Övrigt) group", () => {
    const capabilities = readCapabilityMapCapabilities();
    expect(capabilities.length).toBeGreaterThan(0);
    const unassigned = capabilities.filter(
      (capability) => resolveDossierGroup(capability).id === "other",
    );
    expect(unassigned).toEqual([]);
  });

  it("falls back to 'Övrigt' for an unknown capability", () => {
    const group = resolveDossierGroup("some-capability-that-does-not-exist");
    expect(group.id).toBe("other");
    expect(group.label).toBe("Övrigt");
  });

  it("is case-insensitive and tolerates empty/nullish input", () => {
    expect(resolveDossierGroup("PAYMENTS").id).toBe("payments");
    expect(resolveDossierGroup("  database  ").id).toBe("data-storage");
    expect(resolveDossierGroup("").id).toBe("other");
    expect(resolveDossierGroup(null).id).toBe("other");
    expect(resolveDossierGroup(undefined).id).toBe("other");
  });

  it("matches the documented capability→group table exactly (docs/contracts/dossier-system.md)", () => {
    // Full canonical mapping — one entry per capability in the docs table.
    // A capability landing in the wrong bucket (not just "Övrigt") must fail.
    const expectedGroupByCapability: Record<string, string> = {
      database: "data-storage",
      cms: "data-storage",
      payments: "payments",
      subscriptions: "payments",
      auth: "auth",
      "supabase-auth": "auth",
      "ai-chat": "ai",
      "ai-tool-calling": "ai",
      "rag-chat": "ai",
      "image-generation": "ai",
      "contact-form": "email",
      "newsletter-subscribe": "email",
      analytics: "analytics",
      "error-tracking": "analytics",
      realtime: "realtime",
      "cta-section": "content",
      "faq-section": "content",
      "pricing-section": "content",
      "testimonials-section": "content",
      "feature-grid": "content",
      "stats-counter": "content",
      stepper: "content",
      "logo-cloud": "content",
      carousel: "visual-interaction",
      marquee: "visual-interaction",
      "gallery-lightbox": "visual-interaction",
      "parallax-scroll": "visual-interaction",
      "parallax-pointer": "visual-interaction",
      "visual-3d": "visual-interaction",
      "physics-3d": "visual-interaction",
      "interactive-game": "visual-interaction",
      "dashboard-charts": "visual-interaction",
      "command-search": "visual-interaction",
    };

    for (const [capability, expectedGroupId] of Object.entries(expectedGroupByCapability)) {
      expect({ capability, group: resolveDossierGroup(capability).id }).toEqual({
        capability,
        group: expectedGroupId,
      });
    }

    // Every capability in the generated capability-map must be covered by the
    // canonical table above — a NEW capability without a decided bucket fails
    // here instead of silently landing in "Övrigt".
    const mapped = new Set(Object.keys(expectedGroupByCapability));
    const uncovered = readCapabilityMapCapabilities().filter((cap) => !mapped.has(cap));
    expect(uncovered).toEqual([]);
  });

  it("uses the documented Swedish labels", () => {
    expect(resolveDossierGroup("database").label).toBe("Data & lagring");
    expect(resolveDossierGroup("payments").label).toBe("Betalningar");
    expect(resolveDossierGroup("auth").label).toBe("Inloggning & konton");
    expect(resolveDossierGroup("supabase-auth").label).toBe("Inloggning & konton");
    expect(resolveDossierGroup("ai-chat").label).toBe("AI");
    expect(resolveDossierGroup("contact-form").label).toBe("E-post & utskick");
    expect(resolveDossierGroup("analytics").label).toBe("Analys & övervakning");
    expect(resolveDossierGroup("realtime").label).toBe("Realtid");
    expect(resolveDossierGroup("cta-section").label).toBe("Innehåll & sektioner");
    expect(resolveDossierGroup("carousel").label).toBe("Visuellt & interaktion");
  });

  it("has 10 groups in the documented order", () => {
    expect(DOSSIER_GROUP_ORDER.map((group) => group.id)).toEqual([
      "data-storage",
      "payments",
      "auth",
      "ai",
      "email",
      "analytics",
      "realtime",
      "content",
      "visual-interaction",
      "other",
    ]);
  });

  it("every mapped group id is present in the render order", () => {
    const orderIds = new Set(DOSSIER_GROUP_ORDER.map((group) => group.id));
    for (const group of Object.values(DOSSIER_GROUPS)) {
      expect(orderIds.has(group.id)).toBe(true);
    }
  });
});
