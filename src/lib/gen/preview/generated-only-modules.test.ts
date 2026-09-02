import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseManifestDependencySpec } from "@/lib/gen/autofix/dep-completer";
import {
  getGeneratedOnlyPackages,
  partitionUndecidableModuleDiagnostics,
} from "./generated-only-modules";

function unresolved(specifier: string) {
  return {
    code: "TS2307",
    message: `Cannot find module '${specifier}' or its corresponding type declarations.`,
  };
}

describe("getGeneratedOnlyPackages", () => {
  it("covers dossier-declared SDKs the platform does not install", () => {
    const packages = getGeneratedOnlyPackages();
    for (const pkg of [
      "@supabase/ssr",
      "@supabase/supabase-js",
      "@clerk/nextjs",
      // next-sanity left the set 2026-09-02 with the parked sanity-cms dossier.
      "@vercel/blob",
      "maplibre-gl",
      "minisearch",
      "server-only",
    ]) {
      expect(packages.has(pkg), `${pkg} missing from the generated-only set`).toBe(true);
    }
  });

  it("drops SDKs whose dossiers are parked (curation owns the set)", () => {
    // ably-realtime / sentry-error-tracking (etapp 1) and mongodb-atlas /
    // neon-postgres (etapp 3) were parked 2026-08-06, so their SDKs are no
    // longer dossier-declared and their TS2307s are decidable (KEPT) again.
    // The KNOWN_PACKAGES pins that remain in dep-completer serve legacy-
    // version export, not this suppression set.
    const packages = getGeneratedOnlyPackages();
    expect(packages.has("ably")).toBe(false);
    expect(packages.has("@sentry/nextjs")).toBe(false);
    expect(packages.has("mongodb")).toBe(false);
    expect(packages.has("@neondatabase/serverless")).toBe(false);
  });

  it("excludes packages the preview runtime already ships", () => {
    const packages = getGeneratedOnlyPackages();
    expect(packages.has("clsx")).toBe(false);
    expect(packages.has("tailwind-merge")).toBe(false);
    expect(packages.has("react")).toBe(false);
  });

  // The dossier schema allows a semver-pinned entry (`stripe@^14.0.0`). Keying
  // the set on the raw entry would never match a diagnostic's module specifier,
  // so the whole suppression would silently stop working for that dossier
  // (bugbot on #610).
  it("keys on the package name, never the raw manifest entry", () => {
    for (const pkg of getGeneratedOnlyPackages()) {
      expect(pkg, `"${pkg}" still carries a version suffix`).toBe(
        parseManifestDependencySpec(pkg).pkg,
      );
      expect(pkg.replace(/^@[^/]+\//, "")).not.toContain("@");
    }
  });
});

describe("partitionUndecidableModuleDiagnostics", () => {
  let cacheDir: string;

  beforeAll(() => {
    // Minimal stand-in for a warm cache: `stripe` is installed (it is both a
    // dossier dependency AND a platform dependency), the other SDKs are not.
    cacheDir = mkdtempSync(join(tmpdir(), "generated-only-modules-"));
    mkdirSync(join(cacheDir, "node_modules", "stripe"), { recursive: true });
  });

  afterAll(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("drops unresolved-module errors for dossier SDKs the cache cannot install", () => {
    const { kept, suppressedModules } = partitionUndecidableModuleDiagnostics(
      [unresolved("@vercel/blob"), unresolved("@supabase/ssr")],
      cacheDir,
    );
    expect(kept).toEqual([]);
    expect(suppressedModules).toEqual(["@supabase/ssr", "@vercel/blob"]);
  });

  it("keeps TS2307 for parked dossier SDKs (mongodb / @neondatabase / next-sanity)", () => {
    // Same pattern as the ably case after etapp 1: no live dossier declares
    // these packages, so pre-VM typecheck must surface the unresolved import.
    // next-sanity joined the list 2026-09-02 when sanity-cms was parked.
    const diagnostics = [
      unresolved("mongodb"),
      unresolved("@neondatabase/serverless"),
      unresolved("next-sanity"),
    ];
    const { kept, suppressedModules } = partitionUndecidableModuleDiagnostics(
      diagnostics,
      cacheDir,
    );
    expect(kept).toEqual(diagnostics);
    expect(suppressedModules).toEqual([]);
  });

  it("normalizes subpath imports to the package name", () => {
    const { kept, suppressedModules } = partitionUndecidableModuleDiagnostics(
      [unresolved("@supabase/ssr/dist/module"), unresolved("maplibre-gl/dist/maplibre-gl.css")],
      cacheDir,
    );
    expect(kept).toEqual([]);
    expect(suppressedModules).toEqual(["@supabase/ssr", "maplibre-gl"]);
  });

  it("keeps unresolved-module errors for packages no dossier declares", () => {
    const diagnostics = [unresolved("totally-made-up-package"), unresolved("@acme/invented")];
    const { kept, suppressedModules } = partitionUndecidableModuleDiagnostics(
      diagnostics,
      cacheDir,
    );
    expect(kept).toEqual(diagnostics);
    expect(suppressedModules).toEqual([]);
  });

  it("keeps a bad subpath of an INSTALLED dossier package (a real error)", () => {
    const diagnostics = [unresolved("stripe/does-not-exist")];
    const { kept, suppressedModules } = partitionUndecidableModuleDiagnostics(
      diagnostics,
      cacheDir,
    );
    expect(kept).toEqual(diagnostics);
    expect(suppressedModules).toEqual([]);
  });

  it("keeps every non-TS2307 diagnostic, including stub-shaped TS2305", () => {
    const diagnostics = [
      { code: "TS2322", message: "Type 'string' is not assignable to type 'number'." },
      { code: "TS2305", message: `Module '"@clerk/nextjs"' has no exported member 'useUser'.` },
      { code: "TS2304", message: "Cannot find name 'Badge'." },
    ];
    const { kept, suppressedModules } = partitionUndecidableModuleDiagnostics(
      diagnostics,
      cacheDir,
    );
    expect(kept).toEqual(diagnostics);
    expect(suppressedModules).toEqual([]);
  });
});
