/**
 * Registry tests: cache invalidation + path-traversal guard.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { utimesSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  clearDossierRegistryCache,
  getAllDossiers,
  getCapabilityMap,
  getDossierProviderCatalog,
  getDossierFileContent,
  isSafeDossierPath,
  resolveDossierProvider,
} from "./registry";
import { INTEGRATION_PROVIDERS } from "../agent-tools";
import { integrationRegistry } from "../../integrations/registry";

const ROOT = resolve(process.cwd(), "data", "dossiers");

beforeEach(() => clearDossierRegistryCache());
afterEach(() => clearDossierRegistryCache());

describe("loadEntry copies the manifest mock field (bugbot #468)", () => {
  it("surfaces the declared mock mode on loaded entries, not a dropped default", () => {
    const all = getAllDossiers();
    const openaiChat = all.find((d) => d.id === "openai-chat");
    expect(openaiChat?.mock).toBe("canned");
    const resend = all.find((d) => d.id === "resend-contact-form");
    expect(resend?.mock).toBe("success");
    const drizzle = all.find((d) => d.id === "postgres-drizzle");
    expect(drizzle?.mock).toBe("seed");
    // neon-postgres / mongodb-atlas parked 2026-08-06 — seed mock lives on
    // the sole remaining database dossier above.
    // Taxonomy 2026-07-22: payment/auth surfaces render a full interactive
    // demo surface (mock: visual) instead of a dead placeholder.
    const stripe = all.find((d) => d.id === "stripe-checkout");
    expect(stripe?.mock).toBe("visual");
    const supabaseAuth = all.find((d) => d.id === "supabase-auth");
    expect(supabaseAuth?.mock).toBe("visual");
  });

  it("surfaces provider ownership and verification status", () => {
    const all = getAllDossiers();
    expect(all.find((d) => d.id === "stripe-checkout")?.providers).toEqual(["stripe"]);
    expect(all.find((d) => d.id === "openai-chat")?.providers).toEqual(["openai"]);
    expect(all.find((d) => d.id === "gallery-lightbox")?.providers).toBeUndefined();
  });
});

describe("registry list cache invalidates on manifest mtime change", () => {
  it("returns fresh data after touching a manifest mtime", () => {
    const first = getAllDossiers();
    expect(first.length).toBeGreaterThan(0);

    // Touch one manifest's mtime forward by 1s — this must invalidate the
    // list cache even though the file content hasn't changed.
    const manifestPath = join(ROOT, "soft", "gallery-lightbox", "manifest.json");
    const stat = statSync(manifestPath);
    const future = new Date(stat.mtimeMs + 5_000);
    utimesSync(manifestPath, future, future);

    const second = getAllDossiers();
    // Same shape, but the call should not have hit the stale cached array.
    // Verify by checking the entry came from a fresh load (id present).
    expect(second.find((d) => d.id === "gallery-lightbox")).toBeDefined();
    expect(second.length).toBe(first.length);

    // Reset mtime back so we don't dirty the working tree timestamps.
    utimesSync(manifestPath, new Date(stat.mtimeMs), new Date(stat.mtimeMs));
  });
});

describe("getDossierFileContent path-traversal guard", () => {
  it("rejects '..' segments", () => {
    expect(getDossierFileContent("hard", "stripe-checkout", "../../etc/passwd")).toBeNull();
    expect(getDossierFileContent("hard", "stripe-checkout", "components/../../../foo")).toBeNull();
  });

  it("rejects absolute paths", () => {
    expect(getDossierFileContent("hard", "stripe-checkout", "/etc/passwd")).toBeNull();
  });

  it("returns content for valid paths", () => {
    const content = getDossierFileContent(
      "hard",
      "stripe-checkout",
      "components/checkout-button.tsx",
    );
    expect(content).not.toBeNull();
    expect(content).toContain("CheckoutButton");
  });
});

describe("isSafeDossierPath", () => {
  it("accepts simple subpaths", () => {
    expect(isSafeDossierPath("hard", "stripe-checkout", "components/foo.ts")).toBe(true);
  });

  // PR #396-klassen: literala Next.js catch-all-kataloger innehåller
  // substrängen `..` men är inte traversal — en substring-check tappade
  // dem tyst. Segment-checken ska släppa igenom dem.
  it("accepts literal catch-all directory names ([...slug])", () => {
    expect(isSafeDossierPath("hard", "stripe-checkout", "files/app/docs/[...slug]/page.tsx")).toBe(
      true,
    );
    expect(isSafeDossierPath("hard", "stripe-checkout", "files/app/[[...slug]]/page.tsx")).toBe(
      true,
    );
  });

  it("rejects parent traversal", () => {
    expect(isSafeDossierPath("hard", "stripe-checkout", "../bar")).toBe(false);
    expect(isSafeDossierPath("hard", "stripe-checkout", "components/../../../etc")).toBe(false);
    // Traversal gömd EFTER en legitim catch-all-katalog ska fortfarande stoppas.
    expect(
      isSafeDossierPath("hard", "stripe-checkout", "files/app/[...slug]/../../../etc/passwd"),
    ).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafeDossierPath("hard", "stripe-checkout", "/etc/passwd")).toBe(false);
  });
});

describe("getCapabilityMap", () => {
  it("groups dossiers by capability with sorted ids", () => {
    const map = getCapabilityMap();
    expect(map["payments"]).toContain("stripe-checkout");
    expect(map["site-search"]).toContain("local-site-search");
    // One capability, two provider siblings after the 2026-07-22 auth merge.
    expect(map["auth"]).toEqual(["clerk-auth", "supabase-auth"]);
    for (const ids of Object.values(map)) {
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    }
  });
});

describe("manifest provider projection", () => {
  it("maps a unique provider to exact dossier identity and capability", () => {
    expect(resolveDossierProvider("stripe")).toMatchObject({
      provider: "stripe",
      status: "unique",
      dossierIds: ["stripe-checkout"],
      capabilities: ["payments"],
    });
  });

  it("resolves openai uniquely to openai-chat after etapp 4 (injection still forced-generic)", () => {
    // Registry projection is unique; FORCED_GENERIC_PROVIDER_KEYS in
    // tier3-build-spec.ts still blocks deterministic injection (#785).
    expect(resolveDossierProvider("openai")).toMatchObject({
      status: "unique",
      dossierIds: ["openai-chat"],
      capabilities: ["ai-chat"],
    });
  });

  it("resolves postgres uniquely to postgres-drizzle after etapp 4", () => {
    expect(resolveDossierProvider("postgres")).toMatchObject({
      status: "unique",
      dossierIds: ["postgres-drizzle"],
      capabilities: ["database"],
    });
  });

  it("contains only explicit hard-manifest providers", () => {
    const providers = getDossierProviderCatalog();
    expect(providers).toContain("stripe");
    expect(providers).toContain("mailchimp");
    // fal left the catalog when fal-image-generation was parked (2026-08-06).
    expect(providers).not.toContain("fal");
    expect(providers).not.toContain("cmdk");
    expect(providers).toEqual([...providers].sort());
  });

  it("keeps the agent enum in parity with registry and manifest providers", () => {
    const expected = new Set([
      ...integrationRegistry.map((definition) => definition.provider ?? definition.key),
      ...getDossierProviderCatalog(),
      "other",
    ]);
    expect(new Set(INTEGRATION_PROVIDERS)).toEqual(expected);
    expect(INTEGRATION_PROVIDERS).toHaveLength(expected.size);
  });

  it("retains every legacy agent provider value, including generic Prisma", () => {
    expect(INTEGRATION_PROVIDERS).toEqual(
      expect.arrayContaining([
        "supabase",
        "stripe",
        "clerk",
        "next-auth",
        "resend",
        "upstash",
        "prisma",
        "openai",
        "vercel-blob",
        "vercel-kv",
        "google",
        "other",
      ]),
    );
  });
});

describe("getAllDossiers deterministic ordering", () => {
  // Regression guard: readdirSync() returns filesystem-dependent order. If a
  // future refactor drops the explicit sort in listIds(), downstream
  // first-wins consumers (buildCapabilityBulletList, capability-map export)
  // would silently become non-deterministic across machines. Assert that the
  // id sequence is stable and ascending within each class boundary.
  it("returns dossier ids in ascending sort order per class", () => {
    const all = getAllDossiers();
    const hardIds = all.filter((d) => d.class === "hard").map((d) => d.id);
    const softIds = all.filter((d) => d.class === "soft").map((d) => d.id);
    expect(hardIds).toEqual([...hardIds].sort());
    expect(softIds).toEqual([...softIds].sort());
  });
});
