/**
 * Validator tests — structural (AJV) + cross-cutting helpers.
 *
 * Hits all three gates the fas 2·D plan calls out:
 *   - invalid manifest returns { valid: false, errors }
 *   - id-mismatch catches curator mistakes
 *   - defaultForCapability uniqueness
 *   - instructions.md heading check
 */
import { describe, it, expect } from "vitest";

import {
  findDuplicateDefaults,
  findMissingInstructionsHeadings,
  findMissingInstructionsHeadingsPartitioned,
  RECOMMENDED_INSTRUCTIONS_HEADINGS,
  REQUIRED_INSTRUCTIONS_HEADINGS,
  validateDossierManifest,
} from "./validate-manifest";

const VALID_MANIFEST = {
  $schema: "../../../../docs/schemas/strict/dossier.schema.json",
  id: "example-dossier",
  label: "Example Dossier",
  capability: "payments",
  codeFidelity: "rewritable" as const,
  complexity: "simple" as const,
  defaultForCapability: false,
  summary:
    "A placeholder example dossier used in tests. Demonstrates the minimum shape that passes AJV validation without envVars, files, or exposes.",
  lastVerified: "2026-04-23",
};

describe("validateDossierManifest — happy path", () => {
  it("accepts a minimal valid manifest", () => {
    const result = validateDossierManifest(VALID_MANIFEST, {
      expectedId: "example-dossier",
      class: "soft",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.capability).toBe("payments");
      expect(result.warnings).toEqual([]);
    }
  });
});

describe("validateDossierManifest — schema failures", () => {
  it("rejects manifest with missing required field", () => {
    const broken = { ...VALID_MANIFEST } as Record<string, unknown>;
    delete broken.capability;
    const result = validateDossierManifest(broken, {
      expectedId: "example-dossier",
      class: "soft",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("capability"))).toBe(true);
    }
  });

  it("rejects manifest with wrong-shape codeFidelity", () => {
    const broken = { ...VALID_MANIFEST, codeFidelity: "bogus" };
    const result = validateDossierManifest(broken, {
      expectedId: "example-dossier",
      class: "soft",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects non-kebab-case id", () => {
    const broken = { ...VALID_MANIFEST, id: "BadID" };
    const result = validateDossierManifest(broken, {
      expectedId: "BadID",
      class: "soft",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects non-object top-level input", () => {
    const result = validateDossierManifest("not an object", {
      expectedId: "example-dossier",
      class: "soft",
    });
    expect(result.valid).toBe(false);
  });
});

describe("validateDossierManifest — id/directory mismatch", () => {
  it("rejects when manifest.id diverges from directory name", () => {
    const result = validateDossierManifest(VALID_MANIFEST, {
      expectedId: "different-name",
      class: "soft",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("does not match directory name")),
      ).toBe(true);
    }
  });
});

describe("findDuplicateDefaults", () => {
  it("returns [] when each capability has ≤1 default", () => {
    expect(
      findDuplicateDefaults([
        { id: "a", capability: "payments", defaultForCapability: true },
        { id: "b", capability: "payments", defaultForCapability: false },
        { id: "c", capability: "ai-chat", defaultForCapability: true },
      ]),
    ).toEqual([]);
  });

  it("flags capabilities with >1 default", () => {
    const errors = findDuplicateDefaults([
      { id: "stripe", capability: "payments", defaultForCapability: true },
      { id: "klarna", capability: "payments", defaultForCapability: true },
    ]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("payments");
    expect(errors[0]).toContain("klarna");
    expect(errors[0]).toContain("stripe");
  });
});

describe("findMissingInstructionsHeadings (required-only back-compat)", () => {
  it("returns [] when all required headings are present", () => {
    const md = REQUIRED_INSTRUCTIONS_HEADINGS.map((h) => `# ${h}\n\nBody.\n`).join("\n");
    expect(findMissingInstructionsHeadings(md)).toEqual([]);
  });

  it("is case-insensitive", () => {
    const md = REQUIRED_INSTRUCTIONS_HEADINGS.map((h) => `# ${h.toUpperCase()}\n`).join("\n");
    expect(findMissingInstructionsHeadings(md)).toEqual([]);
  });

  it("ignores H2+ headings", () => {
    const md = `## When to use\n\nsome text\n`;
    const missing = findMissingInstructionsHeadings(md);
    expect(missing).toContain("When to use");
  });

  it("lists only missing required headings (not recommended)", () => {
    const md = `# When to use\n\nbody\n`;
    expect(findMissingInstructionsHeadings(md)).toEqual(["How to integrate"]);
  });
});

describe("findMissingInstructionsHeadingsPartitioned", () => {
  it("splits into required + recommended missing", () => {
    const md = `# When to use\n\nbody\n# How to integrate\n`;
    const result = findMissingInstructionsHeadingsPartitioned(md);
    expect(result.missingRequired).toEqual([]);
    expect(result.missingRecommended.sort()).toEqual(
      [...RECOMMENDED_INSTRUCTIONS_HEADINGS].sort(),
    );
  });

  it("matches substring so 'Verification checklist (…)' satisfies 'Verification'", () => {
    const md = `# When to use\n# How to integrate\n# Verification checklist (per lastVerified)\n`;
    const result = findMissingInstructionsHeadingsPartitioned(md);
    expect(result.missingRecommended).not.toContain("Verification");
  });
});
