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

  it("groups the documented capability buckets as expected", () => {
    expect(resolveDossierGroup("database").label).toBe("Data & lagring");
    expect(resolveDossierGroup("payments").label).toBe("Betalningar");
    expect(resolveDossierGroup("contact-form").label).toBe("E-post & utskick");
    expect(resolveDossierGroup("newsletter-subscribe").label).toBe("E-post & utskick");
    expect(resolveDossierGroup("analytics").label).toBe("Analys & övervakning");
    expect(resolveDossierGroup("error-tracking").label).toBe("Analys & övervakning");
    expect(resolveDossierGroup("ai-chat").label).toBe("AI");
    expect(resolveDossierGroup("ai-tool-calling").label).toBe("AI");
    expect(resolveDossierGroup("image-generation").label).toBe("AI");
    expect(resolveDossierGroup("auth").label).toBe("Inloggning");
    expect(resolveDossierGroup("realtime").label).toBe("Realtid");
    expect(resolveDossierGroup("visual-3d").label).toBe("Innehåll & sektioner");
    expect(resolveDossierGroup("cta-section").label).toBe("Innehåll & sektioner");
  });

  it("every mapped group id is present in the render order", () => {
    const orderIds = new Set(DOSSIER_GROUP_ORDER.map((group) => group.id));
    for (const group of Object.values(DOSSIER_GROUPS)) {
      expect(orderIds.has(group.id)).toBe(true);
    }
  });
});
