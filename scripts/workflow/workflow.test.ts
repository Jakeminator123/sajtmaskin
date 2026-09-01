import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  evaluateCiBranch,
  evaluateCiScopeWorkflow,
  evaluatePolicyFloors,
  evaluatePrHeadWorkflowPermissions,
  evaluateReservedWorkflowCheckNames,
  evaluateRetiredBugIdFloor,
  evaluateSecretWorkflowDispatches,
  evaluateTrustedReviewWindowGate,
  evaluateWorkflowContract,
} from "./check-contract.mjs";
import {
  collectImpact,
  expandBraces,
  loadWorkflowInputs,
  normalizeRepoPath,
  parseGitNameStatus,
  pathMatchesPattern,
} from "./path-impact.mjs";
import {
  assertBranchSafety,
  classifyProcessResult,
  executeVerificationCommands,
  isCiRunner,
  parseArgs,
  resolveVerificationCommand,
  runNpm,
  trackedPathsForBase,
} from "./verify-pr.mjs";
import { missingCursorSecretIgnores } from "../dev/check-agent-context-budget.mjs";

describe("agent workflow path matching", () => {
  it.each([
    ["src/lib/gen/a.ts", "src/lib/gen/**"],
    ["src/lib/gen/a.ts", "src/lib/gen/*.ts"],
    ["docs/a/b.md", "**/*.md"],
    ["config/ai_models/manifest.json", "config/ai_models/manifest.json#repairPolicies"],
    ["data/dossiers/hard/x/manifest.json", "data/dossiers/{hard,soft}/*/manifest.json"],
    [".agents/skills/x/SKILL.md", ".agents/skills/"],
  ])("matches %s against %s", (path, pattern) => {
    expect(pathMatchesPattern(path, pattern)).toBe(true);
  });

  it("normalizes Windows separators and expands braces", () => {
    expect(normalizeRepoPath("src\\lib\\db\\schema.ts")).toBe("src/lib/db/schema.ts");
    expect(expandBraces("data/{hard,soft}/x")).toEqual(["data/hard/x", "data/soft/x"]);
  });

  it("does not overmatch a single star across directories", () => {
    expect(pathMatchesPattern("src/lib/gen/deep/a.ts", "src/lib/gen/*.ts")).toBe(false);
  });

  it("keeps both sides of NUL-delimited rename and copy records", () => {
    const output = [
      "R100",
      "config/agent-workflow.json",
      "docs/agent-workflow.json",
      "C087",
      "backoffice/pages/cursor_agents.py",
      "docs/cursor_agents.py",
      "M",
      "README.md",
      "",
    ].join("\0");
    expect(parseGitNameStatus(output)).toEqual([
      "config/agent-workflow.json",
      "docs/agent-workflow.json",
      "backoffice/pages/cursor_agents.py",
      "docs/cursor_agents.py",
      "README.md",
    ]);
  });

  it("fails closed on malformed name-status output", () => {
    expect(() => parseGitNameStatus("R100\0config/agent-workflow.json\0")).toThrow(
      "missing its destination",
    );
  });
});

describe("agent workflow impact", () => {
  const inputs = loadWorkflowInputs();

  it("keeps workstation cleanup out of the PR verification profile", () => {
    expect(inputs.policy.verificationProfiles.full).not.toEqual(
      expect.arrayContaining(["clean:orphans:dry", "clean:scratch"]),
    );
  });

  it("fails the agent check if a proven Cursor secret guard is removed", () => {
    const source = readFileSync(".cursorignore", "utf8");
    expect(missingCursorSecretIgnores(source)).toEqual([]);
    expect(missingCursorSecretIgnores(source.replace(/^\.env-backups\/$/mu, ""))).toContain(
      ".env-backups/",
    );
  });

  it("orders cheaper runtime gates before the full Vitest suite", () => {
    const commands = inputs.policy.verificationProfiles.runtime;
    expect(commands.indexOf("typecheck")).toBeLessThan(commands.indexOf("test:ci"));
    expect(commands.indexOf("lint")).toBeLessThan(commands.indexOf("test:ci"));
  });

  it("finds the Cursor-agenter Backoffice surface after the skill move", () => {
    const impact = collectImpact({
      ...inputs,
      changedFiles: [".agents/skills/godnatt-bugg/SKILL.md", "AGENTS.md"],
    });
    expect(impact.backofficePages).toContain("Cursor-agenter");
    expect(impact.commands).toContain("check:agent-context");
    expect(impact.commands).toContain("backoffice:test");
  });

  it("maps a strict schema to its hard validator", () => {
    const impact = collectImpact({
      ...inputs,
      changedFiles: ["docs/schemas/strict/dossier.schema.json"],
    });
    expect(impact.authorities.map((entry) => entry.id)).toContain("dossier-manifest-schema");
    expect(impact.commands).toContain("dossiers:validate-all");
  });

  it.each([
    "docs/schemas/strict/new.schema.json",
    "config/control-plane/new-registry.json",
    "config/backoffice/new-domain.json",
  ])("routes control-plane surface %s to its hard contract", (path) => {
    const impact = collectImpact({ ...inputs, changedFiles: [path] });
    expect(impact.commands).toContain("control-plane:check");
    if (path.startsWith("docs/")) expect(impact.commands).toContain("docs:test");
  });

  it("reports runtime paths without a control-plane owner while keeping the core profile", () => {
    const impact = collectImpact({
      ...inputs,
      changedFiles: ["src/lib/new-area/deleted.ts"],
    });
    expect(impact.unmappedRuntimeFiles).toEqual(["src/lib/new-area/deleted.ts"]);
    expect(impact.commands).toContain("typecheck");
    expect(impact.commands).toContain("test:ci");
    expect(impact.commands).toContain("lint");
    expect(impact.commands).not.toContain("knip:files");
  });

  it.each([
    [
      "config/ai_models/41-tier3-stub-placeholders.env.txt",
      "generated-site-tier3-stub-placeholders",
      "Env Readiness (read-only)",
      "medium",
    ],
    ["config/ai_models/pricing.json", "ai-model-pricing", "Generation Cost", "high"],
  ])("never gives draft changes to %s a shallow verification plan", (path, id, surface, danger) => {
    const impact = collectImpact({ ...inputs, changedFiles: [path] });
    const owner = inputs.policyRegistry.entries.find((entry: { id: string }) => entry.id === id);

    expect(owner).toMatchObject({
      sourceOfTruth: path,
      validator: "test:ci",
      ciStatus: "hard",
      runtimeEnforced: true,
      runtimeStatus: "wired",
      backoffice: { surface, editable: false, writePath: null, danger },
    });
    expect(impact.groups.runtime).toContain(path);
    expect(impact.authorities).toContainEqual(
      expect.objectContaining({
        id,
        sourceOfTruth: path,
        validator: "test:ci",
        runtimeStatus: "wired",
        backofficeSurface: surface,
      }),
    );
    expect(impact.unmappedRuntimeFiles).toEqual([]);
    expect(impact.unclassifiedFiles).toEqual([]);
    expect(impact.backofficePages).toContain(surface);
    expect(impact.commands).toEqual(
      expect.arrayContaining([
        "embeddings:ensure",
        "typecheck",
        "lint",
        "test:ci",
        "backoffice:test",
      ]),
    );
    expect(impact.commands).not.toContain("knip:files");
  });

  it("routes the production OpenClaw prompt tips through their runtime owner", () => {
    const path = "data/openclaw/builder-prompt-tips.md";
    const impact = collectImpact({ ...inputs, changedFiles: [path] });
    const owner = inputs.policyRegistry.entries.find(
      (entry: { id: string }) => entry.id === "openclaw-builder-prompt-tips",
    );

    expect(owner).toMatchObject({
      sourceOfTruth: path,
      validator: "test:ci",
      ciStatus: "hard",
      runtimeEnforced: true,
      runtimeStatus: "wired",
      backoffice: { surface: null, editable: false, writePath: null },
    });
    expect(impact.groups.runtime).toContain(path);
    expect(impact.authorities).toContainEqual(
      expect.objectContaining({
        id: "openclaw-builder-prompt-tips",
        sourceOfTruth: path,
        validator: "test:ci",
        runtimeStatus: "wired",
        backofficeSurface: null,
      }),
    );
    expect(impact.unmappedRuntimeFiles).not.toContain(path);
    expect(impact.backofficePages).toEqual([]);
    expect(impact.commands).toEqual(
      expect.arrayContaining(["embeddings:ensure", "typecheck", "lint", "test:ci"]),
    );
  });

  it("keeps ownerless OpenClaw debug scenarios on the fail-closed runtime core", () => {
    const path = "data/openclaw/debug-scenarios.json";
    const impact = collectImpact({ ...inputs, changedFiles: [path] });

    expect(impact.groups.runtime).toContain(path);
    expect(impact.authorities).toEqual([]);
    expect(impact.unmappedRuntimeFiles).toEqual([path]);
    expect(impact.unclassifiedFiles).toEqual([]);
    expect(impact.commands).toEqual(
      expect.arrayContaining(["embeddings:ensure", "typecheck", "lint", "test:ci"]),
    );
    expect(impact.commands).not.toContain("knip:files");
  });

  it.each([".cursorignore", ".cursorindexingignore", ".gitignore", ".worktreeinclude"])(
    "routes the root Cursor control file %s to the agent profile",
    (path) => {
      const impact = collectImpact({ ...inputs, changedFiles: [path] });
      expect(impact.unclassifiedFiles).toEqual([]);
      expect(impact.commands).toEqual(
        expect.arrayContaining(["workflow:contract", "check:agent-context"]),
      );
      expect(impact.commands).not.toContain("test:ci");
      expect(impact.commands).not.toContain("knip:files");
    },
  );

  it.each(["src/components/Foo.tsx", "tests/new.test.ts", "public/worker.js"])(
    "does not add the supplemental full profile for classified runtime path %s",
    (path) => {
      const impact = collectImpact({ ...inputs, changedFiles: [path] });
      expect(impact.commands).toEqual(expect.arrayContaining(["typecheck", "lint", "test:ci"]));
      expect(impact.commands).not.toContain("knip:files");
    },
  );

  it.each([
    "tests/new.test.ts",
    "e2e/new.spec.ts",
    "infra/service.tf",
    "drizzle/schema.ts",
    "public/worker.js",
    "vitest.config.ts",
    "tsconfig.json",
    "vercel.json",
    "next.config.ts",
    "eslint.config.mjs",
    ".github/CODEOWNERS",
    ".github/dependabot.yml",
  ])("never gives a shallow plan for repository surface %s", (path) => {
    const impact = collectImpact({ ...inputs, changedFiles: [path] });
    expect(impact.commands).toContain("typecheck");
    expect(impact.commands).toContain("test:ci");
    expect(impact.commands).toContain("lint");
  });

  it("fails unknown top-level areas into runtime + full verification", () => {
    const impact = collectImpact({ ...inputs, changedFiles: ["new-zone/value.custom"] });
    expect(impact.unclassifiedFiles).toEqual(["new-zone/value.custom"]);
    expect(impact.commands).toEqual(
      expect.arrayContaining(["embeddings:ensure", "typecheck", "test:ci", "lint"]),
    );
  });

  it("makes an explicit --full request include runtime and supplemental checks", () => {
    const impact = collectImpact({
      ...inputs,
      changedFiles: ["docs/example-guide.md"],
      forceFull: true,
    });
    expect(impact.commands).toEqual(
      expect.arrayContaining(["typecheck", "lint", "test:ci", "knip:files"]),
    );
  });

  it.each([
    "övrigt/OPENCLAW-BUILDER/STATUS.yaml",
    "övrigt/OPENCLAW-BUILDER/diagrams/target.mmd",
    "övrigt/OPENCLAW-BUILDER/diagrams/target.svg",
    "docs/architecture/flow.svg",
  ])("treats documentation assets as docs instead of unknown paths: %s", (path) => {
    const impact = collectImpact({ ...inputs, changedFiles: [path] });
    expect(impact.unclassifiedFiles).toEqual([]);
    expect(impact.commands).not.toContain("test:ci");
    expect(impact.commands).toContain("docs:check");
  });

  // The documentation-asset classification must stay scoped to documentation
  // roots. A global `**/*.svg` or `övrigt/**/*.yml` would let emit-capable
  // dossier content and the excluded code surface `övrigt/testyta` skip the
  // fail-safe.
  it.each([
    "deploy/cluster.yaml",
    "data/dossiers/hard/demo/public/icon.svg",
    "övrigt/testyta/docker-compose.yml",
  ])("still fails a non-documentation asset into full verification: %s", (path) => {
    const impact = collectImpact({ ...inputs, changedFiles: [path] });
    expect(impact.commands).toContain("test:ci");
    expect(impact.commands).toContain("knip:files");
  });

  it("runs the isolated preview-host package guards", () => {
    const impact = collectImpact({ ...inputs, changedFiles: ["preview-host/src/server.js"] });
    expect(impact.commands).toContain("preview-host:verify");
  });

  it("routes Backoffice dependency changes to Python tests", () => {
    const impact = collectImpact({ ...inputs, changedFiles: ["requirements.backoffice.txt"] });
    expect(impact.commands).toContain("backoffice:test");
    expect(impact.commands).toContain("baseline-deps:verify");
  });

  it("treats the Node runtime version as a full runtime change", () => {
    const impact = collectImpact({ ...inputs, changedFiles: [".node-version"] });
    expect(impact.commands).toEqual(
      expect.arrayContaining(["embeddings:ensure", "typecheck", "test:ci", "lint", "knip:files"]),
    );
  });

  it.each(["package.json", "package-lock.json"])(
    "runs product verification for dependency owner %s",
    (path) => {
      const impact = collectImpact({ ...inputs, changedFiles: [path] });
      expect(impact.commands).toEqual(expect.arrayContaining(["typecheck", "test:ci", "lint"]));
    },
  );

  it.each([
    ["requirements.backoffice.dev.txt", "backoffice:test"],
    ["requirements.dbtest.txt", "db:blob-sync-unit"],
    ["requirements.genlogs.txt", "observability:test"],
  ])("routes Python dependency surface %s to %s", (path, command) => {
    const impact = collectImpact({ ...inputs, changedFiles: [path] });
    expect(impact.commands).toContain(command);
    expect(impact.commands).toContain("lint");
  });

  it.each(["e2e/deploy/new.smoke.spec.ts", "playwright.deploy-smoke.config.ts"])(
    "gives Playwright surface %s an explicit discovery contract",
    (path) => {
      const impact = collectImpact({ ...inputs, changedFiles: [path] });
      expect(impact.commands).toContain("test:e2e:contract");
    },
  );

  it("reports manual validators without executing them", () => {
    const impact = collectImpact({
      ...inputs,
      changedFiles: ["config/env-policy.json"],
    });
    expect(impact.manualValidators).toContain("env:audit");
  });

  it("does not let editable group overlap hide product or unknown paths", () => {
    const weakenedPolicy = structuredClone(inputs.policy);
    weakenedPolicy.pathGroups = Object.fromEntries(
      Object.keys(weakenedPolicy.pathGroups).map((group) => [
        group,
        group === "docs" ? ["**"] : ["__never__/**"],
      ]),
    );

    for (const path of ["src/components/Foo.tsx", "new-zone/value.custom"]) {
      const impact = collectImpact({ ...inputs, policy: weakenedPolicy, changedFiles: [path] });
      expect(impact.commands, path).toEqual(
        expect.arrayContaining(["typecheck", "test:ci", "lint"]),
      );
    }
  });

  it("keeps ordinary documentation changes on the docs-only plan", () => {
    const impact = collectImpact({ ...inputs, changedFiles: ["docs/example-guide.md"] });
    expect(impact.commands).toEqual(
      expect.arrayContaining(["workflow:contract", "docs:check", "docs:links"]),
    );
    expect(impact.commands).not.toContain("typecheck");
    expect(impact.commands).not.toContain("test:ci");
    expect(impact.commands).not.toContain("lint");
  });
});

describe("agent workflow branch safety", () => {
  const policy = loadWorkflowInputs().policy;

  it("allows ordinary work on master when the policy is open", () => {
    expect(() =>
      assertBranchSafety({
        branch: "master",
        head: "a".repeat(40),
        policy,
        env: { NODE_ENV: "test" },
      }),
    ).not.toThrow();
  });

  it("allows an explicit reasoned break-glass", () => {
    expect(() =>
      assertBranchSafety({
        branch: "master",
        head: "a".repeat(40),
        policy,
        env: {
          NODE_ENV: "test",
          SAJTMASKIN_BREAK_GLASS: "1",
          SAJTMASKIN_BREAK_GLASS_REASON: "Akut återställning av trasig mergegrind",
        },
      }),
    ).not.toThrow();
  });

  it("does not require a branch-name prefix when the policy list is empty", () => {
    const baseEnv = {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_ACTOR: "octocat",
    };
    expect(evaluateCiBranch(policy, { ...baseEnv, GITHUB_HEAD_REF: "fix/safe-change" })).toBeNull();
    expect(evaluateCiBranch(policy, { ...baseEnv, GITHUB_HEAD_REF: "tmp/hidden-rule" })).toBeNull();
    expect(
      evaluateCiBranch(policy, { ...baseEnv, GITHUB_HEAD_REF: "simplify-agent-workflow" }),
    ).toBeNull();
    expect(
      evaluateCiBranch(policy, {
        ...baseEnv,
        GITHUB_BASE_REF: "master",
        GITHUB_HEAD_REF: "sand/ocb-p0-1bbc",
      }),
    ).toBeNull();
  });

  it("keeps the explicit Dependabot branch exception", () => {
    expect(
      evaluateCiBranch(policy, {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_ACTOR: "dependabot[bot]",
        GITHUB_HEAD_REF: "dependabot/npm_and_yarn/example-1.2.3",
      }),
    ).toBeNull();
  });
});

describe("local base freshness", () => {
  it("treats only exact true runner signals as CI", () => {
    expect(isCiRunner({ CI: "true" })).toBe(true);
    expect(isCiRunner({ GITHUB_ACTIONS: "true" })).toBe(true);
    expect(isCiRunner({ CI: "false" })).toBe(false);
    expect(isCiRunner({ CI: "0" })).toBe(false);
    expect(isCiRunner({})).toBe(false);
  });

  it("includes source and destination paths when verify:pr sees a rename", () => {
    const git = () => ({
      stdout: "R100\0config/agent-workflow.json\0docs/agent-workflow.json\0",
    });
    expect(trackedPathsForBase("origin/master", git)).toEqual([
      "config/agent-workflow.json",
      "docs/agent-workflow.json",
    ]);
  });
});

describe("verify:pr command execution", () => {
  it("uses fail-fast by default and exposes an explicit diagnostic override", () => {
    expect(parseArgs([]).keepGoing).toBe(false);
    expect(parseArgs(["--keep-going"]).keepGoing).toBe(true);
  });

  it("uses the resource-capped test profile only outside CI", () => {
    expect(resolveVerificationCommand("test:ci", {})).toBe("test:pr");
    expect(resolveVerificationCommand("test:ci", { CI: "true" })).toBe("test:ci");
    expect(resolveVerificationCommand("test:ci", { GITHUB_ACTIONS: "true" })).toBe("test:ci");
    expect(resolveVerificationCommand("lint", {})).toBe("lint");
  });

  it("stops after the first failed command and reports what was skipped", () => {
    const calls: string[] = [];
    const execution = executeVerificationCommands(["first", "broken", "later"], (command) => {
      calls.push(command);
      return { signal: null, status: command === "broken" ? 7 : 0 };
    });

    expect(calls).toEqual(["first", "broken"]);
    expect(execution.passed).toEqual(["first"]);
    expect(execution.failures).toEqual([
      { command: "broken", outcome: { kind: "exit", status: 7 } },
    ]);
    expect(execution.skipped).toEqual(["later"]);
  });

  it("continues only when --keep-going was explicitly requested", () => {
    const calls: string[] = [];
    const execution = executeVerificationCommands(
      ["first", "broken", "later"],
      (command) => {
        calls.push(command);
        return { signal: null, status: command === "broken" ? 7 : 0 };
      },
      { keepGoing: true },
    );

    expect(calls).toEqual(["first", "broken", "later"]);
    expect(execution.passed).toEqual(["first", "later"]);
    expect(execution.failures).toHaveLength(1);
    expect(execution.skipped).toEqual([]);
  });

  it("fails closed on a real spawn error", () => {
    const result = spawnSync(`sajtmaskin-missing-command-${process.pid}`, []);
    expect(classifyProcessResult(result)).toEqual({ kind: "spawn-error", error: result.error });
    expect(result.error).toMatchObject({ code: "ENOENT" });
  });

  it("classifies signal termination as an interrupted process", () => {
    expect(classifyProcessResult({ signal: "SIGTERM", status: null })).toEqual({
      kind: "signal",
      signal: "SIGTERM",
    });
  });

  it.each([0, 7])("preserves the normal exit status %i", (status) => {
    expect(classifyProcessResult({ signal: null, status })).toEqual({ kind: "exit", status });
  });

  it("starts the Windows npm command through a shell", () => {
    const calls: Array<{
      command: string;
      args: string[];
      options: Record<string, unknown>;
    }> = [];
    const spawnCommand = ((
      command: string,
      args: readonly string[],
      options: Record<string, unknown>,
    ) => {
      calls.push({ command, args: [...args], options });
      return { error: undefined, signal: null, status: 0 } as never;
    }) as unknown as typeof spawnSync;
    const result = runNpm(
      ["run", "workflow:contract"],
      { inherit: true },
      {
        platform: "win32",
        spawnCommand,
      },
    );

    expect(result.status).toBe(0);
    expect(calls).toEqual([
      {
        command: "npm.cmd",
        args: ["run", "workflow:contract"],
        options: expect.objectContaining({ shell: true, stdio: "inherit" }),
      },
    ]);
  });
});

describe("agent workflow repository contract", () => {
  it("keeps policy, CI, hooks, routers and registries in sync", () => {
    expect(evaluateWorkflowContract().errors).toEqual([]);
  });

  it("keeps CI scope fail-closed and live credentials on trusted master", () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(evaluateCiScopeWorkflow(source, packageScripts)).toEqual([]);
    const replaceOnce = (search: string, replacement: string) => {
      const candidate = source.replace(search, replacement);
      expect(candidate).not.toBe(source);
      return candidate;
    };

    const weakened = [
      replaceOnce("ready_for_review, ", ""),
      replaceOnce(
        "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
        "cancel-in-progress: true",
      ),
      replaceOnce("group: ci-${{ github.ref }}", "group: ci-${{ github.run_id }}"),
      replaceOnce("github.ref == 'refs/heads/master'", "github.ref == 'refs/heads/feature'"),
      replaceOnce(
        "needs: [quality, schema-drift, build, backoffice-tests]",
        "needs: [quality, schema-drift]",
      ),
      replaceOnce(
        "needs.scope.result != 'success' || needs.scope.outputs.run_heavy != 'false'",
        "needs.scope.outputs.run_heavy == 'true'",
      ),
      replaceOnce(
        "if: ${{ !cancelled() }}\n    runs-on: ubuntu-latest\n    env:\n      RUN_HEAVY:",
        "if: ${{ !cancelled() && needs.scope.outputs.run_heavy == 'true' }}\n    runs-on: ubuntu-latest\n    env:\n      RUN_HEAVY:",
      ),
      replaceOnce(
        "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
        "cancel-in-progress: ${{ github.event_name == 'pull_request' || true }}",
      ),
      replaceOnce(
        "github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
        "github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch' || true)",
      ),
      replaceOnce(
        "    # en stale concurrency-cancelled PR-run dö i stället för att leva vidare.\n    if: ${{ !cancelled() }}",
        "    # en stale concurrency-cancelled PR-run dö i stället för att leva vidare.\n    if: ${{ always() }}",
      ),
      replaceOnce("run: npm run docs:test", "run: npm run test:ci"),
      replaceOnce("run: npm run test:e2e:contract", "run: echo e2e-contract-skipped"),
      replaceOnce(
        "  dead-code:\n    needs: scope\n    if: ${{ !cancelled() }}",
        "  dead-code:\n    if: ${{ !cancelled() }}",
      ),
      replaceOnce(
        "      - name: Orphan-file gate (blocking)\n        if: ${{ env.RUN_HEAVY == 'true' }}\n        run: npm run knip:files",
        "      - name: Orphan-file gate (blocking)\n        run: npm run knip:files",
      ),
    ];
    for (const candidate of weakened) {
      expect(evaluateCiScopeWorkflow(candidate, packageScripts).length).toBeGreaterThan(0);
    }
    expect(
      evaluateCiScopeWorkflow(source, {
        ...packageScripts,
        "test:e2e:contract": "true",
      }),
    ).toContain("test:e2e:contract must retain its exact Playwright discovery command");
  });

  it("keeps no-op review events outside trusted gate concurrency", () => {
    const source = readFileSync(".github/workflows/merge-ready-freshness.yml", "utf8");
    expect(evaluateTrustedReviewWindowGate(source)).toEqual([]);

    const mutations = [
      source.replace(
        "        github.event.action == 'ready_for_review'\n",
        "        github.event.action == 'ready_for_review' ||\n" +
          "        github.event.action == 'edited'\n",
      ),
      source.replace(
        "      github.event_name == 'pull_request_target' &&\n",
        "      (github.event_name == 'pull_request_target' || " +
          "github.event_name == 'issue_comment') &&\n",
      ),
      source.replace(
        "      group: trusted-review-window-${{ github.event.pull_request.number || github.event.issue.number }}\n",
        "      group: trusted-review-window\n",
      ),
      source.replace(
        "\npermissions:\n",
        "\nconcurrency:\n  group: merge-ready-freshness-global\n  cancel-in-progress: true\n\npermissions:\n",
      ),
    ];

    for (const candidate of mutations) {
      expect(candidate).not.toBe(source);
      expect(evaluateTrustedReviewWindowGate(candidate).length).toBeGreaterThan(0);
    }
  });

  it("scopes DB/Blob PR smoke to its exact executable inputs", () => {
    const blob = readFileSync(".github/workflows/db-blob-sync-check.yml", "utf8");
    const parity = readFileSync(".github/workflows/db-schema-parity.yml", "utf8");
    expect(evaluateSecretWorkflowDispatches(blob, parity)).toEqual([]);
    const replaceOnce = (search: string, replacement: string) => {
      const candidate = blob.replace(search, replacement);
      expect(candidate).not.toBe(blob);
      return candidate;
    };

    const weakened = [
      replaceOnce('      - ".github/workflows/db-blob-sync-check.yml"\n', ""),
      replaceOnce('      - "requirements.dbtest.txt"\n', ""),
      replaceOnce('      - "scripts/db/**/*.py"', '      - "scripts/db/**"'),
      replaceOnce(
        "  push:\n    branches: [master]",
        "  push:\n    branches: [master]\n    paths: [scripts/db/**]",
      ),
      replaceOnce("-r requirements.dbtest.txt", "-r requirements.backoffice.txt"),
      replaceOnce("python -m unittest test_pydatabastest -v", "python -m unittest -v"),
      replaceOnce(
        "      - name: Validate gate script (pull_request, no credentials)\n        if: ${{ github.event_name == 'pull_request' }}\n        # No secrets are injected here, so the PR's (untrusted) script can never run\n        # with production credentials. Each DB/blob target SKIPs with a WARN; this step\n        # only validates that the script parses and runs.\n        run: python scripts/db/pydatabastest.py --ci",
        "      - name: Validate gate script (pull_request, no credentials)\n        if: ${{ github.event_name == 'pull_request' }}\n        run: python scripts/db/pydatabastest.py --json",
      ),
      replaceOnce(
        "        run: python scripts/db/pydatabastest.py --ci\n        env:",
        "        run: python scripts/db/pydatabastest.py --ci\n        continue-on-error: true\n        env:",
      ),
    ];
    for (const candidate of weakened) {
      expect(evaluateSecretWorkflowDispatches(candidate, parity).length).toBeGreaterThan(0);
    }
  });

  it("rejects secret-bearing manual workflow runs outside master", () => {
    const blob = readFileSync(".github/workflows/db-blob-sync-check.yml", "utf8");
    const parity = readFileSync(".github/workflows/db-schema-parity.yml", "utf8");
    expect(evaluateSecretWorkflowDispatches(blob, parity)).toEqual([]);
    const replaceOnce = (source: string, search: string, replacement: string) => {
      const candidate = source.replace(search, replacement);
      expect(candidate).not.toBe(source);
      return candidate;
    };

    const weakened = [
      [
        replaceOnce(
          blob,
          "if: ${{ github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/master' }}",
          "if: ${{ github.event_name == 'workflow_dispatch' }}",
        ),
        parity,
      ],
      [
        replaceOnce(
          blob,
          "if: ${{ github.event_name == 'pull_request' || (github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')) }}",
          "if: ${{ github.event_name != 'workflow_dispatch' || true }}",
        ),
        parity,
      ],
      [
        replaceOnce(
          blob,
          "if: ${{ github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') }}",
          "if: ${{ github.event_name != 'pull_request' }}",
        ),
        parity,
      ],
      [
        replaceOnce(
          blob,
          "          exit 1\n\n  db-blob-sync:",
          "          exit 0\n\n  db-blob-sync:",
        ),
        parity,
      ],
      [
        blob,
        replaceOnce(
          parity,
          "if: ${{ github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/master' }}",
          "if: ${{ github.event_name == 'workflow_dispatch' }}",
        ),
      ],
      [
        blob,
        replaceOnce(
          parity,
          "if: ${{ github.ref == 'refs/heads/master' && (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') }}",
          "if: ${{ github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' }}",
        ),
      ],
      [
        blob,
        replaceOnce(
          parity,
          "          exit 1\n\n  db-schema-parity-scheduled:",
          "          exit 0\n\n  db-schema-parity-scheduled:",
        ),
      ],
    ];
    for (const [blobCandidate, parityCandidate] of weakened) {
      expect(
        evaluateSecretWorkflowDispatches(blobCandidate, parityCandidate).length,
      ).toBeGreaterThan(0);
    }
  });

  it("runs write-capable Dependabot automation only from trusted default-branch code", () => {
    const source = readFileSync(".github/workflows/dependabot-safe-classify.yml", "utf8");
    expect(source).toContain("pull_request_target:");
    expect(source).not.toMatch(/^  pull_request:\s*$/mu);
    expect(source).not.toContain("actions/checkout");
    expect(source).not.toContain("gh pr merge");
    expect(source).not.toContain("DEPENDABOT_AUTOMERGE_ENABLED");
    expect(source).toContain("github.event.pull_request.user.login == 'dependabot[bot]'");
    expect(source).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(source).toContain("if: always()");
    expect(source).toContain("steps.meta.outcome == 'success'");
    expect(source).toContain("--force");
    expect(source).toContain('--remove-label "dependabot-patch-safe"');
  });

  it.each([
    ["block.yml", "on: pull_request\npermissions: write-all\njobs: {}\n"],
    ["block.yml", "on: [push, pull_request]\npermissions:\n  checks: write\njobs: {}\n"],
    ["block.yml", "on:\n  pull_request: {}\npermissions: { checks: write }\njobs: {}\n"],
    ["block.yml", "on:\n  'pull_request':\npermissions:\n  checks: 'write'\njobs: {}\n"],
    ["block.yml", "on:\n  pull_request:\npermissions:\n  checks: write # granted\njobs: {}\n"],
    ["block.yml", "on:\n    pull_request:\npermissions: write-all\njobs: {}\n"],
    ["block.yml", "on:\n  pull_request:\njobs: {}\n"],
    [
      "block.yml",
      "on: [pull_request]\npermissions: { contents: read }\njobs:\n  unsafe:\n    permissions: { issues: 'write' }\n",
    ],
  ])("parses every PR-head trigger/permission form fail-closed: %s", (name, source) => {
    expect(evaluatePrHeadWorkflowPermissions([{ name, source }]).length).toBeGreaterThan(0);
  });

  it("allows an explicit read-only pull_request workflow and ignores comments", () => {
    const source = [
      "on: [pull_request]",
      "permissions: { contents: read } # issues: write is only a comment",
      "jobs:",
      "  safe:",
      "    runs-on: ubuntu-latest",
      "    steps: []",
      "",
    ].join("\n");
    expect(evaluatePrHeadWorkflowPermissions([{ name: "safe.yml", source }])).toEqual([]);
  });

  it.each([
    ["review-window.yaml", "on: push\njobs: {}\n"],
    ["other.yml", "on: push\njobs:\n  review-window:\n    runs-on: ubuntu-latest\n"],
    [
      "other.yml",
      "on: push\njobs:\n  fake:\n    name: review-window\n    runs-on: ubuntu-latest\n",
    ],
    ["other.yml", "on: push\njobs:\n  quality:\n    name: harmless\n    runs-on: ubuntu-latest\n"],
    ["other.yml", "on: push\njobs:\n  fake:\n    name: build\n    runs-on: ubuntu-latest\n"],
    [
      "other.yml",
      "on: push\njobs:\n  fake:\n    name: trusted-pr-ai-review\n    runs-on: ubuntu-latest\n",
    ],
    [
      "other.yml",
      "on: pull_request\njobs:\n  fake:\n    name: ${{ matrix.check }}\n    runs-on: ubuntu-latest\n",
    ],
  ])("reserves the native review-window identity: %s", (name, source) => {
    expect(evaluateReservedWorkflowCheckNames([{ name, source }]).length).toBeGreaterThan(0);
  });

  it("allows every core context exactly once only in canonical CI", () => {
    const source = [
      "on: pull_request",
      "permissions: { contents: read }",
      "jobs:",
      "  quality: { runs-on: ubuntu-latest, steps: [] }",
      "  build: { runs-on: ubuntu-latest, steps: [] }",
      "  backoffice-tests: { runs-on: ubuntu-latest, steps: [] }",
      "  schema-drift: { runs-on: ubuntu-latest, steps: [] }",
      "",
    ].join("\n");
    expect(evaluateReservedWorkflowCheckNames([{ name: "ci.yml", source }])).toEqual([]);
  });

  it("keeps an independent security floor below the editable policy", () => {
    const policy = loadWorkflowInputs().policy;
    expect(evaluatePolicyFloors(policy)).toEqual([]);
    expect(policy.manualMergePathPrefixes).toContain("scripts/workflow/check-contract.mjs");
    expect(
      evaluatePolicyFloors({
        ...structuredClone(policy),
        manualMergePathPrefixes: policy.manualMergePathPrefixes.filter(
          (candidate: string) => candidate !== "scripts/workflow/check-contract.mjs",
        ),
      }),
    ).toContain(
      "manualMergePathPrefixes security floor missing: scripts/workflow/check-contract.mjs",
    );

    const weakened = [
      { ...structuredClone(policy), requiredChecks: ["quality"] },
      ...policy.manualMergePathPrefixes.map((prefix: string) => ({
        ...structuredClone(policy),
        manualMergePathPrefixes: policy.manualMergePathPrefixes.filter(
          (candidate: string) => candidate !== prefix,
        ),
      })),
      {
        ...structuredClone(policy),
        review: {
          ...structuredClone(policy.review),
          requiredCheckWorkflow: { path: ".github/workflows/fake.yml", event: "pull_request" },
        },
      },
      {
        ...structuredClone(policy),
        verificationProfiles: { ...structuredClone(policy.verificationProfiles), runtime: [] },
      },
      {
        ...structuredClone(policy),
        verificationProfiles: {
          ...structuredClone(policy.verificationProfiles),
          runtime: policy.verificationProfiles.runtime.filter(
            (command: string) => command !== "lint",
          ),
        },
      },
      {
        ...structuredClone(policy),
        verificationProfiles: { ...structuredClone(policy.verificationProfiles), full: ["lint"] },
      },
      {
        ...structuredClone(policy),
        protectedPaths: policy.protectedPaths.filter((path: string) => path !== ".github/**"),
      },
      {
        ...structuredClone(policy),
        protectedPaths: policy.protectedPaths.filter((path: string) => path !== "drizzle/**"),
      },
      {
        ...structuredClone(policy),
        branchPrefixExemptActors: ["dependabot[bot]", "octocat"],
      },
      {
        ...structuredClone(policy),
        review: {
          ...structuredClone(policy.review),
          qualifyingCheckPatterns: ["gitguardian"],
        },
      },
      {
        ...structuredClone(policy),
        review: {
          ...structuredClone(policy.review),
          securityVetoCheckPatterns: ["other-scanner"],
        },
      },
      {
        ...structuredClone(policy),
        review: {
          ...structuredClone(policy.review),
          deploymentCheckNames: ["Preview Deploy"],
        },
      },
      {
        ...structuredClone(policy),
        immutableRemoteBranchPatterns: ["rescue/*"],
      },
      {
        ...structuredClone(policy),
        pathGroups: Object.fromEntries(
          Object.keys(policy.pathGroups).map((group) => [
            group,
            group === "docs" ? ["**"] : ["__never__/**"],
          ]),
        ),
      },
    ];
    for (const candidate of weakened) {
      expect(evaluatePolicyFloors(candidate).length).toBeGreaterThan(0);
    }
  });

  it("does not let a retired SM id become reusable by editing only the backlog validator", () => {
    const source = readFileSync("scripts/dev/check-bug-backlog.mjs", "utf8");
    expect(evaluateRetiredBugIdFloor(source)).toEqual([]);
    expect(evaluateRetiredBugIdFloor(source.replace('  "SM-002",\n', ""))).toEqual([
      expect.stringContaining("historical SM ids must never become reusable"),
    ]);
  });
});
