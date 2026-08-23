import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const FILE_BUDGETS = Object.freeze({
  "AGENTS.md": 2_200,
  ".cursor/README.md": 3_500,
  "docs/architecture/glossary.md": 22_000,
  ".cursor/rules/pr-merge.mdc": 5_000,
  ".agents/skills/sajtmaskin-context/SKILL.md": 1_800,
  ".cursor/commands/818.md": 800,
  ".cursor/commands/automat.md": 800,
  ".cursor/commands/kedja.md": 800,
  ".cursor/commands/logg.md": 800,
  ".cursor/commands/logg-internet.md": 800,
});

export const ALWAYS_RULE_LIMIT = 4;
export const ALWAYS_RULE_BYTES_LIMIT = 6_000;

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
  const alwaysRules = rules.filter((path) => /^alwaysApply:\s*true\s*$/m.test(read(root, path)));
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
