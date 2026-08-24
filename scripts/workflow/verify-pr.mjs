#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectImpact, loadWorkflowInputs, parseGitNameStatus } from "./path-impact.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Prefer `node + npm-cli.js` so Windows never spawnar `npm.cmd` utan shell
 * (Node ≥ 20 → EINVAL, CVE-2024-27980). `npm_execpath` finns när hooken
 * kör `npm run verify:pr`. Fallback: `npm.cmd` + shell bara på win32.
 * `git` ska förbli shell-fri.
 */
export function resolveNpmInvocation({
  platform = process.platform,
  npmExecPath = process.env.npm_execpath,
  nodeExecutable = process.execPath,
} = {}) {
  const cliPath = String(npmExecPath ?? "").trim();
  if (cliPath) {
    return { command: nodeExecutable, args: [cliPath], shell: false };
  }
  if (platform === "win32") {
    return { command: "npm.cmd", args: [], shell: true };
  }
  return { command: "npm", args: [], shell: false };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    shell: options.shell === true,
  });
}

function npmRun(script, options = {}) {
  const npm = resolveNpmInvocation();
  return run(npm.command, [...npm.args, "run", script], {
    ...options,
    shell: npm.shell,
  });
}

function git(args, options = {}) {
  const result = run("git", args, options);
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }
  return result;
}

function lines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = { plan: false, full: false, fetch: true, base: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--plan") options.plan = true;
    else if (arg === "--full") options.full = true;
    else if (arg === "--no-fetch") options.fetch = false;
    else if (arg === "--base") options.base = argv[++i] ?? null;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function printList(label, values, empty = "inga") {
  console.log(`[verify:pr] ${label}: ${values.length > 0 ? values.join(", ") : empty}`);
}

/** @param {Record<string, string | undefined>} [env] */
export function isCiRunner(env = process.env) {
  return env.GITHUB_ACTIONS === "true" || env.CI === "true";
}

/**
 * @param {{ branch: string, head: string, policy: any, env?: Record<string, string | undefined> }} input
 */
export function assertBranchSafety({ branch, head, policy, env = process.env }) {
  if (!branch) throw new Error("detached HEAD — skapa eller öppna uppgiftens branch");
  if (branch === policy.trunk) {
    const enabled = env[policy.directMaster.breakGlassFlag] === "1";
    const reason = String(env[policy.directMaster.breakGlassReason] ?? "").trim();
    if (!enabled || reason.length < 12) {
      throw new Error(
        `direkt ${policy.trunk} är stängd. Skapa en kortlivad branch och PR. ` +
          `Break-glass kräver ${policy.directMaster.breakGlassFlag}=1 och en tydlig ` +
          `${policy.directMaster.breakGlassReason}.`,
      );
    }
    console.warn(`[verify:pr] BREAK-GLASS för ${head.slice(0, 8)}: ${reason}`);
    return;
  }
  if (!policy.allowedBranchPrefixes.some((prefix) => branch.startsWith(prefix))) {
    throw new Error(
      `branch "${branch}" saknar tillåtet prefix (${policy.allowedBranchPrefixes.join(", ")})`,
    );
  }
}

export function formatImpactSummary({ branch, base, head, impact }) {
  const rows = [
    `[verify:pr] branch: ${branch} · base: ${base} · head: ${head.slice(0, 12)}`,
    `[verify:pr] ändrade filer: ${impact.files.length}`,
    `[verify:pr] protected: ${impact.protectedFiles.length ? impact.protectedFiles.join(", ") : "inga"}`,
    `[verify:pr] Backoffice: ${impact.backofficePages.length ? impact.backofficePages.join(", ") : "ingen träff"}`,
    `[verify:pr] control-plane: ${impact.authorities.length ? impact.authorities.map((entry) => `${entry.id} (${entry.runtimeStatus})`).join(", ") : "ingen direkt owner-träff"}`,
    `[verify:pr] omappad runtime: ${impact.unmappedRuntimeFiles.length ? impact.unmappedRuntimeFiles.join(", ") : "ingen"}`,
    `[verify:pr] oklassificerat (fail-safe full): ${impact.unclassifiedFiles.length ? impact.unclassifiedFiles.join(", ") : "inget"}`,
    `[verify:pr] kontroller: ${impact.commands.join(" → ")}`,
  ];
  if (impact.manualValidators.length > 0) {
    rows.push(
      `[verify:pr] manuella validators (rapporteras, körs inte): ${impact.manualValidators.join(", ")}`,
    );
  }
  return rows.join("\n");
}

/**
 * @param {string} base
 * @param {(args: string[], options?: Record<string, unknown>) => { stdout: string }} [gitCommand]
 */
export function trackedPathsForBase(base, gitCommand = git) {
  const result = gitCommand(["diff", "--name-status", "-z", "--diff-filter=ACDMRTUXB", base]);
  return parseGitNameStatus(result.stdout);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputs = loadWorkflowInputs(REPO_ROOT);
  const { policy } = inputs;

  if (options.fetch && !isCiRunner(process.env)) {
    console.log(`[verify:pr] hämtar origin/${policy.trunk}…`);
    const fetched = git(["fetch", "origin", policy.trunk, "--quiet"], { allowFailure: true });
    if (fetched.status !== 0) {
      throw new Error(
        `kunde inte hämta färsk ${policy.trunk}: ${(fetched.stderr || "okänt fel").trim()}`,
      );
    }
  }

  const branch = git(["branch", "--show-current"]).stdout.trim();
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  assertBranchSafety({ branch, head, policy });

  const base = options.base ?? `origin/${policy.trunk}`;
  git(["rev-parse", "--verify", base]);
  const ancestor = git(["merge-base", "--is-ancestor", base, "HEAD"], { allowFailure: true });
  if (ancestor.status !== 0) {
    throw new Error(`${branch} innehåller inte färsk ${base}. Uppdatera branchen innan PR/push.`);
  }

  const tracked = trackedPathsForBase(base);
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]).stdout);
  const impact = collectImpact({
    ...inputs,
    changedFiles: [...tracked, ...untracked],
    forceFull: options.full,
  });
  console.log(formatImpactSummary({ branch, base, head, impact }));
  if (impact.files.length === 0) {
    console.log("[verify:pr] ingen diff mot base — klart.");
    return;
  }
  if (options.plan) return;

  const failures = [];
  const diffCheck = git(["diff", "--check", base], { allowFailure: true, inherit: true });
  if (diffCheck.status !== 0) failures.push("git diff --check");

  for (const command of impact.commands) {
    console.log(`\n[verify:pr] kör npm run ${command}`);
    const result = npmRun(command, { inherit: true });
    if (result.status !== 0) failures.push(`npm run ${command}`);
  }

  if (failures.length > 0) {
    throw new Error(`följande kontroller föll: ${failures.join(", ")}`);
  }
  printList("klara kontroller", impact.commands);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[verify:pr] STOPP: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
