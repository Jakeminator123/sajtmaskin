// @vitest-environment node
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  evaluateAgentContext,
  FILE_BUDGETS,
  REQUIRED_ALWAYS_RULES,
} from "./check-agent-context-budget.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
let fixtureRoot: string;

function writeFixture(path: string, body: string) {
  const target = join(fixtureRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
}

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "sajtmaskin-agent-context-"));
  const paths = new Set([
    ...Object.keys(FILE_BUDGETS),
    ...REQUIRED_ALWAYS_RULES,
    "README.md",
    "docs/README.md",
    ".agents/skills/pr-workflow/SKILL.md",
    ".cursorignore",
    ".cursorindexingignore",
    "config/agent-workflow.json",
    ".codex/config.toml",
  ]);
  for (const path of paths) {
    const target = join(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(repoRoot, path), target);
  }
  // Claude-projektionen och dess Cursor-källor (claude:sync).
  for (const path of [
    ".cursor/rules",
    ".cursor/permissions.json",
    ".cursor/mcp.json.example",
    ".claude",
    ".mcp.json",
    // Startskript som .mcp.json pekar på direkt (directNodeEntry).
    "scripts/cursor",
  ]) {
    cpSync(join(repoRoot, path), join(fixtureRoot, path), { recursive: true });
  }
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("active agent context", () => {
  it("ignores historical scratch files and nested worktree instructions", () => {
    writeFixture(".cursor/tmp/old-state.json", '{"rule":"mvp-scope-freeze.mdc"}');
    writeFixture(".cursor/worktrees/old/.cursor/rules/legacy.mdc", "mvp-scope-freeze.mdc");

    expect(evaluateAgentContext(fixtureRoot).errors).toEqual([]);
  });

  it("fails when the Claude projection is missing or its gate was removed", () => {
    rmSync(join(fixtureRoot, ".claude"), { recursive: true, force: true });
    expect(evaluateAgentContext(fixtureRoot).errors).toEqual(
      expect.arrayContaining([
        "Claude-projektionen: saknas: .claude/settings.json — kör npm run claude:sync",
        "Claude-projektionen: saknas: .claude/rules/git.md — kör npm run claude:sync",
      ]),
    );
  });

  it("fails when CLAUDE.md stops importing AGENTS.md", () => {
    writeFixture("CLAUDE.md", "# Claude Code\n");
    expect(evaluateAgentContext(fixtureRoot).errors).toContain(
      "CLAUDE.md must import @AGENTS.md (Claude Code skips AGENTS.md otherwise)",
    );
  });

  it("still rejects retired instructions in an active rule", () => {
    writeFixture(".cursor/rules/legacy.mdc", "mvp-scope-freeze.mdc");

    expect(evaluateAgentContext(fixtureRoot).errors).toContain(
      ".cursor/rules/legacy.mdc contains retired mvp-scope-freeze pointer",
    );
  });
});
