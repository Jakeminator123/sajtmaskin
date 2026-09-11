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
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeHookResponse } from "./hook-io.mjs";

/**
 * Split a shell line into independently executed parts.
 *
 * Judging the whole string at once is bypassable: `npm run worktree:remove --
 * ../a; git worktree remove ../b --force` mentions the sanctioned wrapper, so a
 * whole-string allowlist would pass it while the raw delete still runs.
 */
export function shellSegments(command) {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function shellTokens(segment) {
  const tokens = [];
  let value = "";
  let quote = null;
  let substitutionDepth = 0;
  let backtick = false;
  let started = false;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (char === "\\" && quote !== "'") {
      started = true;
      if (index + 1 < segment.length) value += segment[++index];
      continue;
    }
    // A command substitution is one shell word even when its payload contains
    // spaces. Keeping it together lets the guards recognise partially composed
    // executables such as `$(printf g)it` instead of treating `g)it` as prose.
    if (quote !== "'" && char === "$" && segment[index + 1] === "(") {
      started = true;
      substitutionDepth += 1;
      value += "$(";
      index += 1;
      continue;
    }
    if (substitutionDepth > 0) {
      value += char;
      if (char === "(") substitutionDepth += 1;
      else if (char === ")") substitutionDepth -= 1;
      continue;
    }
    if (quote !== "'" && char === "`") {
      started = true;
      backtick = !backtick;
      value += char;
      continue;
    }
    if (backtick) {
      value += char;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else value += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) tokens.push(value);
      value = "";
      started = false;
      continue;
    }
    value += char;
    started = true;
  }
  if (started) tokens.push(value);
  return tokens;
}

export function invokesGit(tokens) {
  const gitIndex = tokens.findIndex((token) => /(?:^|[/\\])git(?:\.exe)?$/i.test(token));
  if (gitIndex < 0) return -1;
  const allowedPrefix =
    /^(?:&|call|command|builtin|exec|sudo|env|nohup|nice|--|-[^\s]+|[A-Za-z_][A-Za-z0-9_]*=.*)$/i;
  return tokens.slice(0, gitIndex).every((token) => allowedPrefix.test(token)) ? gitIndex : -1;
}

const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
]);

function gitSubcommand(tokens, gitIndex) {
  if (gitIndex < 0) return null;
  for (let index = gitIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (GIT_OPTIONS_WITH_VALUE.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("--git-dir=") || token.startsWith("--work-tree=")) continue;
    if (token.startsWith("--namespace=") || token.startsWith("--config-env=")) continue;
    if (token.startsWith("-")) continue;
    return token.toLowerCase();
  }
  return null;
}

const COMMAND_PREFIXES = new Set([
  "&",
  "call",
  "command",
  "builtin",
  "exec",
  "sudo",
  "env",
  "nohup",
  "nice",
  "--",
]);
const SHELL_EXPANSION = /\$\(|`|\$\{|\$[A-Za-z_]/u;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=.*/u;

function firstExecutableIndex(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (COMMAND_PREFIXES.has(token.toLowerCase()) || ENV_ASSIGNMENT.test(token)) continue;
    if (token.startsWith("-")) continue;
    return index;
  }
  return -1;
}

function hasInlineAliasOption(tokens, gitIndex) {
  const start = gitIndex >= 0 ? gitIndex + 1 : 0;
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-c" || token === "--config-env") {
      if (/^alias\.[^=\s]+=/iu.test(tokens[index + 1] ?? "")) return true;
      index += 1;
      continue;
    }
    if (/^--config-env=alias\.[^=\s]+=/iu.test(token)) return true;
  }
  return false;
}

function hasAliasEnvironmentAssignment(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!/^GIT_CONFIG_KEY_\d+=alias\.[^\s=]+$/iu.test(token)) continue;
    const prefix = tokens.slice(0, index);
    if (
      prefix.every(
        (candidate) =>
          candidate.toLowerCase() === "export" ||
          candidate.toLowerCase() === "env" ||
          candidate.startsWith("-") ||
          ENV_ASSIGNMENT.test(candidate),
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasDynamicGitExecutable(tokens, aliases) {
  const executableIndex = firstExecutableIndex(tokens);
  if (executableIndex < 0 || !SHELL_EXPANSION.test(tokens[executableIndex])) return false;
  const args = tokens.slice(executableIndex + 1);
  const hasProtectedSubcommand =
    args.some((token) => /^commit$/iu.test(token)) ||
    args.some((token, index) => /^worktree$/iu.test(token) && /^remove$/iu.test(args[index + 1]));
  const invokesKnownAlias =
    aliases instanceof Set && args.length > 0 && aliases.has(args[0].toLowerCase());
  return hasProtectedSubcommand || invokesKnownAlias || hasInlineAliasOption(tokens, -1);
}

/** Read configured aliases once per hook invocation. null = inspection failed. */
export function readGitAliases() {
  const result = spawnSync("git", ["config", "--get-regexp", "^alias\\."], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 2000,
    windowsHide: true,
  });
  // Git exits 1 when no matching aliases exist; that is a verified empty set.
  if (result.status === 1 && !result.stdout.trim()) return new Set();
  if (result.status !== 0) return null;
  const aliases = new Set();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = /^alias\.([^\s]+)\s+/iu.exec(line.trim());
    if (match) aliases.add(match[1].toLowerCase());
  }
  return aliases;
}

/**
 * True when the alias table can still change this command's verdict.
 *
 * A Git alias is only reachable through a literal `git` executable or a shell
 * expansion that assembles one: `hasDynamicGitExecutable` requires expansion in
 * the executable token, and every other `looksLikeGit` arm requires a literal
 * `git`. A command with neither therefore resolves identically against any
 * alias set, so reading the table would spend a `git config` subprocess on a
 * verdict that cannot move. That cost is paid on EVERY tool call, and a hook
 * that misses its deadline reads as a crashed hook and fails closed.
 */
export function mayResolveToGit(command) {
  if (typeof command !== "string") return true;
  if (SHELL_EXPANSION.test(command)) return true;
  return /git/iu.test(command.replace(/["'\\]/gu, ""));
}

/**
 * Read aliases only when they can matter. `new Set()` is not a weaker default
 * here: for commands `mayResolveToGit` rejects, `isAmbiguousGitCommand` returns
 * false for every alias set, and `isRawWorktreeRemove` never consults aliases.
 */
export function resolveAliasesFor(command, read = readGitAliases) {
  return mayResolveToGit(command) ? read() : new Set();
}

/**
 * Shell expansion and Git aliases are executable code. The hook deliberately
 * refuses them instead of pretending to implement a complete shell/Git parser.
 */
export function isAmbiguousGitCommand(command, aliases = new Set()) {
  const segments = shellSegments(command);
  // Git's environment config protocol can define an alias in an earlier shell
  // segment (`export ...; git alias`). The hook process has not executed those
  // assignments yet, so `git config --get-regexp` cannot see them.
  const injectsAliasEnvironment = segments.some((segment) =>
    hasAliasEnvironmentAssignment(shellTokens(segment)),
  );
  const inspect = (segment) => {
    if (nestedShellPayloads(segment).some((payload) => shellSegments(payload).some(inspect))) {
      return true;
    }
    const tokens = shellTokens(segment);
    const gitIndex = invokesGit(tokens);
    // Single-quoted text is literal to the shell. Double-quoted and unquoted
    // expansions can still assemble the executable after inspection.
    const expandableTokens = shellTokens(segment.replace(/'[^']*'/gu, ""));
    const dynamicGit = hasDynamicGitExecutable(expandableTokens, aliases);
    const dequoted = segment.replace(/["'\\]/gu, "");
    // `$(git …)` / `` `git …` `` inside a string never reached this point: the
    // substitution was one opaque token and the prose regex requires
    // whitespace before `git`. A `Write-Host "$(git push --force …)"` therefore
    // ran uninspected. Treat a git that opens a substitution as git-looking so
    // it falls into the dynamic branch below and is denied (found 2026-09-11).
    const looksLikeGit =
      gitIndex >= 0 ||
      dynamicGit ||
      /(?:^|[\s;&|])(?:[^\s;&|/\\]+[/\\])*git(?:\.exe)?\b/iu.test(dequoted) ||
      /(?:\$\(|`)\s*(?:[^\s;&|/\\()`]+[/\\])*git(?:\.exe)?\b/iu.test(segment);
    if (!looksLikeGit) return false;
    if (aliases === null) return true;

    if (hasInlineAliasOption(tokens, gitIndex)) return true;
    if (injectsAliasEnvironment && (gitIndex >= 0 || dynamicGit)) return true;
    if (dynamicGit) return true;

    const subcommand = gitSubcommand(tokens, gitIndex);

    // Single-quoted shell text is literal. Everything else below can change
    // the executable/subcommand after the hook has inspected the raw string.
    //
    // Exception (2026-09-11): a LITERAL `git` with a LITERAL read-only
    // subcommand cannot be turned into a write by whatever its arguments
    // expand to — `git log $sha`, `git diff $a $b`, `git show $ref:$path` stay
    // reads no matter what `$sha` becomes. Denying those was the single most
    // frequent false positive in practice (a `foreach` over branches with
    // `$_` in a `git log` line). The executable and subcommand tokens are still
    // required to be expansion-free; only the args may expand.
    const expandable = segment.replace(/'[^']*'/gu, "");
    if (/\$\(|`|\$\{|\$[A-Za-z_]/u.test(expandable)) {
      const subcommandIndex = tokens.findIndex(
        (token, index) => index > gitIndex && token.toLowerCase() === subcommand,
      );
      const literalReadOnly =
        gitIndex >= 0 &&
        subcommand !== null &&
        subcommandIndex > gitIndex &&
        READ_ONLY_GIT_SUBCOMMANDS.has(subcommand) &&
        // Everything from `git` through the subcommand itself must be literal;
        // an expansion in a global option (`git -C $dir log`) or in the
        // subcommand slot would let the read become something else.
        !tokens.slice(gitIndex, subcommandIndex + 1).some((token) => SHELL_EXPANSION.test(token));
      if (!literalReadOnly) return true;
    }
    if (/(?:^|\s)-c\s+['"]?alias\.[^\s=]+=/iu.test(segment)) return true;

    return subcommand !== null && aliases.has(subcommand);
  };
  return segments.some(inspect);
}

/** True for a segment that invokes git's own worktree removal, not the wrapper. */
export function nestedShellPayloads(segment) {
  const payloads = [];
  const patterns = [
    /\b(?:ba|z|k)?sh(?:\.exe)?\b[^;&|\n]*?\s-[^\s]*c[^\s]*\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^\s;&|])+))/giu,
    /\b(?:pwsh|powershell)(?:\.exe)?\b[^;&|\n]*?\s-(?:command|c)\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^\s;&|])+))/giu,
    /\bcmd(?:\.exe)?\b[^;&|\n]*?\s\/c\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^\s;&|])+))/giu,
  ];
  for (const pattern of patterns) {
    for (const match of segment.matchAll(pattern)) {
      payloads.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\\([\\ "';&|])/g, "$1"));
    }
  }
  return payloads;
}

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "rev-parse",
  "fetch",
  "ls-files",
  "describe",
  "cat-file",
  "ls-tree",
  "name-rev",
  "for-each-ref",
  "symbolic-ref",
  "version",
  "help",
  "annotate",
  "blame",
  "grep",
  "shortlog",
  "range-diff",
  "whatchanged",
  "rev-list",
  "merge-base",
  "var",
]);

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
    if (args.some((token) => token === "-f" || token === "--force" || token === "--discard-changes")) {
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
    if (
      args.some(
        (token) =>
          token === "-f" ||
          token === "--force" ||
          token.startsWith("--force-with-lease") ||
          token === "--force-if-includes" ||
          token === "--delete" ||
          token === "-d" ||
          /^\+\S/u.test(token),
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
  const invocation = inspectGitInvocation(shellTokens(segment));
  if (!invocation) return "allow";
  return classifyGitInvocation(invocation.subcommand, invocation.args);
}

/**
 * Fast verdict for commands this hook does not need to inspect further.
 *
 * Returns `allow` / immutable-branch `deny`, or `null` when the regular
 * alias + worktree-remove analysis must run. Never spawns git.
 */
export function cheapShellDecision(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  const expandable = command.replace(/'[^']*'/gu, "");
  if (SHELL_EXPANSION.test(expandable)) return null;
  if (/(?:^|\s)-c\s+['"]?alias\.[^\s=]+=/iu.test(command)) return null;

  const verdicts = [];
  const walk = (value) => {
    for (const segment of shellSegments(value)) {
      for (const payload of nestedShellPayloads(segment)) walk(payload);
      verdicts.push(classifySegment(segment));
    }
  };
  walk(command);
  if (verdicts.includes("deny-immutable")) return immutableBranchDenial();
  if (verdicts.includes("deny-force-push")) return forcePushDenial();
  if (verdicts.includes("deny-discard")) return discardDenial();
  if (verdicts.includes("heavy")) return null;
  return { permission: "allow" };
}

export function forcePushDenial() {
  return {
    permission: "deny",
    user_message:
      "Blockerat: force-push, `+refspec` eller remote-delete via `git push`. Repot skriver aldrig om " +
      "delad historik från agentens shell; remote-delete ägs av GitHubs delete_branch_on_merge eller " +
      "städwrappern. Hämta remote och bevara commits. Break-glass är ett ägarbeslut utanför agenten.",
    agent_message:
      "Denied: force-push (-f/--force/--force-with-lease/--force-if-includes), `+refspec` or `--delete` " +
      "on `git push`. Fetch and preserve remote commits instead. Remote branch deletion belongs to " +
      "GitHub delete_branch_on_merge or the canonical cleanup wrapper. Do not work around this with " +
      "another command.",
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

export function decide(command, { aliases } = {}) {
  if (typeof command !== "string" || !command.trim()) return failure("saknat kommando");
  const cheap = cheapShellDecision(command);
  if (cheap) return cheap;
  const resolved = aliases === undefined ? resolveAliasesFor(command) : aliases;
  if (isAmbiguousGitCommand(command, resolved)) {
    return failure("dynamiskt eller aliasbaserat git-kommando; skriv det explicita git-kommandot");
  }
  const offending = shellSegments(command).find(isRawWorktreeRemove);
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
