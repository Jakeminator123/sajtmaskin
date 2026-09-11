#!/usr/bin/env node
/**
 * Machine-local drift check. Read-only.
 *
 * Why this exists: CI verifies the repo, and `check:agent-context` verifies the
 * committed context budget. Neither can see the things that actually drifted
 * after a Cursor reinstall on 2026-09-11 — the RTK hook, the live MCP file, a
 * duplicated skill root — because none of them live in git. Those were found by
 * a manual audit, which is exactly the kind of work that does not get repeated
 * on schedule. This turns that audit into a command.
 *
 * Design rules that keep it useful:
 *   - Never fails. It reports drift; it does not gate. A local-only red that CI
 *     cannot reproduce teaches you to ignore the check.
 *   - Silent on success with `--quiet`, so `predev` can run it every dev start
 *     and only speak up when something actually moved.
 *   - Never prints a secret. The live `.cursor/mcp.json` can hold auth headers,
 *     so only server KEY NAMES are ever read out of it.
 *
 * Usage:
 *   npm run doctor          # full report
 *   npm run doctor -- --quiet   # only print findings
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOME = homedir();

/**
 * @typedef {"ok" | "info" | "note" | "warn"} Level
 *   `warn`/`note` = something drifted and is worth acting on; surfaced by
 *   `--quiet`. `info` = a standing fact shown only in the full report. `ok` =
 *   verified fine.
 * @typedef {{ level: Level, area: string, message: string, fix?: string }} Finding
 */
const QUIET_LEVELS = new Set(["warn", "note"]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function dirNames(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Node must match the pin every other tool reads. */
export function checkNode(pinned, running) {
  if (!pinned) return { level: "note", area: "node", message: ".node-version saknas" };
  const actual = String(running).replace(/^v/, "");
  return actual === pinned
    ? { level: "ok", area: "node", message: `Node ${actual} matchar pinnen` }
    : {
        level: "warn",
        area: "node",
        message: `Node ${actual} men repot pinnar ${pinned}`,
        fix: "volta install node@" + pinned,
      };
}

/**
 * RTK only compresses terminal output when the GLOBAL Cursor hook file exists.
 * A Cursor reinstall removes it while the binary and its config survive, so the
 * absence looks like nothing at all. Only relevant if RTK is actually installed.
 */
export function checkRtk({ binaryPresent, hooks }) {
  if (!binaryPresent) {
    return { level: "ok", area: "rtk", message: "RTK inte installerad — inget att koppla in" };
  }
  const wired = JSON.stringify(hooks ?? {}).includes("rtk hook cursor");
  return wired
    ? { level: "ok", area: "rtk", message: "RTK wrappar Shell via global hook" }
    : {
        level: "warn",
        area: "rtk",
        message: "RTK finns men Cursor-hooken saknas — terminaloutput komprimeras inte",
        fix: "rtk init -g --agent cursor  (och starta om Cursor)",
      };
}

/**
 * `.cursor/mcp.json` stopped being `.cursorignore`d on 2026-09-11 so an agent
 * can actually see the tool state it is asked about. The blanket blindfold is
 * therefore replaced by a targeted check: warn if the file ever gains a field
 * shaped like a credential. `.gitignore` still keeps it out of the public repo.
 *
 * Matches on KEYS and on obvious token shapes in values — never prints a value.
 */
// Heuristic, not a vault. Key names: anything that *ends in* key (openai_key,
// private_key, apiKey) or names a credential outright. Value shapes: the
// common vendor prefixes plus JWT and a bare `Bearer <token>`.
const SECRET_KEY_RE =
  /(header|authorization|token|secret|password|bearer|credential|(?:^|[_-])key$|[a-z]key$)/iu;
const SECRET_VALUE_RE =
  /(?:\b(?:sk-|xai-|ghp_|gho_|github_pat_|xox[baprs]-|AIza|AKIA|sbp_|npm_|eyJ[A-Za-z0-9_-]{10,})|\bBearer\s+\S{8,})/u;

export function checkMcpSecrets(rawServers) {
  if (!rawServers) return { level: "ok", area: "mcp-secrets", message: "Ingen live-fil att granska" };
  const flagged = [];
  const walk = (node, serverName) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (SECRET_KEY_RE.test(key)) flagged.push(`${serverName}.${key}`);
      else if (typeof value === "string" && SECRET_VALUE_RE.test(value)) {
        flagged.push(`${serverName}.${key}`);
      } else if (typeof value === "object") walk(value, serverName);
    }
  };
  for (const [name, server] of Object.entries(rawServers)) walk(server, name);

  return flagged.length === 0
    ? { level: "ok", area: "mcp-secrets", message: "mcp.json innehåller inga secret-formade fält" }
    : {
        level: "warn",
        area: "mcp-secrets",
        message: `mcp.json har secret-formade fält: ${flagged.join(", ")}`,
        fix: "Flytta auth till OAuth via Settings → Tools & MCP. Filen är gitignorerad men läsbar för agenten.",
      };
}

/** The live MCP file drifts silently behind the tracked template. */
export function checkMcp({ live, template }) {
  if (!live) {
    return {
      level: "warn",
      area: "mcp",
      message: ".cursor/mcp.json saknas — Cursor får inga projektservrar",
      fix: "npm run worktree:setup, eller kopiera .cursor/mcp.json.example",
    };
  }
  const missing = template.filter((name) => !live.includes(name));
  const extra = live.filter((name) => !template.includes(name));
  if (missing.length === 0 && extra.length === 0) {
    return { level: "ok", area: "mcp", message: `${live.length} servrar i synk med mallen` };
  }
  const parts = [];
  if (missing.length > 0) parts.push(`saknas lokalt: ${missing.join(", ")}`);
  if (extra.length > 0) parts.push(`bara lokalt: ${extra.join(", ")}`);
  return {
    level: "note",
    area: "mcp",
    message: `mcp.json avviker från mallen (${parts.join(" · ")})`,
    fix: "Avsiktligt? Uppdatera .cursor/mcp.json.example i samma ändring.",
  };
}

/**
 * Every skill description ships in the prompt. Two roots holding the same skill
 * names pay for it twice, and the repo's own command mirrors pay for commands
 * that are already loaded from `.cursor/commands`.
 */
export function checkSkillDuplication({ cursorSkills, agentSkills, commandMirrors }) {
  const findings = [];
  const overlap = agentSkills.filter((name) => cursorSkills.includes(name));
  if (overlap.length > 0) {
    findings.push({
      level: "warn",
      area: "skills",
      message: `${overlap.length} skills finns i både ~/.cursor/skills-cursor och ~/.agents/skills — beskrivningarna laddas två gånger`,
      fix: "Flytta undan ~/.agents om du inte kör Codex CLI lokalt",
    });
  }
  if (commandMirrors.length > 0) {
    findings.push({
      level: "warn",
      area: "skills",
      message: `${commandMirrors.length} source-command-speglingar dubblerar .cursor/commands`,
      fix: "Remove-Item -Recurse -Force .agents/skills/source-command-*",
    });
  }
  if (findings.length === 0) {
    findings.push({ level: "ok", area: "skills", message: "Inga dubblerade skill-rötter" });
  }
  return findings;
}

/**
 * Plugin skill catalogues are a fixed per-session cost.
 *
 * Reported as `info`, which `--quiet` drops: the cost is a standing fact, not
 * drift. Repeating it at every dev start would be the kind of noise that gets
 * filtered out mentally, taking the real findings with it.
 */
export function checkPluginCost(plugins) {
  const heavy = plugins.filter((plugin) => plugin.approximateTokens >= 1_000);
  if (heavy.length === 0) {
    return { level: "ok", area: "plugins", message: "Inga tunga plugin-kataloger" };
  }
  const summary = heavy
    .map((plugin) => `${plugin.name} ~${plugin.approximateTokens} tokens/${plugin.skills} skills`)
    .join(" · ");
  return {
    level: "info",
    area: "plugins",
    message: `Fast kontextkostnad per session: ${summary}`,
    fix: "Stäng av det du sällan använder i .cursor/settings.json → plugins",
  };
}

/**
 * The plugin cache on disk outlives a disable: `.cursor/settings.json` turned
 * `vercel` off on 2026-09-11 and the 51 skills stayed cached. Reporting their
 * cost as live would claim a session tax that is no longer paid, so disabled
 * plugins are dropped here. Only an explicit `enabled: false` counts as off.
 */
function disabledPlugins() {
  const settings = readJson(join(REPO_ROOT, ".cursor", "settings.json"));
  return new Set(
    Object.entries(settings?.plugins ?? {})
      .filter(([, config]) => config?.enabled === false)
      .map(([name]) => name),
  );
}

function collectPlugins() {
  const cacheRoot = join(HOME, ".cursor", "plugins", "cache", "cursor-public");
  const disabled = disabledPlugins();
  return dirNames(cacheRoot)
    .filter((name) => !disabled.has(name))
    .map((name) => {
      const skillFiles = [];
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const abs = join(dir, entry.name);
          if (entry.isDirectory()) walk(abs);
          else if (entry.name === "SKILL.md") skillFiles.push(abs);
        }
      };
      try {
        walk(join(cacheRoot, name));
      } catch {
        return null;
      }
      // The prompt carries each description plus its path, not the whole file.
      // One unreadable SKILL.md must not take the whole report down: skip it.
      let bytes = 0;
      for (const file of skillFiles) {
        let raw;
        try {
          raw = readFileSync(file, "utf8");
        } catch {
          continue;
        }
        const frontmatter = /^---\s*([\s\S]*?)^---/m.exec(raw)?.[1] ?? "";
        const description = /^description:\s*([\s\S]*?)(?=^[a-z-]+:|$)/m.exec(frontmatter)?.[1] ?? "";
        bytes += Buffer.byteLength(description.trim()) + 90;
      }
      return { name, skills: skillFiles.length, approximateTokens: Math.ceil(bytes / 4) };
    })
    .filter(Boolean)
    .sort((a, b) => b.approximateTokens - a.approximateTokens);
}

export function collectFindings() {
  /** @type {Finding[]} */
  const findings = [];

  const pinned = existsSync(join(REPO_ROOT, ".node-version"))
    ? readFileSync(join(REPO_ROOT, ".node-version"), "utf8").trim()
    : null;
  findings.push(checkNode(pinned, process.version));

  findings.push(
    checkRtk({
      binaryPresent: existsSync(join(HOME, ".local", "bin", "rtk.exe")) || existsSync(join(HOME, ".local", "bin", "rtk")),
      hooks: readJson(join(HOME, ".cursor", "hooks.json")),
    }),
  );

  const live = readJson(join(REPO_ROOT, ".cursor", "mcp.json"));
  const template = readJson(join(REPO_ROOT, ".cursor", "mcp.json.example"));
  findings.push(
    checkMcp({
      live: live ? Object.keys(live.mcpServers ?? {}) : null,
      template: template ? Object.keys(template.mcpServers ?? {}) : [],
    }),
  );
  findings.push(checkMcpSecrets(live?.mcpServers ?? null));

  findings.push(
    ...checkSkillDuplication({
      cursorSkills: dirNames(join(HOME, ".cursor", "skills-cursor")),
      agentSkills: dirNames(join(HOME, ".agents", "skills")),
      commandMirrors: dirNames(join(REPO_ROOT, ".agents", "skills")).filter((name) =>
        name.startsWith("source-command-"),
      ),
    }),
  );

  findings.push(checkPluginCost(collectPlugins()));

  return findings;
}

function main() {
  const quiet = process.argv.includes("--quiet");
  let findings;
  try {
    findings = collectFindings();
  } catch (error) {
    // The promise this script makes is "never blocks dev". A crash here would
    // break `predev`'s `&&` chain and stop `npm run dev` over a diagnostic — the
    // exact false red the script exists to avoid. Report the crash as a finding
    // and exit 0; the review that caught this found `readFileSync` outside `try`.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[doctor] ! doctor: kunde inte köra alla kontroller (${message})`);
    return;
  }
  const actionable = findings.filter((finding) => QUIET_LEVELS.has(finding.level));

  if (quiet && actionable.length === 0) return;

  const icons = { warn: "!", note: "·", info: "i", ok: "+" };
  for (const finding of quiet ? actionable : findings) {
    console.log(`[doctor] ${icons[finding.level]} ${finding.area}: ${finding.message}`);
    if (finding.fix && finding.level !== "ok") console.log(`[doctor]     → ${finding.fix}`);
  }
  if (!quiet && actionable.length === 0) {
    console.log("[doctor] Inget lokalt driv. Kör den igen efter en Cursor-ominstallation.");
  }
}

// Exit code is always 0: this reports machine-local drift that CI cannot see,
// so failing here would be a red nobody else can reproduce. `main` catches its
// own failures for the same reason, and `doctor:soft` in package.json adds
// `|| echo` as a second belt — same pattern as `hooks:install:soft`.
if (process.argv[1] && process.argv[1].endsWith("doctor.mjs")) main();
