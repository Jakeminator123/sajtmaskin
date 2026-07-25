/**
 * Which "Cannot find module" diagnostics the pre-VM typecheck is allowed to
 * trust.
 *
 * The warm cache reuses THIS repo's `node_modules` (a symlink, see
 * `scripts/provision-warm-cache.ts`), but a generated site gets its SDKs from
 * the dossier manifests' `dependencies` — packages the platform does not
 * install. So `tsc` in the cache reports `TS2307` for perfectly valid generated
 * code (`import * as Ably from "ably"`, `@supabase/ssr`, `mongodb`, …) and the
 * repair loop is handed a diagnostic that describes the CACHE, not the code:
 * the LLM fixer can "fix" a correct import away, and the round costs time and
 * money for nothing.
 *
 * The install status of those packages is simply not decidable here — the VM
 * installs them later from the generated `package.json`. So they are dropped
 * before the repair loop instead of being guessed at, and the VM build
 * (`ReleaseGate`) stays authoritative for whether a dependency really resolves.
 *
 * Why dropping is safe: `dep-completer.ts` pins every dossier-declared package
 * into the generated `package.json` whenever the code imports it (import scan
 * on the export path, plus the capability backstop), resolving the version from
 * the curated allowlist or the manifest entry's own pin
 * (`resolveExportableVersion`). `dep-completer.test.ts` asserts that coverage
 * through the same resolver, so a dropped `TS2307` can never mean "nobody will
 * install this".
 *
 * Chosen over the alternatives on the 2026-07-25 bug-swarm row: installing the
 * SDKs into the cache means a heavy cache plus version drift against the
 * manifests, and per-package stubs cannot work at all — a stub narrower than
 * the real SDK just trades `TS2307` for `TS2305`, which is the same false
 * diagnostic in a different code (verified: the `@clerk/nextjs` stub from #603
 * made valid `useUser()` code fail with
 * `Module '"@clerk/nextjs"' has no exported member 'useUser'`).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  isBuiltinPackage,
  normalizePackageName,
  parseManifestDependencySpec,
} from "@/lib/gen/autofix/dep-completer";
import { getAllDossiers } from "@/lib/gen/dossiers/registry";

/** tsc's unresolved-module diagnostic under `moduleResolution: bundler`. */
const UNRESOLVED_MODULE_CODE = "TS2307";

/** Both TS2307 message forms start with `Cannot find module '<specifier>'`. */
const UNRESOLVED_MODULE_SPECIFIER_RE = /Cannot find module '([^']+)'/;

/**
 * Packages supplied by the GENERATED project rather than this repo, derived
 * from the dossier manifests (the canonical owner of dossier dependencies) so
 * a new dossier needs no bookkeeping here. Entries go through the manifest spec
 * parser because the schema allows a semver-pinned form (`stripe@^14.0.0`) that
 * would otherwise never match a diagnostic's module specifier.
 */
export function getGeneratedOnlyPackages(): ReadonlySet<string> {
  const packages = new Set<string>();
  for (const dossier of getAllDossiers()) {
    for (const dep of dossier.dependencies ?? []) {
      const { pkg } = parseManifestDependencySpec(dep);
      if (!pkg || isBuiltinPackage(pkg)) continue;
      packages.add(pkg);
    }
  }
  return packages;
}

export interface UndecidableModuleDiagnostic {
  code: string;
  message: string;
}

export interface PartitionedModuleDiagnostics<T> {
  /** Diagnostics the pre-VM pass may act on. */
  kept: T[];
  /** Package names whose unresolved-module diagnostics were dropped. */
  suppressedModules: string[];
}

/**
 * Split diagnostics into the ones the warm cache can decide and the ones it
 * cannot. A `TS2307` is dropped only when the specifier's package is
 * dossier-declared AND absent from the cache's `node_modules` — a bad SUBPATH
 * of an installed package (`"stripe/nope"`) is a real error and stays.
 */
export function partitionUndecidableModuleDiagnostics<T extends UndecidableModuleDiagnostic>(
  diagnostics: readonly T[],
  cacheDir: string,
): PartitionedModuleDiagnostics<T> {
  const kept: T[] = [];
  const suppressed = new Set<string>();
  let generatedOnly: ReadonlySet<string> | null = null;

  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== UNRESOLVED_MODULE_CODE) {
      kept.push(diagnostic);
      continue;
    }
    const specifier = diagnostic.message.match(UNRESOLVED_MODULE_SPECIFIER_RE)?.[1];
    if (!specifier) {
      kept.push(diagnostic);
      continue;
    }
    const pkg = normalizePackageName(specifier);
    generatedOnly ??= getGeneratedOnlyPackages();
    if (!generatedOnly.has(pkg) || isPackageInstalled(cacheDir, pkg)) {
      kept.push(diagnostic);
      continue;
    }
    suppressed.add(pkg);
  }

  return { kept, suppressedModules: [...suppressed].sort() };
}

function isPackageInstalled(cacheDir: string, pkg: string): boolean {
  try {
    return existsSync(join(cacheDir, "node_modules", ...pkg.split("/")));
  } catch {
    return false;
  }
}
