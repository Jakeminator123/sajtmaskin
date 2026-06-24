import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Version-glue guard: the dependency baseline that GENERATED PROJECTS ship
 * (`PACKAGE_JSON` in `project-scaffold.ts`) must stay in lockstep with this
 * platform's own `package.json` for the load-bearing packages. The vendored
 * `src/components/ui/*` files are copied verbatim from the platform into user
 * projects, so a version skew (e.g. lucide-react drifting) can ship a component
 * that imports an icon/API the pinned runtime does not have -> user build break.
 *
 * `lucide-react` is checked at major.minor because the LUCIDE_ICONS allowlist
 * + check-lucide-icons.mjs + the shipped runtime must all agree on the exact
 * icon export set. If this fails after bumping the platform lucide, also bump
 * the `lucide-react` pin in project-scaffold.ts and run
 * `node scripts/dev/generate-lucide-icons.mjs`.
 */

const ROOT = process.cwd();

function parseVersion(range: string): { major: number; minor: number } {
  const cleaned = range.trim().replace(/^[\^~>=<\s]+/, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse a version out of "${range}"`);
  return { major: Number(match[1]), minor: Number(match[2]) };
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

/** Packages whose major must match between platform and generated projects. */
const MAJOR_LOCKED = [
  "react",
  "react-dom",
  "next",
  "radix-ui",
  "three",
  "@react-three/fiber",
] as const;

/** Packages whose major AND minor must match (exact-runtime-sensitive). */
const MAJOR_MINOR_LOCKED = ["lucide-react", "tailwindcss"] as const;

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
});
