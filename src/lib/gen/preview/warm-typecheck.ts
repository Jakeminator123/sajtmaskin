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
 *  - **Bounded by feature flag:** disabled unless
 *    `SAJTMASKIN_PRE_VM_TYPECHECK` is truthy. F3 generations can opt in
 *    by passing `force: true` (set by `runPreVmTypecheck` callers when
 *    `previewPolicy === "fidelity3"`).
 *  - **Scoped tsc:** runs `tsc --noEmit --project <cache>/tsconfig.json`
 *    inside `tmp/sajtmaskin/typecheck-cache/<scaffoldId>` after the
 *    generated files are written into the cache root. Intended for
 *    catching the long tail of "type-A is missing" / "callable signature"
 *    issues that survive esbuild syntax validation.
 *
 * Cache provisioning is intentionally out of scope here — the directory
 * is expected to be populated by an offline script (one-time per scaffold
 * deploy). When unprovisioned, the function reports `cache_cold` and the
 * pipeline continues unaffected.
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import type { CodeFile } from "@/lib/gen/parser";
import { hasTraversalSegment } from "@/lib/utils/path-utils";

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
}

const CACHE_ROOT_ENV = "SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT";
const FEATURE_FLAG_ENV = "SAJTMASKIN_PRE_VM_TYPECHECK";

function isFeatureFlagEnabled(): boolean {
  const raw = process.env[FEATURE_FLAG_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function resolveCacheRoot(): string {
  const override = process.env[CACHE_ROOT_ENV]?.trim();
  if (override) return override;
  return join(tmpdir(), "sajtmaskin", "typecheck-cache");
}

function resolveCacheForScaffold(scaffoldId: string | null | undefined): string | null {
  const id = scaffoldId?.trim();
  if (!id) return null;
  const root = resolveCacheRoot();
  return join(root, id);
}

function isCacheWarm(cacheDir: string): boolean {
  return (
    existsSync(cacheDir) &&
    existsSync(join(cacheDir, "node_modules")) &&
    existsSync(join(cacheDir, "tsconfig.json"))
  );
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
    const dest = join(cacheDir, safe);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content, "utf8");
    written.push(safe);
  }
  return written;
}

function cleanupWrittenFiles(cacheDir: string, paths: string[]): void {
  for (const rel of paths) {
    const dest = join(cacheDir, rel);
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
  const cacheDir =
    params.cacheDirOverride ?? resolveCacheForScaffold(params.scaffoldId);
  if (!cacheDir || !isCacheWarm(cacheDir)) {
    return {
      ok: true,
      skipped: "cache_cold",
      diagnostics: [],
      durationMs: Date.now() - startedAt,
    };
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
    const diagnostics = parseTscOutput(combined);
    return {
      ok: diagnostics.length === 0,
      diagnostics,
      durationMs: Date.now() - startedAt,
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
