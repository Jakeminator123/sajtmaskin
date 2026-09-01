#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectImpact, loadWorkflowInputs, parseGitNameStatus } from "./path-impact.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function run(command, args, options = {}, spawnCommand = spawnSync) {
  return spawnCommand(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    // Node vägrar spawna .cmd utan shell sedan CVE-2024-27980.
    shell: options.shell ?? false,
  });
}

export function runNpm(
  args,
  options = {},
  { platform = process.platform, spawnCommand = spawnSync } = {},
) {
  const isWindows = platform === "win32";
  const npm = isWindows ? "npm.cmd" : "npm";
  return run(npm, args, { ...options, shell: isWindows }, spawnCommand);
}

export function classifyProcessResult(result) {
  if (result.error) return { kind: "spawn-error", error: result.error };
  if (result.signal !== null && result.signal !== undefined) {
    return { kind: "signal", signal: result.signal };
  }
  if (typeof result.status === "number") {
    return { kind: "exit", status: result.status };
  }
  return { kind: "unknown" };
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

export function parseArgs(argv) {
  const options = { plan: false, full: false, fetch: true, keepGoing: false, base: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--plan") options.plan = true;
    else if (arg === "--full") options.full = true;
    else if (arg === "--no-fetch") options.fetch = false;
    else if (arg === "--keep-going") options.keepGoing = true;
    else if (arg === "--base") options.base = argv[++i] ?? null;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/**
 * @param {string[]} commands
 * @param {(command: string) => { error?: Error, signal?: string | null, status?: number | null }} runCommand
 * @param {{ keepGoing?: boolean }} [options]
 */
export function executeVerificationCommands(commands, runCommand, { keepGoing = false } = {}) {
  const passed = [];
  const failures = [];

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const outcome = classifyProcessResult(runCommand(command));
    if (outcome.kind === "exit" && outcome.status === 0) {
      passed.push(command);
      continue;
    }

    failures.push({ command, outcome });
    if (!keepGoing) {
      return { passed, failures, skipped: commands.slice(index + 1) };
    }
  }

  return { passed, failures, skipped: [] };
}

export function describeCommandFailure({ command, outcome }) {
  if (outcome.kind === "spawn-error") {
    return `npm run ${command} (kunde inte starta: ${outcome.error.message})`;
  }
  if (outcome.kind === "signal") {
    return `npm run ${command} (avbruten av signal ${outcome.signal})`;
  }
  if (outcome.kind === "exit") return `npm run ${command} (exit ${outcome.status})`;
  return `npm run ${command} (saknar exitstatus, signal och spawnfel)`;
}

function printList(label, values, empty = "inga") {
  console.log(`[verify:pr] ${label}: ${values.length > 0 ? values.join(", ") : empty}`);
}

/** @param {Record<string, string | undefined>} [env] */
export function isCiRunner(env = process.env) {
  return env.GITHUB_ACTIONS === "true" || env.CI === "true";
}

/**
 * @param {string} command
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveVerificationCommand(command, env = process.env) {
  return command === "test:ci" && !isCiRunner(env) ? "test:pr" : command;
}

/**
 * @param {{ branch: string, head: string, policy: any, env?: Record<string, string | undefined> }} input
 */
export function assertBranchSafety({ branch, head, policy, env = process.env }) {
  if (!branch) throw new Error("detached HEAD — skapa eller öppna uppgiftens branch");
  if (branch === policy.trunk) {
    if (policy.directMaster?.allowed === true) return;
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
  const prefixes = policy.allowedBranchPrefixes ?? [];
  if (prefixes.length > 0 && !prefixes.some((prefix) => branch.startsWith(prefix))) {
    throw new Error(`branch "${branch}" saknar tillåtet prefix (${prefixes.join(", ")})`);
  }
}

export function formatImpactSummary({ branch, base, head, impact }) {
  const rows = [
    `[verify:pr] branch: ${branch} · base: ${base} · head: ${head.slice(0, 12)}`,
    `[verify:pr] ändrade filer: ${impact.files.length}`,
    `[verify:pr] protected: ${impact.protectedFiles.length ? impact.protectedFiles.join(", ") : "inga"}`,
    `[verify:pr] Backoffice: ${impact.backofficePages.length ? impact.backofficePages.join(", ") : "ingen träff"}`,
    `[verify:pr] control-plane: ${impact.authorities.length ? impact.authorities.map((entry) => `${entry.id} (${entry.runtimeStatus})`).join(", ") : "ingen direkt owner-träff"}`,
    `[verify:pr] runtime utan control-plane-owner (info): ${impact.unmappedRuntimeFiles.length ? impact.unmappedRuntimeFiles.join(", ") : "ingen"}`,
    `[verify:pr] oklassificerat (fail-safe full): ${impact.unclassifiedFiles.length ? impact.unclassifiedFiles.join(", ") : "inget"}`,
    `[verify:pr] diffvalda kontroller: ${impact.commands.join(" → ")}`,
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
  const executableCommands = impact.commands.map((command) =>
    resolveVerificationCommand(command, process.env),
  );
  if (executableCommands.includes("test:pr")) {
    console.log("[verify:pr] lokal testprofil: test:ci → test:pr (50% workers, fail-fast)");
    printList("valfri lokal exekveringsprofil", executableCommands);
  }
  if (options.plan) return;

  const failures = [];
  const diffCheck = git(["diff", "--check", base], { allowFailure: true, inherit: true });
  if (diffCheck.status !== 0) failures.push("git diff --check");

  if (failures.length > 0 && !options.keepGoing) {
    printList("inte körda efter fail-fast", executableCommands);
    throw new Error(`följande kontroller föll: ${failures.join(", ")}`);
  }

  const execution = executeVerificationCommands(
    executableCommands,
    (command) => {
      console.log(`\n[verify:pr] kör npm run ${command}`);
      return runNpm(["run", command], { inherit: true });
    },
    { keepGoing: options.keepGoing },
  );
  failures.push(...execution.failures.map(describeCommandFailure));

  printList("klara kontroller", execution.passed);
  if (execution.skipped.length > 0) {
    printList("inte körda efter fail-fast", execution.skipped);
  }

  if (failures.length > 0) {
    throw new Error(`följande kontroller föll: ${failures.join(", ")}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[verify:pr] STOPP: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
