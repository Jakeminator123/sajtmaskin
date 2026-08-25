#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectImpact, loadWorkflowInputs, parseGitNameStatus } from "./path-impact.mjs";
import {
  invokesGit,
  isAmbiguousGitCommand,
  nestedShellPayloads,
  readGitAliases,
  shellSegments,
  shellTokens,
} from "../../.cursor/hooks/worktree-force-guard.mjs";

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function deny(reason) {
  return {
    permission: "deny",
    user_message:
      `Blockerat: commit-skyddet kunde inte verifiera ändringen (${reason}). ` +
      "Kontrollera git-läget och kör npm run verify:pr.",
    agent_message:
      `Denied fail-closed: commit guard could not verify the change (${reason}). ` +
      "Inspect git state and run npm run verify:pr.",
  };
}

function gitFiles(args, cwd = process.cwd()) {
  const output = execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (args.includes("--name-status")) return parseGitNameStatus(output);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Cursor sends an empty `cwd` and only the workspace root, so a commit made in
 * a sibling agent worktree would otherwise be judged against the main
 * checkout's branch — and denied as a direct-`master` commit even though the
 * worktree sits on a task branch. Read the command's own directory change.
 *
 * Deliberately regex-based rather than tokenised: `shellTokens` treats `\` as
 * an escape, which destroys Windows paths such as `cd C:\dev\sajtmaskin-x`.
 */
export function commandWorkingDirectory(command, fallback) {
  let cwd = fallback;
  for (const segment of shellSegments(command)) {
    const match =
      /^(?:cd|chdir|pushd|set-location|sl)\s+(?:-(?:literal)?path\s+)?(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/iu.exec(
        segment.trim(),
      );
    if (!match) continue;
    const target = match[1] ?? match[2] ?? match[3];
    if (!target || target.startsWith("-")) continue;
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

export function decideCommitCommand(
  command,
  { git = gitFiles, env = process.env, aliases = readGitAliases(), cwd = process.cwd() } = {},
) {
  if (typeof command !== "string" || !command.trim()) return deny("saknat kommando");
  if (isAmbiguousGitCommand(command, aliases)) {
    return deny("dynamiskt eller aliasbaserat git-kommando — skriv det explicita git-kommandot");
  }
  if (!isCommitCommand(command, { aliases })) return { permission: "allow" };

  try {
    const inputs = loadWorkflowInputs();
    const { policy } = inputs;
    const repo = commandWorkingDirectory(command, cwd);
    const branch = git(["branch", "--show-current"], repo)[0] ?? "";
    if (!branch) return deny("detached HEAD — skapa uppgiftens branch före commit");
    if (branch === policy.trunk) {
      const enabled = env[policy.directMaster.breakGlassFlag] === "1";
      const reason = String(env[policy.directMaster.breakGlassReason] ?? "").trim();
      if (!enabled || reason.length < 12) {
        return deny(
          `direkt ${policy.trunk} är stängd; break-glass kräver ` +
            `${policy.directMaster.breakGlassFlag}=1 och tydlig ${policy.directMaster.breakGlassReason}`,
        );
      }
    }

    const staged = git(["diff", "--cached", "--name-status", "-z"], repo);
    // Always inspect tracked working-tree changes too. Git accepts pathspecs,
    // --only and --include, so parsing only -a/--all would leave bypasses. A
    // conservative ask for an unrelated protected dirty file is preferable to
    // silently committing one through an unrecognised Git form.
    const tracked = git(["diff", "--name-status", "-z"], repo);
    const files = [...new Set([...staged, ...tracked])];
    if (files.length === 0) return { permission: "allow" };

    const impact = collectImpact({ ...inputs, changedFiles: files });
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
        "Kör `npm run verify:pr` och en färsk oberoende review innan commit.",
      agent_message:
        "Shared workflow-impact policy flagged this commit. Verify the exact diff with npm run verify:pr and report Backoffice/control-plane impact before committing.",
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
  respond(response);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
