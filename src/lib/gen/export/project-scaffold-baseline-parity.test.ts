import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_PACKAGES } from "@/lib/gen/autofix/dep-completer";

/**
 * Version-glue guard: the dependency baseline that GENERATED PROJECTS ship
 * (`PACKAGE_JSON` in `project-scaffold.ts`) must stay in lockstep with this
 * platform's own `package.json` for the load-bearing packages. The vendored
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

function readGeneratedBaselineDeps(): Record<string, string> {
  const src = readFileSync(join(ROOT, "src/lib/gen/export/project-scaffold.ts"), "utf8");
  const match = src.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
  if (!match) throw new Error("Could not find PACKAGE_JSON template in project-scaffold.ts");
  const parsed = JSON.parse(match[1]) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
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
 * The React-Three 3D stack is no longer in the generated baseline (it is
 * capability-gated and injected on demand). Its pins now live in
 * KNOWN_PACKAGES (dep-completer) and must still match the platform's installed
 * 3D stack exactly, because the `three-fiber-canvas` dossier ships vendored
 * shell code coupled to specific three/fiber/drei versions.
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
    it(`${pkg}: KNOWN_PACKAGES pin matches platform major.minor.patch`, () => {
      const p = platform[pkg];
      const k = KNOWN_PACKAGES[pkg];
      expect(p, `${pkg} missing from platform package.json`).toBeTruthy();
      expect(k, `${pkg} missing from KNOWN_PACKAGES`).toBeTruthy();
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
