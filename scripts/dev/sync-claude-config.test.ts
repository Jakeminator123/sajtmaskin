// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REQUIRED_CURSOR_SECRET_IGNORES } from "./check-agent-context-budget.mjs";
import {
  buildAllowRules,
  buildDenyRules,
  buildRuleFiles,
  claudeProjectionDrift,
  EXCLUDED_RULES,
  parseJsonc,
  parseMdc,
  toClaudePath,
  toClaudeReadRule,
  writeClaudeProjection,
} from "./sync-claude-config.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const fixtures: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sajtmaskin-claude-sync-"));
  fixtures.push(root);
  for (const path of [
    ".cursor/rules",
    ".cursorignore",
    ".cursor/permissions.json",
    ".cursor/mcp.json.example",
  ]) {
    cpSync(join(repoRoot, path), join(root, path), { recursive: true });
  }
  mkdirSync(join(root, ".claude"), { recursive: true });
  cpSync(join(repoRoot, ".claude/settings.json"), join(root, ".claude/settings.json"));
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Claude-projektionen", () => {
  it("är i synk med Cursor-källorna i repot", () => {
    expect(claudeProjectionDrift(repoRoot)).toEqual([]);
  });

  it("upptäcker en ändrad Cursor-regel och en föräldralös spegling", () => {
    const root = fixture();
    writeClaudeProjection(root);
    expect(claudeProjectionDrift(root)).toEqual([]);

    const source = join(root, ".cursor/rules/evals.mdc");
    writeFileSync(source, `${readFileSync(source, "utf8")}\nNy rad.\n`);
    rmSync(join(root, ".cursor/rules/openclaw-bridge.mdc"));

    expect(claudeProjectionDrift(root)).toEqual(
      expect.arrayContaining([
        "inaktuell: .claude/rules/evals.md",
        "föräldralös: .claude/rules/openclaw-bridge.md",
      ]),
    );
  });

  it("speglar always- och glob-regler som filer och beskrivningsregler som index", () => {
    const files = buildRuleFiles(repoRoot);
    expect(files.get(".claude/rules/git.md")).not.toMatch(/^---/u);
    expect(files.get(".claude/rules/evals.md")).toMatch(
      /^---\npaths:\n {2}- "src\/lib\/gen\/eval\/\*\*"/u,
    );
    expect(files.get(".claude/rules/cursor-regelindex.md")).toContain(".cursor/rules/pr-merge.mdc");
    for (const excluded of Object.keys(EXCLUDED_RULES)) {
      const md = excluded.replace(/\.mdc$/u, ".md");
      expect(files.has(`.claude/rules/${md}`)).toBe(false);
      expect(files.get(".claude/rules/cursor-regelindex.md")).not.toContain(excluded);
    }
  });

  it("blockerar varje obligatoriskt secret-mönster från .cursorignore", () => {
    const deny = new Set(buildDenyRules(repoRoot));
    for (const pattern of REQUIRED_CURSOR_SECRET_IGNORES) {
      expect(deny.has(toClaudeReadRule(pattern)), pattern).toBe(true);
    }
  });

  it("ger PowerShell-cmdlets bara till PowerShell-verktyget", () => {
    const allow = buildAllowRules(repoRoot);
    expect(allow).toContain("PowerShell(Get-ChildItem*)");
    expect(allow).not.toContain("Bash(Get-ChildItem*)");
    expect(allow).toContain("Bash(git status*)");
  });
});

describe("mappningar", () => {
  it("läser mdc-frontmatter med lista och always-flagga", () => {
    const rule = parseMdc(
      '---\ndescription: "D"\nglobs:\n  - a/**\n  - "b.ts"\nalwaysApply: false\n---\n\n# R\n',
    );
    expect(rule).toMatchObject({ description: "D", globs: ["a/**", "b.ts"], alwaysApply: false });
    expect(rule.body).toBe("# R\n");
    expect(parseMdc("---\nalwaysApply: true\n---\nx").alwaysApply).toBe(true);
  });

  it("gör Next-segment till wildcard eftersom [ är teckenklass i paths", () => {
    expect(toClaudePath("src/app/api/engine/chats/[chatId]/readiness/**")).toBe(
      "src/app/api/engine/chats/*/readiness/**",
    );
  });

  it("översätter gitignore-mönster till Read-regler", () => {
    expect(toClaudeReadRule(".env")).toBe("Read(**/.env)");
    expect(toClaudeReadRule(".vercel/")).toBe("Read(**/.vercel/**)");
    expect(toClaudeReadRule(".cursor/openclaw-bridge/")).toBe("Read(/.cursor/openclaw-bridge/**)");
    expect(toClaudeReadRule("/old/")).toBe("Read(/old/**)");
    expect(toClaudeReadRule("**/client_secret*.json")).toBe("Read(**/client_secret*.json)");
    expect(toClaudeReadRule("docs/old/**/*.env")).toBe("Read(/docs/old/**/*.env)");
  });

  it("tål radkommentarer och avslutande komman i JSONC", () => {
    expect(parseJsonc('{\n  // kommentar\n  "a": [1, 2,],\n}\n')).toEqual({ a: [1, 2] });
  });
});
