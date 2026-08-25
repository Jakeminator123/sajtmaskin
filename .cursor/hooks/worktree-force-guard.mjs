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
 *   - never call `process.exit()` after writing, because stdout to a pipe is
 *     async on Windows and exiting can discard the response before Cursor
 *     reads it — an empty response reads as a crashed hook;
 *   - never throw. Unexpected input resolves to an explicit deny because this
 *     hook protects a destructive operation and is configured fail-closed.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    const looksLikeGit =
      gitIndex >= 0 ||
      dynamicGit ||
      /(?:^|[\s;&|])(?:[^\s;&|/\\]+[/\\])*git(?:\.exe)?\b/iu.test(dequoted);
    if (!looksLikeGit) return false;
    if (aliases === null) return true;

    if (hasInlineAliasOption(tokens, gitIndex)) return true;
    if (injectsAliasEnvironment && (gitIndex >= 0 || dynamicGit)) return true;
    if (dynamicGit) return true;

    // Single-quoted shell text is literal. Everything else below can change
    // the executable/subcommand after the hook has inspected the raw string.
    const expandable = segment.replace(/'[^']*'/gu, "");
    if (/\$\(|`|\$\{|\$[A-Za-z_]/u.test(expandable)) return true;
    if (/(?:^|\s)-c\s+['"]?alias\.[^\s=]+=/iu.test(segment)) return true;

    const subcommand = gitSubcommand(tokens, gitIndex);
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

export function decide(command, { aliases = new Set() } = {}) {
  if (typeof command !== "string" || !command.trim()) return failure("saknat kommando");
  if (isAmbiguousGitCommand(command, aliases)) {
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
    response = decide(input.command, { aliases: resolveAliasesFor(input.command) });
  } catch {
    response = failure("ogiltig hook-input");
  }
  try {
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch {
    // A closed pipe (the client already gave up waiting) must not surface as a
    // non-zero exit: the client reports that as a crashed hook rather than as
    // its own timeout, which hides the real cause.
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
