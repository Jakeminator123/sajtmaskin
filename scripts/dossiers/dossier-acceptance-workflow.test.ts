import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { pathMatchesPattern } from "../workflow/path-impact.mjs";
import { DOSSIER_ACCEPTANCE_PATH_CONTRACT, DOSSIER_ACCEPTANCE_PATHS } from "./acceptance-paths.mjs";
import { decideAcceptanceScope, matchesAcceptanceContract, selectAffectedDossiers } from "./acceptance-scope.mjs";
import { acceptanceCatalog, validateAcceptanceSelection } from "./list-acceptance-matrix.mjs";

const workflow = readFileSync(".github/workflows/dossier-acceptance.yml", "utf8");

describe("affected dossier selection", () => {
  const catalog = acceptanceCatalog();
  const all = catalog.map(entry => entry.id);
  it("selects only changed file-shipping dossiers, without repeated builds for multiple files", () => {
    expect(selectAffectedDossiers([
      "data/dossiers/hard/stripe-checkout/instructions.md",
      "data/dossiers/hard/stripe-checkout/components/checkout-button.tsx",
      "data/dossiers/hard/openai-chat/instructions.md",
    ], catalog)).toEqual({ dossiers: ["openai-chat", "stripe-checkout"], matrixMode: "affected" });
  });
  it.each([
    "src/components/ui/button.tsx", // All transitive UI consumers must build.
    "src/lib/gen/export/project-scaffold-ui-reader.ts",
    "src/lib/gen/scaffolds/landing-page/files/app/page.tsx",
    "package-lock.json",
    "data/dossiers/hard/stripe-checkout/manifest.json", // Shared npm resolution.
    "data/dossiers/_index/capability-map.json",
    "data/dossiers/hard/deleted-or-unknown/manifest.json",
  ])("retains full coverage for shared, transitive or unprovable input %s", path => {
    expect(selectAffectedDossiers([path], catalog)).toEqual({ dossiers: all, matrixMode: "full" });
  });
  it("includes both sides of a dossier rename and falls back when the old id was deleted", () => {
    expect(selectAffectedDossiers([
      "data/dossiers/hard/removed/manifest.json",
      "data/dossiers/hard/openai-chat/manifest.json",
    ], catalog).dossiers).toEqual(all);
  });
  it("preserves full scheduled/manual and non-preview push coverage", () => {
    for (const eventName of ["schedule", "workflow_dispatch", "push"]) {
      expect(decideAcceptanceScope({ eventName })).toMatchObject({ dossiers: all, matrixMode: "full" });
    }
  });
  it.each(["", "[]", "null", "{}", '["missing"]', '["openai-chat","openai-chat"]', "bad json"])(
    "rejects missing/invalid discovery output %s", value => {
      expect(() => validateAcceptanceSelection(value, catalog)).toThrow();
    },
  );
  it("CI discovery exits nonzero when classification output is absent", () => {
    const result = spawnSync(process.execPath, ["scripts/dossiers/list-acceptance-matrix.mjs"], {
      env: { ...process.env, GITHUB_ACTIONS: "true", ACCEPTANCE_DOSSIERS: "" }, encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("promotion requires every dossier", () => {
  const catalog = acceptanceCatalog();
  const all = catalog.map(entry => entry.id);
  it.each(["master", "", "release", undefined])("requires the whole catalog for PR base %s without trusting a narrow diff", baseRef => {
    for (const diff of ["M\0README.md\0", "M\0data/dossiers/hard/vercel-analytics/components/analytics-providers.tsx\0", ""]) {
      expect(decideAcceptanceScope({ eventName: "pull_request", baseRef,
        baseSha: "a".repeat(40), headSha: "b".repeat(40),
        gitCommand: () => ({ status: 0, stdout: diff }),
      })).toMatchObject({ runMatrix: true, matrixMode: "full", dossiers: all, reason: "non-preview-pr-full" });
    }
  });
  it("defers even a one-dossier Preview PR to promote and names what promote will build", () => {
    expect(decideAcceptanceScope({ eventName: "pull_request", baseRef: "preview",
      baseSha: "a".repeat(40), headSha: "b".repeat(40),
      gitCommand: () => ({ status: 0, stdout: "M\0data/dossiers/hard/vercel-analytics/components/analytics-providers.tsx\0" }),
    })).toMatchObject({
      runMatrix: false, matrixMode: "none", dossiers: [], reason: "deferred-to-promote",
      deferredDossiers: ["vercel-analytics"],
    });
  });
  it("independently refuses partial discovery, including when a future dossier is added", () => {
    expect(() => validateAcceptanceSelection(JSON.stringify(all.slice(1)), catalog, { requireFull: true })).toThrow("Full acceptance catalog required");
    expect(validateAcceptanceSelection(JSON.stringify([...all].reverse()), catalog, { requireFull: true })).toEqual([...all].reverse());
    expect(() => validateAcceptanceSelection(JSON.stringify(all), [...catalog, { id: "future-dossier", class: "hard" }], { requireFull: true })).toThrow();
  });
  it("fails the actual discovery command for a forged partial promotion selection", () => {
    const result = spawnSync(process.execPath, ["scripts/dossiers/list-acceptance-matrix.mjs"], {
      env: { ...process.env, GITHUB_ACTIONS: "true", ACCEPTANCE_REQUIRE_FULL: "true", ACCEPTANCE_DOSSIERS: JSON.stringify([all[0]]) }, encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Full acceptance catalog required");
  });
  it.each([
    ["pull_request", { SAJTMASKIN_PR_BASE_REF: "preview", SAJTMASKIN_PR_BASE_SHA: "", SAJTMASKIN_PR_HEAD_SHA: "" }],
    ["push", { GITHUB_REF: "refs/heads/preview", SAJTMASKIN_PUSH_BASE_SHA: "0".repeat(40), GITHUB_SHA: "" }],
  ])("wires an actual preview %s into deferred scope output that the aggregate accepts", (eventName, extraEnv) => {
    const dir = mkdtempSync(resolve(tmpdir(), "dossier-preview-scope-"));
    const output = resolve(dir, "output");
    try {
      const result = spawnSync(process.execPath, ["scripts/dossiers/acceptance-scope.mjs"], {
        env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_TOKEN: "", ...extraEnv, GITHUB_OUTPUT: output }, encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("reason=deferred-to-promote");
      const lines = readFileSync(output, "utf8").split("\n");
      expect(lines).toContain("run_matrix=false");
      expect(lines).toContain("matrix_mode=none");
      expect(lines).toContain("dossiers=[]");
      expect(lines).toContain("reason=deferred-to-promote");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("wires the actual promotion event into full scope output", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "dossier-promote-scope-"));
    const output = resolve(dir, "output");
    try {
      const result = spawnSync(process.execPath, ["scripts/dossiers/acceptance-scope.mjs"], {
        env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", SAJTMASKIN_PR_BASE_REF: "master", GITHUB_OUTPUT: output }, encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      const lines = readFileSync(output, "utf8").split("\n");
      expect(lines).toContain("run_matrix=true");
      expect(lines).toContain("matrix_mode=full");
      expect(JSON.parse(lines.find(line => line.startsWith("dossiers="))!.slice(9))).toEqual(all);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("materializer transitive dependency contract", () => {
  it("covers the static value-import closure, including newly introduced shared dependencies", () => {
    const seen = new Set<string>();
    function visit(file: string) {
      if (seen.has(file)) return;
      seen.add(file);
      if (!/\.[cm]?[jt]sx?$/.test(file)) return;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
        if ((ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
            (ts.isExportDeclaration(node) && node.isTypeOnly) ||
            !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        const specifier = node.moduleSpecifier.text;
        if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
        const root = specifier.startsWith("@/") ? resolve("src", specifier.slice(2)) : resolve(dirname(file), specifier);
        const target = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts"].map(suffix => root + suffix)
          .find(path => existsSync(path) && statSync(path).isFile());
        expect(target, `Resolve ${specifier} from ${file}`).toBeDefined();
        visit(relative(process.cwd(), target!).replaceAll("\\", "/"));
      }
    }
    visit("src/lib/gen/dossiers/acceptance-project.ts");
    expect([...seen].filter(path => !matchesAcceptanceContract(path))).toEqual([]);
  });
});

const IN_CONTRACT_EXAMPLES = [
  ".github/workflows/dossier-acceptance.yml",
  "data/dossiers/hard/stripe-checkout/manifest.json",
  "data/dossiers/soft/maplibre-map/files/components/map.tsx",
  "scripts/dossiers/materialize-acceptance-project.ts",
  "scripts/workflow/ci-scope.mjs",
  "scripts/workflow/path-impact.mjs",
  "scripts/workflow/push-baseline.mjs",
  "src/lib/gen/dossiers/acceptance-project.ts",
  "src/lib/gen/export/project-scaffold.ts",
  "src/lib/gen/scaffolds/landing-page/files/app/page.tsx",
  "src/lib/gen/scaffolds/ecommerce/files/app/product/[id]/page.tsx",
  "src/lib/gen/scaffolds/dashboard/files/app/users/page.tsx",
  "src/lib/gen/scaffolds/blog/files/app/blog/[slug]/page.tsx",
  "src/lib/gen/scaffolds/load-scaffold-files.ts",
  "src/lib/gen/autofix/dep-completer.ts",
  "src/components/ui/button.tsx",
  "components/ui/card.tsx",
  ".node-version",
  ".nvmrc",
  "package.json",
  "package-lock.json",
] as const;

const OUT_OF_CONTRACT_EXAMPLES = [
  "README.md",
  "docs/contracts/dossier-system.md",
  "config/scaffold-variants/landing-page/default.json",
  "src/lib/gen/scaffolds/auth-pages/files/app/page.tsx",
  "src/lib/gen/scaffolds/baseline-paths.ts",
  "src/app/builder/page.tsx",
  "config/agent-workflow.json",
] as const;

describe("dossier acceptance path contract", () => {
  it("lists every direct materialization dependency exactly once", () => {
    expect(DOSSIER_ACCEPTANCE_PATHS).toEqual(expect.arrayContaining([
      ".github/workflows/dossier-acceptance.yml",
      "data/dossiers/**",
      "scripts/dossiers/**",
      "scripts/workflow/ci-scope.mjs",
      "scripts/workflow/path-impact.mjs",
      "scripts/workflow/push-baseline.mjs",
      "src/lib/gen/dossiers/**",
      "src/lib/gen/export/**",
      "src/lib/gen/scaffolds/landing-page/**",
      "src/lib/gen/scaffolds/ecommerce/**",
      "src/lib/gen/scaffolds/dashboard/**",
      "src/lib/gen/scaffolds/blog/**",
      "src/lib/gen/scaffolds/load-scaffold-files.ts",
      "src/lib/gen/autofix/dep-completer.ts",
      "src/lib/gen/data/shadcn-components.ts",
      "src/lib/gen/parser.ts",
      "src/lib/gen/preview/env-local.ts",
      "src/lib/utils/infer-file-language.ts",
      "src/lib/utils/path-utils.ts",
      "src/components/ui/**",
      "components/ui/**",
      ".node-version",
      ".nvmrc",
      "package.json",
      "package-lock.json",
    ]));
    expect(new Set(DOSSIER_ACCEPTANCE_PATHS).size).toBe(DOSSIER_ACCEPTANCE_PATHS.length);
    expect(DOSSIER_ACCEPTANCE_PATH_CONTRACT.every((entry) => entry.reason.trim().length > 0)).toBe(
      true,
    );
  });

  it("matches materialized-project owners and ignores variants plus other scaffolds", () => {
    for (const path of IN_CONTRACT_EXAMPLES) {
      expect(matchesAcceptanceContract(path), path).toBe(true);
      expect(
        DOSSIER_ACCEPTANCE_PATHS.some((pattern) => pathMatchesPattern(path, pattern)),
        path,
      ).toBe(true);
    }
    for (const path of OUT_OF_CONTRACT_EXAMPLES) {
      expect(matchesAcceptanceContract(path), path).toBe(false);
    }
  });
});

describe("dossier acceptance scope", () => {
  it("always runs the matrix on scheduled and manual events", () => {
    expect(decideAcceptanceScope({ eventName: "schedule" })).toMatchObject({
      runMatrix: true,
      reason: "trusted-schedule-full",
    });
    expect(decideAcceptanceScope({ eventName: "workflow_dispatch" })).toMatchObject({
      runMatrix: true,
      reason: "trusted-workflow_dispatch-full",
    });
  });

  it("defers an out-of-contract Preview PR diff", () => {
    const result = decideAcceptanceScope({
      eventName: "pull_request", baseRef: "preview",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      gitCommand: () => ({
        status: 0,
        stdout: "M\0README.md\0",
        stderr: "",
      }),
    });
    expect(result).toMatchObject({
      runMatrix: false,
      reason: "deferred-to-promote",
      files: ["README.md"],
      matched: [],
      deferredDossiers: [],
      classificationError: null,
    });
  });

  it("defers a shared UI or Node pin change on Preview and reports the full catalog for promote", () => {
    const result = decideAcceptanceScope({
      eventName: "pull_request", baseRef: "preview",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      gitCommand: () => ({
        status: 0,
        stdout: "M\0src/components/ui/button.tsx\0M\0.node-version\0",
        stderr: "",
      }),
    });
    expect(result).toMatchObject({
      runMatrix: false,
      reason: "deferred-to-promote",
      classificationError: null,
      deferredDossiers: acceptanceCatalog().map(entry => entry.id),
    });
    expect(result.matched).toEqual(["src/components/ui/button.tsx", ".node-version"]);
  });

  it("an unclassifiable Preview diff is still deferred; the error is only reported", () => {
    const result = decideAcceptanceScope({
      eventName: "pull_request", baseRef: "preview",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      gitCommand: () => ({
        status: 1,
        stdout: "",
        stderr: "git diff failed",
      }),
    });
    expect(result).toMatchObject({
      runMatrix: false,
      reason: "deferred-to-promote",
    });
    expect(result.classificationError).toContain("git diff failed");
  });
});

describe("preview push dossier scope", () => {
  it.each([
    "src/app/builder/page.tsx",
    "README.md",
    "data/dossiers/hard/test/manifest.json",
    "src/components/ui/button.tsx",
    "scripts/workflow/ci-scope.mjs",
    "package-lock.json",
  ])("defers preview push %s to promote", (path) => {
    expect(
      decideAcceptanceScope({
        eventName: "push",
        ref: "refs/heads/preview",
        baseSha: "a".repeat(40),
        headSha: "b".repeat(40),
        gitCommand: () => ({ status: 0, stdout: `M\0${path}\0` }),
      }),
    ).toMatchObject({ runMatrix: false, reason: "deferred-to-promote", classificationError: null });
  });

  it("an unprovable preview push is deferred too, and other refs stay full", () => {
    for (const baseSha of ["", "0".repeat(40), "a".repeat(40)]) {
      expect(
        decideAcceptanceScope({
          eventName: "push",
          ref: "refs/heads/preview",
          baseSha,
          headSha: "b".repeat(40),
          gitCommand: () => ({ status: 1, stdout: "" }),
        }),
      ).toMatchObject({ runMatrix: false, reason: "deferred-to-promote" });
    }
    expect(decideAcceptanceScope({ eventName: "push", ref: "refs/heads/master" })).toMatchObject({
      runMatrix: true,
    });
  });

  it("still reports a renamed dependency for the promote summary", () => {
    expect(
      decideAcceptanceScope({
        eventName: "push",
        ref: "refs/heads/preview",
        baseSha: "a".repeat(40),
        headSha: "b".repeat(40),
        gitCommand: () => ({
          status: 0,
          stdout: "R100\0src/components/ui/card.tsx\0docs/card.md\0",
        }),
      }),
    ).toMatchObject({ runMatrix: false, matched: ["src/components/ui/card.tsx"] });
  });
});

// Use Git for Windows' Bash, not WSL. CI runs this exact aggregate on Ubuntu.
const bash =
  process.platform === "win32"
    ? `${process.env.ProgramFiles ?? "C:/Program Files"}/Git/bin/bash.exe`
    : "bash";
describe.skipIf(process.platform === "win32" && !existsSync(bash))(
  "required dossier aggregate",
  () => {
    const aggregate = parse(workflow).jobs["dossier-acceptance"].steps[0].run;
    const success = {
      EVENT_NAME: "push",
      BASE_REF: "preview",
      MATRIX_MODE: "full",
      SCOPE_RESULT: "success",
      RUN_MATRIX: "true",
      DISCOVER_RESULT: "success",
      REGISTRY_RESULT: "success",
      BUILD_RESULT: "success",
      EVIDENCE_RESULT: "skipped",
    };
    const skipped = {
      RUN_MATRIX: "false",
      DISCOVER_RESULT: "skipped",
      REGISTRY_RESULT: "skipped",
      BUILD_RESULT: "skipped",
    };
    function run(overrides: Partial<typeof success>) {
      const result = spawnSync(bash, ["-c", aggregate], {
        env: { ...process.env, ...success, ...overrides },
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      return result.status;
    }
    it.each(["push", "pull_request"])(
      "accepts a successful matrix or proven irrelevant %s",
      (EVENT_NAME) => {
        expect(run({ EVENT_NAME })).toBe(0);
        expect(run({ EVENT_NAME, ...skipped })).toBe(0);
        // The exact outputs a deferred preview run publishes.
        expect(run({ EVENT_NAME, ...skipped, MATRIX_MODE: "none" })).toBe(0);
      },
    );
    it.each(["master", "", "release"])("blocks skipped/partial or failed promotion matrices for base %s", BASE_REF => {
      expect(run({ EVENT_NAME: "pull_request", BASE_REF })).toBe(0);
      expect(run({ EVENT_NAME: "pull_request", BASE_REF, ...skipped })).toBe(1);
      for (const MATRIX_MODE of ["affected", "none", "", "unknown"]) {
        expect(run({ EVENT_NAME: "pull_request", BASE_REF, MATRIX_MODE })).toBe(1);
      }
      for (const BUILD_RESULT of ["failure", "cancelled", "skipped"]) {
        expect(run({ EVENT_NAME: "pull_request", BASE_REF, BUILD_RESULT })).toBe(1);
      }
    });
    it.each(["schedule", "workflow_dispatch"])(
      "never permits a skipped matrix on %s",
      (EVENT_NAME) => {
        expect(run({ EVENT_NAME, EVIDENCE_RESULT: "success" })).toBe(0);
        expect(run({ EVENT_NAME, EVIDENCE_RESULT: "success", ...skipped })).toBe(1);
      },
    );
    it.each(["failure", "cancelled", "skipped", "", "unknown"])(
      "blocks failed or missing scope %s",
      (SCOPE_RESULT) => {
        expect(run({ SCOPE_RESULT, ...skipped })).toBe(1);
      },
    );
    it.each(["failure", "cancelled", "skipped", "", "unknown"])(
      "blocks failed or missing matrix %s",
      (BUILD_RESULT) => {
        expect(run({ BUILD_RESULT })).toBe(1);
        if (BUILD_RESULT !== "skipped") expect(run({ ...skipped, BUILD_RESULT })).toBe(1);
      },
    );
  },
);

describe("dossier acceptance workflow contract", () => {
  it("keeps one discovered dossier id per job and at most six builds in parallel", () => {
    expect(workflow).toContain(
      'dossiers=$(node scripts/dossiers/list-acceptance-matrix.mjs)',
    );
    expect(workflow).toContain("dossier: ${{ fromJSON(needs.discover.outputs.dossiers) }}");
    expect(workflow).toContain("max-parallel: 6");
  });

  it("runs on every pull request and keeps weekly/manual coverage", () => {
    const start = workflow.indexOf("  pull_request:");
    const end = workflow.indexOf("  schedule:", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pullRequestBlock = workflow.slice(start, end);
    expect(pullRequestBlock).not.toContain("    paths:");
    expect(pullRequestBlock).toContain("ready_for_review");
    expect(parse(workflow).on.pull_request.types).not.toContain("edited");
    expect(pullRequestBlock).not.toContain("converted_to_draft");
    expect(workflow).toContain('    - cron: "17 3 * * 2"');
    expect(parse(workflow).on.workflow_dispatch.inputs.cold_cache).toMatchObject({ type: "boolean", default: false });
    expect(parse(workflow).concurrency.group).toBe("dossier-acceptance-${{ github.event.pull_request.number || github.run_id }}");
  });

  it.each([
    ["ci.yml", "ci"],
    ["db-blob-sync-check.yml", "db-blob-sync"],
  ])("retains active and pending trusted receipts in %s while replacing stale PR runs", (file, prefix) => {
    const concurrency = parse(readFileSync(`.github/workflows/${file}`, "utf8")).concurrency;
    expect(concurrency).toEqual({
      group: `${prefix}-` + "${{ github.event.pull_request.number || github.run_id }}",
      "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    });
  });

  it("classifies paths before the matrix and publishes a required aggregate", () => {
    expect(workflow).toContain("  scope:");
    expect(workflow).toContain("run: node scripts/dossiers/acceptance-scope.mjs");
    expect(workflow).toContain("  dossier-acceptance:");
    expect(parse(workflow).jobs["dossier-acceptance"].if).toContain("!cancelled()");
    expect(workflow).toContain("EXPECT_MATRIX=true");
    expect(parse(workflow).jobs.discover.steps.find((s: { id?: string }) => s.id === "matrix").env.ACCEPTANCE_DOSSIERS).toBe("${{ needs.scope.outputs.dossiers }}");
  });

  it("shares only prepared source from this run and preserves isolated install, typecheck and build", () => {
    const jobs = parse(workflow).jobs;
    const prepare = jobs.discover.steps;
    const build = jobs["keyless-production-build"].steps;
    expect(prepare.filter((s: { run?: string }) => s.run === "npm ci")).toHaveLength(1);
    expect(build.some((s: { run?: string }) => s.run === "npm ci")).toBe(false);
    expect(build.map((s: { run?: string }) => s.run).join("\n")).toContain('npm --prefix "$ACCEPTANCE_ROOT" install --no-audit --no-fund');
    expect(build.map((s: { run?: string }) => s.run).join("\n")).toContain('npm --prefix "$ACCEPTANCE_ROOT" run typecheck');
    expect(build.map((s: { run?: string }) => s.run).join("\n")).toContain('npm --prefix "$ACCEPTANCE_ROOT" run build');
    const download = build.find((s: { uses?: string }) => s.uses?.startsWith("actions/download-artifact@"));
    expect(download.with).toEqual({
      "artifact-ids": "${{ needs.discover.outputs.artifact_id }}",
      path: "${{ runner.temp }}/acceptance-artifact",
    }); // No cross-run ID, token or repository override.
    expect(parse(workflow).permissions).toEqual({ contents: "read" });
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toContain("pull_request_target:");
    expect(prepare.find((s: { id?: string }) => s.id === "projects").with["if-no-files-found"]).toBe("error");
  });

  it("keeps cold-cache measurement manual, with automatic caching disabled in every install job", () => {
    const jobs = parse(workflow).jobs;
    for (const id of ["discover", "dependency-registry", "verification-evidence", "keyless-production-build"]) {
      const steps = jobs[id].steps;
      const setup = steps.find((s: { uses?: string }) => s.uses?.startsWith("actions/setup-node@"));
      expect(setup.with.cache).toBe("${{ !(github.event_name == 'workflow_dispatch' && inputs.cold_cache) && 'npm' || '' }}");
      expect(setup.with["package-manager-cache"]).toBe(false);
      const cold = steps.find((s: { name?: string }) => s.name?.startsWith("Use an empty npm cache"));
      expect(cold.if).toBe("${{ github.event_name == 'workflow_dispatch' && inputs.cold_cache }}");
      expect(steps.indexOf(cold)).toBeLessThan(steps.findIndex((s: { run?: string }) => s.run?.startsWith("npm ")));
    }
    expect(decideAcceptanceScope({ eventName: "workflow_dispatch" }).dossiers).toEqual(acceptanceCatalog().map(entry => entry.id));
  });

  it.skipIf(process.platform === "win32" && !existsSync(bash))("cold measurement uses a fresh directory and refuses existing cache without deleting it", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dossier-cold-cache-"));
    try {
      const envFile = resolve(root, "github-env");
      const script = parse(workflow).jobs.discover.steps.find((s: { name?: string }) => s.name?.startsWith("Use an empty npm cache")).run;
      const run = () => spawnSync(bash, ["-e", "-c", script], { encoding: "utf8", timeout: 5_000,
        env: { ...process.env, RUNNER_TEMP: root.replaceAll("\\", "/"), GITHUB_ENV: envFile.replaceAll("\\", "/") } });
      expect(run().status).toBe(0);
      const exported = readFileSync(envFile, "utf8");
      expect(exported.trim()).toBe(`NPM_CONFIG_CACHE=${root.replaceAll("\\", "/")}/dossier-cold-npm`);
      const cache = resolve(root, "dossier-cold-npm");
      mkdirSync(cache);
      expect(run().status).not.toBe(0);
      expect(existsSync(cache)).toBe(true);
      expect(readFileSync(envFile, "utf8")).toBe(exported);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("still triggers on preview pushes (to publish the deferred receipt) and keeps freshness only on schedule/manual", () => {
    const start = workflow.indexOf("  verification-evidence:");
    const end = workflow.indexOf("  dependency-registry:", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(workflow.slice(start, end)).toContain(
      "    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
    );
    expect(workflow).toContain("  push:\n    branches: [preview]");
    expect(workflow).toContain(
      'if [ "$EVENT_NAME" = "pull_request" ] || [ "$EVENT_NAME" = "push" ]; then',
    );
  });
});

describe("PR metadata and retargeting regression", () => {
  const document = parse(workflow);
  function decision(eventName = "pull_request", runId = 100, cancelled = false) {
    const context = {
      github: { event_name: eventName, run_id: runId, event: { pull_request: { number: eventName === "pull_request" ? 42 : null } } },
      cancelled: () => cancelled,
    };
    const evaluate = (expression: string) => runInNewContext(
      expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), context, { timeout: 100 },
    );
    return {
      aggregate: Boolean(evaluate(document.jobs["dossier-acceptance"].if)),
      group: document.concurrency.group.replace(/\$\{\{([\s\S]*?)\}\}/gu, (_match: string, expression: string) => String(evaluate(expression))),
      cancel: Boolean(evaluate(document.concurrency["cancel-in-progress"])),
    };
  }
  it("never creates a new acceptance suite when the title or checklist changes", () => {
    // GitHub can leave the required identity Expected when a newer edited suite
    // is entirely skipped. Simulating a dynamic job name did not catch that.
    expect(document.on.pull_request.types).toEqual(["opened", "synchronize", "reopened", "ready_for_review"]);
    expect(document.jobs["dossier-acceptance"].name).toBe("dossier-acceptance");
    expect(document.jobs.scope.if).toBeUndefined();
    expect(workflow).not.toContain("github.event.changes");
  });
  it("replaces stale PR work while keeping a stable required identity", () => {
    expect(decision()).toEqual({ aggregate: true, group: "dossier-acceptance-42", cancel: true });
  });
  it.each(["push", "schedule", "workflow_dispatch"])("preserves unique non-cancelling %s receipts", eventName => {
    expect(decision(eventName)).toEqual({ aggregate: true, group: "dossier-acceptance-100", cancel: false });
    expect(decision(eventName).group).not.toBe(decision(eventName, 101).group);
  });
  it("does not keep an aggregate alive after cancellation", () => {
    expect(decision("pull_request", 100, true).aggregate).toBe(false);
  });
  it("drafts only a base change, then readiness reruns CI and dossiers for the new base", () => {
    const guard = parse(readFileSync(".github/workflows/pr-base-guard.yml", "utf8"));
    const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
    const job = guard.jobs["draft-on-base-change"];
    const shouldDraft = (changes: Record<string, unknown>) => runInNewContext(job.if, {
      github: { event: { changes, pull_request: { state: "open" } } },
    }, { timeout: 100 });
    expect(shouldDraft({ body: { from: "text" } })).toBe(false);
    expect(shouldDraft({ base: { ref: { from: "preview" } } })).toBe(true);
    expect(shouldDraft({ base: {}, body: {} })).toBe(true);
    expect(job.concurrency["cancel-in-progress"]).toBe(false);
    expect(ci.on.pull_request.types).toContain("ready_for_review");
    expect(document.on.pull_request.types).toContain("ready_for_review");
    expect(decideAcceptanceScope({ eventName: "pull_request", baseRef: "master" })).toMatchObject({
      runMatrix: true, matrixMode: "full", dossiers: acceptanceCatalog().map(entry => entry.id),
    });
  });
});

describe("master-only acceptance receipt", () => {
  const job = parse(workflow).jobs["dossier-acceptance-master"];
  function receipt(base = "master", action = "synchronize", changes: Record<string, unknown> = {}, eventName = "pull_request", cancelled = false) {
    const context = {
      github: { event_name: eventName, event: { action, changes, pull_request: { base: { ref: base } } } },
      always: () => true,
      cancelled: () => cancelled,
    };
    const evaluate = (expression: string) => runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), context, { timeout: 100 });
    return { name: evaluate(job.name), run: Boolean(evaluate(job.if)) };
  }
  it.each(["opened", "synchronize", "ready_for_review", "reopened"])("requires a separate full receipt for master %s", action => {
    expect(receipt("master", action)).toEqual({ name: "dossier-acceptance-master", run: true });
  });
  it.each(["preview", "release", ""])("never publishes even a skipped master identity on base %s", base => {
    expect(receipt(base)).toEqual({ name: "dossier-master-not-applicable", run: false });
  });
  it.each(["push", "schedule", "workflow_dispatch"])("cannot reuse a %s receipt as the master gate", eventName => {
    expect(receipt("master", "", {}, eventName)).toEqual({ name: "dossier-master-not-applicable", run: false });
  });
  it("still evaluates failed or cancelled dependencies instead of publishing a skipped green", () => {
    expect(receipt("master", "synchronize", {}, "pull_request", true)).toEqual({ name: "dossier-acceptance-master", run: true });
  });
  const success = {
    SCOPE_RESULT: "success", MATRIX_MODE: "full", RUN_MATRIX: "true",
    DISCOVER_RESULT: "success", REGISTRY_RESULT: "success", BUILD_RESULT: "success", ACCEPTANCE_RESULT: "success",
  };
  function run(overrides: Record<string, string> = {}) {
    const step = job.steps.find((step: { run?: string }) => step.run?.startsWith("node scripts/"));
    const script = step.run.slice("node ".length);
    return spawnSync(process.execPath, [script], { env: { ...process.env, ...success, ...overrides }, encoding: "utf8", timeout: 5_000 });
  }
  it("accepts a full successful catalog without installing or building again", () => {
    expect(run().status).toBe(0);
    expect(job.steps.filter((step: { run?: string }) => step.run)).toHaveLength(1);
  });
  it.each(Object.keys(success))("rejects incomplete or unproven %s via the actual workflow command", key => {
    for (const value of ["", "skipped", "cancelled", "failure", "affected"]) {
      const result = run({ [key]: value });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain(key);
    }
  });
});
