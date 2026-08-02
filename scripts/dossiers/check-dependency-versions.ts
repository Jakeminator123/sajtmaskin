/**
 * Dossier dependency contract + optional npm-registry drift check.
 *
 * Offline mode is part of normal CI: every non-builtin manifest dependency
 * must resolve to an explicit generated-project range (never `latest`).
 * Registry mode is intended for the scheduled maintenance workflow and proves
 * that every resolved range still exists on npm.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  isBuiltinPackage,
  parseManifestDependencySpec,
  resolveExportableVersion,
} from "../../src/lib/gen/autofix/dep-completer";
import { getAllDossiers } from "../../src/lib/gen/dossiers/registry";

const execFileP = promisify(execFile);
const CONCURRENCY = 6;

export interface NpmInvocation {
  executable: string;
  argsPrefix: string[];
}

/**
 * Prefer npm's JS entrypoint: it is cross-platform and keeps registry
 * arguments out of a shell. `npm run` always supplies `npm_execpath`.
 */
export function npmInvocationForEnvironment(
  platform: string,
  npmExecPath: string | undefined,
  nodeExecutable: string,
): NpmInvocation {
  const cliPath = npmExecPath?.trim();
  if (cliPath) return { executable: nodeExecutable, argsPrefix: [cliPath] };
  if (platform === "win32") {
    throw new Error("npm_execpath is required for shell-free npm execution on Windows");
  }
  return { executable: "npm", argsPrefix: [] };
}

export interface DependencyManifestInput {
  id: string;
  class: "hard" | "soft";
  dependencies?: readonly string[];
}

export interface DependencyContractRow {
  pkg: string;
  range: string;
  dossierIds: string[];
}

export interface DependencyContractIssue {
  dossierId: string;
  dependency: string;
  reason: "invalid-spec" | "unresolved-version" | "floating-latest" | "shadowed-manifest-pin";
  resolvedRange?: string;
}

/** Pure evaluator; injected resolvers keep the policy unit-testable. */
export function evaluateDossierDependencyContracts(
  dossiers: readonly DependencyManifestInput[],
  options: {
    resolveVersion?: (pkg: string) => string | undefined;
    isBuiltin?: (pkg: string) => boolean;
  } = {},
): { checked: DependencyContractRow[]; builtins: string[]; issues: DependencyContractIssue[] } {
  const resolveVersion = options.resolveVersion ?? resolveExportableVersion;
  const isBuiltin = options.isBuiltin ?? isBuiltinPackage;
  const byPackage = new Map<string, DependencyContractRow>();
  const builtins = new Set<string>();
  const issues: DependencyContractIssue[] = [];

  for (const dossier of dossiers) {
    for (const raw of dossier.dependencies ?? []) {
      const { pkg, version: manifestVersion } = parseManifestDependencySpec(raw);
      if (!pkg) {
        issues.push({ dossierId: dossier.id, dependency: raw, reason: "invalid-spec" });
        continue;
      }
      if (isBuiltin(pkg)) {
        builtins.add(pkg);
        continue;
      }
      const resolvedRange = resolveVersion(pkg)?.trim();
      if (!resolvedRange) {
        issues.push({
          dossierId: dossier.id,
          dependency: raw,
          reason: "unresolved-version",
        });
        continue;
      }
      if (resolvedRange === "latest" || resolvedRange === "*") {
        issues.push({
          dossierId: dossier.id,
          dependency: raw,
          reason: "floating-latest",
          resolvedRange,
        });
        continue;
      }
      // An explicit manifest pin must be the range export will actually use.
      // Otherwise the manifest claims one tested SDK while KNOWN_PACKAGES
      // silently overwrites it with another — two owners, no reliable evidence.
      if (manifestVersion && manifestVersion.trim() !== resolvedRange) {
        issues.push({
          dossierId: dossier.id,
          dependency: raw,
          reason: "shadowed-manifest-pin",
          resolvedRange,
        });
        continue;
      }

      const existing = byPackage.get(pkg);
      if (existing) {
        if (!existing.dossierIds.includes(dossier.id)) existing.dossierIds.push(dossier.id);
      } else {
        byPackage.set(pkg, { pkg, range: resolvedRange, dossierIds: [dossier.id] });
      }
    }
  }

  return {
    checked: Array.from(byPackage.values()).sort((a, b) => a.pkg.localeCompare(b.pkg)),
    builtins: Array.from(builtins).sort(),
    issues,
  };
}

async function poolMap<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));
  return output;
}

async function checkRegistry(rows: readonly DependencyContractRow[]) {
  const npm = npmInvocationForEnvironment(
    process.platform,
    process.env.npm_execpath,
    process.execPath,
  );
  return poolMap(rows, async (row) => {
    try {
      const { stdout } = await execFileP(
        npm.executable,
        [...npm.argsPrefix, "view", `${row.pkg}@${row.range}`, "version", "--json"],
        { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      );
      const value = JSON.parse(stdout) as unknown;
      const versions = Array.isArray(value) ? value : [value];
      const ok = versions.some(
        (version) => typeof version === "string" && version.trim().length > 0,
      );
      return { ...row, ok, error: ok ? undefined : "empty registry result" };
    } catch (error) {
      return {
        ...row,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

async function main() {
  const wantRegistry = process.argv.includes("--registry");
  const wantJson = process.argv.includes("--json");
  const dossiers = getAllDossiers().map((entry) => ({
    id: entry.id,
    class: entry.class,
    dependencies: entry.dependencies,
  }));
  const contract = evaluateDossierDependencyContracts(dossiers);
  const registry = wantRegistry ? await checkRegistry(contract.checked) : [];
  const registryFailures = registry.filter((row) => !row.ok);
  const failed = contract.issues.length > 0 || registryFailures.length > 0;

  if (wantJson) {
    process.stdout.write(JSON.stringify({ ok: !failed, ...contract, registry }));
    process.exit(failed ? 1 : 0);
  }

  console.log(
    `Dossier dependency contract — ${contract.checked.length} explicit package ranges across ${dossiers.length} dossiers`,
  );
  for (const issue of contract.issues) {
    console.error(
      `FAIL  ${issue.dossierId}: ${issue.dependency} (${issue.reason}${
        issue.resolvedRange ? `; export uses ${issue.resolvedRange}` : ""
      })`,
    );
  }
  if (wantRegistry) {
    console.log(
      `Registry resolution — ${registry.length - registryFailures.length}/${registry.length} ranges resolved`,
    );
    for (const row of registryFailures) {
      console.error(`FAIL  ${row.pkg}@${row.range}: ${row.error}`);
    }
  } else {
    console.log("Offline mode: use --registry for the scheduled npm resolution check.");
  }

  if (failed) process.exit(1);
  console.log("All dossier dependencies have deterministic export ranges.");
}

function isInvokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
