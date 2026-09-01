#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeHookResponse } from "../../.cursor/hooks/hook-io.mjs";
import {
  cheapShellDecision,
  invokesGit,
  isAmbiguousGitCommand,
  nestedShellPayloads,
  resolveAliasesFor,
  shellSegments,
  shellTokens,
} from "../../.cursor/hooks/worktree-force-guard.mjs";
import { collectImpact, loadWorkflowInputs, parseGitNameStatus } from "./path-impact.mjs";

function deny(reason) {
  return {
    permission: "deny",
    user_message:
      `Blockerat: commit-skyddet kunde inte verifiera ändringen (${reason}). ` +
      "Kontrollera git-läget och kör npm run verify:pr -- --plan.",
    agent_message:
      `Denied fail-closed: commit guard could not verify the change (${reason}). ` +
      "Inspect git state and run npm run verify:pr -- --plan.",
  };
}

function gitFiles(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 8000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || "git inspection failed");
  }
  const output = result.stdout ?? "";
  if (args.includes("--name-status")) return parseGitNameStatus(output);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const DIRECTORY_CHANGE_RE =
  /^(?:cd|chdir|pushd|set-location|sl)\s+(?:-(?:literal)?path\s+)?(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/iu;
const COMMIT_WORD_RE = /(?<![\p{L}\p{N}_])commit(?![\p{L}\p{N}_])/u;
// `--git-dir`/`--work-tree` can point a commit at a checkout this guard cannot
// reconstruct from the string alone. Those forms are denied instead of guessed.
const OPAQUE_REPO_OPTION_RE = /(?<![\p{L}\p{N}_-])--(?:git-dir|work-tree)(?:[=\s]|$)/iu;

function directoryChangeTarget(segment) {
  const match = DIRECTORY_CHANGE_RE.exec(segment.trim());
  if (!match) return null;
  const target = match[1] ?? match[2] ?? match[3];
  return target && !target.startsWith("-") ? target : null;
}

function topLevelShellSegments(command) {
  const segments = [];
  let value = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\" && quote !== "'") {
      value += char;
      if (index + 1 < command.length) value += command[++index];
      continue;
    }
    if (quote) {
      value += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      value += char;
      continue;
    }
    const pair = command.slice(index, index + 2);
    if (pair === "&&" || pair === "||") {
      if (value.trim()) segments.push(value.trim());
      value = "";
      index += 1;
      continue;
    }
    // `|` must not split here: a pipe does not persist cwd, so
    // `cd scripts | git commit` is one segment and stays at start-cwd.
    // `&&` / `||` / `;` still split so a preceding `cd` carries.
    if (char === ";" || char === "\n") {
      if (value.trim()) segments.push(value.trim());
      value = "";
      continue;
    }
    value += char;
  }
  if (value.trim()) segments.push(value.trim());
  return segments;
}

/**
 * Every checkout a command could commit in.
 *
 * Cursor sends an empty `cwd` and only the workspace root, so judging against
 * the hook's own directory denied legitimate commits made in a sibling agent
 * worktree. But following the shell `cd` alone is not enough either: `git -C`
 * overrides it, so `cd <feature-worktree>; git -C <main> commit` would be judged
 * against the feature branch while Git commits on the trunk. Collect all
 * candidates and let the caller refuse if *any* of them is on the trunk.
 *
 * Deliberately regex-based rather than tokenised: `shellTokens` treats `\` as
 * an escape, which destroys Windows paths such as `cd C:\dev\sajtmaskin-x`.
 */
export function commitTargetDirectories(command, fallback) {
  const directories = new Set();
  const walk = (segments, startCwd) => {
    let cwd = startCwd;
    for (const segment of segments) {
      const target = directoryChangeTarget(segment);
      if (target) {
        const resolved = resolve(cwd, target);
        if (existsSync(resolved)) cwd = resolved;
        continue;
      }
      if (!COMMIT_WORD_RE.test(segment)) continue;
      // Only `-C` *before* the subcommand is a directory. `git commit -C HEAD`
      // reuses a commit message and must not be read as a path. When present it
      // replaces the shell directory for this invocation rather than adding to
      // it, so `cd <main>; git -C <worktree> commit` is not falsely denied.
      const commitIndex = segment.search(COMMIT_WORD_RE);
      const prefix = commitIndex >= 0 ? segment.slice(0, commitIndex) : segment;
      const targets = [];
      for (const match of prefix.matchAll(/(?:^|\s)-C\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gu)) {
        const dir = match[1] ?? match[2] ?? match[3];
        if (!dir) continue;
        const resolved = resolve(cwd, dir);
        targets.push(existsSync(resolved) ? resolved : cwd);
      }
      if (targets.length === 0) directories.add(cwd);
      else for (const target of targets) directories.add(target);
    }
  };
  // Nested payloads must be pulled from the whole command: a naive split
  // on `;` would tear a quoted `pwsh -c "cd x; git commit"` apart.
  const nestedPayloads = nestedShellPayloads(command);
  for (const payload of nestedPayloads) walk(topLevelShellSegments(payload), fallback);
  // Outer `cd; git commit` must stay one walk so the directory change sticks.
  // Wrapper segments (`pwsh -c "…"`) are skipped here — their interiors were
  // already walked as nested payloads. Walking each outer segment from
  // `fallback` separately would treat `cd scripts; git commit` as a trunk
  // commit.
  const outerSegments = topLevelShellSegments(command).filter(
    (segment) => nestedShellPayloads(segment).length === 0,
  );
  walk(outerSegments, fallback);
  if (directories.size === 0) directories.add(fallback);
  return [...directories];
}

/** Kept for callers that only need the shell's own final directory. */
export function commandWorkingDirectory(command, fallback) {
  let cwd = fallback;
  for (const segment of topLevelShellSegments(command)) {
    const target = directoryChangeTarget(segment);
    if (!target) continue;
    const resolved = resolve(cwd, target);
    if (existsSync(resolved)) cwd = resolved;
  }
  return cwd;
}

export function isCommitCommand(command, { aliases = new Set() } = {}) {
  if (typeof command !== "string") return false;
  if (isAmbiguousGitCommand(command, aliases)) return true;
  const segmentCommits = (segment) => {
    if (
      nestedShellPayloads(segment).some((payload) => shellSegments(payload).some(segmentCommits))
    ) {
      return true;
    }
    const tokens = shellTokens(segment);
    const gitIndex = invokesGit(tokens);
    const args = gitIndex >= 0 ? tokens.slice(gitIndex + 1) : tokens;
    const hasCommit = args.some((token) => /^commit$/iu.test(token));
    if (!hasCommit) return false;
    // Dynamiska executable-former som `$(command -v git) commit` kan inte
    // bindas till ett tokenindex. Matcherträff + separat commit-ord nekas hellre
    // konservativt än att hela grinden hoppas över.
    const dequotedExecutable = segment.replace(/["'\\]/gu, "");
    return gitIndex >= 0 || /\bgit(?:\.exe)?\b/iu.test(dequotedExecutable);
  };
  return shellSegments(command).some(segmentCommits);
}

export function includesTrackedChanges(command) {
  return (
    /(?:^|\s)--all(?=\s|$)/u.test(command) || /(?:^|\s)-[A-Za-z]*a[A-Za-z]*(?=\s|$)/u.test(command)
  );
}

/**
 * @param {string} command
 * @param {{
 *   git?: (args: string[], cwd?: string) => string[],
 *   env?: Record<string, string | undefined>,
 *   aliases?: Set<string> | null,
 *   cwd?: string,
 * }} [options] `aliases` omitted means "resolve lazily"; an explicit value
 *   (including `null`, i.e. inspection failed) is used as given.
 */
export function decideCommitCommand(
  command,
  { git = gitFiles, env = process.env, aliases, cwd = process.cwd() } = {},
) {
  if (typeof command !== "string" || !command.trim()) return deny("saknat kommando");
  const cheap = cheapShellDecision(command);
  if (cheap) return cheap;
  // Resolved only when the command could still be a commit or alias. The cheap
  // path above already allowed read-only git without a `git config` subprocess.
  const resolved = aliases === undefined ? resolveAliasesFor(command) : aliases;
  if (isAmbiguousGitCommand(command, resolved)) {
    return deny("dynamiskt eller aliasbaserat git-kommando — skriv det explicita git-kommandot");
  }
  if (!isCommitCommand(command, { aliases: resolved })) return { permission: "allow" };
  if (OPAQUE_REPO_OPTION_RE.test(command)) {
    return deny(
      "--git-dir/--work-tree kan peka på en annan checkout; kör commiten i dess worktree",
    );
  }

  try {
    const inputs = loadWorkflowInputs();
    const { policy } = inputs;
    // Judge every checkout the command could commit in, not just the shell's
    // final directory. `git -C <trunk-checkout>` must not be able to hide
    // behind an earlier `cd` into a task worktree.
    const repositories = commitTargetDirectories(command, cwd);
    const files = new Set();
    for (const repo of repositories) {
      const branch = git(["branch", "--show-current"], repo)[0] ?? "";
      // An empty branch means detached HEAD *or* a checkout misconfigured as
      // bare — `core.bare=true` has silently reappeared in this repo's main
      // checkout twice, and it reads exactly like a detached HEAD here.
      if (!branch) {
        return deny(
          `ingen branch i ${repo} — detached HEAD, eller checkouten är felkonfigurerad som bare (kontrollera core.bare)`,
        );
      }
      if (branch === policy.trunk && policy.directMaster?.allowed !== true) {
        const enabled = env[policy.directMaster.breakGlassFlag] === "1";
        const reason = String(env[policy.directMaster.breakGlassReason] ?? "").trim();
        if (!enabled || reason.length < 12) {
          return deny(
            `direkt ${policy.trunk} är stängd; break-glass kräver ` +
              `${policy.directMaster.breakGlassFlag}=1 och tydlig ${policy.directMaster.breakGlassReason}`,
          );
        }
      }

      // Always inspect tracked working-tree changes too. Git accepts pathspecs,
      // --only and --include, so parsing only -a/--all would leave bypasses. A
      // conservative ask for an unrelated protected dirty file is preferable to
      // silently committing one through an unrecognised Git form.
      for (const file of git(["diff", "--cached", "--name-status", "-z"], repo)) files.add(file);
      for (const file of git(["diff", "--name-status", "-z"], repo)) files.add(file);
    }
    if (files.size === 0) return { permission: "allow" };

    const impact = collectImpact({ ...inputs, changedFiles: [...files] });
    if (impact.protectedFiles.length === 0 && impact.backofficePages.length === 0) {
      return { permission: "allow" };
    }

    const protectedSummary = impact.protectedFiles.slice(0, 8).join(", ") || "inga";
    const backofficeSummary = impact.backofficePages.join(", ") || "ingen";
    return {
      permission: "ask",
      user_message:
        "Committen träffar skyddade eller Backoffice-kopplade ytor.\n\n" +
        `Protected: ${protectedSummary}\nBackoffice: ${backofficeSummary}\n\n` +
        "Kör `npm run verify:pr -- --plan`, relevanta riktade kontroller och en färsk oberoende review innan commit.",
      agent_message:
        "Shared workflow-impact policy flagged this commit. Plan the exact diff, run relevant targeted checks and report Backoffice/control-plane impact before committing.",
    };
  } catch (error) {
    return deny(error instanceof Error ? error.message : "okänt fel");
  }
}

function main() {
  let response;
  try {
    const raw = readFileSync(0, "utf8").trim();
    if (!raw) throw new Error("tom hook-input");
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || typeof input.command !== "string") {
      throw new Error("ogiltig hook-input");
    }
    response = decideCommitCommand(input.command);
  } catch (error) {
    response = deny(error instanceof Error ? error.message : "ogiltig hook-input");
  }
  writeHookResponse(response);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
