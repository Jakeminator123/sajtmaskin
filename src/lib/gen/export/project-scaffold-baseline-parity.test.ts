import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERATED_SITE_DEPENDENCY_CATALOG_PATH,
  GENERATED_SITE_KNOWN_PACKAGES,
} from "@/lib/gen/data/generated-site-dependency-catalog";
import { mergePackageJsonWithBaseline } from "./project-scaffold";

/**
 * Version-glue guard: the dependency baseline that GENERATED PROJECTS ship
 * (`exportBaseline` in `config/generated-site-dependencies.json`, which
 * `project-scaffold.ts` merges model output onto) must stay in lockstep with
 * this platform's own `package.json` for the load-bearing packages. The vendored
 * `src/components/ui/*` files are copied verbatim from the platform into user
 * projects, so a version skew (e.g. lucide-react drifting) can ship a component
 * that imports an icon/API the pinned runtime does not have -> user build break.
 *
 * Lock granularity per package is defined by the buckets below. The runtime-
 * sensitive packages (lucide-react + the React-Three 3D stack) are locked at
 * the full declared major.minor.patch because their pins currently match
 * exactly and a silent minor/patch skew there is the highest build-break risk.
 * If a lucide bump trips this, also bump the `lucide-react` pin in
 * project-scaffold.ts and run `node scripts/dev/generate-lucide-icons.mjs`.
 */

const ROOT = process.cwd();

function parseVersion(range: string): { major: number; minor: number; patch: number } {
  const cleaned = range.trim().replace(/^[\^~>=<\s]+/, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse a version out of "${range}"`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function readPlatformDeps(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
}

function readCatalogExportBaseline(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
  [key: string]: unknown;
} {
  const raw = readFileSync(join(ROOT, GENERATED_SITE_DEPENDENCY_CATALOG_PATH), "utf8");
  const parsed = JSON.parse(raw) as { exportBaseline?: Record<string, unknown> };
  if (!parsed.exportBaseline) {
    throw new Error(`Missing "exportBaseline" in ${GENERATED_SITE_DEPENDENCY_CATALOG_PATH}`);
  }
  return parsed.exportBaseline;
}

function readGeneratedBaselineDeps(): Record<string, string> {
  const baseline = readCatalogExportBaseline();
  return { ...(baseline.dependencies ?? {}), ...(baseline.devDependencies ?? {}) };
}

/**
 * Packages whose MAJOR must match between platform and generated projects.
 * `framer-motion` lives here (not major.minor) because the platform caret
 * range (`^12.29.0`) and the generated pin (`12.38.0`) legitimately differ at
 * the minor level; only a major bump is a real compatibility break.
 */
const MAJOR_LOCKED = [
  "react",
  "react-dom",
  "next",
  "radix-ui",
  "framer-motion",
] as const;

/** Packages whose major AND minor must match (exact-runtime-sensitive). */
const MAJOR_MINOR_LOCKED = ["tailwindcss"] as const;

/**
 * Packages locked at the full major.minor.patch level — the highest build-break
 * risk if they drift.
 *
 * - `lucide-react`: the LUCIDE_ICONS allowlist is generated from, and validated
 *   (`check-lucide-icons.mjs`) against, the platform's lucide, while generated
 *   projects ship the exact pin below. Locking the declared patch keeps those
 *   in lockstep so the allowlist can never admit an icon the shipped runtime
 *   lacks.
 *
 * The React-Three 3D stack used to be locked here too, but it is no longer part
 * of the generated baseline (it is capability-gated). Its version lock now lives
 * in the `3D stack gated pins` block below, comparing KNOWN_PACKAGES to the
 * platform instead of the baseline.
 *
 * Residual (accepted): this compares the *declared* versions, not the resolved
 * lockfile. A pure lockfile patch bump on a platform caret range is not caught
 * here — but for lucide the allowlist is BASE-names-only (stable across
 * patches) and `check-lucide-icons.mjs` re-validates every name against the
 * installed package in CI, so a removed/renamed export is still caught.
 */
const MAJOR_MINOR_PATCH_LOCKED = ["lucide-react"] as const;

describe("project-scaffold baseline parity with platform package.json", () => {
  const platform = readPlatformDeps();
  const generated = readGeneratedBaselineDeps();

  for (const pkg of MAJOR_LOCKED) {
    it(`${pkg}: generated major matches platform`, () => {
      const p = platform[pkg];
      const g = generated[pkg];
      expect(p, `${pkg} missing from platform package.json`).toBeTruthy();
      expect(g, `${pkg} missing from generated baseline`).toBeTruthy();
      expect(parseVersion(g).major).toBe(parseVersion(p).major);
    });
  }

  for (const pkg of MAJOR_MINOR_LOCKED) {
    it(`${pkg}: generated major.minor matches platform`, () => {
      const p = platform[pkg];
      const g = generated[pkg];
      expect(p, `${pkg} missing from platform package.json`).toBeTruthy();
      expect(g, `${pkg} missing from generated baseline`).toBeTruthy();
      const pv = parseVersion(p);
      const gv = parseVersion(g);
      expect({ major: gv.major, minor: gv.minor }).toEqual({ major: pv.major, minor: pv.minor });
    });
  }

  for (const pkg of MAJOR_MINOR_PATCH_LOCKED) {
    it(`${pkg}: generated major.minor.patch matches platform (declared)`, () => {
      const p = platform[pkg];
      const g = generated[pkg];
      expect(p, `${pkg} missing from platform package.json`).toBeTruthy();
      expect(g, `${pkg} missing from generated baseline`).toBeTruthy();
      expect(parseVersion(g)).toEqual(parseVersion(p));
    });
  }
});

/**
 * Single-source guard: what `project-scaffold` actually writes into a generated
 * `package.json` must come from the catalog, so a version can never be edited
 * in the TS module and silently diverge from `config/`.
 */
describe("generated package.json comes from the dependency catalog", () => {
  it("merging an empty model onto the baseline reproduces exportBaseline verbatim", () => {
    const merged = mergePackageJsonWithBaseline({}, { dependencies: {} });
    expect(merged).toEqual(readCatalogExportBaseline());
  });
});

/**
 * The React-Three 3D stack is no longer in the generated baseline (it is
 * capability-gated and injected on demand). Its pins live in the catalog's
 * `knownPackages` (read by dep-completer) and must still match the platform's
 * installed 3D stack exactly, because the `three-fiber-canvas` dossier ships
 * vendored shell code coupled to specific three/fiber/drei versions.
 *
 * `@react-three/rapier` is only installed here for the warm-cache typecheck.
 * If it ever leaves the platform `package.json`, this comparison loses its
 * counterpart — drop rapier from the list below rather than weakening the
 * assertion for the whole stack.
 */
const THREE_STACK_PACKAGES = [
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "@react-three/rapier",
] as const;

describe("3D stack gated pins parity with platform package.json", () => {
  const platform = readPlatformDeps();
  const generated = readGeneratedBaselineDeps();

  for (const pkg of THREE_STACK_PACKAGES) {
    it(`${pkg}: catalog knownPackages pin matches platform major.minor.patch`, () => {
      const p = platform[pkg];
      const k = GENERATED_SITE_KNOWN_PACKAGES[pkg];
      expect(p, `${pkg} missing from platform package.json`).toBeTruthy();
      expect(
        k,
        `${pkg} missing from knownPackages in ${GENERATED_SITE_DEPENDENCY_CATALOG_PATH}`,
      ).toBeTruthy();
      expect(parseVersion(k)).toEqual(parseVersion(p));
    });

    it(`${pkg}: NOT shipped in the always-installed generated baseline`, () => {
      expect(
        generated[pkg],
        `${pkg} must be capability-gated, not in the baseline`,
      ).toBeUndefined();
    });
  }
});
