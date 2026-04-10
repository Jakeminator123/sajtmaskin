import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SHADCN_COMPONENTS } from "../data/shadcn-components";
import { KNOWN_PACKAGES } from "../autofix/dep-completer";
import {
  CAPABILITY_PACKS,
  resolveCapabilityPacks,
  collectPackDeps,
  buildCapabilityHintsFromPacks,
} from "./capability-packs";
import type { InferredCapabilities } from "../capability-inference";

function readBaselineDeps(): Record<string, string> {
  const text = readFileSync(
    resolve(process.cwd(), "src/lib/gen/project-scaffold.ts"),
    "utf8",
  );
  const m = text.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
  if (!m) throw new Error("Could not find PACKAGE_JSON in project-scaffold.ts");
  return (JSON.parse(m[1]) as { dependencies?: Record<string, string> })
    .dependencies ?? {};
}

const baselineDeps = readBaselineDeps();

describe("CAPABILITY_PACKS data integrity", () => {
  it("every requiredDep is either in baseline or KNOWN_PACKAGES", () => {
    const missing: string[] = [];
    for (const pack of CAPABILITY_PACKS) {
      for (const pkg of Object.keys(pack.requiredDeps)) {
        if (!baselineDeps[pkg] && !KNOWN_PACKAGES[pkg]) {
          missing.push(`${pack.capability}: ${pkg}`);
        }
      }
    }
    expect(missing, `Deps missing from both baseline and KNOWN_PACKAGES: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("every shadcnComponent is a valid key in SHADCN_COMPONENTS", () => {
    const invalid: string[] = [];
    for (const pack of CAPABILITY_PACKS) {
      for (const comp of pack.shadcnComponents) {
        if (!(comp in SHADCN_COMPONENTS)) {
          invalid.push(`${pack.capability}: ${comp}`);
        }
      }
    }
    expect(invalid, `Unknown shadcn components: ${invalid.join(", ")}`).toHaveLength(0);
  });

  it("each capability appears at most once", () => {
    const seen = new Set<string>();
    for (const pack of CAPABILITY_PACKS) {
      expect(seen.has(pack.capability), `Duplicate capability: ${pack.capability}`).toBe(false);
      seen.add(pack.capability);
    }
  });
});

describe("collectPackDeps", () => {
  it("merges deps from multiple packs without duplicates", () => {
    const allCaps: InferredCapabilities = {
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
    const packs = resolveCapabilityPacks(allCaps);
    const deps = collectPackDeps(packs);
    expect(deps["@tanstack/react-table"]).toBeDefined();
    expect(deps["embla-carousel-autoplay"]).toBeDefined();
  });

  it("returns empty record when no packs have deps", () => {
    const allCaps: InferredCapabilities = {
      needsMotion: false,
      needs3D: false,
      needsCharts: false,
      needsDatabase: false,
      needsAuth: true,
      needsAppShell: false,
      needsDataUI: false,
      needsForms: false,
      needsEcommerce: false,
      needsCarousel: false,
      needsPremiumVisuals: false,
    };
    const deps = collectPackDeps(resolveCapabilityPacks(allCaps));
    expect(Object.keys(deps)).toHaveLength(0);
  });
});

describe("buildCapabilityHintsFromPacks", () => {
  it("returns null for empty pack list", () => {
    expect(buildCapabilityHintsFromPacks([])).toBeNull();
  });

  it("includes heading and all pack hints", () => {
    const allCaps: InferredCapabilities = {
      needsMotion: false,
      needs3D: false,
      needsCharts: true,
      needsDatabase: false,
      needsAuth: false,
      needsAppShell: false,
      needsDataUI: true,
      needsForms: true,
      needsEcommerce: false,
      needsCarousel: false,
      needsPremiumVisuals: false,
    };
    const hints = buildCapabilityHintsFromPacks(resolveCapabilityPacks(allCaps));
    expect(hints).toContain("## Detected Capabilities");
    expect(hints).toContain("Charts/data visualization");
    expect(hints).toContain("Data table");
    expect(hints).toContain("Forms requested");
  });
});
