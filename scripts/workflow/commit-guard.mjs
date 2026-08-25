#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectImpact, loadWorkflowInputs, parseGitNameStatus } from "./path-impact.mjs";
import {
  invokesGit,
  isAmbiguousGitCommand,
  nestedShellPayloads,
  resolveAliasesFor,
  shellSegments,
  shellTokens,
} from "../../.cursor/hooks/worktree-force-guard.mjs";

function respond(payload) {
  try {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } catch {
    // A closed pipe (the client already gave up waiting) must not surface as a
    // non-zero exit: the client reports that as a crashed hook rather than as
    // its own timeout, which hides the real cause.
  }
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

function gitFiles(args) {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (args.includes("--name-status")) return parseGitNameStatus(output);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
 *   git?: (args: string[]) => string[],
 *   env?: Record<string, string | undefined>,
 *   aliases?: Set<string> | null,
 * }} [options] `aliases` omitted means "resolve lazily"; an explicit value
 *   (including `null`, i.e. inspection failed) is used as given.
 */
export function decideCommitCommand(command, { git = gitFiles, env = process.env, aliases } = {}) {
  if (typeof command !== "string" || !command.trim()) return deny("saknat kommando");
  // Resolved after the cheap input check and only when the command could reach
  // git at all — an eager default argument spent a `git config` subprocess on
  // every unrelated tool call, including the ones this guard immediately allows.
  const resolved = aliases === undefined ? resolveAliasesFor(command) : aliases;
  if (isAmbiguousGitCommand(command, resolved)) {
    return deny("dynamiskt eller aliasbaserat git-kommando — skriv det explicita git-kommandot");
  }
  if (!isCommitCommand(command, { aliases: resolved })) return { permission: "allow" };

  try {
    const inputs = loadWorkflowInputs();
    const { policy } = inputs;
    const branch = git(["branch", "--show-current"])[0] ?? "";
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

    const staged = git(["diff", "--cached", "--name-status", "-z"]);
    // Always inspect tracked working-tree changes too. Git accepts pathspecs,
    // --only and --include, so parsing only -a/--all would leave bypasses. A
    // conservative ask for an unrelated protected dirty file is preferable to
    // silently committing one through an unrecognised Git form.
    const tracked = git(["diff", "--name-status", "-z"]);
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
