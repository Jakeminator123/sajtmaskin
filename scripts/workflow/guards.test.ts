import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { decide as decideWorktree } from "../../.cursor/hooks/worktree-force-guard.mjs";
import { decideCommitCommand, includesTrackedChanges, isCommitCommand } from "./commit-guard.mjs";

describe("destructive worktree guard", () => {
  it.each([
    "git worktree remove ../x --force",
    'bash -c "git worktree remove ../x --force"',
    "pwsh -Command 'git -C . worktree remove ../x'",
    String.raw`cmd /c "git worktree remove C:\tmp\wt --force"`,
    String.raw`cmd.exe /s /c "git -C . worktree remove C:\tmp\wt"`,
    String.raw`bash -c git\ worktree\ remove\ ../x\ --force`,
    '"git" worktree remove ../x --force',
    "'git' worktree remove ../x",
    'g"it" worktree remove ../x',
    'env "git" worktree remove ../x',
    "/usr/bin/git worktree remove ../x --force",
    "command /usr/bin/git worktree remove ../x",
    "$(command -v git) worktree remove ../x",
    'git work"tree" remove ../x',
    'git worktree re"mo"ve ../x',
    String.raw`git worktr\ee remove ../x`,
  ])("denies raw removal, including nested shells: %s", (command) => {
    expect(decideWorktree(command).permission).toBe("deny");
  });

  it("runs the worktree guard for shell-composed subcommands", () => {
    const hooks = JSON.parse(readFileSync(".cursor/hooks.json", "utf8"));
    const source = hooks.hooks.beforeShellExecution.find((hook: { command: string }) =>
      hook.command.endsWith("worktree-force-guard.mjs"),
    ).matcher;
    const matcher = new RegExp(source, "iu");
    for (const command of [
      'git work"tree" remove ../x',
      'git worktree re"mo"ve ../x',
      String.raw`git worktr\ee remove ../x`,
    ]) {
      expect(matcher.test(command), command).toBe(true);
      expect(decideWorktree(command).permission, command).toBe("deny");
    }
  });

  it("allows the canonical wrapper and quoted prose", () => {
    expect(decideWorktree("npm run worktree:remove -- ../x --force").permission).toBe("allow");
    expect(decideWorktree('rg "git worktree remove" docs')).toEqual({ permission: "allow" });
  });

  it("denies empty or malformed hook input", () => {
    expect(decideWorktree("").permission).toBe("deny");
    const run = spawnSync("node", [resolve(".cursor/hooks/worktree-force-guard.mjs")], {
      cwd: process.cwd(),
      input: "{",
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout).permission).toBe("deny");
  });

  it.each([
    'git -c alias.wt="worktree remove" wt ../victim --force',
    "X='!git worktree remove ../victim --force' git --config-env=alias.wt=X wt",
    "X='!git worktree remove ../victim --force' git --config-env alias.wt=X wt",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.wt GIT_CONFIG_VALUE_0='!git worktree remove ../victim --force' git wt",
    'git "$(printf worktree)" remove ../victim --force',
    "git work$(printf tree) remove ../victim --force",
    "$(printf g)it worktree remove ../victim --force",
    "g$(printf it) worktree remove ../victim --force",
  ])("denies alias/dynamic git commands fail-closed: %s", (command) => {
    expect(decideWorktree(command).permission).toBe("deny");
  });

  it("denies invocation of a configured global alias", () => {
    expect(decideWorktree("git wt ../victim", { aliases: new Set(["wt"]) }).permission).toBe(
      "deny",
    );
    expect(
      decideWorktree("$(printf g)it wt ../victim", { aliases: new Set(["wt"]) }).permission,
    ).toBe("deny");
  });
});

describe("commit guard", () => {
  it("recognizes git options before commit and compact -am", () => {
    expect(isCommitCommand("git -C . commit -am 'x'")).toBe(true);
    expect(includesTrackedChanges("git commit -am 'x'")).toBe(true);
    expect(includesTrackedChanges("git commit --all -m 'x'")).toBe(true);
  });

  it.each([
    'g"it" commit -m x',
    'g"i"t commit -m x',
    "g'it' commit -m x",
    String.raw`g\it commit -m x`,
    "bash -c 'g\"it\" commit -m x'",
    "/usr/bin/git commit -m x",
    "$(command -v git) commit -m x",
    'git co"mm"it -m x',
    "git c'o'mmit -m x",
    String.raw`git co\mmit -m x`,
  ])("recognizes shell-composed git executables: %s", (command) => {
    expect(isCommitCommand(command)).toBe(true);
  });

  it.each([
    'git -c alias.ci="commit" ci -a -m test',
    "X=commit git --config-env=alias.ci=X ci -a -m test",
    "X=commit git --config-env alias.ci=X ci -a -m test",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.ci GIT_CONFIG_VALUE_0=commit git ci -a -m test",
    'git "$(printf commit)" -a -m test',
    "git com$(printf mit) -a -m test",
    "$(printf g)it commit -a -m test",
    "g$(printf it) commit -a -m test",
    'G=git; "$G" commit -a -m test',
  ])("denies alias/dynamic commit candidates fail-closed: %s", (command) => {
    expect(decideCommitCommand(command, { aliases: new Set() }).permission).toBe("deny");
  });

  it("denies a configured global commit alias", () => {
    expect(decideCommitCommand("git ci -a -m test", { aliases: new Set(["ci"]) }).permission).toBe(
      "deny",
    );
    expect(
      decideCommitCommand("$(printf g)it ci -a -m test", { aliases: new Set(["ci"]) }).permission,
    ).toBe("deny");
  });

  it("allows ordinary quoted prose about protected git commands", () => {
    expect(decideCommitCommand('rg "git commit" docs', { aliases: new Set() })).toEqual({
      permission: "allow",
    });
    expect(decideWorktree('rg "git --config-env=alias.wt=X worktree remove" docs')).toEqual({
      permission: "allow",
    });
  });

  it("keeps the Cursor matcher aligned with composed executable forms", () => {
    const hooks = JSON.parse(readFileSync(".cursor/hooks.json", "utf8"));
    const source = hooks.hooks.beforeShellExecution.find((hook: { command: string }) =>
      hook.command.endsWith("commit-guard.mjs"),
    ).matcher;
    const matcher = new RegExp(source, "iu");
    for (const command of [
      "git commit -m x",
      'g"it" commit -m x',
      "g'it' commit -m x",
      String.raw`g\it commit -m x`,
      'git co"mm"it -m x',
      "git c'o'mmit -m x",
      String.raw`git co\mmit -m x`,
    ]) {
      expect(matcher.test(command), command).toBe(true);
      expect(isCommitCommand(command), command).toBe(true);
    }
  });

  it("asks for protected unstaged files included by -am", () => {
    const git = vi.fn((args: string[]) => {
      if (args[0] === "branch") return ["fix/test"];
      return args.includes("--cached") ? [] : ["config/agent-workflow.json"];
    });
    expect(decideCommitCommand("git -C . commit -am 'x'", { git }).permission).toBe("ask");
  });

  it("keeps the protected source path when a commit contains a rename", () => {
    const git = vi.fn((args: string[]) => {
      if (args[0] === "branch") return ["fix/test"];
      if (args.includes("--name-status")) {
        return args.includes("--cached")
          ? ["config/agent-workflow.json", "docs/agent-workflow.json"]
          : [];
      }
      return ["docs/agent-workflow.json"];
    });
    expect(decideCommitCommand("git commit -m x", { git }).permission).toBe("ask");
    expect(git).toHaveBeenCalledWith(["diff", "--cached", "--name-status", "-z"]);
  });

  it.each([
    "git commit AGENTS.md -m x",
    "git commit --only AGENTS.md -m x",
    "git commit --include AGENTS.md -m x",
  ])("does not miss commit pathspec forms: %s", (command) => {
    const git = vi.fn((args: string[]) => {
      if (args[0] === "branch") return ["fix/test"];
      return args.includes("--cached") ? [] : ["AGENTS.md"];
    });
    expect(decideCommitCommand(command, { git }).permission).toBe("ask");
  });

  it("denies ordinary commits on master even for unprotected source", () => {
    const git = vi.fn((args: string[]) =>
      args[0] === "branch" ? ["master"] : ["src/components/example.tsx"],
    );
    expect(decideCommitCommand("git commit -am x", { git }).permission).toBe("deny");
  });

  it("allows the same commit only with reasoned policy break-glass", () => {
    const git = vi.fn((args: string[]) =>
      args[0] === "branch" ? ["master"] : ["src/components/example.tsx"],
    );
    expect(
      decideCommitCommand("git commit -am x", {
        git,
        env: {
          NODE_ENV: "test",
          SAJTMASKIN_BREAK_GLASS: "1",
          SAJTMASKIN_BREAK_GLASS_REASON: "Akut återställning av trasig mergegrind",
        },
      }).permission,
    ).toBe("allow");
  });

  it("denies detached HEAD before inspecting file impact", () => {
    expect(decideCommitCommand("git commit -m x", { git: vi.fn(() => []) }).permission).toBe(
      "deny",
    );
  });

  it("denies malformed input and git inspection errors", () => {
    expect(decideCommitCommand("").permission).toBe("deny");
    expect(
      decideCommitCommand("git commit -m x", {
        git: () => {
          throw new Error("git unavailable");
        },
      }).permission,
    ).toBe("deny");
  });
});
