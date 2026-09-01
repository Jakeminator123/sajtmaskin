import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  cheapShellDecision,
  decide as decideWorktree,
  expandAnsiCQuotes,
  isImmutableBranchName,
  mayResolveToGit,
  resolveAliasesFor,
} from "../../.cursor/hooks/worktree-force-guard.mjs";
import {
  commandWorkingDirectory,
  commitTargetDirectories,
  decideCommitCommand,
  includesTrackedChanges,
  isCommitCommand,
} from "./commit-guard.mjs";

describe("alias lookup fast path", () => {
  it.each([
    "echo hello",
    "npm run build",
    "vercel env ls",
    "node scripts/dev/check-unicode-regex.mjs",
    "npm run worktree:remove -- ../x",
  ])("skips the alias table for commands that cannot reach git: %s", (command) => {
    expect(mayResolveToGit(command)).toBe(false);
    const read = vi.fn(() => new Set(["ci"]));
    expect(resolveAliasesFor(command, read)).toEqual(new Set());
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    "git commit -m x",
    "git worktree remove ../x",
    '"git" status',
    "/usr/bin/git commit",
    "$(command -v git) worktree remove ../x",
    "$G commit -a -m test",
    "GIT_CONFIG_KEY_0=alias.ci git ci",
  ])("still reads the alias table when git is reachable: %s", (command) => {
    expect(mayResolveToGit(command)).toBe(true);
    const read = vi.fn(() => new Set(["ci"]));
    expect(resolveAliasesFor(command, read)).toEqual(new Set(["ci"]));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reaches the same verdict with and without the fast path", () => {
    const command = "npm run worktree:remove -- ../x";
    expect(decideCommitCommand(command)).toEqual({ permission: "allow" });
    expect(decideCommitCommand(command, { aliases: new Set(["ci"]) })).toEqual({
      permission: "allow",
    });
    expect(decideWorktree(command, { aliases: new Set(["ci"]) })).toEqual({ permission: "allow" });
  });

  it("keeps denying a worktree removal that never names git", () => {
    expect(mayResolveToGit("tool worktree remove ../victim")).toBe(false);
    expect(decideWorktree("tool worktree remove ../victim", { aliases: new Set() }).permission).toBe(
      "deny",
    );
  });
});

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
    ".cursor/hooks/worktree-force-guard.mjs",
    "scripts/workflow/commit-guard.mjs",
  ])("does not crash when stdout closes before %s responds", async (script) => {
    const child = spawn(process.execPath, [resolve(script)], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.destroy();
    child.stdin.end(JSON.stringify({ command: "echo ok" }));
    const [code, signal] = await once(child, "close");
    expect(signal).toBeNull();
    expect(code).toBe(0);
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
    for (const command of ["npm run typecheck", "echo ok", "python3 -m unittest"]) {
      expect(matcher.test(command), command).toBe(false);
    }
  });

  it("does not run the worktree guard matcher on ordinary commands", () => {
    const hooks = JSON.parse(readFileSync(".cursor/hooks.json", "utf8"));
    const source = hooks.hooks.beforeShellExecution.find((hook: { command: string }) =>
      hook.command.endsWith("worktree-force-guard.mjs"),
    ).matcher;
    const matcher = new RegExp(source, "iu");
    expect(matcher.test("git worktree remove ../x")).toBe(true);
    expect(matcher.test("npm run typecheck")).toBe(false);
    expect(matcher.test("echo ok")).toBe(false);
    // ANSI-C can hide the letters `git` (`$'\\x67it'`). The matcher must
    // still start the hook; decide allows harmless `$'…'` without git payload.
    expect(matcher.test("$'\\x67it' fetch origin JAKOB_BRA:JAKOB_BRA")).toBe(true);
    expect(matcher.test("$'\\x67it' config --edit")).toBe(true);
    expect(matcher.test("echo $'hello'")).toBe(true);
    expect(decideWorktree("echo $'hello'", { aliases: new Set() }).permission).toBe("allow");
    expect(expandAnsiCQuotes("$'\\x67it' $'\\x66etch' origin JAKOB_BRA:JAKOB_BRA")).toBe(
      "git fetch origin JAKOB_BRA:JAKOB_BRA",
    );
    expect(expandAnsiCQuotes("$'\\x67it' fetch --refmap=+refs/heads/*:refs/heads/* origin")).toBe(
      "git fetch --refmap=+refs/heads/*:refs/heads/* origin",
    );
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
    expect(git).toHaveBeenCalledWith(
      ["diff", "--cached", "--name-status", "-z"],
      commandWorkingDirectory("git commit -m x", process.cwd()),
    );
  });

  it("judges a worktree commit against the worktree branch, not the hook cwd", () => {
    // Cursor reports an empty cwd, so without this the guard reads the shared
    // main checkout — which sits on master — and denies a legitimate commit.
    const mainCheckout = process.cwd();
    const worktree = resolve(mainCheckout, "scripts");
    expect(commitTargetDirectories("cd scripts; git commit -am x", mainCheckout)).toEqual([
      worktree,
    ]);
    const git = vi.fn((args: string[], cwd?: string) => {
      if (args[0] === "branch") return [cwd === worktree ? "fix/task" : "master"];
      if (cwd === worktree) return args.includes("--cached") ? [] : ["src/components/example.tsx"];
      return args.includes("--cached") ? [] : ["AGENTS.md"];
    });
    expect(decideCommitCommand("cd scripts; git commit -am x", { git }).permission).toBe("allow");
    expect(decideCommitCommand("git commit -am x", { git }).permission).toBe("ask");
  });

  it("does not let a pipe carry cwd, while && and ; still do", () => {
    const startCwd = process.cwd();
    const scripts = resolve(startCwd, "scripts");
    expect(commitTargetDirectories("cd scripts | git commit -m x", startCwd)).toEqual([startCwd]);
    expect(commitTargetDirectories("cd scripts; git commit -m x", startCwd)).toEqual([scripts]);
    expect(commitTargetDirectories("cd scripts && git commit -m x", startCwd)).toEqual([scripts]);
    expect(commitTargetDirectories("cd scripts || git commit -m x", startCwd)).toEqual([scripts]);
    expect(commandWorkingDirectory("cd scripts | git commit -m x", startCwd)).toBe(startCwd);
    expect(commandWorkingDirectory("cd scripts; git commit -m x", startCwd)).toBe(scripts);
    expect(commandWorkingDirectory("cd scripts && git commit -m x", startCwd)).toBe(scripts);
    expect(commandWorkingDirectory("cd scripts || git commit -m x", startCwd)).toBe(scripts);

    const git = vi.fn((args: string[], cwd?: string) => {
      if (args[0] === "branch") return [cwd === scripts ? "fix/task" : "master"];
      if (cwd === scripts) return args.includes("--cached") ? [] : ["src/components/example.tsx"];
      return args.includes("--cached") ? [] : ["AGENTS.md"];
    });
    // Explicit aliases keep this unit test off a real `git config` subprocess.
    const aliases = new Set<string>();
    expect(
      decideCommitCommand("cd scripts | git commit -m x", { git, cwd: startCwd, aliases })
        .permission,
    ).toBe("ask");
    expect(
      decideCommitCommand("cd scripts; git commit -m x", { git, cwd: startCwd, aliases })
        .permission,
    ).toBe("allow");
    expect(
      decideCommitCommand("cd scripts && git commit -m x", { git, cwd: startCwd, aliases })
        .permission,
    ).toBe("allow");
    expect(
      decideCommitCommand("cd scripts || git commit -m x", { git, cwd: startCwd, aliases })
        .permission,
    ).toBe("allow");
  });

  it("denies when git -C targets the trunk checkout behind an earlier cd", () => {
    // `cd <task worktree>; git -C <trunk checkout> commit` must not be judged
    // against the task branch — Git commits in the -C directory.
    const mainCheckout = process.cwd();
    const worktree = resolve(mainCheckout, "scripts");
    const git = vi.fn((args: string[], cwd?: string) => {
      if (args[0] === "rev-parse") return ["true"];
      if (args[0] === "branch") return [cwd === worktree ? "fix/task" : "master"];
      if (cwd === worktree) return args.includes("--cached") ? [] : ["src/components/example.tsx"];
      return args.includes("--cached") ? [] : ["AGENTS.md"];
    });
    expect(
      decideCommitCommand(`cd scripts; git -C "${mainCheckout}" commit -m x`, { git }).permission,
    ).toBe("ask");
  });

  it("does not read git commit -C as a directory", () => {
    // `-C` after the subcommand reuses a commit message; only `git -C <dir>`
    // before it is a path.
    const cwd = process.cwd();
    expect(commitTargetDirectories("git commit -C HEAD --no-edit", cwd)).toEqual([cwd]);
    expect(commitTargetDirectories(`git -C "${resolve(cwd, "scripts")}" commit -m x`, cwd)).toEqual([
      resolve(cwd, "scripts"),
    ]);
  });

  it("denies a commit routed through an opaque repository option", () => {
    const git = vi.fn(() => ["fix/task"]);
    for (const command of [
      "git --git-dir=/tmp/other/.git commit -m x",
      "git --work-tree /tmp/other commit -m x",
    ]) {
      expect(decideCommitCommand(command, { git }).permission, command).toBe("deny");
    }
  });

  it("names the bare-checkout case when no branch can be read", () => {
    // core.bare=true has silently reappeared in this repo's main checkout twice
    // and looks exactly like a detached HEAD from here, so the message must
    // point at both causes instead of only one.
    const git = vi.fn(() => []);
    const decision = decideCommitCommand("git commit -m x", { git });
    expect(decision).toEqual(
      expect.objectContaining({
        permission: "deny",
        user_message: expect.stringContaining("core.bare"),
      }),
    );
  });

  it("collects the commit target directory from a nested shell payload", () => {
    const cwd = process.cwd();
    const nested = commitTargetDirectories(`pwsh -c "cd scripts; git commit -m x"`, cwd);
    expect(nested).toEqual([resolve(cwd, "scripts")]);

    const nestedThenOuter = commitTargetDirectories(
      `pwsh -c "cd scripts; git status"; git commit -m x`,
      cwd,
    );
    expect(nestedThenOuter).toEqual([cwd]);
  });

  it("resolves only directory changes that actually exist", () => {
    const cwd = process.cwd();
    expect(commandWorkingDirectory("git commit -m x", cwd)).toBe(cwd);
    expect(commandWorkingDirectory("cd scripts; git commit -m x", cwd)).toBe(
      resolve(cwd, "scripts"),
    );
    expect(commandWorkingDirectory("cd no-such-directory-here; git commit -m x", cwd)).toBe(cwd);
    expect(commandWorkingDirectory("cd scripts | git commit -m x", cwd)).toBe(cwd);
    // Windows paths must survive: shellTokens would eat the backslashes.
    expect(commandWorkingDirectory(`cd "${resolve(cwd, "scripts")}"; git commit -m x`, cwd)).toBe(
      resolve(cwd, "scripts"),
    );
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

  it("allows ordinary commits on master for unprotected source", () => {
    const git = vi.fn((args: string[]) =>
      args[0] === "branch" ? ["master"] : ["src/components/example.tsx"],
    );
    expect(decideCommitCommand("git commit -am x", { git }).permission).toBe("allow");
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

describe("cheap read-only git path", () => {
  const readonly = [
    "git worktree list",
    "git branch -vv",
    "git fetch --prune origin",
    "git status",
    "git status --short --branch",
    "git log -1 --oneline",
    "git diff --stat",
    "git rev-parse --abbrev-ref HEAD",
    "git show HEAD",
    "git checkout -b tmp-hook-repro",
    "git switch -c tmp-hook-repro",
    "GIT_CONFIG_NOSYSTEM=1 git fetch --prune origin",
  ];

  it.each(readonly)("allows %s before alias inspection", (command) => {
    expect(cheapShellDecision(command)).toEqual({ permission: "allow" });
    expect(decideCommitCommand(command, { aliases: null })).toEqual({ permission: "allow" });
    expect(decideWorktree(command, { aliases: null })).toEqual({ permission: "allow" });
  });

  it("treats checkout -b and switch -c the same", () => {
    expect(cheapShellDecision("git checkout -b feat/hook")).toEqual(
      cheapShellDecision("git switch -c feat/hook"),
    );
    expect(decideCommitCommand("git checkout -b feat/hook", { aliases: null })).toEqual({
      permission: "allow",
    });
    expect(decideCommitCommand("git switch -c feat/hook", { aliases: null })).toEqual({
      permission: "allow",
    });
  });

  it("does not cheap-allow a commit or raw worktree remove", () => {
    expect(cheapShellDecision("git commit -m x")).toBeNull();
    expect(cheapShellDecision("git worktree remove ../x --force")).toBeNull();
    expect(cheapShellDecision("tool worktree remove ../victim")).toBeNull();
  });

  it("recognizes immutable backup branch names", () => {
    expect(isImmutableBranchName("JAKOB_BRA_9999_INNNAN_MVP_BRA")).toBe(true);
    expect(isImmutableBranchName("rescue/stash-2026-08-14")).toBe(true);
    expect(isImmutableBranchName("feat/hook")).toBe(false);
  });

  it.each([
    "git checkout JAKOB_BRA_9999_INNNAN_MVP_BRA",
    "git switch rescue/stash-2026-08-14",
    "git checkout -b JAKOB_BRA_new",
    "git switch -c rescue/new",
    "git checkout -f JAKOB_BRA_9999_INNNAN_MVP_BRA",
    "git fetch origin JAKOB_BRA:JAKOB_BRA",
    "git fetch origin +refs/heads/JAKOB_BRA_9999:refs/heads/JAKOB_BRA_9999",
    "git -c remote.origin.fetch=+refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA fetch origin",
    "git fetch --refmap=+refs/heads/*:refs/heads/* origin",
    "git fetch --refmap +refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA origin",
    "git pull origin JAKOB_BRA:JAKOB_BRA",
    "GIT_CONFIG_GLOBAL=/tmp/evil.gitconfig git fetch origin",
    "GIT_CONFIG=/tmp/evil.gitconfig git fetch origin",
    "GIT_CONFIG_SYSTEM=/tmp/evil.gitconfig git fetch origin",
    "export GIT_CONFIG=/tmp/evil.gitconfig; git fetch origin",
    "GIT_CONFIG=/tmp/evil.gitconfig; git fetch origin",
    "git --config-env=remote.origin.fetch=EVIL_FETCH fetch origin",
    "git --config-env=include.path=EVIL_INCLUDE fetch origin",
    "git -c $'remote.origin.fetch=+refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA' fetch origin",
    "git -c $'include.path=/tmp/evil.cfg' status",
    "git --config-env=$'include.path=EVIL' fetch origin",
    "git config --edit",
    "git config -e",
    "GIT_EDITOR='cp /tmp/evil .git/config' git config --edit",
    "$'\\x67it' fetch origin JAKOB_BRA:JAKOB_BRA",
    "g$'\\x69t' fetch origin JAKOB_BRA:JAKOB_BRA",
    "$'\\x67it' config --edit",
    "$'\\x67it' $'\\x66etch' origin JAKOB_BRA:JAKOB_BRA",
    "$'\\x67it' fetch origin $'JAKOB_\\x42RA:JAKOB_\\x42RA'",
    "$'\\x67it' $'\\x63onfig' --edit",
    "$'\\x67it' config $'--\\x65dit'",
    "$'\\x67it' -c $'include\\x2epath=/tmp/evil.cfg' status",
    "$'\\x67it' fetch --refmap=+refs/heads/*:refs/heads/* origin",
    "$'\\x67it' fetch origin $'\\x72escue/foo:\\x72escue/foo'",
    "git -c include.path=/tmp/evil.cfg fetch origin",
    "git -c include.path=/tmp/evil.cfg status",
    "git config remote.origin.fetch +refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA",
    "git config remote.origin.fetch=+refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA",
    "git config --add include.path /tmp/evil.cfg",
    "git config remote.origin.fetch +refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA; git fetch origin",
    "git worktree add ../tmp-bra JAKOB_BRA_9999_INNNAN_MVP_BRA",
    "git branch -D JAKOB_BRA_9999_INNNAN_MVP_BRA",
    "git worktree add -b JAKOB_BRA_tmp ../tmp-bra",
  ])("denies mutating an immutable branch: %s", (command) => {
    expect(cheapShellDecision(command)?.permission).toBe("deny");
    expect(decideCommitCommand(command, { aliases: null }).permission).toBe("deny");
    expect(decideWorktree(command, { aliases: null }).permission).toBe("deny");
  });

  it("does not deny a read of remote.*.fetch as if it were a BRA write", () => {
    expect(cheapShellDecision("git config --get remote.origin.fetch")).toBeNull();
    expect(
      decideCommitCommand("git config --get remote.origin.fetch", { aliases: new Set() }).permission,
    ).toBe("allow");
    expect(decideWorktree("git config --get remote.origin.fetch", { aliases: new Set() }).permission).toBe(
      "allow",
    );
  });

  it.each([
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.status GIT_CONFIG_VALUE_0='checkout -f JAKOB_BRA_9999_INNNAN_MVP_BRA' git status",
    "GIT_CONFIG_PARAMETERS=\"'alias.status=checkout -f JAKOB_BRA'\" git status",
  ])("denies GIT_CONFIG alias injection that would cheap-allow a read-only subcommand: %s", (command) => {
    expect(cheapShellDecision(command)).toBeNull();
    expect(decideCommitCommand(command, { aliases: new Set() }).permission).toBe("deny");
    expect(decideWorktree(command, { aliases: new Set() }).permission).toBe("deny");
  });
});

describe("hook CLI contract", () => {
  function ask(script: string, command: string) {
    const run = spawnSync(process.execPath, [resolve(script)], {
      cwd: process.cwd(),
      input: JSON.stringify({ command }),
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
    });
    expect(run.status, `${script} ${command}`).toBe(0);
    expect(run.stdout.trim(), `${script} ${command} stdout`).not.toBe("");
    return JSON.parse(run.stdout) as { permission: string };
  }

  it("writes hook responses synchronously and never exits after write", () => {
    const io = readFileSync(resolve(".cursor/hooks/hook-io.mjs"), "utf8");
    expect(io).toContain("writeSync");
    // The doc comment names `process.exit()` as the thing to avoid, so match
    // against code only.
    const code = io.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
    expect(code).not.toMatch(/process\.exit\(/);
    expect(readFileSync(resolve(".cursor/hooks/worktree-force-guard.mjs"), "utf8")).toContain(
      "writeHookResponse",
    );
    expect(readFileSync(resolve("scripts/workflow/commit-guard.mjs"), "utf8")).toContain(
      "writeHookResponse",
    );
  });

  it.each([
    [".cursor/hooks/worktree-force-guard.mjs", "git worktree list", "allow"],
    [".cursor/hooks/worktree-force-guard.mjs", "git status --short --branch", "allow"],
    [".cursor/hooks/worktree-force-guard.mjs", "git checkout -b tmp-cli", "allow"],
    [".cursor/hooks/worktree-force-guard.mjs", "git switch -c tmp-cli", "allow"],
    [".cursor/hooks/worktree-force-guard.mjs", "git worktree remove ../x --force", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git checkout JAKOB_BRA_9999_INNNAN_MVP_BRA", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git checkout -f JAKOB_BRA_9999_INNNAN_MVP_BRA", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git fetch origin JAKOB_BRA:JAKOB_BRA", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git -c remote.origin.fetch=+refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git fetch --refmap=+refs/heads/*:refs/heads/* origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git pull origin JAKOB_BRA:JAKOB_BRA", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "GIT_CONFIG_GLOBAL=/tmp/evil.gitconfig git fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "GIT_CONFIG=/tmp/evil.gitconfig git fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "export GIT_CONFIG=/tmp/evil.gitconfig; git fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git --config-env=remote.origin.fetch=EVIL_FETCH fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git -c $'remote.origin.fetch=+refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA' fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git -c $'include.path=/tmp/evil.cfg' status", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git config --edit", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git config -e", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "$'\\x67it' fetch origin JAKOB_BRA:JAKOB_BRA", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "$'\\x67it' config --edit", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "$'\\x67it' $'\\x66etch' origin JAKOB_BRA:JAKOB_BRA", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "$'\\x67it' fetch --refmap=+refs/heads/*:refs/heads/* origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git -c include.path=/tmp/evil.cfg fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git -c include.path=/tmp/evil.cfg status", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git config remote.origin.fetch +refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git config --add include.path /tmp/evil.cfg", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git config remote.origin.fetch +refs/heads/JAKOB_BRA:refs/heads/JAKOB_BRA; git fetch origin", "deny"],
    [".cursor/hooks/worktree-force-guard.mjs", "git worktree add ../tmp-bra JAKOB_BRA_9999_INNNAN_MVP_BRA", "deny"],
    ["scripts/workflow/commit-guard.mjs", "git branch -vv", "allow"],
    ["scripts/workflow/commit-guard.mjs", "git fetch --prune origin", "allow"],
    ["scripts/workflow/commit-guard.mjs", "git checkout -b tmp-cli", "allow"],
    ["scripts/workflow/commit-guard.mjs", "git switch -c tmp-cli", "allow"],
    ["scripts/workflow/commit-guard.mjs", "git switch rescue/stash-2026-08-14", "deny"],
  ] as const)("%s %s → %s", (script, command, permission) => {
    expect(ask(script, command).permission).toBe(permission);
  });
});
