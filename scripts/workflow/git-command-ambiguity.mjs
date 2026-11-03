/**
 * Shell/Git parsing shared by the fail-closed Cursor shell guards
 * (`.cursor/hooks/worktree-force-guard.mjs` and `scripts/workflow/commit-guard.mjs`).
 *
 * Shell expansion and Git aliases are executable code, so a guard cannot know
 * what an expanded command finally runs. `isAmbiguousGitCommand` refuses only
 * the expansions that could turn into a write these guards protect (commit,
 * push, worktree removal, branch/checkout/switch). A literal `git` with a
 * literal read-only subcommand stays a read whatever its arguments expand to.
 *
 * Never spawns git except in `readGitAliases`, and never throws on odd input:
 * both hooks are fail-closed and run on every matching shell call.
 */
import { spawnSync } from "node:child_process";

/**
 * Split a shell line into independently executed parts.
 *
 * Judging the whole string at once is bypassable: `npm run worktree:remove --
 * ../a; git worktree remove ../b --force` mentions the sanctioned wrapper, so a
 * whole-string allowlist would pass it while the raw delete still runs.
 */
export function shellSegments(command) {
  return [...new Set(shellSegmentVariants(command).flat())];
}

/**
 * The hook input has no shell identity. Inspect both POSIX backslash escaping
 * and Windows/PowerShell quoting; a backslash cannot hide a Windows separator.
 * Keep quoted separators and descriptor redirects (`2>&1`) inside their word.
 * Leading `&` stays attached to the next command for PowerShell invocation.
 */
export function shellSegmentVariants(command, { splitPipes = true } = {}) {
  return ["posix", "powershell"].map((dialect) => {
    const segments = [];
    let value = "";
    let quote = null;
    for (let index = 0; index < command.length; index += 1) {
      const char = command[index];
      const next = command[index + 1] ?? "";
      const escape = dialect === "posix" ? "\\" : "`";
      if (char === escape && quote !== "'") {
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
      const singleAmpersand =
        char === "&" && next !== "&" && !/[<>]/u.test(command[index - 1] ?? "");
      if (
        pair === "&&" ||
        pair === "||" ||
        char === ";" ||
        char === "\n" ||
        (splitPipes && char === "|") ||
        singleAmpersand
      ) {
        if (value.trim()) segments.push(value.trim());
        value = singleAmpersand ? "& " : "";
        if (pair === "&&" || pair === "||") index += 1;
        continue;
      }
      value += char;
    }
    if (value.trim()) segments.push(value.trim());
    return segments;
  });
}

const EXPANSION_START = /[A-Za-z_{]/u;

/**
 * Shell words with two facts the guards need: `dynamic` (unquoted or
 * double-quoted expansion that changes the word at run time) and `quoted`.
 */
export function shellWords(segment) {
  const words = [];
  let word = null;
  let quote = null;
  let substitutionDepth = 0;
  let backtick = false;
  const begin = () => (word ??= { text: "", dynamic: false, quoted: false });
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    const next = segment[index + 1] ?? "";
    if (substitutionDepth > 0) {
      word.text += char;
      if (char === "(") substitutionDepth += 1;
      else if (char === ")") substitutionDepth -= 1;
      continue;
    }
    if (backtick) {
      word.text += char;
      if (char === "`") backtick = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      const current = begin();
      if (index + 1 < segment.length) {
        // PowerShell does not treat `\` as an escape, so `\$x` still expands there.
        if (next === "$" && EXPANSION_START.test(segment[index + 2] ?? "")) current.dynamic = true;
        current.text += segment[++index];
      }
      continue;
    }
    // A command substitution is one shell word even when its payload contains
    // spaces. Keeping it together lets the guards recognise partially composed
    // executables such as `$(printf g)it` instead of treating `g)it` as prose.
    if (quote !== "'" && char === "$" && next === "(") {
      const current = begin();
      current.dynamic = true;
      current.text += "$(";
      substitutionDepth = 1;
      index += 1;
      continue;
    }
    if (quote !== "'" && char === "`") {
      const current = begin();
      current.dynamic = true;
      current.text += char;
      backtick = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (quote === '"' && char === "$" && EXPANSION_START.test(next)) word.dynamic = true;
      word.text += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      begin().quoted = true;
      continue;
    }
    if (/\s/u.test(char)) {
      if (word) words.push(word);
      word = null;
      continue;
    }
    const current = begin();
    if (char === "$" && EXPANSION_START.test(next)) current.dynamic = true;
    current.text += char;
  }
  if (word) words.push(word);
  return words;
}

export function shellTokens(segment) {
  return shellWords(segment).map((word) => word.text);
}

/** Index just past the `)` / `}` that closes the `(` / `{` at `open`, or -1. */
function balancedEnd(text, open) {
  const opener = text[open];
  const closer = opener === "{" ? "}" : ")";
  let depth = 0;
  let quote = null;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\" && quote !== "'") {
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/**
 * Code that runs inside one command line: `$(…)` and `` `…` `` outside single
 * quotes, plus bare `(…)` groups (PowerShell subexpressions, POSIX subshells)
 * and `{…}` script blocks (`Invoke-Command -ScriptBlock { … }`). Quoted text
 * without a substitution is an argument, not a command.
 */
export function groupPayloads(text) {
  const payloads = [];
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\" && quote !== "'") {
      index += 1;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (char === "$" && text[index + 1] === "(") {
      const end = balancedEnd(text, index + 1);
      if (end < 0) {
        payloads.push(text.slice(index + 2));
        break;
      }
      payloads.push(text.slice(index + 2, end - 1));
      index = end - 1;
      continue;
    }
    if (char === "`") {
      const close = text.indexOf("`", index + 1);
      if (close < 0) continue;
      payloads.push(text.slice(index + 1, close));
      index = close;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || (char === "{" && text[index - 1] !== "$")) {
      const end = balancedEnd(text, index);
      if (end < 0) continue;
      payloads.push(text.slice(index + 1, end - 1));
      index = end - 1;
    }
  }
  return payloads;
}

/** Quoted payloads that a nested shell or `Invoke-Expression` will execute. */
export function nestedShellPayloads(segment) {
  const payloads = [];
  const patterns = [
    /\b(?:ba|z|k)?sh(?:\.exe)?\b[^;&|\n]*?\s-[^\s]*c[^\s]*\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^\s;&|])+))/giu,
    /\b(?:pwsh|powershell)(?:\.exe)?\b[^;&|\n]*?\s-(?:command|c)\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^\s;&|])+))/giu,
    /\bcmd(?:\.exe)?\b[^;&|\n]*?\s\/c\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^\s;&|])+))/giu,
    /\b(?:iex|invoke-expression|eval)\b(?:\s+-command)?\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^\s;&|])+))/giu,
  ];
  for (const pattern of patterns) {
    for (const match of segment.matchAll(pattern)) {
      payloads.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\\([\\ "';&|])/g, "$1"));
    }
  }
  // cmd does not use backslash escapes or single-quote delimiters. Keep a
  // Windows interpretation as well as the portable shell regex above, including
  // /s /c's outer-quote removal. Do not let POSIX dequoting hide a later `&`.
  const cmd = /\bcmd(?:\.exe)?\b[^;&|\n]*?\s\/[ck]\s+([\s\S]*)/iu.exec(segment);
  if (cmd) {
    const tail = cmd[1].trim().replace(/'/gu, "");
    payloads.push(tail);
    if (tail.startsWith('"') && tail.endsWith('"')) payloads.push(tail.slice(1, -1));
  }
  return [...new Set(payloads)];
}

const BLOCK_OPENERS = [
  /^\s*[{}]\s*/u,
  /^\s*&\s*(?=\{)/u,
  /^\s*(?:else|try|finally|do|begin|process|end)\s*\{\s*/iu,
  /^\s*catch\b[^{]*\{\s*/iu,
  /^\s*(?:ForEach-Object|Where-Object|foreach|where|%|\?)\s*\{\s*/iu,
  /^\s*(?:\[[^\]]+\]\s*)?\$(?:\{[^}]+\}|[A-Za-z_][\w:]*)\s*[-+*/]?=(?!=)\s*/u,
];
const CONTROL_HEADER = /^\s*(?:foreach|for|while|if|elseif|switch|until)\s*(?=\()/iu;

/**
 * Drop PowerShell syntax in front of the executable: `$n = `, `{`, `}`,
 * `foreach (…) {`, `ForEach-Object {`. The header's `(…)` is not lost — it is
 * inspected as a group payload of the whole line.
 */
function stripPowerShellPrefix(segment) {
  let rest = segment;
  for (let guard = 0; guard < 32; guard += 1) {
    const header = CONTROL_HEADER.exec(rest);
    if (header) {
      const end = balancedEnd(rest, header[0].length);
      if (end < 0) break;
      rest = rest.slice(end).replace(/^\s*\{?\s*/u, "");
      continue;
    }
    const opener = BLOCK_OPENERS.find((pattern) => pattern.test(rest));
    if (!opener) break;
    rest = rest.replace(opener, "");
  }
  return rest.replace(/(?:\s*\})+\s*$/u, "").trim();
}

/**
 * Every command body a line can execute: top-level segments, nested shell /
 * `iex` payloads and substitution/subexpression payloads, each with
 * PowerShell prefix syntax removed.
 */
export function expandSegments(command, depth = 0) {
  if (depth > 8) return [command];
  const bodies = [];
  for (const payload of groupPayloads(command)) bodies.push(...expandSegments(payload, depth + 1));
  for (const raw of shellSegments(command)) {
    for (const payload of nestedShellPayloads(raw)) {
      bodies.push(...expandSegments(payload, depth + 1));
    }
    const body = stripPowerShellPrefix(raw);
    if (body) bodies.push(body);
  }
  return bodies;
}

const REDIRECT = /^(?:\d|\*)?>>?/u;
const BARE_REDIRECT = /^(?:\d|\*)?>>?$/u;

/** Words of one command body without redirections such as `2>$null` / `> out.txt`. */
export function commandWords(segment) {
  const words = shellWords(segment);
  const kept = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (!word.quoted && REDIRECT.test(word.text)) {
      if (BARE_REDIRECT.test(word.text)) index += 1;
      continue;
    }
    kept.push(word);
  }
  return kept;
}

const GIT_EXECUTABLE = /(?:^|[/\\])git(?:\.exe)?$/iu;

export function invokesGit(tokens) {
  const gitIndex = tokens.findIndex((token) => GIT_EXECUTABLE.test(token));
  if (gitIndex < 0) return -1;
  const allowedPrefix =
    /^(?:&|call|command|builtin|exec|sudo|env|nohup|nice|--|-[^\s]+|[A-Za-z_][A-Za-z0-9_]*=.*)$/i;
  return tokens.slice(0, gitIndex).every((token) => allowedPrefix.test(token)) ? gitIndex : -1;
}

export const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
]);

function gitSubcommandIndex(tokens, gitIndex) {
  if (gitIndex < 0) return -1;
  for (let index = gitIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (GIT_OPTIONS_WITH_VALUE.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    return index;
  }
  return -1;
}

export const READ_ONLY_GIT_SUBCOMMANDS = new Set([
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

/** Subcommands whose expanded arguments can reach a protected write or immutable branch. */
const PROTECTED_WRITE_SUBCOMMANDS = new Set(["commit", "push", "branch", "checkout", "switch"]);

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
export const SHELL_EXPANSION = /\$\(|`|\$\{|\$[A-Za-z_]/u;
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

/**
 * `aliases` is a Map (name → expansion) from `readGitAliases`, or a Set of
 * names when only names are known; a bare name is treated as a possible write.
 * Git never lets an alias shadow a builtin, so only non-builtin names matter.
 */
function aliasMayWrite(aliases, name) {
  if (!aliases || typeof aliases.has !== "function" || !aliases.has(name)) return false;
  if (!(aliases instanceof Map)) return true;
  const expansion = String(aliases.get(name) ?? "").trim();
  if (expansion.startsWith("!")) return true;
  const first = expansion
    .split(/\s+/u)
    .find((token) => token && !token.startsWith("-"))
    ?.toLowerCase();
  return !first || !READ_ONLY_GIT_SUBCOMMANDS.has(first);
}

function namesProtectedWrite(args) {
  return (
    args.some((token) => /^(?:commit|push)$/iu.test(token)) ||
    args.some(
      (token, index) => /^worktree$/iu.test(token) && /^remove$/iu.test(args[index + 1] ?? ""),
    )
  );
}

function expandedArgsMayWrite(subcommand, args) {
  if (PROTECTED_WRITE_SUBCOMMANDS.has(subcommand)) return true;
  if (subcommand !== "worktree") return false;
  const action = args.find((word) => !word.text.startsWith("-"));
  return !action || action.dynamic || action.text.toLowerCase() !== "list";
}

const GIT_WORD = /(?:^|[\s;&|("'])git(?:\.exe)?(?=$|[\s;&|)"'])/iu;

/** A value that can make git run another command: an expansion or a `git …` command line. */
function valueRunsGit(text, dynamic = false) {
  return dynamic || SHELL_EXPANSION.test(text) || GIT_WORD.test(text);
}

const CODE_EVALUATOR = /^(?:iex|invoke-expression|eval)$/iu;
const SCRIPT_RUNNER = /^(?:invoke-command|icm|start-job|start-threadjob)$/iu;
const NESTED_SHELL = /^(?:(?:ba|z|k)?sh|pwsh|powershell|cmd)(?:\.exe)?$/iu;

/**
 * A body that executes code assembled at run time (`iex $cmd`, `"…" | iex`,
 * `eval "$cmd"`, `& $x`, `& (…)`, `pwsh -c $cmd`). Literal payloads are
 * inspected as nested segments instead; these cannot be.
 */
function runsDynamicCode(segment) {
  const words = commandWords(segment);
  if (words.length === 0) return false;
  if (
    (words[0].text === "&" || words[0].text === ".") &&
    words[1] &&
    (words[1].dynamic || words[1].text.startsWith("("))
  ) {
    return true;
  }
  if (/\[scriptblock\]::create/iu.test(segment)) return true;
  const tokens = words.map((word) => word.text);
  const executableIndex = firstExecutableIndex(tokens);
  if (executableIndex < 0) return false;
  const executable = tokens[executableIndex].toLowerCase();
  const rest = words.slice(executableIndex + 1);
  if (CODE_EVALUATOR.test(executable)) {
    // No argument means the code arrives on the pipeline (`"…" | iex`).
    return (
      rest.length === 0 ||
      rest.some((word) => word.dynamic || word.text.startsWith("(") || word.text === "+")
    );
  }
  if (SCRIPT_RUNNER.test(executable)) return rest.some((word) => word.dynamic);
  if (NESTED_SHELL.test(executable)) {
    return nestedShellPayloads(segment).some((payload) => {
      const payloadWords = commandWords(payload);
      const index = firstExecutableIndex(payloadWords.map((word) => word.text));
      return index >= 0 && payloadWords[index].dynamic;
    });
  }
  return false;
}

const STRING_ASSIGNMENT =
  /^\s*(?:(?:export|local|readonly|declare(?:\s+-\w+)*)\s+)?(?:\$\{([^}]+)\}|\$([A-Za-z_][\w:]*)|([A-Za-z_]\w*))\s*\+?=(?!=)\s*(.*)$/su;

/**
 * Variables assigned a string that names git (`$cmd = "git push -f"`,
 * `cmd="git push -f"`). Executing one (`$cmd` in bash) runs that string.
 * `$n = git rev-list …` captures command output and is not a string value.
 */
function stringVariablesNamingGit(command) {
  const names = new Set();
  for (const raw of shellSegments(command)) {
    const match = STRING_ASSIGNMENT.exec(raw);
    if (!match) continue;
    const [, braced, sigil, bare, value] = match;
    const isString = bare !== undefined || /^["']/u.test(value);
    if (isString && GIT_WORD.test(value)) names.add((braced ?? sigil ?? bare).toLowerCase());
  }
  return names;
}

function referencesVariable(text, names) {
  if (names.size === 0) return false;
  for (const match of text.matchAll(/\$\{?([A-Za-z_][\w:]*)\}?/gu)) {
    if (names.has(match[1].toLowerCase())) return true;
  }
  return false;
}

const GIT_EXEC_ENV =
  /(?:^|[\s;&|({])(?:\$env:|export\s+|set\s+)?(GIT_(?:PAGER|EDITOR|SEQUENCE_EDITOR|SSH|SSH_COMMAND|EXTERNAL_DIFF|ASKPASS|EXEC_PATH|PROXY_COMMAND|CONFIG_PARAMETERS|CONFIG_VALUE_\d+)|PAGER|EDITOR|VISUAL|SSH_ASKPASS|LESSOPEN)\s*=\s*("[^"]*"|'[^']*'|[^\s;&|]*)/giu;
const GIT_EXEC_ENV_WRITER =
  /(?:\b(?:Set-Item|New-Item|si|ni)\b[^;|]*\benv:|SetEnvironmentVariable\s*\(\s*["'])(?:GIT_\w+|PAGER|EDITOR|VISUAL)\b/iu;

/** Environment that makes git itself run a command (`GIT_PAGER`, `GIT_SSH_COMMAND`, …). */
function injectsGitExecutableEnvironment(command) {
  for (const match of command.matchAll(GIT_EXEC_ENV)) {
    if (valueRunsGit(match[2])) return true;
  }
  return GIT_EXEC_ENV_WRITER.test(command);
}

const EXEC_CONFIG_KEY =
  /^(?:core\.(?:pager|sshcommand|editor|fsmonitor|hookspath|askpass|gitproxy)|sequence\.editor|diff\.external|pager\..+|credential\..*helper|.+\.(?:command|cmd|textconv|helper|process|clean|smudge|path))$/iu;
const EXEC_OPTION = /^--(?:upload-pack|receive-pack|exec)(?:=([\s\S]*))?$/iu;

/** `--upload-pack=$c`, `-c core.pager="git push …"`: git options whose value git executes. */
function gitOptionRunsCode(words, gitIndex, subcommandIndex) {
  for (let index = gitIndex + 1; index < words.length; index += 1) {
    const word = words[index];
    const option = EXEC_OPTION.exec(word.text);
    if (option) {
      if (option[1] !== undefined) {
        if (valueRunsGit(option[1], word.dynamic)) return true;
      } else {
        const value = words[index + 1];
        if (!value || valueRunsGit(value.text, value.dynamic)) return true;
      }
      continue;
    }
    const inHead = subcommandIndex < 0 || index < subcommandIndex;
    if (!inHead) continue;
    const inlineEnv = /^--config-env=([^=]+)=/iu.exec(word.text);
    if (inlineEnv && EXEC_CONFIG_KEY.test(inlineEnv[1])) return true;
    if (word.text !== "-c" && word.text !== "--config-env") continue;
    const setting = words[index + 1];
    if (!setting) continue;
    const separator = setting.text.indexOf("=");
    const key = separator < 0 ? setting.text : setting.text.slice(0, separator);
    if (!EXEC_CONFIG_KEY.test(key)) continue;
    // `--config-env` reads the value from an environment variable this hook cannot see.
    if (word.text === "--config-env") return true;
    if (valueRunsGit(separator < 0 ? "" : setting.text.slice(separator + 1), setting.dynamic)) {
      return true;
    }
  }
  return false;
}

/** An expanded executable (`$git`, `& $exe`, `$(printf g)it`) that may run a protected git write. */
function dynamicExecutableMayWrite(words, aliases, gitStrings) {
  const tokens = words.map((word) => word.text);
  const executableIndex = firstExecutableIndex(tokens);
  if (executableIndex < 0 || !words[executableIndex].dynamic) return false;
  if (/git/iu.test(tokens[executableIndex])) return true;
  if (referencesVariable(tokens[executableIndex], gitStrings)) return true;
  const args = tokens.slice(executableIndex + 1);
  return (
    namesProtectedWrite(args) ||
    (args.length > 0 && aliasMayWrite(aliases, args[0].toLowerCase())) ||
    hasInlineAliasOption(tokens, -1)
  );
}

function ambiguousSegment(segment, aliases, injectsAliasEnvironment, gitStrings) {
  const words = commandWords(segment);
  const tokens = words.map((word) => word.text);
  let gitIndex = invokesGit(tokens);
  // A literal `git` after an unknown runner (`xargs git`, `Start-Process git`)
  // still executes git. A quoted `git` there is an argument (`rg "git" docs`).
  if (gitIndex < 0)
    gitIndex = words.findIndex((word) => !word.quoted && GIT_EXECUTABLE.test(word.text));
  if (gitIndex < 0) return dynamicExecutableMayWrite(words, aliases, gitStrings);

  if (hasInlineAliasOption(tokens, gitIndex)) return true;
  if (/(?:^|\s)-c\s+['"]?alias\.[^\s=]+=/iu.test(segment)) return true;
  if (injectsAliasEnvironment) return true;

  // Everything from `git` through the subcommand must be literal: an expansion
  // in a global option (`git -C $dir …`) or the subcommand slot (`git $c`) can
  // turn a read into any write.
  const subcommandIndex = gitSubcommandIndex(tokens, gitIndex);
  const headEnd = subcommandIndex < 0 ? words.length : subcommandIndex + 1;
  if (words.slice(gitIndex, headEnd).some((word) => word.dynamic)) return true;
  if (gitOptionRunsCode(words, gitIndex, subcommandIndex)) return true;
  if (subcommandIndex < 0) return false;

  const subcommand = tokens[subcommandIndex].toLowerCase();
  if (READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) return false;
  if (aliases === null || aliasMayWrite(aliases, subcommand)) return true;
  const args = words.slice(subcommandIndex + 1);
  return args.some((word) => word.dynamic) && expandedArgsMayWrite(subcommand, args);
}

/**
 * True when expansion or a Git alias could turn this command into a protected
 * write the guards cannot see statically. `aliases === null` means alias
 * inspection failed; only literal read-only git passes then.
 *
 * @param {string} command
 * @param {GitAliases} [aliases]
 */
export function isAmbiguousGitCommand(command, aliases = new Set()) {
  if (typeof command !== "string") return true;
  const segments = expandSegments(command);
  // Git's environment config protocol can define an alias in an earlier shell
  // segment (`export ...; git alias`). The hook process has not executed those
  // assignments yet, so `git config --get-regexp` cannot see them.
  const injectsAliasEnvironment =
    /\$env:GIT_CONFIG_KEY_\d+\s*=\s*['"]?alias\./iu.test(command) ||
    segments.some((segment) => hasAliasEnvironmentAssignment(shellTokens(segment)));
  // Code built at run time or handed to git through its environment cannot be
  // inspected. Fail closed whenever the line names git anywhere — including a
  // quoted `$cmd = "git push …"` that a later `iex $cmd` runs.
  if (/git/iu.test(command.replace(/["'`\\]/gu, ""))) {
    if (segments.some(runsDynamicCode) || injectsGitExecutableEnvironment(command)) return true;
  }
  const gitStrings = stringVariablesNamingGit(command);
  return segments.some((segment) =>
    ambiguousSegment(segment, aliases, injectsAliasEnvironment, gitStrings),
  );
}

/** @typedef {Map<string, string> | Set<string> | null} GitAliases */

/**
 * Read configured aliases (name → expansion) once per hook invocation. null = inspection failed.
 *
 * @returns {Map<string, string> | null}
 */
export function readGitAliases() {
  const result = spawnSync("git", ["config", "--get-regexp", "^alias\\."], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 2000,
    windowsHide: true,
  });
  // Git exits 1 when no matching aliases exist; that is a verified empty set.
  if (result.status === 1 && !result.stdout.trim()) return new Map();
  if (result.status !== 0) return null;
  const aliases = new Map();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = /^alias\.(\S+)\s+(.*)$/iu.exec(line.trim());
    if (match) aliases.set(match[1].toLowerCase(), match[2]);
  }
  return aliases;
}

/**
 * True when the alias table can still change this command's verdict.
 *
 * A Git alias is only reachable through a literal `git` executable or a shell
 * expansion that assembles one. A command with neither resolves identically
 * against any alias set, so reading the table would spend a `git config`
 * subprocess on a verdict that cannot move. That cost is paid on EVERY tool
 * call, and a hook that misses its deadline reads as a crashed hook and fails
 * closed.
 */
export function mayResolveToGit(command) {
  if (typeof command !== "string") return true;
  if (SHELL_EXPANSION.test(command)) return true;
  return /git/iu.test(command.replace(/["'\\]/gu, ""));
}

/**
 * Read aliases only when they can matter. `new Set()` is not a weaker default
 * here: for commands `mayResolveToGit` rejects, `isAmbiguousGitCommand` returns
 * false for every alias set.
 *
 * @param {string} command
 * @param {() => GitAliases} [read]
 * @returns {GitAliases}
 */
export function resolveAliasesFor(command, read = readGitAliases) {
  return mayResolveToGit(command) ? read() : new Set();
}
