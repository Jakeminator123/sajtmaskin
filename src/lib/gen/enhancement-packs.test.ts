import { describe, expect, it } from "vitest";
import { SHADCN_COMPONENTS } from "./data/shadcn-components";
import { KNOWN_PACKAGES } from "./autofix/dep-completer";
import {
  ENHANCEMENT_PACKS,
  resolveEnhancementPacks,
  collectEnhancementDeps,
  buildEnhancementGuidance,
} from "./enhancement-packs";
import type { InferredCapabilities } from "./capability-inference";

function readBaselineDeps(): Record<string, string> {
  const { readFileSync } = require("node:fs");
  const { resolve } = require("node:path");
  const text = readFileSync(
    resolve(process.cwd(), "src/lib/gen/project-scaffold.ts"),
    "utf8",
  ) as string;
  const m = text.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
  if (!m) throw new Error("Could not find PACKAGE_JSON in project-scaffold.ts");
  return (JSON.parse(m[1]) as { dependencies?: Record<string, string> })
    .dependencies ?? {};
}

const baselineDeps = readBaselineDeps();

describe("ENHANCEMENT_PACKS data integrity", () => {
  it("every npmDep is in baseline or KNOWN_PACKAGES", () => {
    const missing: string[] = [];
    for (const pack of ENHANCEMENT_PACKS) {
      for (const pkg of Object.keys(pack.npmDeps)) {
        if (!baselineDeps[pkg] && !KNOWN_PACKAGES[pkg]) {
          missing.push(`${pack.id}: ${pkg}`);
        }
      }
    }
    expect(
      missing,
      `Deps missing from both baseline and KNOWN_PACKAGES: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  it("every shadcnComponent is a valid key in SHADCN_COMPONENTS", () => {
    const invalid: string[] = [];
    for (const pack of ENHANCEMENT_PACKS) {
      for (const comp of pack.shadcnComponents) {
        if (!(comp in SHADCN_COMPONENTS)) {
          invalid.push(`${pack.id}: ${comp}`);
        }
      }
    }
    expect(
      invalid,
      `Unknown shadcn components: ${invalid.join(", ")}`,
    ).toHaveLength(0);
  });

  it("each pack has a unique id", () => {
    const ids = ENHANCEMENT_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each pack has non-empty promptGuidance", () => {
    for (const pack of ENHANCEMENT_PACKS) {
      expect(pack.promptGuidance.length, `${pack.id} has empty guidance`).toBeGreaterThan(50);
    }
  });
});

describe("resolveEnhancementPacks", () => {
  const emptyCaps: InferredCapabilities = {
    needsMotion: false,
    needs3D: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
    needsEcommerce: false,
    needsCarousel: false,
    needsPremiumVisuals: false,
  };

  it("returns matching packs for active capabilities", () => {
    const packs = resolveEnhancementPacks({ ...emptyCaps, needsForms: true, needsCharts: true });
    const ids = packs.map((p) => p.id);
    expect(ids).toContain("form-pack");
    expect(ids).toContain("chart-pack");
  });

  it("returns empty array when no capabilities match", () => {
    expect(resolveEnhancementPacks(emptyCaps)).toHaveLength(0);
  });

  it("includes feedback-pack and command-pack when needsAppShell", () => {
    const packs = resolveEnhancementPacks({ ...emptyCaps, needsAppShell: true });
    const ids = packs.map((p) => p.id);
    expect(ids).toContain("feedback-pack");
    expect(ids).toContain("command-pack");
  });
});

describe("collectEnhancementDeps", () => {
  const emptyCaps: InferredCapabilities = {
    needsMotion: false,
    needs3D: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: true,
    needsForms: false,
    needsEcommerce: false,
    needsCarousel: true,
    needsPremiumVisuals: false,
  };

  it("collects deps from triggered packs", () => {
    const deps = collectEnhancementDeps(resolveEnhancementPacks(emptyCaps));
    expect(deps["@tanstack/react-table"]).toBeDefined();
    expect(deps["embla-carousel-autoplay"]).toBeDefined();
  });
});

describe("buildEnhancementGuidance", () => {
  it("returns null for empty pack list", () => {
    expect(buildEnhancementGuidance([])).toBeNull();
  });

  it("includes heading and pack guidance", () => {
    const emptyCaps: InferredCapabilities = {
      needsMotion: false,
      needs3D: false,
      needsCharts: true,
      needsDatabase: false,
      needsAuth: false,
      needsAppShell: false,
      needsDataUI: false,
      needsForms: true,
      needsEcommerce: false,
      needsCarousel: false,
      needsPremiumVisuals: false,
    };
    const guidance = buildEnhancementGuidance(resolveEnhancementPacks(emptyCaps));
    expect(guidance).toContain("## Enhancement Packs");
    expect(guidance).toContain("Form Components");
    expect(guidance).toContain("Chart Components");
  });
});
