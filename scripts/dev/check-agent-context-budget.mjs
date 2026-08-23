import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const FILE_BUDGETS = Object.freeze({
  "AGENTS.md": 2_200,
  ".cursor/README.md": 4_500,
  "docs/architecture/glossary.md": 22_000,
  ".cursor/rules/pr-merge.mdc": 5_000,
  ".cursor/commands/818.md": 800,
  ".cursor/commands/automat.md": 800,
  ".cursor/commands/kedja.md": 800,
  ".cursor/commands/logg.md": 800,
  ".cursor/commands/logg-internet.md": 800,
  ".cursor/commands/explore.md": 1_000,
  ".cursor/commands/pr-herde.md": 2_000,
  ".cursor/commands/post-review.md": 1_800,
  ".cursor/commands/avslutning.md": 1_500,
  ".cursor/rules/response-format.mdc": 800,
});

export const ALWAYS_RULE_LIMIT = 4;
export const ALWAYS_RULE_BYTES_LIMIT = 6_000;
const GODNATT_PROFILES = Object.freeze({
  ".codex/agents/godnatt-investigator.toml": "xhigh",
  ".codex/agents/godnatt-worker.toml": "high",
  ".codex/agents/godnatt-reviewer.toml": "xhigh",
});

function read(root, path) {
  return readFileSync(resolve(root, path), "utf8");
}

function byteLength(root, path) {
  return Buffer.byteLength(read(root, path));
}

function filesBelow(root, relativeDir, suffix) {
  const absolute = resolve(root, relativeDir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) return filesBelow(root, relative, suffix);
      return entry.isFile() && relative.endsWith(suffix) ? [relative] : [];
    })
    .sort();
}

function skillIds(root, relativeDir) {
  return filesBelow(root, relativeDir, "/SKILL.md").map((path) =>
    path.slice(relativeDir.length + 1, -"/SKILL.md".length),
  );
}

export function evaluateAgentContext(root = REPO_ROOT) {
  const errors = [];
  const files = {};

  for (const [path, limit] of Object.entries(FILE_BUDGETS)) {
    if (!existsSync(resolve(root, path))) {
      errors.push(`missing context-budget file: ${path}`);
      continue;
    }
    const bytes = byteLength(root, path);
    files[path] = { bytes, limit, approximateTokens: Math.ceil(bytes / 4) };
    if (bytes > limit) errors.push(`${path} is ${bytes} bytes; budget is ${limit}`);
  }

  const rules = filesBelow(root, ".cursor/rules", ".mdc");
  const alwaysRules = rules.filter((path) =>
    /^alwaysApply:\s*true(?:\s+#.*)?\s*$/im.test(read(root, path)),
  );
  const alwaysBytes = alwaysRules.reduce((sum, path) => sum + byteLength(root, path), 0);
  if (alwaysRules.length > ALWAYS_RULE_LIMIT) {
    errors.push(`alwaysApply rules: ${alwaysRules.length}; limit is ${ALWAYS_RULE_LIMIT}`);
  }
  if (alwaysBytes > ALWAYS_RULE_BYTES_LIMIT) {
    errors.push(`alwaysApply rule bytes: ${alwaysBytes}; limit is ${ALWAYS_RULE_BYTES_LIMIT}`);
  }

  const canonicalSkills = skillIds(root, ".agents/skills");
  const cursorSkills = skillIds(root, ".cursor/skills");
  const duplicates = cursorSkills.filter((id) => canonicalSkills.includes(id));
  if (duplicates.length > 0) errors.push(`duplicate skill ids: ${duplicates.join(", ")}`);
  if (cursorSkills.length > 0) {
    errors.push(`skills must be canonical under .agents/skills; found: ${cursorSkills.join(", ")}`);
  }

  const indexingIgnore = read(root, ".cursorindexingignore")
    .split(/\r?\n/)
    .map((line) => line.trim());
  if (!indexingIgnore.includes("BUG-SWARM-BACKLOG.md")) {
    errors.push("BUG-SWARM-BACKLOG.md must stay in .cursorindexingignore");
  }

  const agents = read(root, "AGENTS.md");
  if (/Läs i denna ordning innan du börjar/i.test(agents)) {
    errors.push("AGENTS.md must not restore a mandatory pre-read stack");
  }
  if (/\b(?:PowerShell|pwsh)\b/i.test(agents)) {
    errors.push("AGENTS.md must not inject shell-specific reminders into every task");
  }

  const codexConfig = read(root, ".codex/config.toml");
  if (!/^model\s*=\s*"gpt-5\.6-sol"\s*$/m.test(codexConfig)) {
    errors.push(".codex/config.toml must keep gpt-5.6-sol as the project default");
  }
  if (!/^default_subagent_model\s*=\s*"gpt-5\.6-sol"\s*$/m.test(codexConfig)) {
    errors.push(".codex/config.toml must keep gpt-5.6-sol as the subagent default");
  }
  for (const [path, effort] of Object.entries(GODNATT_PROFILES)) {
    const profile = read(root, path);
    if (
      !/^model\s*=\s*"gpt-5\.6-sol"\s*$/m.test(profile) ||
      !new RegExp(`^model_reasoning_effort\\s*=\\s*"${effort}"\\s*$`, "m").test(profile)
    ) {
      errors.push(`${path} must stay on gpt-5.6-sol with ${effort} reasoning`);
    }
  }

  for (const path of filesBelow(root, ".cursor/commands", ".md")) {
    const command = read(root, path);
    const restoresBroadReadBundle = [
      "docs/README.md",
      "docs/architecture/code-map.md",
      "docs/architecture/glossary.md",
    ].every((needle) => command.includes(needle));
    if (restoresBroadReadBundle) {
      errors.push(`${path} must not restore the old broad pre-read bundle`);
    }
  }

  return {
    errors,
    metrics: {
      files,
      alwaysRules,
      alwaysRuleBytes: alwaysBytes,
      alwaysRuleApproximateTokens: Math.ceil(alwaysBytes / 4),
      canonicalSkillCount: canonicalSkills.length,
      cursorSkillCount: cursorSkills.length,
    },
  };
}

function main() {
  const { errors, metrics } = evaluateAgentContext();
  for (const [path, metric] of Object.entries(metrics.files)) {
    console.log(
      `[agent-context] ${path}: ${metric.bytes}/${metric.limit} bytes (~${metric.approximateTokens} tokens)`,
    );
  }
  console.log(
    `[agent-context] alwaysApply: ${metrics.alwaysRules.length} rules, ${metrics.alwaysRuleBytes} bytes (~${metrics.alwaysRuleApproximateTokens} tokens)`,
  );
  console.log(
    `[agent-context] skills: ${metrics.canonicalSkillCount} canonical, ${metrics.cursorSkillCount} under .cursor`,
  );

  if (errors.length === 0) {
    console.log("[agent-context] Context budgets are within limits.");
    return;
  }
  for (const error of errors) console.error(`[agent-context] ${error}`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
