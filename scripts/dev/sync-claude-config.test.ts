// @vitest-environment node
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REQUIRED_CURSOR_SECRET_IGNORES } from "./check-agent-context-budget.mjs";
import {
  buildAllowRules,
  buildDenyRules,
  buildMcpConfig,
  buildRuleFiles,
  directNodeEntry,
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

  it("blockerar även innehållet när ett secret-namn är en katalog", () => {
    const deny = new Set(buildDenyRules(repoRoot));
    expect(deny.has("Read(**/.env/**)")).toBe(true);
    expect(deny.has("Read(**/.env.*/**)")).toBe(true);
    expect(deny.has("Read(**/.vercel/**)")).toBe(true);
  });

  it("räknar en borttagen eller ändrad grind i settings.json som drift", () => {
    const root = fixture();
    writeClaudeProjection(root);
    const path = join(root, ".claude/settings.json");
    const settings = JSON.parse(readFileSync(path, "utf8"));
    expect(settings.hooks.PreToolUse.map((h: { matcher: string }) => h.matcher)).toEqual([
      "Bash|PowerShell",
      "Read",
    ]);

    delete settings.hooks;
    settings.permissions.ask = [];
    writeFileSync(path, JSON.stringify(settings));
    expect(claudeProjectionDrift(root)).toContain("inaktuell: .claude/settings.json");
  });

  it("ger PowerShell-cmdlets bara till PowerShell-verktyget", () => {
    const allow = buildAllowRules(repoRoot);
    expect(allow).toContain("PowerShell(Get-ChildItem*)");
    expect(allow).not.toContain("Bash(Get-ChildItem*)");
    expect(allow).toContain("Bash(git status*)");
  });
});

function runHook(script: string, stdin: string) {
  const result = spawnSync(process.execPath, [join(repoRoot, ".claude/hooks", script)], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot },
    timeout: 30_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const shellInput = (command: unknown) =>
  JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot });

describe("Claude-hookarna", () => {
  it.each([
    "git push --force origin preview",
    "git push -uf origin HEAD",
    "git push --m origin",
    "x && $(printf g)it push --force",
  ])("shell-guard nekar med exitkod 2: %s", (command) => {
    const result = runHook("shell-guard.mjs", shellInput(command));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Denied/u);
  });

  it("shell-guard släpper vanliga kommandon utan beslut", () => {
    const result = runHook("shell-guard.mjs", shellInput("echo $(date) && ls -la"));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it.each(["", "{inte json", shellInput(["git", "push", "-f"])])(
    "shell-guard nekar oläsbar indata (fail-closed): %j",
    (stdin) => {
      expect(runHook("shell-guard.mjs", stdin).status).toBe(2);
    },
  );

  it("gör ingenting när Cursor kör de importerade hookarna (Cursor har egna grindar)", () => {
    const cursorShell = JSON.stringify({
      conversation_id: "c1",
      cursor_version: "3.26.16",
      hook_event_name: "preToolUse",
      tool_name: "Shell",
      tool_input: { command: "git push --force origin preview", working_directory: repoRoot },
    });
    const result = runHook("shell-guard.mjs", cursorShell);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toBe("");
    const cursorRead = JSON.stringify({
      conversation_id: "c1",
      tool_name: "Read",
      tool_input: { file_path: join(repoRoot, ".cursor", "mcp.json") },
    });
    expect(runHook("read-guard.mjs", cursorRead).status).toBe(0);
  });

  it("hookkommandot är exec-form som inte beror på vilket skal Claude väljer", () => {
    const settings = JSON.parse(readFileSync(join(repoRoot, ".claude/settings.json"), "utf8"));
    for (const entry of settings.hooks.PreToolUse) {
      for (const hook of entry.hooks) {
        expect(hook.command).toBe("node");
        expect(hook.args).toHaveLength(1);
        expect(hook.args[0]).toMatch(/^\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/[\w-]+\.mjs$/u);
      }
    }
  });

  it("i Cursor (args ignorerade) blir node med JSON på stdin fail-open, aldrig exit 2", () => {
    const result = spawnSync(process.execPath, [], {
      input: JSON.stringify({ conversation_id: "c1", tool_input: { command: "git push -f" } }),
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.status).toBe(1);
  });

  it("read-guard nekar .cursor/mcp.json med secret-format och släpper annat", () => {
    const root = mkdtempSync(join(tmpdir(), "sajtmaskin-claude-read-"));
    fixtures.push(root);
    const guarded = join(root, ".cursor", "mcp.json");
    mkdirSync(dirname(guarded), { recursive: true });
    symlinkSync(dirname(guarded), join(root, "alias"), "junction");
    const read = (filePath: string) =>
      runHook(
        "read-guard.mjs",
        JSON.stringify({ tool_name: "Read", cwd: root, tool_input: { file_path: filePath } }),
      );
    const aliases = [
      guarded,
      join(root, "alias", "mcp.json"),
      `${root}/.cursor/./mcp.json`,
      `${root}/.cursor/unused/../mcp.json`,
      ".cursor/./mcp.json",
      ".cursor/unused/../mcp.json",
      ".cursor\\unused\\..\\mcp.json",
    ];

    writeFileSync(guarded, JSON.stringify({ mcpServers: { x: { url: "https://example.test" } } }));
    for (const filePath of aliases) expect(read(filePath).status, filePath).toBe(0);

    writeFileSync(
      guarded,
      JSON.stringify({
        mcpServers: {
          x: { url: "https://example.test", headers: { Authorization: "Bearer abc" } },
        },
      }),
    );
    for (const filePath of aliases) expect(read(filePath).status, filePath).toBe(2);
    expect(read(join(root, "README.md")).status).toBe(0);
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

  it("startar cmd-wrappade MCP-skript direkt med node för Claude", () => {
    const shadcn = JSON.parse(buildMcpConfig(repoRoot)).mcpServers.shadcn;
    expect(shadcn).toEqual({
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR:-.}/scripts/cursor/shadcn-mcp.cjs"],
    });
    expect(
      directNodeEntry(repoRoot, { command: "cmd", args: ["/c", "${workspaceFolder}\\saknas.cmd"] }),
    ).toBeNull();
  });

  it("tål radkommentarer och avslutande komman i JSONC", () => {
    expect(parseJsonc('{\n  // kommentar\n  "a": [1, 2,],\n}\n')).toEqual({ a: [1, 2] });
  });
});
