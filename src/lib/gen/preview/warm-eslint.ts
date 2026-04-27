/**
 * Pre-VM eslint pass against the warm per-scaffold workspace cache.
 * Mirrors {@link runPreVmTypecheck} in `warm-typecheck.ts`: fail-open,
 * feature-flag gated, bounded to a single spawn.
 *
 * Design constraints (2026-04, P34 Fas A+B):
 *  - **Fail-open:** returns `{ ok: true, skipped: "cache_cold" | ... }` when
 *    the cache or eslint is unavailable. The finalize pipeline never blocks
 *    on infrastructure that hasn't been provisioned.
 *  - **Feature flag:** disabled unless `SAJTMASKIN_BLOCKING_ESLINT` is truthy.
 *    Tier-3 callers can pass `force: true`. This keeps Fas A+B a no-op in
 *    production until we've measured latency.
 *  - **Scoped eslint:** runs `npx --no-install eslint . --max-warnings=<N>`
 *    inside the scaffold cache. Cache must have `eslint.config.mjs` +
 *    `eslint-config-next` installed (same invariant as the exported project
 *    scaffold).
 *  - **Issues routed through existing repair plumbing:** parsed via
 *    `parseLintOutput` (ESLint stylish format) in `lint-output.ts`, so the
 *    same LLM-fixer infrastructure as typecheck/esbuild can consume them.
 *
 * Cache provisioning is shared with warm-typecheck — the eslint pass only
 * adds a file-write + spawn on top. No additional offline script needed
 * provided the scaffold's `package.json` already has eslint-config-next.
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import type { CodeFile } from "@/lib/gen/parser";
import { parseLintOutput, type ParsedLintIssue } from "@/lib/gen/verify/lint-output";

export type PreVmEslintSkipReason =
  | "feature_flag_disabled"
  | "cache_cold"
  | "no_files"
  | "eslint_unavailable"
  | "exception";

export interface PreVmEslintResult {
  ok: boolean;
  skipped?: PreVmEslintSkipReason;
  issues: ParsedLintIssue[];
  /** Issues that are errors (counted against the gate). Warnings are listed in `issues`. */
  errorCount: number;
  durationMs: number;
}

const CACHE_ROOT_ENV = "SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT";
const FEATURE_FLAG_ENV = "SAJTMASKIN_BLOCKING_ESLINT";
const MAX_WARNINGS_ENV = "SAJTMASKIN_BLOCKING_ESLINT_MAX_WARNINGS";
const DEFAULT_MAX_WARNINGS = 20;

function isFeatureFlagEnabled(): boolean {
  const raw = process.env[FEATURE_FLAG_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function resolveMaxWarnings(): number {
  const raw = process.env[MAX_WARNINGS_ENV]?.trim();
  if (!raw) return DEFAULT_MAX_WARNINGS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_WARNINGS;
  return parsed;
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

function isEslintCacheWarm(cacheDir: string): boolean {
  return (
    existsSync(cacheDir) &&
    existsSync(join(cacheDir, "node_modules")) &&
    // ESLint flat-config: either eslint.config.mjs or eslint.config.js/ts
    (existsSync(join(cacheDir, "eslint.config.mjs")) ||
      existsSync(join(cacheDir, "eslint.config.js")) ||
      existsSync(join(cacheDir, "eslint.config.ts")))
  );
}

function writeFilesIntoCache(cacheDir: string, files: CodeFile[]): string[] {
  const written: string[] = [];
  for (const file of files) {
    if (!file.path || typeof file.content !== "string") continue;
    const safe = file.path.replace(/\\/g, "/");
    if (safe.includes("..") || safe.startsWith("/")) continue;
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
      /* best-effort */
    }
  }
}

function buildStylishOutput(result: {
  stdout?: string | null;
  stderr?: string | null;
}): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

export interface RunPreVmEslintParams {
  scaffoldId: string | null | undefined;
  files: CodeFile[];
  /** Run regardless of `SAJTMASKIN_BLOCKING_ESLINT`. F3 callers can set this. */
  force?: boolean;
  /** Override the per-scaffold cache directory (testing). */
  cacheDirOverride?: string;
  /** Override max warnings threshold; defaults to env or 20. */
  maxWarningsOverride?: number;
}

export async function runPreVmEslint(
  params: RunPreVmEslintParams,
): Promise<PreVmEslintResult> {
  const startedAt = Date.now();
  if (!params.force && !isFeatureFlagEnabled()) {
    return {
      ok: true,
      skipped: "feature_flag_disabled",
      issues: [],
      errorCount: 0,
      durationMs: 0,
    };
  }
  if (!params.files || params.files.length === 0) {
    return {
      ok: true,
      skipped: "no_files",
      issues: [],
      errorCount: 0,
      durationMs: 0,
    };
  }
  const cacheDir =
    params.cacheDirOverride ?? resolveCacheForScaffold(params.scaffoldId);
  if (!cacheDir || !isEslintCacheWarm(cacheDir)) {
    return {
      ok: true,
      skipped: "cache_cold",
      issues: [],
      errorCount: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const maxWarnings = params.maxWarningsOverride ?? resolveMaxWarnings();
  let written: string[] = [];
  try {
    written = writeFilesIntoCache(cacheDir, params.files);
    if (written.length === 0) {
      return {
        ok: true,
        skipped: "no_files",
        issues: [],
        errorCount: 0,
        durationMs: Date.now() - startedAt,
      };
    }
    const result = spawnSync(
      "npx",
      [
        "--no-install",
        "eslint",
        ".",
        "--format",
        "stylish",
        "--max-warnings",
        String(maxWarnings),
      ],
      {
        cwd: cacheDir,
        encoding: "utf8",
        shell: process.platform === "win32",
        timeout: 60_000,
      },
    );
    if (result.error) {
      return {
        ok: true,
        skipped: "eslint_unavailable",
        issues: [],
        errorCount: 0,
        durationMs: Date.now() - startedAt,
      };
    }
    const combined = buildStylishOutput(result);
    const issues = parseLintOutput(combined);
    const errorCount = issues.filter((i) => i.severity === "error").length;
    // ESLint exits 0 when passed, 1 when errors/too-many-warnings, 2 on config
    // errors. Treat exit 0 as ok; otherwise the diagnostics we parsed are the
    // source of truth. If we parsed nothing but exit != 0, it's a config
    // error — fail-open to avoid blocking generations on eslint misconfig.
    if (result.status === 0) {
      return {
        ok: true,
        issues,
        errorCount,
        durationMs: Date.now() - startedAt,
      };
    }
    if (issues.length === 0) {
      return {
        ok: true,
        skipped: "eslint_unavailable",
        issues: [],
        errorCount: 0,
        durationMs: Date.now() - startedAt,
      };
    }
    return {
      ok: errorCount === 0,
      issues,
      errorCount,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    // ESLint-process crashed (cache cold, missing config, etc.). Same logic
    // as warm-typecheck.ts: do NOT bubble a synthetic `(pre-vm-eslint)`
    // diagnostic through the repair loop — it is not a real code-level lint
    // error and only wastes an LLM-fixer call.
    if (process.env.SAJTMASKIN_DEV_LOG) {
      console.warn(
        "[warm-eslint] exception (skipping repair):",
        err instanceof Error ? err.message : String(err),
      );
    }
    return {
      ok: true,
      skipped: "exception",
      issues: [],
      errorCount: 0,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    cleanupWrittenFiles(cacheDir, written);
  }
}

/** Format issues for the repair loop's `errors` channel (same shape as tsc). */
export function formatEslintIssuesForRepair(issues: ParsedLintIssue[]): string[] {
  return issues.slice(0, 40).map((issue) => {
    const location =
      issue.line && issue.column ? `${issue.file}:${issue.line}:${issue.column}` : issue.file;
    const ruleSuffix = issue.ruleId ? ` [${issue.ruleId}]` : "";
    return `${location} ${issue.severity}: ${issue.message}${ruleSuffix}`;
  });
}
