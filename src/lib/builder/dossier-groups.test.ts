import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOSSIER_GROUPS,
  DOSSIER_GROUP_ORDER,
  resolveDossierGroup,
} from "./dossier-groups";

interface CapabilityMapFile {
  capabilities?: Record<string, unknown>;
  groups?: Record<string, { label?: string; capabilities?: string[] }>;
}

function readCapabilityMap(): CapabilityMapFile {
  const path = join(process.cwd(), "data", "dossiers", "_index", "capability-map.json");
  return JSON.parse(readFileSync(path, "utf8")) as CapabilityMapFile;
}

function readCapabilityMapCapabilities(): string[] {
  return Object.keys(readCapabilityMap().capabilities ?? {});
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
    expect(resolveDossierGroup("PAYMENTS").id).toBe("commerce");
    expect(resolveDossierGroup("  database  ").id).toBe("data-content");
    expect(resolveDossierGroup("").id).toBe("other");
    expect(resolveDossierGroup(null).id).toBe("other");
    expect(resolveDossierGroup(undefined).id).toBe("other");
  });

  it("matches the documented capability→group table exactly (docs/contracts/dossier-system.md)", () => {
    // Full canonical mapping — one entry per capability in the docs table.
    // A capability landing in the wrong bucket (not just "Övrigt") must fail.
    const expectedGroupByCapability: Record<string, string> = {
      database: "data-content",
      cms: "data-content",
      auth: "auth",
      payments: "commerce",
      subscriptions: "commerce",
      "contact-form": "contact",
      "newsletter-subscribe": "contact",
      "ai-chat": "ai",
      "ai-tool-calling": "ai",
      "rag-chat": "ai",
      "image-generation": "ai",
      "site-search": "search-maps",
      "map-display": "search-maps",
      "command-palette": "search-maps",
      "gallery-lightbox": "media",
      carousel: "media",
      "visual-3d": "interactive",
      "physics-3d": "interactive",
      "interactive-game": "interactive",
      "dashboard-charts": "interactive",
      realtime: "ops",
      analytics: "ops",
      "error-tracking": "ops",
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
    expect(resolveDossierGroup("database").label).toBe("Data & innehåll");
    expect(resolveDossierGroup("auth").label).toBe("Inloggning & konton");
    expect(resolveDossierGroup("payments").label).toBe("Betalning & handel");
    expect(resolveDossierGroup("contact-form").label).toBe("Kontakt & utskick");
    expect(resolveDossierGroup("ai-chat").label).toBe("AI");
    expect(resolveDossierGroup("site-search").label).toBe("Sök & karta");
    expect(resolveDossierGroup("carousel").label).toBe("Media & galleri");
    expect(resolveDossierGroup("visual-3d").label).toBe("Interaktivt & 3D");
    expect(resolveDossierGroup("realtime").label).toBe("Realtid & drift");
    expect(resolveDossierGroup("analytics").label).toBe("Realtid & drift");
  });

  it("has 10 groups in the documented order", () => {
    expect(DOSSIER_GROUP_ORDER.map((group) => group.id)).toEqual([
      "data-content",
      "auth",
      "commerce",
      "contact",
      "ai",
      "search-maps",
      "media",
      "interactive",
      "ops",
      "other",
    ]);
  });

  it("every mapped group id is present in the render order", () => {
    const orderIds = new Set(DOSSIER_GROUP_ORDER.map((group) => group.id));
    for (const group of Object.values(DOSSIER_GROUPS)) {
      expect(orderIds.has(group.id)).toBe(true);
    }
  });

  it("the committed capability-map `groups` view matches this canonical map (drift-guard)", () => {
    // Guards the generated view backoffice reads: labels, group order and
    // per-capability placement must equal what resolveDossierGroup computes.
    // Fails when dossier-groups.ts changes without `dossiers:capability-map:write`.
    const map = readCapabilityMap();
    expect(map.groups, "groups view missing — run npm run dossiers:capability-map:write").toBeTruthy();
    const groups = map.groups ?? {};

    expect(Object.keys(groups)).toEqual(DOSSIER_GROUP_ORDER.map((group) => group.id));
    for (const group of DOSSIER_GROUP_ORDER) {
      expect(groups[group.id]?.label).toBe(group.label);
    }
    for (const [groupId, info] of Object.entries(groups)) {
      for (const capability of info.capabilities ?? []) {
        expect({ capability, group: resolveDossierGroup(capability).id }).toEqual({
          capability,
          group: groupId,
        });
      }
    }
    const listed = Object.values(groups).flatMap((info) => info.capabilities ?? []);
    expect([...listed].sort()).toEqual(readCapabilityMapCapabilities().sort());
  });
});
