/**
 * Warm-cache smoke check (P1) — verifies that the per-scaffold warm cache
 * used by the pre-VM typecheck/eslint passes is actually usable, so
 * "flag on but cache cold → silent fail-open skip" is caught by a command
 * instead of being discovered in telemetry after the fact.
 *
 * Checks per scaffold (list: scripts/warm-cache-scaffolds.json, same source
 * as scripts/provision-warm-cache.ts):
 *   1. cache dir exists            (<root>/<scaffoldId>/)
 *   2. node_modules exists         (symlink/junction to repo node_modules)
 *   3. tsconfig.json exists AND maps `@/*` to `./*` and nothing else
 *      (generated-project layout; a stale cache with the repo's `./src/*` alias
 *      makes tsc report bogus TS2307 for every `@/…` import, and a leftover SDK
 *      stub alias from #600/#603 makes it report bogus TS2305 — re-provision)
 *   4. eslint.config.{mjs,js,ts} exists
 * Plus once per run, inside the first warm cache dir:
 *   5. `npx --no-install tsc --version` works
 *   6. `npx --no-install eslint --version` works
 *
 * Exit codes: 0 = all warm, 1 = one or more scaffolds cold / tools missing.
 * Usage: `npm run warm-cache:smoke` (run `npm run provision:warm-cache` first).
 *
 * Cache root resolution mirrors src/lib/gen/preview/warm-typecheck.ts:
 * SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT override, else <tmpdir>/sajtmaskin/typecheck-cache.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function resolveCacheRoot() {
  const override = process.env.SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT?.trim();
  if (override) return resolve(override);
  return join(tmpdir(), "sajtmaskin", "typecheck-cache");
}

function loadScaffoldIds() {
  const manifestPath = join(REPO_ROOT, "scripts", "warm-cache-scaffolds.json");
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(parsed.scaffoldIds) || parsed.scaffoldIds.length === 0) {
    throw new Error(`No scaffoldIds found in ${manifestPath}`);
  }
  return parsed.scaffoldIds;
}

function checkScaffold(cacheRoot, scaffoldId) {
  const cacheDir = join(cacheRoot, scaffoldId);
  const problems = [];
  if (!existsSync(cacheDir)) {
    return { scaffoldId, cacheDir, problems: ["cache dir missing"] };
  }
  if (!existsSync(join(cacheDir, "node_modules"))) {
    problems.push("node_modules missing (symlink dead? re-run provisioning)");
  }
  const tsconfigPath = join(cacheDir, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    problems.push("tsconfig.json missing");
  } else {
    try {
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
      const alias = tsconfig?.compilerOptions?.paths?.["@/*"];
      if (!Array.isArray(alias) || alias.length !== 1 || alias[0] !== "./*") {
        problems.push(
          `tsconfig.json maps "@/*" to ${JSON.stringify(alias)} instead of ["./*"] — stale provisioning, re-run npm run provision:warm-cache`,
        );
      }
      // Retired SDK stub aliases (#600/#603, removed in #607): a cache
      // provisioned by the older script still resolves `@clerk/nextjs` to the
      // narrow stub, which reports TS2305 ("has no exported member 'useUser'")
      // on valid generated code. The pre-VM pass now drops undecidable
      // unresolved-module diagnostics instead, so any leftover stub alias means
      // stale provisioning.
      const staleStubAliases = Object.keys(tsconfig?.compilerOptions?.paths ?? {}).filter(
        (alias) => alias !== "@/*",
      );
      if (staleStubAliases.length > 0) {
        problems.push(
          `tsconfig.json still carries retired SDK stub alias(es) ${staleStubAliases.join(", ")} — stale provisioning, re-run npm run provision:warm-cache`,
        );
      }
    } catch (err) {
      problems.push(`tsconfig.json unreadable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const eslintConfigs = ["eslint.config.mjs", "eslint.config.js", "eslint.config.ts"];
  if (!eslintConfigs.some((name) => existsSync(join(cacheDir, name)))) {
    problems.push("eslint.config.{mjs,js,ts} missing");
  }
  return { scaffoldId, cacheDir, problems };
}

function checkTool(cacheDir, tool) {
  const result = spawnSync("npx", ["--no-install", tool, "--version"], {
    cwd: cacheDir,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 60_000,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error
      ? result.error.message
      : `exit ${result.status}: ${(result.stderr || result.stdout || "").trim().slice(0, 200)}`;
    return { ok: false, detail };
  }
  return { ok: true, detail: (result.stdout || "").trim().split(/\r?\n/)[0] };
}

function main() {
  const cacheRoot = resolveCacheRoot();
  const scaffoldIds = loadScaffoldIds();
  console.log(`[warm-cache:smoke] Cache root: ${cacheRoot}`);
  console.log(`[warm-cache:smoke] Scaffolds: ${scaffoldIds.join(", ")}`);

  let failed = false;
  const warmDirs = [];
  for (const scaffoldId of scaffoldIds) {
    const { cacheDir, problems } = checkScaffold(cacheRoot, scaffoldId);
    if (problems.length === 0) {
      console.log(`  OK    ${scaffoldId}`);
      warmDirs.push(cacheDir);
    } else {
      failed = true;
      console.error(`  COLD  ${scaffoldId}: ${problems.join("; ")}`);
    }
  }

  if (warmDirs.length > 0) {
    for (const tool of ["tsc", "eslint"]) {
      const { ok, detail } = checkTool(warmDirs[0], tool);
      if (ok) {
        console.log(`  OK    npx --no-install ${tool} --version → ${detail}`);
      } else {
        failed = true;
        console.error(`  FAIL  npx --no-install ${tool} --version: ${detail}`);
      }
    }
  }

  if (failed) {
    console.error(
      "[warm-cache:smoke] FAILED — one or more scaffolds are cold. " +
        "The pre-VM typecheck/eslint passes will silently skip (cache_cold) for those. " +
        "Fix: `npm run provision:warm-cache` (see docs/runbooks/warm-cache-setup.md).",
    );
    process.exit(1);
  }
  console.log("[warm-cache:smoke] All scaffolds warm.");
}

main();
