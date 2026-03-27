import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const LEGACY_V0_ROOT = join(repoRoot, "src", "lib", "v0");

const SCAN_ROOTS = [
  join(repoRoot, "src", "lib", "own-engine"),
  join(repoRoot, "src", "lib", "providers", "own-engine"),
];

/** Block legacy V0 Platform code and imports from own-engine modules. */
const FORBIDDEN = [
  /@\/lib\/v0\//,
  /from\s+["']v0-sdk["']/,
  /require\s*\(\s*["']v0-sdk["']\s*\)/,
];

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, acc);
    else if (st.isFile() && /\.[mc]?tsx?$/.test(name) && !name.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("own-engine ↔ v0 import boundary", () => {
  it("src/lib/own-engine and src/lib/providers/own-engine do not import v0 Platform internals", () => {
    expect(existsSync(LEGACY_V0_ROOT), `Legacy directory must be removed: ${LEGACY_V0_ROOT}`).toBe(
      false,
    );

    for (const root of SCAN_ROOTS) {
      if (!existsSync(root)) {
        throw new Error(
          `Expected ${root} to exist (cwd=${repoRoot}). Run Vitest from the repository root.`,
        );
      }
    }

    const violations = new Set<string>();
    for (const root of SCAN_ROOTS) {
      for (const file of walkTsFiles(root)) {
        const src = readFileSync(file, "utf8");
        for (const re of FORBIDDEN) {
          if (re.test(src)) {
            violations.add(`${relative(join(repoRoot, "src"), file)} matches /${re.source}/`);
          }
        }
      }
    }
    expect([...violations].sort(), [...violations].join("\n")).toEqual([]);
  });
});
