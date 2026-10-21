#!/usr/bin/env node
/**
 * Speglar Cursor-konfigurationen till Claude Code. Cursor-filerna är källan;
 * allt som skrivs här är projektion och redigeras aldrig för hand.
 *
 *   .cursor/rules/*.mdc               → .claude/rules/*.md (+ index för beskrivningsregler)
 *   .cursorignore                     → .claude/settings.json permissions.deny (Read)
 *   .cursor/permissions.json          → .claude/settings.json permissions.allow
 *   .cursor/mcp.json.example          → .mcp.json
 *
 * Hela .claude/settings.json ägs av det här skriptet. `permissions.ask`, `env`
 * och `hooks` är konstanter nedan, så att en borttagen grind syns som drift.
 *
 *   npm run claude:sync            skriv projektionen
 *   npm run claude:sync -- --check  rapportera drift (check:agent-context gör samma)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CLAUDE_RULES_DIR = ".claude/rules";
export const CLAUDE_SETTINGS = ".claude/settings.json";
export const CLAUDE_MCP = ".mcp.json";
const RULE_INDEX = `${CLAUDE_RULES_DIR}/cursor-regelindex.md`;
const GENERATED_MARK = "<!-- Genererad av npm run claude:sync";

/**
 * Cursor-regler som inte speglas. Ersättningen står i CLAUDE.md, testad mot
 * Claude Codes verktyg 2026-10-22.
 */
export const EXCLUDED_RULES = Object.freeze({
  "bash-och-pwsh.mdc":
    "Claudes PowerShell-verktyg är pwsh 7 med UTF-8 och Bash-verktyget är Git Bash; de punkter som fortfarande gäller står i CLAUDE.md § Skal.",
});

/** MCP-servrar i Cursor-mallen som Claude inte får (legacy eller kräver nyckel). */
export const EXCLUDED_MCP_SERVERS = Object.freeze({
  v0: "legacy v0-chat-API; riktiga anrop kräver nyckel",
});

const bothShells = (pattern) => [`Bash(${pattern})`, `PowerShell(${pattern})`];

/**
 * Cursors `autoRun.block_instructions` (styrning till klassificeraren) som
 * deterministiska frågor. `*` är wildcard var som helst i mönstret.
 */
export const CLAUDE_ASK_RULES = Object.freeze([
  ...bothShells("gh pr merge*"),
  ...bothShells("gh pr create*"),
  // gh api med annan metod än GET; fältflaggor gör anropet till POST.
  ...bothShells("gh api*-X*"),
  ...bothShells("gh api*--method*"),
  ...bothShells("gh api* -f *"),
  ...bothShells("gh api* -F *"),
  ...bothShells("gh api*--field*"),
  ...bothShells("gh api*--raw-field*"),
  ...bothShells("gh api*--input*"),
  ...bothShells("npm run promote*"),
  ...bothShells("npm run db:*"),
  ...bothShells("npm run clean:*:apply*"),
  ...bothShells("npm run tidy*--apply*"),
  ...bothShells("npm run worktree:remove*"),
  "Bash(rm -r*)",
  "Bash(rm -R*)",
  "Bash(rm -fr*)",
  "Bash(rm -fR*)",
  "Bash(rm --recursive*)",
  // PowerShell-regler kanoniserar alias (rm, del, ri, rd) till Remove-Item.
  "PowerShell(Remove-Item*-r*)",
  "Edit(/.cursor/mcp.json)",
  "Edit(/.mcp.json)",
  "Edit(~/.cursor/**)",
  "Edit(~/.codex/**)",
  "Edit(~/.claude/**)",
]);

export const CLAUDE_ENV = Object.freeze({ CLAUDE_CODE_USE_POWERSHELL_TOOL: "1" });

const hookCommand = (script, timeout) => ({
  type: "command",
  command: "node",
  args: [`\${CLAUDE_PROJECT_DIR}/.claude/hooks/${script}`],
  timeout,
});

/** Motsvarar .cursor/hooks.json; beslutslogiken ägs av Cursor-grindarna. */
export const CLAUDE_HOOKS = Object.freeze({
  PreToolUse: [
    { matcher: "Bash|PowerShell", hooks: [hookCommand("shell-guard.mjs", 120)] },
    { matcher: "Read", hooks: [hookCommand("read-guard.mjs", 10)] },
  ],
});

// ---------- regler ----------

export function parseMdc(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(text);
  if (!match) return { description: "", globs: [], alwaysApply: false, body: text };
  const [, head, body] = match;
  const meta = { description: "", globs: [], alwaysApply: false };
  let inGlobs = false;
  for (const line of head.split(/\r?\n/u)) {
    const item = /^\s+-\s+(.+?)\s*$/u.exec(line);
    if (inGlobs && item) {
      meta.globs.push(unquote(item[1]));
      continue;
    }
    inGlobs = false;
    const pair = /^([A-Za-z]+):\s*(.*?)\s*$/u.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    if (key === "description") meta.description = unquote(value);
    if (key === "alwaysApply") meta.alwaysApply = value === "true";
    if (key === "globs") {
      if (value)
        meta.globs.push(
          ...value
            .split(",")
            .map((g) => unquote(g.trim()))
            .filter(Boolean),
        );
      else inGlobs = true;
    }
  }
  return { ...meta, body: body.replace(/^\s+/u, "") };
}

function unquote(value) {
  return value.replace(/^(['"])(.*)\1$/u, "$2");
}

/**
 * Claude läser `paths` som glob där `[` startar en teckenklass. Next-segment som
 * `[chatId]` blir därför `*` — samma träffyta i den här kodbasen.
 */
export function toClaudePath(glob) {
  return glob.replace(/\[[^\]/]+\]/gu, "*");
}

function ruleHeader(source) {
  return `${GENERATED_MARK} från ${source} — redigera källan, inte den här filen. -->`;
}

function projectRule(file, rule) {
  const source = `.cursor/rules/${file}`;
  const lines = [];
  if (rule.globs.length > 0) {
    lines.push("---", "paths:");
    for (const glob of rule.globs) lines.push(`  - "${toClaudePath(glob)}"`);
    lines.push("---", "");
  }
  lines.push(ruleHeader(source), "", rule.body.trimEnd(), "");
  return lines.join("\n");
}

function projectIndex(entries) {
  const lines = [
    ruleHeader(".cursor/rules/*.mdc (beskrivningsregler)"),
    "",
    "# Cursor-regler att läsa vid behov",
    "",
    "Cursor visar de här reglernas beskrivning och agenten läser regeln när den",
    "passar uppgiften. Gör likadant: läs filen när beskrivningen träffar.",
    "",
    "| Regel | Läs när |",
    "|---|---|",
  ];
  for (const { file, description } of entries) {
    lines.push(`| \`.cursor/rules/${file}\` | ${description.replace(/\|/gu, "\\|")} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildRuleFiles(root = REPO_ROOT) {
  const dir = resolve(root, ".cursor/rules");
  const files = new Map();
  const indexEntries = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".mdc"))
    .sort()) {
    if (EXCLUDED_RULES[file]) continue;
    const rule = parseMdc(readFileSync(resolve(dir, file), "utf8"));
    if (rule.alwaysApply || rule.globs.length > 0) {
      files.set(`${CLAUDE_RULES_DIR}/${file.replace(/\.mdc$/u, ".md")}`, projectRule(file, rule));
    } else {
      indexEntries.push({ file, description: rule.description || "(saknar beskrivning)" });
    }
  }
  if (indexEntries.length > 0) files.set(RULE_INDEX, projectIndex(indexEntries));
  return files;
}

// ---------- läsblockering ----------

function ignoreLines(text) {
  return String(text)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
}

/**
 * gitignore-mönster → Claude `Read(...)`. Mönster utan inre `/` gäller på alla
 * djup (`**\/`), mönster med inre `/` är förankrade i repo-roten (`/` i
 * projektinställningar). Kataloger (`x/`) blockerar allt under sig.
 */
export function toClaudeReadRule(pattern) {
  let p = pattern;
  const isDir = p.endsWith("/");
  if (isDir) p = p.slice(0, -1);
  let path;
  if (p.startsWith("**/")) path = p;
  else if (p.startsWith("/")) path = p;
  else if (p.includes("/")) path = `/${p}`;
  else path = `**/${p}`;
  if (isDir && !path.endsWith("/**")) path = `${path}/**`;
  return `Read(${path})`;
}

export function buildDenyRules(root = REPO_ROOT) {
  const rules = ignoreLines(readFileSync(resolve(root, ".cursorignore"), "utf8")).flatMap(
    (pattern) => {
      const rule = toClaudeReadRule(pattern);
      // gitignore träffar både fil och katalog med samma namn; `.env` kan vara
      // en katalog (`.env/production.env`). Varje filmönster får därför även `/**`.
      return rule.endsWith("/**)") ? [rule] : [rule, rule.replace(/\)$/u, "/**)")];
    },
  );
  // Claudes egna worktree-katalog; samma fälla som .cursor/worktrees/.
  rules.push("Read(/.claude/worktrees/**)");
  return [...new Set(rules)];
}

// ---------- allowlist ----------

/** Cursors permissions.json är JSONC; kommentarerna står på egna rader. */
export function parseJsonc(text) {
  const stripped = String(text)
    .split(/\r?\n/u)
    .filter((line) => !/^\s*\/\//u.test(line))
    .join("\n")
    .replace(/,(\s*[}\]])/gu, "$1");
  return JSON.parse(stripped);
}

const POWERSHELL_CMDLET_RE = /^[A-Z][a-z]+-[A-Z]/u;

/** Cursor matchar prefix rakt av; `*` direkt efter prefixet ger samma semantik. */
export function buildAllowRules(root = REPO_ROOT) {
  const permissions = parseJsonc(readFileSync(resolve(root, ".cursor/permissions.json"), "utf8"));
  const rules = [];
  for (const prefix of permissions.terminalAllowlist ?? []) {
    // Cmdlets (Verb-Noun) finns bara i PowerShell-verktyget.
    if (!POWERSHELL_CMDLET_RE.test(prefix)) rules.push(`Bash(${prefix}*)`);
    rules.push(`PowerShell(${prefix}*)`);
  }
  for (const entry of permissions.mcpAllowlist ?? []) {
    const [server, tool] = entry.split(":");
    if (EXCLUDED_MCP_SERVERS[server]) continue;
    rules.push(tool === "*" ? `mcp__${server}` : `mcp__${server}__${tool}`);
  }
  return [...new Set(rules)];
}

// ---------- MCP ----------

export function buildMcpConfig(root = REPO_ROOT) {
  const template = JSON.parse(readFileSync(resolve(root, ".cursor/mcp.json.example"), "utf8"));
  const servers = {};
  for (const [name, server] of Object.entries(template.mcpServers ?? {})) {
    if (EXCLUDED_MCP_SERVERS[name]) continue;
    if (server.url) {
      servers[name] = { type: "http", url: server.url };
    } else if (server.command) {
      servers[name] = {
        command: server.command,
        args: (server.args ?? []).map((arg) =>
          arg.replaceAll("${workspaceFolder}", "${CLAUDE_PROJECT_DIR:-.}"),
        ),
      };
    }
  }
  return `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
}

// ---------- settings ----------

/** Byggs helt från källor och konstanter — aldrig från filen som kontrolleras. */
export function buildSettings(root = REPO_ROOT) {
  const settings = {
    permissions: {
      allow: buildAllowRules(root),
      ask: [...CLAUDE_ASK_RULES],
      deny: buildDenyRules(root),
    },
    env: { ...CLAUDE_ENV },
    hooks: CLAUDE_HOOKS,
  };
  return `${JSON.stringify(settings, null, 2)}\n`;
}

// ---------- drift / skriv ----------

export function buildClaudeProjection(root = REPO_ROOT) {
  const files = buildRuleFiles(root);
  files.set(CLAUDE_SETTINGS, buildSettings(root));
  files.set(CLAUDE_MCP, buildMcpConfig(root));
  return files;
}

function generatedRuleFiles(root) {
  const dir = resolve(root, CLAUDE_RULES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `${CLAUDE_RULES_DIR}/${f}`)
    .filter((p) => readFileSync(resolve(root, p), "utf8").includes(GENERATED_MARK));
}

/** JSON jämförs på innehåll så att prettier-formatering inte räknas som drift. */
function sameContent(path, actual, expected) {
  if (path.endsWith(".json")) {
    try {
      return isDeepStrictEqual(JSON.parse(actual), JSON.parse(expected));
    } catch {
      return false;
    }
  }
  return actual.replace(/\r\n/gu, "\n") === expected;
}

export function claudeProjectionDrift(root = REPO_ROOT) {
  const expected = buildClaudeProjection(root);
  const drift = [];
  for (const [path, body] of expected) {
    const target = resolve(root, path);
    if (!existsSync(target)) drift.push(`saknas: ${path}`);
    else if (!sameContent(path, readFileSync(target, "utf8"), body)) {
      drift.push(`inaktuell: ${path}`);
    }
  }
  for (const path of generatedRuleFiles(root)) {
    if (!expected.has(path)) drift.push(`föräldralös: ${path}`);
  }
  return drift;
}

export function writeClaudeProjection(root = REPO_ROOT) {
  const expected = buildClaudeProjection(root);
  for (const path of generatedRuleFiles(root)) {
    if (!expected.has(path)) rmSync(resolve(root, path));
  }
  const written = [];
  for (const [path, body] of expected) {
    const target = resolve(root, path);
    if (existsSync(target) && sameContent(path, readFileSync(target, "utf8"), body)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    written.push(path);
  }
  return written;
}

function main() {
  if (process.argv.includes("--check")) {
    const drift = claudeProjectionDrift();
    if (drift.length === 0) {
      console.log("[claude:sync] Claude-projektionen är i synk.");
      return;
    }
    for (const line of drift) console.error(`[claude:sync] ${line}`);
    console.error("[claude:sync] Kör npm run claude:sync.");
    process.exitCode = 1;
    return;
  }
  const written = writeClaudeProjection();
  for (const path of written) console.log(`[claude:sync] skrev ${path}`);
  if (written.length === 0) console.log("[claude:sync] Inget att uppdatera.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
