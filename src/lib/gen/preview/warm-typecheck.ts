/**
 * Pre-VM typecheck against a warm `node_modules` cache for the active
 * scaffold. Lets `runFinalizePreflight` catch TS-only failures before
 * the VM's `npm install` + `next dev` pass — and feed them to the
 * existing repair loop so the LLM gets a chance to fix them inline.
 *
 * Design constraints (2026-04):
 *  - **Fail-open:** when the warm cache is missing or the worker import
 *    fails, the function returns `{ ok: true, skipped: "cache_cold", … }`
 *    so the finalize pipeline never blocks on infrastructure that hasn't
 *    been provisioned in this environment.
 *  - **Two ways in:** the env flag `SAJTMASKIN_PRE_VM_TYPECHECK`, OR
 *    `force: true` — which `fast-path.ts` sets unconditionally for F3
 *    (`previewPolicy === "fidelity3"`). F3 therefore runs this pass with the
 *    flag unset; the flag is not a global on/off switch. It is skipped only
 *    when neither applies, or when a planned quality gate already covers
 *    typecheck (`qualityGatePlanned`), where the flag wins and forces the
 *    pass anyway.
 *  - **Scoped tsc:** runs `tsc --noEmit --project <cache>/tsconfig.json`
 *    inside `tmp/sajtmaskin/typecheck-cache/<scaffoldId>` after the
 *    generated files are written into the cache root. Intended for
 *    catching the long tail of "type-A is missing" / "callable signature"
 *    issues that survive esbuild syntax validation.
 *  - **Only decidable diagnostics:** the cache reuses the repo's
 *    `node_modules`, so unresolved-module errors for dossier-supplied SDKs
 *    describe the cache rather than the code and are dropped before the
 *    repair loop (see `generated-only-modules.ts`). A cache whose tsconfig
 *    came from an older provisioning run produces cache-shaped diagnostics
 *    that cannot be filtered after the fact, so it counts as cold.
 *
 * Cache provisioning is intentionally out of scope here — the directory
 * is expected to be populated by an offline script (one-time per scaffold
 * deploy). When unprovisioned, the function reports `cache_cold` and the
 * pipeline continues unaffected.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import type { CodeFile } from "@/lib/gen/parser";
import { hasTraversalSegment } from "@/lib/utils/path-utils";
import { partitionUndecidableModuleDiagnostics } from "./generated-only-modules";

export type PreVmTypecheckSkipReason =
  | "feature_flag_disabled"
  | "cache_cold"
  | "no_files"
  | "tsc_unavailable"
  | "exception";

export interface PreVmTypecheckDiagnostic {
  filePath: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

export interface PreVmTypecheckResult {
  ok: boolean;
  skipped?: PreVmTypecheckSkipReason;
  diagnostics: PreVmTypecheckDiagnostic[];
  durationMs: number;
  /**
   * Packages whose unresolved-module diagnostics were dropped because the warm
   * cache cannot decide them — the VM installs them from the generated
   * `package.json`. Observability only (the repair loop never sees them); the
   * finalize pass logs it so a suppression is never invisible.
   */
  suppressedModules?: string[];
}

const CACHE_ROOT_ENV = "SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT";
const FEATURE_FLAG_ENV = "SAJTMASKIN_PRE_VM_TYPECHECK";

function isFeatureFlagEnabled(): boolean {
  const raw = process.env[FEATURE_FLAG_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

// turbopackIgnore: the cache root is runtime-resolved (env override, test
// override or os.tmpdir()), so Turbopack's static analysis saw a fully dynamic
// fs path and traced the whole project into every route importing the finalize
// pipeline (build warning: "matches 141577 files" at the existsSync call site).
// The cache is a runtime write/read target under /tmp, never a bundle asset.
// Every path handed to fs in this module is routed through `opaqueCachePath`
// so no raw dynamic string reaches the tracer. Same treatment as
// RUNS_ROOT_DIR in src/lib/logging/event-bus.ts.
function opaqueCachePath(dir: string, ...segments: string[]): string {
  return join(/* turbopackIgnore: true */ dir, ...segments);
}

function resolveCacheRoot(): string {
  const override = process.env[CACHE_ROOT_ENV]?.trim();
  if (override) return opaqueCachePath(override);
  return opaqueCachePath(tmpdir(), "sajtmaskin", "typecheck-cache");
}

function resolveCacheForScaffold(scaffoldId: string | null | undefined): string | null {
  const id = scaffoldId?.trim();
  if (!id) return null;
  const root = resolveCacheRoot();
  return opaqueCachePath(root, id);
}

/**
 * A cache is only usable when its tsconfig matches what provisioning writes
 * today. `scripts/dev/check-warm-cache.mjs` asserts the same thing, but a dev
 * who provisioned before a change to the script still has the old cache on
 * disk — and the runtime, not the smoke check, is what feeds the repair loop.
 * Two stale shapes both produce diagnostics that describe the CACHE rather than
 * the code: the repo's own `@/*` → `./src/*` alias (bogus TS2307 for every
 * `@/components/ui/*` import) and the retired SDK stub aliases from #600/#603
 * (bogus TS2305, e.g. `@clerk/nextjs` "has no exported member 'useUser'").
 * Neither is suppressible after the fact, so a stale cache is treated as cold.
 *
 * @returns a short reason when the cache is unusable, `null` when it is warm.
 */
function describeCacheProblem(cacheDir: string): string | null {
  if (!existsSync(cacheDir)) return "cache dir missing";
  if (!existsSync(opaqueCachePath(cacheDir, "node_modules"))) return "node_modules missing";
  const tsconfigPath = opaqueCachePath(cacheDir, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return "tsconfig.json missing";
  let paths: Record<string, unknown>;
  try {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    paths = tsconfig.compilerOptions?.paths ?? {};
  } catch (err) {
    return `tsconfig.json unreadable (${err instanceof Error ? err.message : String(err)})`;
  }
  const appAlias = paths["@/*"];
  if (!Array.isArray(appAlias) || appAlias.length !== 1 || appAlias[0] !== "./*") {
    return `tsconfig.json maps "@/*" to ${JSON.stringify(appAlias)} instead of ["./*"]`;
  }
  const retiredAliases = Object.keys(paths).filter((alias) => alias !== "@/*");
  if (retiredAliases.length > 0) {
    return `tsconfig.json carries retired SDK stub alias(es) ${retiredAliases.join(", ")}`;
  }
  return null;
}

function writeFilesIntoCache(cacheDir: string, files: CodeFile[]): string[] {
  const written: string[] = [];
  for (const file of files) {
    if (!file.path || typeof file.content !== "string") continue;
    const safe = file.path.replace(/\\/g, "/");
    // Segment-based traversal check (Codex P1 on PR #396): a substring
    // `includes("..")` silently dropped catch-all route files
    // (`app/docs/[...slug]/page.tsx`) from the warm cache, so tsc could
    // report green without ever checking the route that runs in preview.
    if (hasTraversalSegment(safe) || safe.startsWith("/")) continue;
    const dest = opaqueCachePath(cacheDir, safe);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content, "utf8");
    written.push(safe);
  }
  return written;
}

function cleanupWrittenFiles(cacheDir: string, paths: string[]): void {
  for (const rel of paths) {
    const dest = opaqueCachePath(cacheDir, rel);
    try {
      rmSync(dest, { force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

const TSC_DIAGNOSTIC_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

function parseTscOutput(output: string): PreVmTypecheckDiagnostic[] {
  const diagnostics: PreVmTypecheckDiagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(TSC_DIAGNOSTIC_RE);
    if (!match) continue;
    const [, filePath, lineStr, columnStr, code, message] = match;
    diagnostics.push({
      filePath,
      line: Number(lineStr) || 0,
      column: Number(columnStr) || 0,
      code,
      message,
    });
  }
  return diagnostics;
}

export interface RunPreVmTypecheckParams {
  scaffoldId: string | null | undefined;
  files: CodeFile[];
  /**
   * When true, run regardless of `SAJTMASKIN_PRE_VM_TYPECHECK`. F3 callers
   * set this so the integrations build always gets the extra check.
   */
  force?: boolean;
  /** Override the per-scaffold cache directory (testing). */
  cacheDirOverride?: string;
}

export async function runPreVmTypecheck(
  params: RunPreVmTypecheckParams,
): Promise<PreVmTypecheckResult> {
  const startedAt = Date.now();
  if (!params.force && !isFeatureFlagEnabled()) {
    return { ok: true, skipped: "feature_flag_disabled", diagnostics: [], durationMs: 0 };
  }
  if (!params.files || params.files.length === 0) {
    return { ok: true, skipped: "no_files", diagnostics: [], durationMs: 0 };
  }
  const cacheDir = params.cacheDirOverride
    ? opaqueCachePath(params.cacheDirOverride)
    : resolveCacheForScaffold(params.scaffoldId);
  const coldResult: PreVmTypecheckResult = {
    ok: true,
    skipped: "cache_cold",
    diagnostics: [],
    durationMs: Date.now() - startedAt,
  };
  if (!cacheDir) return coldResult;
  const cacheProblem = describeCacheProblem(cacheDir);
  if (cacheProblem) {
    // A cache that exists but is stale is an operator problem the `cache_cold`
    // telemetry alone cannot explain, so name it once. (A missing cache is the
    // normal unprovisioned case and already warned about by the caller.)
    if (existsSync(cacheDir)) {
      console.warn(
        `[warm-typecheck] Warm cache at ${cacheDir} is stale — ${cacheProblem}. Treating it as cold; run \`npm run provision:warm-cache\` (see docs/runbooks/warm-cache-setup.md).`,
      );
    }
    return coldResult;
  }

  let written: string[] = [];
  try {
    written = writeFilesIntoCache(cacheDir, params.files);
    if (written.length === 0) {
      return {
        ok: true,
        skipped: "no_files",
        diagnostics: [],
        durationMs: Date.now() - startedAt,
      };
    }
    const result = spawnSync("npx", ["--no-install", "tsc", "--noEmit"], {
      cwd: cacheDir,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 60_000,
    });
    if (result.error) {
      return {
        ok: true,
        skipped: "tsc_unavailable",
        diagnostics: [],
        durationMs: Date.now() - startedAt,
      };
    }
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const { kept, suppressedModules } = partitionUndecidableModuleDiagnostics(
      parseTscOutput(combined),
      cacheDir,
    );
    return {
      ok: kept.length === 0,
      diagnostics: kept,
      durationMs: Date.now() - startedAt,
      ...(suppressedModules.length > 0 ? { suppressedModules } : {}),
    };
  } catch (err) {
    // Tsc-process crashed (different from "tsc reported diagnostics"). The
    // synthetic `(pre-vm-typecheck)` diagnostic was previously bubbled to
    // the repair loop, which then fed an LLM-fixer with text that looks
    // like a TS error but isn't tied to any real source location. That
    // wastes a fixer call and can prompt nonsense edits. Now: log + skip.
    if (process.env.SAJTMASKIN_DEV_LOG) {
      console.warn(
        "[warm-typecheck] exception (skipping repair):",
        err instanceof Error ? err.message : String(err),
      );
    }
    return {
      ok: true,
      skipped: "exception",
      diagnostics: [],
      durationMs: Date.now() - startedAt,
    };
  } finally {
    cleanupWrittenFiles(cacheDir, written);
  }
}

/** Format diagnostics for the repair loop's `errors` channel (file:line:col). */
export function formatTypecheckDiagnosticsForRepair(
  diagnostics: PreVmTypecheckDiagnostic[],
): string[] {
  return diagnostics.map(
    (d) => `${d.filePath}:${d.line}:${d.column} ${d.code}: ${d.message}`,
  );
}
