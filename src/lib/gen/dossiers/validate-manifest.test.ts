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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findDuplicateDefaults,
  findMissingInstructionsHeadings,
  findMissingInstructionsHeadingsPartitioned,
  findModuleLevelSdkConstructions,
  RECOMMENDED_INSTRUCTIONS_HEADINGS,
  REQUIRED_INSTRUCTIONS_HEADINGS,
  validateDossierImportClosure,
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

describe("findModuleLevelSdkConstructions (B5-standard)", () => {
  function withTempDossier(
    source: string,
    run: (root: string) => void,
  ): void {
    const tempRoot = mkdtempSync(join(tmpdir(), "dossier-sdk-init-"));
    try {
      mkdirSync(join(tempRoot, "components/api/checkout"), { recursive: true });
      writeFileSync(join(tempRoot, "components/api/checkout/route.ts"), source, "utf8");
      run(tempRoot);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  const manifest = {
    files: [{ path: "components/api/checkout/route.ts", role: "server" as const }],
    dependencies: ["stripe", "@supabase/supabase-js"],
  };

  it("flaggar modulnivå-new av dependency-SDK (Codex P1-klassen på #374)", () => {
    withTempDossier(
      `import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

export async function POST() {
  return Response.json({ ok: true });
}
`,
      (root) => {
        const issues = findModuleLevelSdkConstructions(manifest, root);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
          dossierFile: "components/api/checkout/route.ts",
          identifier: "Stripe",
          packageName: "stripe",
        });
      },
    );
  });

  it("flaggar modulnivå-fabrik (createClient) från dependency-paket", () => {
    withTempDossier(
      `import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(process.env.SUPABASE_URL ?? "", "anon");

export async function POST() {
  return Response.json({ ok: true });
}
`,
      (root) => {
        const issues = findModuleLevelSdkConstructions(manifest, root);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
          identifier: "createClient",
          packageName: "@supabase/supabase-js",
        });
      },
    );
  });

  it("accepterar lazy init inne i handlern efter env-guard", () => {
    withTempDossier(
      `import Stripe from "stripe";

export async function POST() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return Response.json({ error: "payments-not-configured" }, { status: 503 });
  }
  const stripe = new Stripe(secretKey);
  return Response.json({ ok: Boolean(stripe) });
}
`,
      (root) => {
        expect(findModuleLevelSdkConstructions(manifest, root)).toEqual([]);
      },
    );
  });

  it("flaggar inte inbyggda konstruktorer eller icke-dependency-paket", () => {
    withTempDossier(
      `import { z } from "zod";

const schema = z.object({});
const cache = new Map<string, string>();
const enc = new TextEncoder();

export async function POST() {
  return Response.json({ ok: Boolean(schema && cache && enc) });
}
`,
      (root) => {
        expect(findModuleLevelSdkConstructions(manifest, root)).toEqual([]);
      },
    );
  });

  it("flaggar inte env-FRIA modulnivå-fabriker (createRouteMatcher-mönstret)", () => {
    withTempDossier(
      `import { createRouteMatcher } from "@supabase/supabase-js";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
]);

export async function POST() {
  return Response.json({ ok: Boolean(isProtectedRoute) });
}
`,
      (root) => {
        expect(findModuleLevelSdkConstructions(manifest, root)).toEqual([]);
      },
    );
  });

  it("ignorerar type-only-imports", () => {
    withTempDossier(
      `import type Stripe from "stripe";

const kind: Stripe.Checkout.Session["mode"] | null = null;

export async function POST() {
  return Response.json({ kind });
}
`,
      (root) => {
        expect(findModuleLevelSdkConstructions(manifest, root)).toEqual([]);
      },
    );
  });
});

describe("validateDossierImportClosure", () => {
  it("returnerar inga issues för three-fiber-canvas", () => {
    const manifest = JSON.parse(
      readFileSync("data/dossiers/soft/three-fiber-canvas/manifest.json", "utf8"),
    );
    const issues = validateDossierImportClosure(
      manifest,
      "data/dossiers/soft/three-fiber-canvas",
      new Set(["app/page.tsx", "app/layout.tsx"]),
    );
    expect(issues).toEqual([]);
  });

  it("flaggar saknad transitive import", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "dossier-import-closure-"));
    try {
      mkdirSync(join(tempRoot, "components"), { recursive: true });
      writeFileSync(
        join(tempRoot, "components/foo.tsx"),
        `import { Bar } from "@/components/bar";

export function Foo() {
  return <Bar />;
}
`,
        "utf8",
      );
      const issues = validateDossierImportClosure(
        {
          files: [{ path: "components/foo.tsx", role: "client" }],
        },
        tempRoot,
        new Set(["app/page.tsx", "app/layout.tsx"]),
      );
      expect(issues).toEqual([
        {
          dossierFile: "components/foo.tsx",
          missingImport: "@/components/bar",
          reason: "not_in_files",
        },
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
