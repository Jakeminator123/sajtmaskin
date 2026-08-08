import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_ELEMENT_ITEMS } from "@/lib/builder/ai-elements-catalog";
import { getAllDossiers } from "@/lib/gen/dossiers/registry";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import {
  buildDossierDeclaredVersions,
  buildStaleLockfileMarkerContent,
  completeProjectDependencies,
  detectLockfilePackageManager,
  isBuiltinPackage,
  isCssPackageImportSource,
  KNOWN_PACKAGES,
  LOCKFILE_STALE_MARKER_PATH,
  markLockfileStaleInFiles,
  mergeMissingDependenciesIntoPackageJson,
  parseManifestDependencySpec,
  resolveCapabilityDependencies,
  resolveExportableVersion,
  resolveKnownVersion,
  runDepCompleter,
} from "./dep-completer";

function extractLeadingMajor(versionSpec: string): number | null {
  const match = versionSpec.match(/\d+/);
  if (!match) return null;
  return Number.parseInt(match[0], 10);
}

function readBaselinePackageVersion(packageName: string): string {
  const projectScaffoldPath = resolve(process.cwd(), "src/lib/gen/export/project-scaffold.ts");
  const text = readFileSync(projectScaffoldPath, "utf8");
  const packageJsonMatch = text.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
  if (!packageJsonMatch) {
    throw new Error("Could not find PACKAGE_JSON template in project-scaffold.ts");
  }
  const parsed = JSON.parse(packageJsonMatch[1]) as {
    dependencies?: Record<string, string>;
  };
  const version = parsed.dependencies?.[packageName];
  if (!version) {
    throw new Error(`Missing ${packageName} in project-scaffold PACKAGE_JSON baseline`);
  }
  return version;
}

describe("dep-completer", () => {
  it("adds zod using known package mapping", () => {
    const result = runDepCompleter('import { z } from "zod";\nconst schema = z.object({});\n');
    expect(result.dependencies.zod).toBe(KNOWN_PACKAGES.zod);
  });

  it("keeps zod major aligned with project scaffold baseline", () => {
    const completerMajor = extractLeadingMajor(KNOWN_PACKAGES.zod);
    const baselineMajor = extractLeadingMajor(readBaselinePackageVersion("zod"));
    expect(completerMajor).not.toBeNull();
    expect(baselineMajor).not.toBeNull();
    expect(completerMajor).toBe(baselineMajor);
  });

  it("keeps ALL overlapping KNOWN_PACKAGES majors aligned with scaffold baseline", () => {
    const scaffoldPath = resolve(process.cwd(), "src/lib/gen/export/project-scaffold.ts");
    const text = readFileSync(scaffoldPath, "utf8");
    const m = text.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
    expect(m).not.toBeNull();
    const baselineDeps = (JSON.parse(m![1]) as { dependencies?: Record<string, string> })
      .dependencies ?? {};

    const overlapping = Object.keys(KNOWN_PACKAGES).filter((k) => k in baselineDeps);
    expect(overlapping.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const pkg of overlapping) {
      const knownMajor = extractLeadingMajor(KNOWN_PACKAGES[pkg]);
      const baselineMajor = extractLeadingMajor(baselineDeps[pkg]);
      if (knownMajor !== baselineMajor) {
        mismatches.push(
          `${pkg}: KNOWN_PACKAGES=${KNOWN_PACKAGES[pkg]} (major ${knownMajor}) vs baseline=${baselineDeps[pkg]} (major ${baselineMajor})`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("detects scoped npm imports (e.g. @react-three/fiber)", () => {
    const result = runDepCompleter(
      'import { Canvas } from "@react-three/fiber";\nimport { OrbitControls } from "@react-three/drei";\n',
    );
    expect(result.dependencies["@react-three/fiber"]).toBe(KNOWN_PACKAGES["@react-three/fiber"]);
    expect(result.dependencies["@react-three/drei"]).toBe(KNOWN_PACKAGES["@react-three/drei"]);
  });

  it("adds besöksstatistik (@vercel/analytics) from the curated allowlist", () => {
    const result = runDepCompleter(
      'import { Analytics } from "@vercel/analytics/react";\n',
    );
    expect(result.dependencies["@vercel/analytics"]).toBe(
      KNOWN_PACKAGES["@vercel/analytics"],
    );
    expect(result.unknownPackages).not.toContain("@vercel/analytics");
  });

  it("adds next-mdx-remote from the curated allowlist", () => {
    const result = runDepCompleter(
      'import { MDXRemote } from "next-mdx-remote/rsc";\n',
    );
    expect(result.dependencies["next-mdx-remote"]).toBe(
      KNOWN_PACKAGES["next-mdx-remote"],
    );
    expect(result.unknownPackages).not.toContain("next-mdx-remote");
  });

  it("adds a few common app packages used by generated projects", () => {
    const result = runDepCompleter(
      [
        'import { configureStore } from "@reduxjs/toolkit";',
        'import { Provider } from "react-redux";',
        'import confetti from "canvas-confetti";',
        'import * as HoverCard from "@radix-ui/react-hover-card";',
        "void configureStore;",
        "void Provider;",
        "void confetti;",
        "void HoverCard;",
      ].join("\n"),
    );

    expect(result.dependencies["@reduxjs/toolkit"]).toBe(KNOWN_PACKAGES["@reduxjs/toolkit"]);
    expect(result.dependencies["react-redux"]).toBe(KNOWN_PACKAGES["react-redux"]);
    expect(result.dependencies["canvas-confetti"]).toBe(KNOWN_PACKAGES["canvas-confetti"]);
    expect(result.dependencies["@radix-ui/react-hover-card"]).toBe(
      resolveKnownVersion("@radix-ui/react-hover-card"),
    );
  });

  it("detects side-effect CSS, CommonJS require, and dynamic imports", () => {
    const result = runDepCompleter(
      [
        'import "mapbox-gl/dist/mapbox-gl.css";',
        'const axios = require("axios");',
        'const charts = await import("chart.js");',
        "void axios;",
        "void charts;",
      ].join("\n"),
    );

    expect(result.dependencies["mapbox-gl"]).toBe(KNOWN_PACKAGES["mapbox-gl"]);
    expect(result.dependencies.axios).toBe(KNOWN_PACKAGES.axios);
    expect(result.dependencies["chart.js"]).toBe(KNOWN_PACKAGES["chart.js"]);
  });

  it("does not treat @/ path alias as an npm package", () => {
    const result = runDepCompleter('import { cn } from "@/lib/utils";\n');
    expect(result.dependencies["@/lib/utils"]).toBeUndefined();
    expect(Object.keys(result.dependencies)).toHaveLength(0);
  });

  it("sanity: visual-3d capability selection injects three-stack deps into package.json", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["visual-3d"],
    });
    expect(dossierSelection.selected[0]?.entry.id).toBe("three-fiber-canvas");

    const requestedCapabilities = Object.keys(dossierSelection.byCapability);
    const capabilityDeps = resolveCapabilityDependencies(requestedCapabilities);
    expect(capabilityDeps).toMatchObject({
      three: KNOWN_PACKAGES.three,
      "@react-three/fiber": KNOWN_PACKAGES["@react-three/fiber"],
      "@react-three/drei": KNOWN_PACKAGES["@react-three/drei"],
    });

    const { packageJson, mergedCount } = mergeMissingDependenciesIntoPackageJson(
      {
        name: "site",
        dependencies: {
          next: "16.0.0",
          react: "19.0.0",
          "react-dom": "19.0.0",
        },
      },
      capabilityDeps,
    );
    expect(mergedCount).toBe(3);
    expect(packageJson.dependencies).toMatchObject({
      next: "16.0.0",
      react: "19.0.0",
      "react-dom": "19.0.0",
      three: KNOWN_PACKAGES.three,
      "@react-three/fiber": KNOWN_PACKAGES["@react-three/fiber"],
      "@react-three/drei": KNOWN_PACKAGES["@react-three/drei"],
    });
  });

  it("injects dependencies declared by selected dossier manifests", () => {
    const deps = resolveCapabilityDependencies(["payments", "auth", "contact-form"]);

    expect(deps.stripe).toBe(KNOWN_PACKAGES.stripe);
    expect(deps["@stripe/stripe-js"]).toBe(KNOWN_PACKAGES["@stripe/stripe-js"]);
    expect(deps["@clerk/nextjs"]).toBe(KNOWN_PACKAGES["@clerk/nextjs"]);
    expect(deps.resend).toBe(KNOWN_PACKAGES.resend);
  });

  // Codex P1 (PR #422): dependency-handling change without regression coverage.
  // Selecting the dashboard-charts capability must inject the VisActor package
  // (pinned via KNOWN_PACKAGES, never falling through to `latest`).
  it("injects @visactor/react-vchart when dashboard-charts is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["dashboard-charts"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain(
      "dashboard-charts",
    );

    const deps = resolveCapabilityDependencies(["dashboard-charts"]);
    expect(deps["@visactor/react-vchart"]).toBe(
      KNOWN_PACKAGES["@visactor/react-vchart"],
    );
    expect(deps["@visactor/react-vchart"]).toBeDefined();
    expect(deps["@visactor/react-vchart"]).not.toBe("latest");
  });

  it("pins every dependency advertised by the AI Elements catalog", () => {
    const advertised = [
      ...new Set(AI_ELEMENT_ITEMS.flatMap((item) => item.dependencies ?? [])),
    ].sort();
    const unresolved = advertised.filter((pkg) => !resolveKnownVersion(pkg));

    expect(unresolved).toEqual([]);
    expect(resolveKnownVersion("tokenlens")).toBe("^1");
    expect(resolveKnownVersion("@xyflow/react")).toBe("^12");
  });

  // Dossier wave 1 (legacy import 2026-07-08): each new hard dossier's manifest
  // dependencies must resolve through KNOWN_PACKAGES pins, never `latest`.
  // (ably-realtime and fal-image-generation were parked 2026-08-06 — their
  // capability-selection cases left with them, but the `ably`/`@ai-sdk/fal`
  // pins stay in KNOWN_PACKAGES as import-scan fallbacks for freehand or
  // legacy-version code that still imports the SDKs.)
  it("parked capabilities (realtime / image-generation) select nothing and inject nothing", () => {
    for (const capability of ["realtime", "image-generation"]) {
      const dossierSelection = selectDossiersForRequest({
        requestedCapabilities: [capability],
      });
      expect(dossierSelection.selected).toEqual([]);
      expect(resolveCapabilityDependencies([capability])).toEqual({});
    }
  });

  it("keeps deterministic pins for parked-dossier SDKs (import-scan fallback)", () => {
    expect(KNOWN_PACKAGES.ably).toBeDefined();
    expect(KNOWN_PACKAGES.ably).not.toBe("latest");
    expect(KNOWN_PACKAGES["@ai-sdk/fal"]).toBeDefined();
    expect(KNOWN_PACKAGES["@ai-sdk/fal"]).not.toBe("latest");
  });

  it("injects ai + @ai-sdk/openai (+ react) when ai-chat is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["ai-chat"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain("openai-chat");

    const deps = resolveCapabilityDependencies(["ai-chat"]);
    expect(deps.ai).toBe(KNOWN_PACKAGES.ai);
    expect(deps["@ai-sdk/openai"]).toBe(KNOWN_PACKAGES["@ai-sdk/openai"]);
    expect(deps["@ai-sdk/react"]).toBe(KNOWN_PACKAGES["@ai-sdk/react"]);
    for (const pkg of ["ai", "@ai-sdk/openai", "@ai-sdk/react"]) {
      expect(deps[pkg]).not.toBe("latest");
    }
  });

  // Dossier wave 2 (capability `database`, 2026-07-08): the capability
  // backstop resolves the default dossier's manifest deps through
  // KNOWN_PACKAGES pins (never `latest`); the mongo/neon siblings' deps are
  // covered via the import-scan pins below since the promptless backstop
  // always resolves the capability default.
  it("injects the drizzle/pg stack when database is selected (default dossier)", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["database"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain(
      "postgres-drizzle",
    );

    const deps = resolveCapabilityDependencies(["database"]);
    expect(deps["drizzle-orm"]).toBe(KNOWN_PACKAGES["drizzle-orm"]);
    expect(deps["drizzle-kit"]).toBe(KNOWN_PACKAGES["drizzle-kit"]);
    expect(deps.pg).toBe(KNOWN_PACKAGES.pg);
    expect(deps["@types/pg"]).toBe(KNOWN_PACKAGES["@types/pg"]);
    expect(deps["server-only"]).toBe(KNOWN_PACKAGES["server-only"]);
    for (const pkg of ["drizzle-orm", "drizzle-kit", "pg", "@types/pg", "server-only"]) {
      expect(deps[pkg]).not.toBe("latest");
    }
  });

  it("selects nothing for parked rag-chat / ai-tool-calling capabilities", () => {
    expect(
      selectDossiersForRequest({ requestedCapabilities: ["rag-chat"] }).selected,
    ).toEqual([]);
    expect(
      selectDossiersForRequest({
        requestedCapabilities: ["ai-tool-calling"],
      }).selected,
    ).toEqual([]);
    expect(resolveCapabilityDependencies(["rag-chat"])).toEqual({});
    expect(resolveCapabilityDependencies(["ai-tool-calling"])).toEqual({});
  });

  // neon-postgres / mongodb-atlas parked 2026-08-06 — brand asks still mean
  // capability `database`, and selection yields the sole postgres-drizzle
  // dossier. Sibling-select cases moved to auth in select.test.ts.
  it("selects postgres-drizzle for database brand asks (siblings parked)", () => {
    const mongoSelection = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "spara produkterna i mongodb",
    });
    expect(mongoSelection.selected.map((s) => s.entry.id)).toEqual(["postgres-drizzle"]);

    const neonSelection = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "använd neon postgres för medlemsdatan",
    });
    expect(neonSelection.selected.map((s) => s.entry.id)).toEqual(["postgres-drizzle"]);
  });

  it("pins mongodb and @neondatabase/serverless imports from generated code", () => {
    const result = runDepCompleter(
      [
        'import { MongoClient } from "mongodb";',
        'import { neon } from "@neondatabase/serverless";',
      ].join("\n"),
    );

    expect(result.dependencies.mongodb).toBe(KNOWN_PACKAGES.mongodb);
    expect(result.dependencies["@neondatabase/serverless"]).toBe(
      KNOWN_PACKAGES["@neondatabase/serverless"],
    );
    expect(result.unknownPackages).not.toContain("mongodb");
    expect(result.unknownPackages).not.toContain("@neondatabase/serverless");
  });

  // Dossier Fas D (capability `cms`, 2026-07-09): the sanity-cms manifest
  // deps must resolve through KNOWN_PACKAGES pins, never `latest`.
  it("injects next-sanity + server-only when cms is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["cms"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain("sanity-cms");

    const deps = resolveCapabilityDependencies(["cms"]);
    expect(deps["next-sanity"]).toBe(KNOWN_PACKAGES["next-sanity"]);
    expect(deps["server-only"]).toBe(KNOWN_PACKAGES["server-only"]);
    for (const pkg of ["next-sanity", "server-only"]) {
      expect(deps[pkg]).not.toBe("latest");
    }
  });

  // Taxonomy 2026-07-22: `supabase-auth` is a legacy capability ALIAS that
  // normalizes to `auth` with a dossier pin on the supabase-auth provider.
  // The Supabase Auth SSR dossier's manifest dependency must resolve through
  // the KNOWN_PACKAGES pin (never `latest`), and the alias must select the
  // supabase-auth dossier — NOT clerk-auth (the `auth` capability default).
  it("injects @supabase/ssr when the legacy supabase-auth alias is requested (not clerk)", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["supabase-auth"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain("supabase-auth");
    expect(dossierSelection.selected.map((s) => s.entry.id)).not.toContain("clerk-auth");

    const deps = resolveCapabilityDependencies(["supabase-auth"]);
    expect(deps["@supabase/ssr"]).toBe(KNOWN_PACKAGES["@supabase/ssr"]);
    expect(deps["@supabase/ssr"]).not.toBe("latest");
    expect(deps["@clerk/nextjs"]).toBeUndefined();
  });

  it("still selects clerk-auth for the generic auth capability (non-competition)", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain("clerk-auth");
    expect(dossierSelection.selected.map((s) => s.entry.id)).not.toContain("supabase-auth");

    const deps = resolveCapabilityDependencies(["auth"]);
    expect(deps["@clerk/nextjs"]).toBe(KNOWN_PACKAGES["@clerk/nextjs"]);
    expect(deps["@supabase/ssr"]).toBeUndefined();
  });

  // ---- SM-006: selectedDossierIds beats capability re-selection ----

  it("resolves deps from the CHOSEN sibling, not the capability default (SM-006)", () => {
    // User picked supabase-auth; the raw capability is still `auth`. Without
    // the ids the backfill re-selected clerk-auth (default) and injected the
    // wrong provider's SDK stack.
    const deps = resolveCapabilityDependencies(["auth"], ["supabase-auth"]);
    expect(deps["@supabase/ssr"]).toBe(KNOWN_PACKAGES["@supabase/ssr"]);
    expect(deps["@supabase/supabase-js"]).toBe(KNOWN_PACKAGES["@supabase/supabase-js"]);
    expect(deps["@clerk/nextjs"]).toBeUndefined();
  });

  it("keeps capability fallback for capabilities no picked id covers (SM-006)", () => {
    const deps = resolveCapabilityDependencies(["auth", "database"], ["supabase-auth"]);
    // auth resolved from the pick...
    expect(deps["@supabase/ssr"]).toBe(KNOWN_PACKAGES["@supabase/ssr"]);
    expect(deps["@clerk/nextjs"]).toBeUndefined();
    // ...database from the capability default (postgres-drizzle).
    expect(deps["drizzle-orm"]).toBe(KNOWN_PACKAGES["drizzle-orm"]);
  });

  it("ignores unknown/parked ids and falls back to the capability default (SM-006)", () => {
    // mongodb-atlas is parked — a stale snapshot id must not crash the
    // backfill; auth falls back to the clerk default as before.
    const deps = resolveCapabilityDependencies(["auth"], ["mongodb-atlas"]);
    expect(deps["@clerk/nextjs"]).toBe(KNOWN_PACKAGES["@clerk/nextjs"]);
    expect(deps["mongodb"]).toBeUndefined();
  });

  it("pins tier-3 SDK imports detected in restored dossier files", () => {
    const result = runDepCompleter(
      [
        'import Stripe from "stripe";',
        'import { loadStripe } from "@stripe/stripe-js";',
        'import { ClerkProvider } from "@clerk/nextjs";',
        'import { Resend } from "resend";',
      ].join("\n"),
    );

    expect(result.dependencies).toMatchObject({
      stripe: KNOWN_PACKAGES.stripe,
      "@stripe/stripe-js": KNOWN_PACKAGES["@stripe/stripe-js"],
      "@clerk/nextjs": KNOWN_PACKAGES["@clerk/nextjs"],
      resend: KNOWN_PACKAGES.resend,
    });
    expect(result.unknownPackages).not.toContain("stripe");
    expect(result.unknownPackages).not.toContain("@stripe/stripe-js");
    expect(result.unknownPackages).not.toContain("@clerk/nextjs");
    expect(result.unknownPackages).not.toContain("resend");
  });

  // paddle-billing / subscriptions parked 2026-08-06 — capability selects
  // nothing; the @paddle pin stays as an import-scan fallback for legacy code.
  it("parked subscriptions selects nothing and injects nothing", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["subscriptions"],
    });
    expect(dossierSelection.selected).toEqual([]);
    expect(resolveCapabilityDependencies(["subscriptions"])).toEqual({});
  });

  it("keeps deterministic pin for parked paddle SDK (import-scan fallback)", () => {
    expect(KNOWN_PACKAGES["@paddle/paddle-node-sdk"]).toBeDefined();
    expect(KNOWN_PACKAGES["@paddle/paddle-node-sdk"]).not.toBe("latest");
  });

  /**
   * Generic replacement for the per-dossier pin assertions above: the export
   * path must be able to pin EVERY package any manifest declares, because
   * `runDepCompleter` is the only dependency pass that runs there — generated
   * code that imports the SDK without the capability being requested otherwise
   * ships a `package.json` without it and the VM build fails with "Module not
   * found".
   *
   * The pre-VM typecheck's dossier-SDK suppression
   * (`src/lib/gen/preview/generated-only-modules.ts`) depends on this invariant:
   * dropping an undecidable TS2307 is only safe while the export pipeline
   * guarantees the VM installs the package.
   *
   * Asserted through `resolveExportableVersion` — the same resolver the export
   * path uses — so the test cannot claim coverage the pipeline does not have.
   * An earlier version exempted the pinned manifest form and was green while
   * exactly that case shipped unpinned (Codex P1 on #610).
   */
  it("lets the export path pin EVERY dossier-declared dependency", () => {
    const unresolved: string[] = [];
    for (const dossier of getAllDossiers()) {
      for (const dep of dossier.dependencies ?? []) {
        const { pkg } = parseManifestDependencySpec(dep);
        if (!pkg || isBuiltinPackage(pkg)) continue;
        if (!resolveExportableVersion(pkg)) {
          unresolved.push(`${pkg} (${dossier.class}/${dossier.id})`);
        }
      }
    }
    expect(
      unresolved,
      "add the package to KNOWN_PACKAGES in dep-completer.ts (verify the major with `npm view <pkg> version`), or pin it in the manifest entry itself",
    ).toEqual([]);
  });

  // The pinned manifest form is what made the invariant above leak, so the
  // mapping that now backs it is covered directly rather than only through the
  // current (all-bare) manifest data.
  it("maps a pinned manifest entry to its declared version", () => {
    const versions = buildDossierDeclaredVersions([
      { dependencies: ["some-sdk@^1.2.3", "@scope/pkg@~2.0.0", "bare-pkg"] },
      { dependencies: undefined },
    ]);

    expect(versions.get("some-sdk")).toBe("^1.2.3");
    expect(versions.get("@scope/pkg")).toBe("~2.0.0");
    // A bare entry carries no version — it must come from KNOWN_PACKAGES.
    expect(versions.has("bare-pkg")).toBe(false);
  });

  it("pins a bare dossier dependency found in generated code via the allowlist", () => {
    const result = runDepCompleter('import MiniSearch from "minisearch";\nvoid MiniSearch;\n');
    expect(result.dependencies.minisearch).toBe(resolveExportableVersion("minisearch"));
    expect(result.unknownPackages).not.toContain("minisearch");
  });
});

// Regression suite for the imported-repo dependency gap (prod chat 0d52e5c9,
// 2026-07-31): a follow-up added `@clerk/nextjs` imports without emitting
// package.json — the template's own manifest stayed untouched, the preview
// host skipped install (fingerprint unchanged) and the runtime 500:ade.
describe("completeProjectDependencies", () => {
  const templatePackageJson = JSON.stringify({
    name: "aether-template",
    dependencies: { next: "14.2.0", react: "^18" },
    devDependencies: { typescript: "^5" },
  });

  it("pins a missing known package imported by a code file into package.json", () => {
    const result = completeProjectDependencies([
      { path: "package.json", content: templatePackageJson },
      {
        path: "middleware.ts",
        content:
          'import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";\n',
      },
    ]);

    expect(result.pinnedDependencies["@clerk/nextjs"]).toBe(
      KNOWN_PACKAGES["@clerk/nextjs"],
    );
    const pkg = JSON.parse(
      result.files.find((f) => f.path === "package.json")!.content,
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@clerk/nextjs"]).toBe(KNOWN_PACKAGES["@clerk/nextjs"]);
    // Existing template pins stay verbatim — no baseline force-pins.
    expect(pkg.dependencies.next).toBe("14.2.0");
    expect(pkg.dependencies.react).toBe("^18");
  });

  it("does not pin packages already declared in dependencies or devDependencies", () => {
    const result = completeProjectDependencies([
      { path: "package.json", content: templatePackageJson },
      { path: "app/page.tsx", content: 'import ts from "typescript";\nimport React from "react";\n' },
    ]);

    expect(result.pinnedDependencies).toEqual({});
    expect(result.files.find((f) => f.path === "package.json")!.content).toBe(
      templatePackageJson,
    );
  });

  it("reports unknown packages without pinning a guessed version", () => {
    const result = completeProjectDependencies([
      { path: "package.json", content: templatePackageJson },
      { path: "lib/x.ts", content: 'import weird from "some-unknown-npm-thing";\n' },
    ]);

    expect(result.unknownPackages).toContain("some-unknown-npm-thing");
    expect(result.pinnedDependencies).toEqual({});
    expect(result.files.find((f) => f.path === "package.json")!.content).toBe(
      templatePackageJson,
    );
  });

  it("ignores import-looking text in non-code files", () => {
    const result = completeProjectDependencies([
      { path: "package.json", content: templatePackageJson },
      { path: "README.md", content: 'import { z } from "zod";\n' },
      { path: "pnpm-lock.yaml", content: 'import { z } from "zod";\n' },
    ]);

    expect(result.pinnedDependencies).toEqual({});
  });

  it("is a no-op without a package.json or with invalid JSON", () => {
    const noPkg = completeProjectDependencies([
      { path: "middleware.ts", content: 'import { clerkMiddleware } from "@clerk/nextjs/server";\n' },
    ]);
    expect(noPkg.pinnedDependencies).toEqual({});

    const badPkg = completeProjectDependencies([
      { path: "package.json", content: "{ not json" },
      { path: "middleware.ts", content: 'import { clerkMiddleware } from "@clerk/nextjs/server";\n' },
    ]);
    expect(badPkg.pinnedDependencies).toEqual({});
    expect(badPkg.files.find((f) => f.path === "package.json")!.content).toBe("{ not json");
  });

  // M#ma1 / prod chat 4cc467d2: preview dep-completer ignored CSS `@import`,
  // so tw-animate-css never landed in package.json while deploy already pinned it.
  it("pins tw-animate-css from @import in app/globals.css", () => {
    const result = completeProjectDependencies([
      { path: "package.json", content: templatePackageJson },
      {
        path: "app/globals.css",
        content: '@import "tailwindcss";\n@import "tw-animate-css";\n',
      },
    ]);

    expect(result.pinnedDependencies["tw-animate-css"]).toBe(
      KNOWN_PACKAGES["tw-animate-css"],
    );
    const pkg = JSON.parse(
      result.files.find((f) => f.path === "package.json")!.content,
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["tw-animate-css"]).toBe(KNOWN_PACKAGES["tw-animate-css"]);
    // Baseline builtin — must not become an extra dependency row.
    expect(pkg.dependencies.tailwindcss).toBeUndefined();
  });

  it("does not pin relative CSS @import or bare url() font paths", () => {
    const result = completeProjectDependencies([
      { path: "package.json", content: templatePackageJson },
      {
        path: "app/globals.css",
        content: [
          '@import "./tokens.css";',
          '@import "../theme/colors.css";',
          "@import url(./unquoted-local.css);",
          "@import url(https://fonts.example.com/x.css);",
          '@font-face { src: url("/fonts/x.woff2") format("woff2"); }',
          "@font-face { src: url(/fonts/y.woff2) format('woff2'); }",
        ].join("\n"),
      },
    ]);

    expect(result.pinnedDependencies).toEqual({});
    expect(result.files.find((f) => f.path === "package.json")!.content).toBe(
      templatePackageJson,
    );
  });
});

describe("CSS @import package detection (M#ma1)", () => {
  it("pinnar inte en bare relativ CSS-sökväg vars första segment liknar ett paket", () => {
    // Bugbot på granskningsdiffen: `@import "theme/colors.css"` är en RELATIV
    // sökväg i CSS men saknar `./`, så prefixkontrollen fångar den inte. CSS
    // skannas därför som strikt allow-list mot KNOWN_PACKAGES.
    const result = runDepCompleter(
      [
        '@import "theme/colors.css";',
        "@import url(ui/base.css);",
        '@import "components/card.css";',
      ].join("\n"),
    );

    expect(result.dependencies).toEqual({});
    // Får inte heller läcka in som "okänt paket" — de varningarna matar
    // reparationsprompten.
    expect(result.unknownPackages).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("JS-grammatiken körs inte på .css-filer — prosa i CSS-kommentarer pinnar inget", () => {
    // Bugbot på #813: `from "…"`-armen i IMPORT_SOURCE_RE kan matcha prosa i
    // en CSS-kommentar och pinna ett paket projektet aldrig importerar. En
    // ren stylesheet ska bara skannas med CSS-grammatiken.
    const css = [
      '/* adapted from "framer-motion" */',
      '@import "tw-animate-css";',
      "body { color: red; }",
    ].join("\n");

    const unit = runDepCompleter(css, { grammar: "css" });
    expect(unit.dependencies).toEqual({
      "tw-animate-css": KNOWN_PACKAGES["tw-animate-css"],
    });
    expect(unit.unknownPackages).toEqual([]);

    // Fil-loopen ska själv välja CSS-grammatiken utifrån filändelsen.
    const result = completeProjectDependencies([
      { path: "package.json", content: JSON.stringify({ name: "x", dependencies: {} }) },
      { path: "app/globals.css", content: css },
    ]);
    expect(result.pinnedDependencies).toEqual({
      "tw-animate-css": KNOWN_PACKAGES["tw-animate-css"],
    });
  });

  it("en okänd CSS-specifier blockerar inte samma namn från en riktig JS-import", () => {
    const result = runDepCompleter(
      ['@import "some-unknown-lib/theme.css";', 'import x from "some-unknown-lib";'].join("\n"),
    );

    expect(result.unknownPackages).toEqual(["some-unknown-lib"]);
  });

  it("classifies named packages vs relative/url non-packages", () => {
    expect(isCssPackageImportSource("tw-animate-css")).toBe(true);
    expect(isCssPackageImportSource("tw-animate-css/dist/x.css")).toBe(true);
    expect(isCssPackageImportSource("./tokens.css")).toBe(false);
    expect(isCssPackageImportSource("../y.css")).toBe(false);
    expect(isCssPackageImportSource("/fonts/x.woff2")).toBe(false);
    expect(isCssPackageImportSource("https://example.com/a.css")).toBe(false);
    expect(isCssPackageImportSource("data:text/css,body{}")).toBe(false);
  });

  it("pins tw-animate-css from quoted, url(), and Tailwind v4 suffix forms", () => {
    const forms = [
      '@import "tw-animate-css";',
      "@import 'tw-animate-css';",
      '@import url("tw-animate-css/dist/tw-animate.css");',
      // Unquoted url() is valid CSS and appears in imported templates.
      "@import url(tw-animate-css/dist/tw-animate.css);",
      "@import url( tw-animate-css );",
      '@import "tw-animate-css" layer(utilities);',
      '@import "tw-animate-css" source(none);',
      '@import "tw-animate-css" theme(reference);',
    ];
    for (const content of forms) {
      const result = runDepCompleter(content);
      expect(result.dependencies["tw-animate-css"], content).toBe(
        KNOWN_PACKAGES["tw-animate-css"],
      );
      expect(result.unknownPackages, content).not.toContain("tw-animate-css");
    }
  });

  it("treats @import \"tailwindcss\" as builtin (no dependency pin)", () => {
    const result = runDepCompleter(
      '@import "tailwindcss";\n@import "tailwindcss" layer(base);\n',
    );
    expect(result.dependencies.tailwindcss).toBeUndefined();
    expect(result.unknownPackages).not.toContain("tailwindcss");
  });
});

describe("stale-lockfile marker contract (req A2)", () => {
  it("detects the package manager from the lockfile present", () => {
    expect(detectLockfilePackageManager([{ path: "pnpm-lock.yaml" }])).toBe("pnpm");
    expect(detectLockfilePackageManager([{ path: "yarn.lock" }])).toBe("yarn");
    expect(detectLockfilePackageManager([{ path: "package-lock.json" }])).toBe("npm");
  });

  it("returns null when no lockfile is present (fresh install regenerates anyway)", () => {
    expect(detectLockfilePackageManager([{ path: "package.json" }])).toBeNull();
  });

  it("emits a host-readable sentinel body", () => {
    const parsed = JSON.parse(
      buildStaleLockfileMarkerContent({ reason: "pinned radix-ui", packageManager: "pnpm" }),
    ) as { reason: string; packageManager: string; mutatedAt: string };
    expect(parsed.reason).toBe("pinned radix-ui");
    expect(parsed.packageManager).toBe("pnpm");
    expect(typeof parsed.mutatedAt).toBe("string");
  });

  it("adds the sentinel file exactly once (idempotent replace)", () => {
    const base = [
      { path: "package.json", content: "{}" },
      { path: "pnpm-lock.yaml", content: "old" },
    ];
    const once = markLockfileStaleInFiles(base, {
      reason: "r1",
      packageManager: "pnpm",
      makeFile: (path, content) => ({ path, content }),
    });
    expect(once.filter((f) => f.path === LOCKFILE_STALE_MARKER_PATH)).toHaveLength(1);

    const twice = markLockfileStaleInFiles(once, {
      reason: "r2",
      packageManager: "pnpm",
      makeFile: (path, content) => ({ path, content }),
    });
    expect(twice.filter((f) => f.path === LOCKFILE_STALE_MARKER_PATH)).toHaveLength(1);
    const marker = JSON.parse(
      twice.find((f) => f.path === LOCKFILE_STALE_MARKER_PATH)!.content,
    ) as { reason: string };
    expect(marker.reason).toBe("r2");
  });
});

// Regression 6 (building block): a broken imported template — one that imports a
// package it never declared — gets that dependency pinned by the same
// dep-completer the /template first-preview path runs, and (because a lockfile
// is present) the stale marker is added. The preview host then runs one
// non-frozen install + a readiness gate, so the template can no longer reach
// preview as "healthy" with an undeclared import.
describe("imported template dependency completion + stale marker (req A1)", () => {
  it("pins an undeclared import and marks the pnpm lockfile stale", () => {
    const files = [
      { path: "package.json", content: '{"name":"t","dependencies":{}}' },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'\n" },
      { path: "app/page.tsx", content: 'import { z } from "zod";\nexport default function P(){return null;}\n' },
    ];
    const completed = completeProjectDependencies(files);
    expect(Object.keys(completed.pinnedDependencies)).toContain("zod");

    const pm = detectLockfilePackageManager(completed.files);
    expect(pm).toBe("pnpm");
    const marked = markLockfileStaleInFiles(completed.files, {
      reason: "pinned zod on import",
      packageManager: pm!,
      makeFile: (path, content) => ({ path, content }),
    });
    expect(marked.some((f) => f.path === LOCKFILE_STALE_MARKER_PATH)).toBe(true);
    const pkg = JSON.parse(
      marked.find((f) => f.path === "package.json")!.content,
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.zod).toBeTruthy();
  });
});
