import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getAllDossiers } from "@/lib/gen/dossiers/registry";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import {
  buildDossierDeclaredVersions,
  buildStaleLockfileMarkerContent,
  completeProjectDependencies,
  detectLockfilePackageManager,
  isBuiltinPackage,
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

  // Dossier wave 1 (legacy import 2026-07-08): each new hard dossier's manifest
  // dependencies must resolve through KNOWN_PACKAGES pins, never `latest`.
  it("injects ably when realtime is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["realtime"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain("ably-realtime");

    const deps = resolveCapabilityDependencies(["realtime"]);
    expect(deps.ably).toBe(KNOWN_PACKAGES.ably);
    expect(deps.ably).not.toBe("latest");
  });

  it("injects ai + @ai-sdk/fal when image-generation is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["image-generation"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain(
      "fal-image-generation",
    );

    const deps = resolveCapabilityDependencies(["image-generation"]);
    expect(deps.ai).toBe(KNOWN_PACKAGES.ai);
    expect(deps["@ai-sdk/fal"]).toBe(KNOWN_PACKAGES["@ai-sdk/fal"]);
    expect(deps.ai).not.toBe("latest");
    expect(deps["@ai-sdk/fal"]).not.toBe("latest");
  });

  it("injects ai + @ai-sdk/openai + zod when ai-tool-calling is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["ai-tool-calling"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain(
      "ai-tool-calling-chat",
    );

    const deps = resolveCapabilityDependencies(["ai-tool-calling"]);
    expect(deps.ai).toBe(KNOWN_PACKAGES.ai);
    expect(deps["@ai-sdk/openai"]).toBe(KNOWN_PACKAGES["@ai-sdk/openai"]);
    expect(deps.zod).toBe(KNOWN_PACKAGES.zod);
    for (const pkg of ["ai", "@ai-sdk/openai", "zod"]) {
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

  // Legacy import final wave (capability `rag-chat`, 2026-07-09): the dossier
  // introduces NO new packages — its whole stack (AI SDK + drizzle/pg) must
  // already be pinned in KNOWN_PACKAGES so the backstop never emits `latest`.
  it("injects the AI SDK + drizzle/pg stack when rag-chat is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["rag-chat"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toEqual(["rag-chat"]);

    const deps = resolveCapabilityDependencies(["rag-chat"]);
    expect(deps.ai).toBe(KNOWN_PACKAGES.ai);
    expect(deps["@ai-sdk/openai"]).toBe(KNOWN_PACKAGES["@ai-sdk/openai"]);
    expect(deps["@ai-sdk/react"]).toBe(KNOWN_PACKAGES["@ai-sdk/react"]);
    expect(deps["drizzle-orm"]).toBe(KNOWN_PACKAGES["drizzle-orm"]);
    expect(deps.pg).toBe(KNOWN_PACKAGES.pg);
    expect(deps["@types/pg"]).toBe(KNOWN_PACKAGES["@types/pg"]);
    expect(deps["server-only"]).toBe(KNOWN_PACKAGES["server-only"]);
    for (const pkg of [
      "ai",
      "@ai-sdk/openai",
      "@ai-sdk/react",
      "drizzle-orm",
      "pg",
      "@types/pg",
      "server-only",
    ]) {
      expect(deps[pkg]).not.toBe("latest");
    }
  });

  it("selects the sibling database dossiers on explicit provider prompts", () => {
    const mongoSelection = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "spara produkterna i mongodb",
    });
    expect(mongoSelection.selected[0]?.entry.id).toBe("mongodb-atlas");

    const neonSelection = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "använd neon postgres för medlemsdatan",
    });
    expect(neonSelection.selected[0]?.entry.id).toBe("neon-postgres");
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

  // Dossier (capability `subscriptions`, legacy import 2026-07-09): the
  // paddle-billing manifest deps must resolve through KNOWN_PACKAGES pins,
  // never `latest`.
  it("injects the paddle + supabase stack when subscriptions is selected", () => {
    const dossierSelection = selectDossiersForRequest({
      requestedCapabilities: ["subscriptions"],
    });
    expect(dossierSelection.selected.map((s) => s.entry.id)).toContain("paddle-billing");

    const deps = resolveCapabilityDependencies(["subscriptions"]);
    expect(deps["@paddle/paddle-node-sdk"]).toBe(KNOWN_PACKAGES["@paddle/paddle-node-sdk"]);
    expect(deps["@supabase/ssr"]).toBe(KNOWN_PACKAGES["@supabase/ssr"]);
    expect(deps["@supabase/supabase-js"]).toBe(KNOWN_PACKAGES["@supabase/supabase-js"]);
    expect(deps["server-only"]).toBe(KNOWN_PACKAGES["server-only"]);
    for (const pkg of [
      "@paddle/paddle-node-sdk",
      "@supabase/ssr",
      "@supabase/supabase-js",
      "server-only",
    ]) {
      expect(deps[pkg]).not.toBe("latest");
    }
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
