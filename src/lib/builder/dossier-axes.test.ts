import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  describeDossierClass,
  describeDossierMockMode,
  describeF3Requirement,
} from "./dossier-axes";

/**
 * The demo-mode enum is owned by the strict manifest schema. Deriving the
 * coverage check from it (instead of a hand-listed array here) means a NEW
 * mock mode fails this test with its own name rather than silently rendering
 * as "Ingen demo-yta" in the builder — the same manifest-derived pattern as
 * `dossier-client-mount.test.tsx`.
 */
function schemaMockModes(): string[] {
  const path = join(process.cwd(), "docs", "schemas", "strict", "dossier.schema.json");
  const schema = JSON.parse(readFileSync(path, "utf8")) as {
    properties?: { mock?: { enum?: string[] } };
  };
  return schema.properties?.mock?.enum ?? [];
}

describe("dossier-axes", () => {
  it("gives every mock mode in the strict schema its own label and hint", () => {
    const modes = schemaMockModes();
    expect(modes.length).toBeGreaterThan(0);

    const labels = new Set<string>();
    for (const mode of modes) {
      const descriptor = describeDossierMockMode(mode as never);
      expect({ mode, label: descriptor.label }).not.toEqual({ mode, label: "" });
      expect(descriptor.hint.length).toBeGreaterThan(20);
      if (mode !== "none") {
        // A mode that silently reuses the "none" copy would tell the user the
        // surface is dead when it actually renders something.
        expect({ mode, label: descriptor.label }).not.toEqual({
          mode,
          label: describeDossierMockMode("none").label,
        });
      }
      labels.add(descriptor.label);
    }
    expect(labels.size).toBe(modes.length);
  });

  it("treats an omitted mock field as 'none', exactly like runtime", () => {
    expect(describeDossierMockMode(undefined)).toEqual(describeDossierMockMode("none"));
    expect(describeDossierMockMode(null)).toEqual(describeDossierMockMode("none"));
  });

  it("uses the user-facing Kopplad/Fristående wording, never hård/mjuk", () => {
    expect(describeDossierClass("hard").label).toBe("Kopplad");
    expect(describeDossierClass("soft").label).toBe("Fristående");
    for (const dossierClass of ["hard", "soft"] as const) {
      expect(describeDossierClass(dossierClass).hint.toLowerCase()).not.toContain("hård");
      expect(describeDossierClass(dossierClass).hint.toLowerCase()).not.toContain("mjuk");
    }
  });

  it("does not claim a Kopplad dossier is missing from the preview", () => {
    // The whole point of the mock contract: a hard dossier is always injected
    // and degrades — the copy must not say the opposite.
    expect(describeDossierClass("hard").hint).toContain("läggs ändå alltid in");
  });

  it("names the F3 step for a dossier that requires it, and says so plainly when it does not", () => {
    expect(describeF3Requirement(true).label).toBe("Kräver F3");
    expect(describeF3Requirement(true).hint).toContain("Bygg integrationer");
    expect(describeF3Requirement(false).label).not.toBe(describeF3Requirement(true).label);
  });
});
