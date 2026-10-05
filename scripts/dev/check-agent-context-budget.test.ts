// @vitest-environment node
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    ".codex/agents/godnatt-investigator.toml",
    ".codex/agents/godnatt-worker.toml",
    ".codex/agents/godnatt-reviewer.toml",
  ]);
  for (const path of paths) {
    const target = join(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(repoRoot, path), target);
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

  it("still rejects retired instructions in an active rule", () => {
    writeFixture(".cursor/rules/legacy.mdc", "mvp-scope-freeze.mdc");

    expect(evaluateAgentContext(fixtureRoot).errors).toContain(
      ".cursor/rules/legacy.mdc contains retired mvp-scope-freeze pointer",
    );
  });
});
