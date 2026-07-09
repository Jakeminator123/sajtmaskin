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
 * Strip a `packageManager: "pnpm@<11>.x.y"` pin (A#29). Corepack selects the
 * pnpm version from this field, and pnpm 10 and older IGNORE
 * `PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS` — the exact flag the preview host
 * sets so native-dep build scripts (`@tailwindcss/oxide`, esbuild, sharp) are
 * approved (`preview-host/src/runtime.js` `sanitizedEnv`). A template pinning
 * pnpm 10 therefore crash-loops the preview with `ERR_PNPM_IGNORED_BUILDS`.
 * Removing the pin lets corepack fall back to the VM default (pnpm 11.x), which
 * honors the flag. pnpm 11+ pins and yarn/npm pins are left untouched — they
 * are unaffected by this build-script-approval gap.
 */
function stripLegacyPnpmPackageManager(
  pkg: Record<string, unknown>,
): { pkg: Record<string, unknown>; message: string } | null {
  const pm = pkg.packageManager;
  if (typeof pm !== "string") return null;
  const match = pm.trim().match(/^pnpm@(\d+)/);
  if (!match) return null;
  const major = Number(match[1]);
  if (!Number.isFinite(major) || major >= 11) return null;
  const next = { ...pkg };
  delete next.packageManager;
  return {
    pkg: next,
    message:
      `stripped packageManager "${pm}" (pnpm ${major} ignores the preview host's ` +
      `build-script approval → ERR_PNPM_IGNORED_BUILDS crash-loop; VM default pnpm 11 honors it)`,
  };
}

/**
 * Inject the `motion-dom` compat override when it is provably safe (no lockfile,
 * exact-pinned old framer-motion, no existing motion-dom management). Returns
 * null when the repair does not apply. See the file header for the full
 * rationale.
 */
function applyMotionDomOverride(
  pkg: Record<string, unknown>,
): { pkg: Record<string, unknown>; message: string } | null {
  const dependencies = asRecord(pkg.dependencies);
  const devDependencies = asRecord(pkg.devDependencies);
  const optionalDependencies = asRecord(pkg.optionalDependencies);
  const peerDependencies = asRecord(pkg.peerDependencies);
  const overrides = asRecord(pkg.overrides);

  const framerPin =
    parseExactPin(dependencies["framer-motion"]) ??
    parseExactPin(devDependencies["framer-motion"]);
  if (!framerPin) return null;

  const [major, minor] = framerPin;
  if (major !== 12 || minor >= MOTION_DOM_REMOVAL_MINOR) return null;

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
  if (motionDomAlreadyManaged) return null;

  const pinnedRange =
    (dependencies["framer-motion"] ?? devDependencies["framer-motion"]) as string;
  return {
    pkg: { ...pkg, overrides: { ...overrides, "motion-dom": MOTION_DOM_COMPAT_PIN } },
    message: `motion-dom override ${MOTION_DOM_COMPAT_PIN} (framer-motion exact-pinned @ ${pinnedRange}, no lockfile)`,
  };
}

/**
 * Apply safe deterministic repairs to an imported repo's root `package.json`.
 * Returns the same array instance when nothing needed fixing.
 */
export function normalizeImportedRepoFiles(files: CodeFile[]): ImportNormalizeResult {
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

  let nextPkg = pkg;
  const applied: string[] = [];

  // Repair 1 (A#29): packageManager pnpm<11 strip — runs regardless of lockfile
  // (the build-script crash happens on frozen installs too).
  const pmFix = stripLegacyPnpmPackageManager(nextPkg);
  if (pmFix) {
    nextPkg = pmFix.pkg;
    applied.push(pmFix.message);
  }

  // Repair 2: motion-dom override — only safe without a root lockfile (a lock
  // freezes transitive deps, so the skew can't happen and `npm ci` would reject
  // an override the lock doesn't reflect).
  const hasRootLockfile = files.some((file) => LOCKFILE_NAMES.has(file.path));
  if (!hasRootLockfile) {
    const motionFix = applyMotionDomOverride(nextPkg);
    if (motionFix) {
      nextPkg = motionFix.pkg;
      applied.push(motionFix.message);
    }
  }

  if (applied.length === 0) return { files, applied: [] };

  const nextFiles = [...files];
  nextFiles[pkgIndex] = {
    ...files[pkgIndex],
    content: `${JSON.stringify(nextPkg, null, 2)}\n`,
  };
  return { files: nextFiles, applied };
}
