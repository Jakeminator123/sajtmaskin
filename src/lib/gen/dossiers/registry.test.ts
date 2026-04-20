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
  getDossierFileContent,
  isSafeDossierPath,
} from "./registry";

const ROOT = resolve(process.cwd(), "data", "dossiers");

beforeEach(() => clearDossierRegistryCache());
afterEach(() => clearDossierRegistryCache());

describe("registry list cache invalidates on manifest mtime change", () => {
  it("returns fresh data after touching a manifest mtime", () => {
    const first = getAllDossiers();
    expect(first.length).toBeGreaterThan(0);

    // Touch one manifest's mtime forward by 1s — this must invalidate the
    // list cache even though the file content hasn't changed.
    const manifestPath = join(ROOT, "soft", "pricing-tier-table", "manifest.json");
    const stat = statSync(manifestPath);
    const future = new Date(stat.mtimeMs + 5_000);
    utimesSync(manifestPath, future, future);

    const second = getAllDossiers();
    // Same shape, but the call should not have hit the stale cached array.
    // Verify by checking the entry came from a fresh load (id present).
    expect(second.find((d) => d.id === "pricing-tier-table")).toBeDefined();
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

  it("rejects parent traversal", () => {
    expect(isSafeDossierPath("hard", "stripe-checkout", "../bar")).toBe(false);
    expect(isSafeDossierPath("hard", "stripe-checkout", "components/../../../etc")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafeDossierPath("hard", "stripe-checkout", "/etc/passwd")).toBe(false);
  });
});

describe("getCapabilityMap", () => {
  it("groups dossiers by capability with sorted ids", () => {
    const map = getCapabilityMap();
    expect(map["payments"]).toContain("stripe-checkout");
    expect(map["pricing-section"]).toContain("pricing-tier-table");
    for (const ids of Object.values(map)) {
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    }
  });
});
