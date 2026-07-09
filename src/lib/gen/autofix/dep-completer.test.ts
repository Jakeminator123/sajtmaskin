import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import {
  KNOWN_PACKAGES,
  mergeMissingDependenciesIntoPackageJson,
  resolveCapabilityDependencies,
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

  it("adds Vercel Analytics from the curated allowlist", () => {
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

  // Dossier wave 3 (capability `supabase-auth`, 2026-07-08): the Supabase
  // Auth SSR dossier's manifest dependency must resolve through the
  // KNOWN_PACKAGES pin (never `latest`), and the capability must select the
  // supabase-auth dossier — NOT clerk-auth (which owns the separate `auth`
  // capability).
  it("injects @supabase/ssr when supabase-auth is selected (not clerk)", () => {
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
});
