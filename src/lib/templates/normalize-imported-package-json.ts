import type { CodeFile } from "@/lib/gen/parser";

/**
 * Normalize (deterministic import-repair) for verbatim repo imports —
 * v0 templates from Blob (`/api/template`) and ZIP/GitHub imports
 * (`/api/engine/chats/init`).
 *
 * The motion packages (`framer-motion` / `motion-dom` / `motion-utils`) are
 * published in lockstep and rely on internal cross-package symbols that only
 * match AT THE SAME VERSION. Many v0 templates exact-pin `framer-motion`
 * while leaving its `motion-dom` sub-dependency on a floating `^` range.
 * `motion-dom@12.41.0` removed the internal `activeAnimations` export that
 * every earlier `framer-motion` still imports, so a fresh `npm install`
 * (no lockfile) resolves an internally inconsistent pair and `next dev`
 * dies at build time:
 *
 *   Export activeAnimations doesn't exist in target module
 *   ./node_modules/framer-motion/.../create-projection-node.mjs
 *
 * Upstream reference: motiondivision/motion#3744 (export stripped) and
 * resend/react-email#3599 (same failure + the `overrides` fix).
 *
 * The repair injects an npm `overrides` entry pinning `motion-dom` to the
 * last release that still ships the export. It only runs when it is provably
 * safe:
 *  - no lockfile in the import (a lockfile freezes transitive deps, so the
 *    skew cannot happen — and `npm ci` would reject overrides the lockfile
 *    does not reflect);
 *  - `framer-motion` is EXACT-pinned to a version older than the removal
 *    (>= 12.41.0 already matches the new motion-dom API);
 *  - `motion-dom` is not already declared or overridden by the template.
 *
 * An exact-pinned `motion` wrapper alone is deliberately NOT rewritten: it
 * declares `framer-motion` with a caret range, so the framer-motion +
 * motion-dom pair floats together and stays consistent.
 */

/** Last motion-dom release that still exports `activeAnimations`. */
export const MOTION_DOM_COMPAT_PIN = "12.40.0";

/** First motion-dom minor (within major 12) where the export is gone. */
const MOTION_DOM_REMOVAL_MINOR = 41;

/**
 * Lockfiles that the preview host actually HONORS (see
 * `preview-host/src/runtime.js` `resolveInstallCommand`): pnpm/yarn/package-lock
 * select frozen installs; anything else falls through to a fresh
 * `npm install`. Bun locks are deliberately NOT in this list (Codex P2,
 * PR #424): the preview runtime ignores them, so transitive deps still
 * resolve fresh and the motion-dom skew can occur — the repair must run.
 */
const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
]);

export type ImportNormalizeResult = {
  files: CodeFile[];
  /** Human-readable descriptions of applied repairs (empty = untouched). */
  applied: string[];
};

function parseExactPin(range: unknown): [number, number, number] | null {
  if (typeof range !== "string") return null;
  const match = range.trim().match(/^=?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Apply safe deterministic repairs to an imported repo's root `package.json`.
 * Returns the same array instance when nothing needed fixing.
 */
export function normalizeImportedRepoFiles(files: CodeFile[]): ImportNormalizeResult {
  const hasRootLockfile = files.some((file) => LOCKFILE_NAMES.has(file.path));
  if (hasRootLockfile) return { files, applied: [] };

  const pkgIndex = files.findIndex((file) => file.path === "package.json");
  if (pkgIndex === -1) return { files, applied: [] };

  let pkg: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(files[pkgIndex].content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { files, applied: [] };
    }
    pkg = parsed as Record<string, unknown>;
  } catch {
    return { files, applied: [] };
  }

  const dependencies = asRecord(pkg.dependencies);
  const devDependencies = asRecord(pkg.devDependencies);
  const optionalDependencies = asRecord(pkg.optionalDependencies);
  const peerDependencies = asRecord(pkg.peerDependencies);
  const overrides = asRecord(pkg.overrides);

  const framerPin =
    parseExactPin(dependencies["framer-motion"]) ??
    parseExactPin(devDependencies["framer-motion"]);
  if (!framerPin) return { files, applied: [] };

  const [major, minor] = framerPin;
  if (major !== 12 || minor >= MOTION_DOM_REMOVAL_MINOR) return { files, applied: [] };

  // A DIRECT motion-dom declaration in ANY dependency field blocks the repair:
  // npm throws EOVERRIDE when an override conflicts with a direct dependency
  // spec — optional/peer included (Codex P2, PR #424). An existing override is
  // the template managing the pin itself. Yarn `resolutions` deliberately does
  // NOT count as managed (Codex P2): with no lockfile the preview host always
  // installs with npm, which ignores resolutions — so the skew is still live
  // and our `overrides` entry is the only thing npm will honor.
  const motionDomAlreadyManaged =
    dependencies["motion-dom"] !== undefined ||
    devDependencies["motion-dom"] !== undefined ||
    optionalDependencies["motion-dom"] !== undefined ||
    peerDependencies["motion-dom"] !== undefined ||
    overrides["motion-dom"] !== undefined;
  if (motionDomAlreadyManaged) return { files, applied: [] };

  const nextPkg: Record<string, unknown> = {
    ...pkg,
    overrides: { ...overrides, "motion-dom": MOTION_DOM_COMPAT_PIN },
  };

  const nextFiles = [...files];
  nextFiles[pkgIndex] = {
    ...files[pkgIndex],
    content: `${JSON.stringify(nextPkg, null, 2)}\n`,
  };

  const pinnedRange =
    (dependencies["framer-motion"] ?? devDependencies["framer-motion"]) as string;
  return {
    files: nextFiles,
    applied: [
      `motion-dom override ${MOTION_DOM_COMPAT_PIN} (framer-motion exact-pinned @ ${pinnedRange}, no lockfile)`,
    ],
  };
}
