#!/usr/bin/env node
/**
 * Blocks `git worktree remove --force`.
 *
 * That command deletes the worktree directory recursively and FOLLOWS the
 * `node_modules` junction that agent worktrees use, emptying the main
 * checkout's real `node_modules`. It has happened twice in this repo
 * (2026-07-27 and 2026-08-01) and both times surfaced much later as an
 * unrelated-looking `ERR_MODULE_NOT_FOUND`, which reads like a broken repo
 * rather than a cleanup that went wrong.
 *
 * `scripts/cursor/worktree.mjs` already implements the safe order (detach the
 * links first, then remove), but nothing stopped anyone from reaching past it
 * to raw git. This hook is that stop.
 *
 * Two Windows-specific rules this file follows on purpose:
 *   - write the verdict with `writeHookResponse` (`writeSync` on fd 1) and
 *     never call `process.exit()` afterwards — async `stdout.write` plus a
 *     process teardown can discard the JSON, and Cursor then reports
 *     "returned no output", which fail-closed treats as a crash;
 *   - never throw. Unexpected input resolves to an explicit deny because this
 *     hook protects a destructive operation and is configured fail-closed.
 *
 * Read-only git is decided before any `git config` / alias subprocess. Both
 * project matchers must keep a `git` alternative so `git ci` / `git wt`
 * aliases still reach a hook; the cheap path is what stops that from hanging
 * the fail-closed runner.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  commandWords,
  expandSegments,
  GIT_OPTIONS_WITH_VALUE,
  invokesGit,
  isAmbiguousGitCommand,
  nestedShellPayloads,
  READ_ONLY_GIT_SUBCOMMANDS,
  resolveAliasesFor,
  SHELL_EXPANSION,
  shellSegments,
  shellTokens,
} from "../../scripts/workflow/git-command-ambiguity.mjs";
import { writeHookResponse } from "./hook-io.mjs";

const BRANCH_MUTATING_FLAG =
  /^(?:-[a-zA-Z]*[dDmMcCf][a-zA-Z]*|--delete|--move|--copy|--force)$/u;

const CHECKOUT_CREATE_FLAGS = new Set(["-b", "-B", "--orphan"]);
const SWITCH_CREATE_FLAGS = new Set(["-c", "-C", "--create", "--force-create"]);
const CHECKOUT_VALUE_FLAGS = new Set(["-c", "--conflict", "--onto"]);
const SWITCH_VALUE_FLAGS = new Set(["--conflict"]);
const WORKTREE_CREATE_FLAGS = new Set(["-b", "-B"]);

export function isImmutableBranchName(name) {
  if (typeof name !== "string" || !name) return false;
  const bare = name.replace(/^(?:refs\/heads\/|refs\/remotes\/[^/]+\/)/u, "");
  return bare.includes("BRA") || bare.startsWith("rescue/");
}

export function immutableBranchDenial(detail = "skyddad branch") {
  return {
    permission: "deny",
    user_message:
      `Blockerat: ${detail}. Brancher som matchar *BRA* eller rescue/* är ` +
      "ägarens frysta backuper och får inte skapas, checkas ut, döpas om eller raderas.",
    agent_message:
      "Denied: immutable backup branch (*BRA* / rescue/*). Do not create, checkout, rename, or delete these branches.",
  };
}

function inspectGitInvocation(tokens) {
  const gitIndex = invokesGit(tokens);
  if (gitIndex < 0) return null;
  const args = [];
  let subcommand = null;
  for (let index = gitIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (subcommand) {
      args.push(token);
      continue;
    }
    if (GIT_OPTIONS_WITH_VALUE.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("--git-dir=") || token.startsWith("--work-tree=")) continue;
    if (token.startsWith("--namespace=") || token.startsWith("--config-env=")) continue;
    if (token.startsWith("-")) continue;
    subcommand = token.toLowerCase();
  }
  return { subcommand, args };
}

/**
 * Git läser `-uf` som `-u -f` och godtar entydigt förkortade långa flaggor
 * (`--mirr` = `--mirror`). Båda formerna gick förbi exakta tokenjämförelser
 * medan allowlistans prefix (`git push`, `git switch`, `git branch -vv`) släppte
 * dem utan fråga (extern granskning 2026-10-22).
 */
function clusterHas(token, letters) {
  return /^-[A-Za-z]{2,}$/u.test(token) && [...token.slice(1)].some((c) => letters.includes(c));
}

function abbreviates(token, longNames) {
  if (!token.startsWith("--")) return false;
  const name = token.slice(2).split("=")[0];
  return name.length >= 2 && longNames.some((long) => long !== name && long.startsWith(name));
}

const PUSH_DANGEROUS_LONG = [
  "force",
  "force-with-lease",
  "force-if-includes",
  "delete",
  "mirror",
  "prune",
  "no-verify",
];
const DISCARD_LONG = ["force", "discard-changes"];
const BRANCH_MUTATING_LONG = ["delete", "move", "copy", "force"];

function takeNamedArgs(args, createFlags, valueFlags) {
  const creates = [];
  const positionals = [];
  let hasPathspec = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--") {
      hasPathspec = true;
      break;
    }
    if (createFlags.has(token)) {
      creates.push(args[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (valueFlags.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    positionals.push(token);
  }
  return { creates, positionals, hasPathspec };
}

function classifyGitInvocation(subcommand, args) {
  if (!subcommand) return "heavy";
  if (READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) return "allow";

  if (subcommand === "worktree") {
    const action = args.find((token) => !token.startsWith("-"))?.toLowerCase();
    if (action === "list") return "allow";
    if (action === "remove") return "heavy";
    const created = takeNamedArgs(args, WORKTREE_CREATE_FLAGS, new Set()).creates;
    if (created.some(isImmutableBranchName)) return "deny-immutable";
    return "allow";
  }

  if (subcommand === "branch") {
    // `git branch -vvd x` matchar allowlistans läsprefix `git branch -vv`; en
    // skrivflagga gömd i ett kluster eller en förkortning nekas därför här.
    // Fristående `-d`/`-D` når som förut klassificeraren/frågan.
    if (
      args.some(
        (token) => clusterHas(token, "dDmMcCf") || abbreviates(token, BRANCH_MUTATING_LONG),
      )
    ) {
      return "deny-branch-cluster";
    }
    const mutating = args.some((token) => BRANCH_MUTATING_FLAG.test(token));
    const positionals = args.filter((token) => !token.startsWith("-"));
    const listing =
      !mutating &&
      (positionals.length === 0 ||
        args.includes("--list") ||
        args.includes("--all") ||
        args.includes("--contains") ||
        args.includes("-a") ||
        args.includes("-r"));
    if (listing) return "allow";
    if (positionals.some(isImmutableBranchName)) return "deny-immutable";
    return mutating ? "heavy" : "allow";
  }

  if (subcommand === "checkout" || subcommand === "switch") {
    // `-f` / `--discard-changes` throw away uncommitted work in the tree with
    // no recovery path. With `git switch` allowlisted in permissions.json this
    // would otherwise run without anyone seeing it (extern granskning, 5/10).
    if (
      args.some(
        (token) =>
          token === "-f" ||
          token === "--force" ||
          token === "--discard-changes" ||
          clusterHas(token, "f") ||
          abbreviates(token, DISCARD_LONG),
      )
    ) {
      return "deny-discard";
    }
    if (args.some((token) => token === "--ours" || token === "--theirs")) {
      return "heavy";
    }
    const parsed = takeNamedArgs(
      args,
      subcommand === "switch" ? SWITCH_CREATE_FLAGS : CHECKOUT_CREATE_FLAGS,
      subcommand === "switch" ? SWITCH_VALUE_FLAGS : CHECKOUT_VALUE_FLAGS,
    );
    if (parsed.hasPathspec) return "heavy";
    if ([...parsed.creates, ...parsed.positionals].some(isImmutableBranchName)) {
      return "deny-immutable";
    }
    return "allow";
  }

  if (subcommand === "push") {
    if (
      args.some(
        (token) =>
          isImmutableBranchName(token) ||
          /:(?:refs\/heads\/)?(?:[^\s]*BRA[^\s]*|rescue\/)/u.test(token),
      )
    ) {
      return "deny-immutable";
    }
    // Force-push was only stopped by the GIT pre-push hook, which exists only
    // after `npm run hooks:install`. With `git push` allowlisted in
    // permissions.json the Cursor layer has to be deterministic about it too
    // (extern granskning, 8/10). `--force-with-lease` is included: the repo
    // never rewrites shared history without break-glass, and break-glass is a
    // human running git outside the agent's shell.
    //
    // Second round (7/10, 8/10): `:branch` is the refspec spelling of delete;
    // `--mirror` and `--prune` delete every remote ref that is missing locally;
    // `--no-verify` skips the git pre-push hook that is the other defence line
    // — a push that needs to dodge its own gate is the push to stop.
    if (
      args.some(
        (token) =>
          token === "-f" ||
          token === "--force" ||
          token.startsWith("--force-with-lease") ||
          token === "--force-if-includes" ||
          token === "--delete" ||
          token === "-d" ||
          token === "--mirror" ||
          token === "--prune" ||
          token === "--no-verify" ||
          clusterHas(token, "fd") ||
          abbreviates(token, PUSH_DANGEROUS_LONG) ||
          /^\+\S/u.test(token) ||
          /^:\S/u.test(token),
      )
    ) {
      return "deny-force-push";
    }
    return "heavy";
  }

  if (subcommand === "commit") return "heavy";
  return "heavy";
}

function classifySegment(segment) {
  if (isRawWorktreeRemove(segment)) return "heavy";
  const invocation = inspectGitInvocation(commandWords(segment).map((word) => word.text));
  if (!invocation) return "allow";
  return classifyGitInvocation(invocation.subcommand, invocation.args);
}

/**
 * Fast verdict for commands this hook does not need to inspect further.
 *
 * Returns `allow` / a static `deny`, or `null` when the regular alias +
 * worktree-remove analysis must run. Never spawns git. Static denials are
 * judged before the expansion bail-out: `$x = 1; git push --force` must not
 * escape the force-push rule just because another segment expands.
 */
export function cheapShellDecision(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  const verdicts = expandSegments(command).map(classifySegment);
  if (verdicts.includes("deny-immutable")) return immutableBranchDenial();
  if (verdicts.includes("deny-force-push")) return forcePushDenial();
  if (verdicts.includes("deny-discard")) return discardDenial();
  if (verdicts.includes("deny-branch-cluster")) return branchClusterDenial();

  const expandable = command.replace(/'[^']*'/gu, "");
  if (SHELL_EXPANSION.test(expandable)) return null;
  if (/(?:^|\s)-c\s+['"]?alias\.[^\s=]+=/iu.test(command)) return null;
  if (verdicts.includes("heavy")) return null;
  // Expansion-free lines can still run hidden git (`"git push -f" | iex`,
  // `GIT_SSH_COMMAND="git push -f" git fetch`). Pure check; no alias lookup.
  if (isAmbiguousGitCommand(command, new Set())) return null;
  return { permission: "allow" };
}

export function forcePushDenial() {
  return {
    permission: "deny",
    user_message:
      "Blockerat: force-push, `+refspec`, `:branch`, `--delete`, `--mirror`, `--prune` eller " +
      "`--no-verify` via `git push`. Repot skriver aldrig om delad historik från agentens shell; " +
      "remote-delete ägs av GitHubs delete_branch_on_merge eller " +
      "`npm run tidy -- --delete-remote <branch> --apply`; git-hooken får inte hoppas över. " +
      "Hämta remote och bevara commits. Break-glass är ett ägarbeslut utanför agenten.",
    agent_message:
      "Denied: force-push (-f/--force/--force-with-lease/--force-if-includes), `+refspec`, " +
      "`:branch` delete refspec, `--delete`/`-d`, `--mirror`, `--prune` or `--no-verify` on `git push`. " +
      "Fetch and preserve remote commits instead. Remote branch deletion belongs to GitHub " +
      "delete_branch_on_merge or `npm run tidy -- --delete-remote <branch> --apply`; the pre-push " +
      "hook is not optional. Do not work around this with another command.",
  };
}

export function discardDenial() {
  return {
    permission: "deny",
    user_message:
      "Blockerat: `git checkout/switch -f` eller `--discard-changes` kastar ocommitterat arbete utan " +
      "återställningsväg. Stash:a eller committa först, eller låt ägaren göra det.",
    agent_message:
      "Denied: `git checkout -f`, `git switch -f` and `--discard-changes` drop uncommitted work with no " +
      "recovery path. Use `git stash` or commit first. Do not work around this with another command.",
  };
}

export function branchClusterDenial() {
  return {
    permission: "deny",
    user_message:
      "Blockerat: en skrivflagga (`-d/-D/-m/-M/-c/-C/-f` eller förkortad `--delete/--move/--copy/--force`) " +
      "gömd i ett flaggkluster för `git branch`. Läsformerna är allowlistade, skrivformerna ska frågas.",
    agent_message:
      "Denied: a mutating `git branch` flag hidden in a short-flag cluster or an abbreviated long option " +
      "(e.g. `-vvd`, `--del`). Write the flag on its own (`git branch -d <name>`) so it reaches the normal " +
      "approval path. Do not work around this with another command.",
  };
}

export function isRawWorktreeRemove(segment) {
  // A quoted bash/pwsh payload is executable, not prose. Inspect it before
  // stripping ordinary quoted arguments such as grep patterns or commit text.
  if (
    nestedShellPayloads(segment).some((payload) => shellSegments(payload).some(isRawWorktreeRemove))
  ) {
    return true;
  }

  // Tokenisera shellcitering i stället för att kasta all citerad text. Annars
  // försvinner även giltiga executable-former som `"git"`, `g"it"` och
  // `env "git"`, medan ett citerat grep-/rg-argument inte är ett kommando.
  const tokens = shellTokens(segment);
  const gitIndex = invokesGit(tokens);
  const args = gitIndex < 0 ? tokens : tokens.slice(gitIndex + 1);
  const hasRemoval = args.some(
    (token, index) => /^worktree$/i.test(token) && /^remove$/i.test(args[index + 1]),
  );
  if (!hasRemoval) return false;
  if (gitIndex >= 0) return true;

  // Dynamiska executable-former (`$(command -v git) ...`) går inte att
  // verifiera statiskt. När den riktiga subcommand-paret ändå står som separata
  // shellord nekar vi fail-closed; den kanoniska npm-wrappern använder i stället
  // det enda ordet `worktree:remove` och träffas inte.
  return true;
}

function failure(reason) {
  return {
    permission: "deny",
    user_message: `Blockerat: worktree-skyddet kunde inte verifiera kommandot (${reason}). Använd npm run worktree:remove.`,
    agent_message: `Denied fail-closed: worktree guard could not verify the command (${reason}). Use npm run worktree:remove.`,
  };
}

/**
 * @param {string} command
 * @param {{ aliases?: Map<string, string> | Set<string> | null }} [options]
 */
export function decide(command, { aliases } = {}) {
  if (typeof command !== "string" || !command.trim()) return failure("saknat kommando");
  const cheap = cheapShellDecision(command);
  if (cheap) return cheap;
  const resolved = aliases === undefined ? resolveAliasesFor(command) : aliases;
  if (isAmbiguousGitCommand(command, resolved)) {
    return failure("dynamiskt eller aliasbaserat git-kommando; skriv det explicita git-kommandot");
  }
  const offending = expandSegments(command).find(isRawWorktreeRemove);
  if (!offending) {
    return { permission: "allow" };
  }

  // Both variants are denied, not just the forced one. Git refuses to remove a
  // worktree that is dirty or has untracked files — but a junctioned
  // `node_modules` is *ignored*, not untracked, so `git status --porcelain`
  // (what that check reads, see `parseDirtyEntries` in worktree.mjs) reports the
  // worktree as clean. Plain `git worktree remove` therefore proceeds and
  // follows the junction exactly like `--force` does. The wrapper is the only
  // safe path in both cases.
  const forced = /(?:^|\s)(?:--force|-f)(?:\s|$)/.test(offending);
  const variant = forced ? "`git worktree remove --force`" : "`git worktree remove`";

  return {
    permission: "deny",
    user_message:
      `Blockerat: rå ${variant} följer node_modules-junctionen och tömmer ` +
      "huvudcheckoutens riktiga `node_modules`. Det har hänt två gånger i det här repot.\n\n" +
      "Att utelämna `--force` hjälper inte: git vägrar bara när worktreet är smutsigt eller har " +
      "**ospårade** filer, och en junctionad `node_modules` är *ignorerad* — alltså osynlig för " +
      "den kontrollen.\n\n" +
      "Använd i stället:\n\n" +
      "    npm run worktree:remove -- <sökväg> [--force]\n\n" +
      "Den kopplar loss länkarna först och vägrar dessutom röra huvudcheckouten.",
    agent_message:
      `Denied: raw ${variant} follows the node_modules junction and empties the main checkout's ` +
      "node_modules. Dropping --force does not help: git only refuses on dirty or UNTRACKED " +
      "entries, and a junctioned node_modules is IGNORED, so the worktree reads as clean. Use " +
      "`npm run worktree:remove -- <path> [--force]` instead — it detaches links first and " +
      "refuses to touch the main checkout. Do not work around this by deleting the directory " +
      "with another command.",
  };
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
    response = decide(input.command);
  } catch {
    response = failure("ogiltig hook-input");
  }
  writeHookResponse(response);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
