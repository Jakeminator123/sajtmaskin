import { describe, expect, it } from "vitest";

import { collectImpact, loadWorkflowInputs } from "./path-impact.mjs";
import { decideCiScope, resolveCiScope } from "./ci-scope.mjs";

const inputs = loadWorkflowInputs();

function decide(
  changedFiles: string[],
  { eventName = "pull_request", eventAction = "", isDraft = false } = {},
) {
  const impact = collectImpact({ ...inputs, changedFiles });
  return decideCiScope({ eventName, eventAction, isDraft, impact });
}

describe("CI scope decision", () => {
  it("runs only contract checks for an exclusive ordinary docs diff", () => {
    const result = decide(["README.md", "docs/example-guide.md"]);

    expect(result).toMatchObject({
      runHeavy: false,
      safeDocsOnly: true,
      highRisk: false,
      reason: "safe-docs-only",
    });
  });

  it("does not allow an unmapped docs text asset into the Markdown-only light lane", () => {
    const result = decide(["docs/unmapped-runtime-prompt.txt"]);

    expect(result).toMatchObject({ runHeavy: true, safeDocsOnly: false });
    expect(result.safeDocsBlockers).toContain("outside-safe-docs-allowlist");
  });

  it.each([
    [
      "config/prompt-core/00-core-contract.md",
      ["outside-safe-docs-allowlist", "non-docs-group:runtime", "backoffice-page"],
    ],
    [
      "data/dossiers/hard/openai-chat/instructions.md",
      ["outside-safe-docs-allowlist", "backoffice-page", "extra-command:backoffice:test"],
    ],
    ["docs/architecture/glossary.md", ["backoffice-page", "extra-command:backoffice:test"]],
  ])("does not let the global docs glob hide extra impact for %s", (path, blockers) => {
    const result = decide([path]);

    expect(result).toMatchObject({ runHeavy: true, safeDocsOnly: false });
    expect(result.safeDocsBlockers).toEqual(expect.arrayContaining(blockers));
  });

  it("blocks an allowlisted docs path that also belongs to a runtime group", () => {
    const impact = collectImpact({ ...inputs, changedFiles: ["docs/example-guide.md"] });
    impact.groups.runtime = ["docs/example-guide.md"];

    const result = decideCiScope({ eventName: "pull_request", impact });

    expect(result).toMatchObject({ runHeavy: true, safeDocsOnly: false });
    expect(result.safeDocsBlockers).toContain("non-docs-group:runtime");
  });

  it("blocks an allowlisted docs path with a Backoffice consumer", () => {
    const impact = collectImpact({ ...inputs, changedFiles: ["docs/example-guide.md"] });
    impact.backofficePages = ["Synthetic consumer"];

    const result = decideCiScope({ eventName: "pull_request", impact });

    expect(result).toMatchObject({ runHeavy: true, safeDocsOnly: false });
    expect(result.safeDocsBlockers).toContain("backoffice-page");
  });

  it("requires the exact light-lane command set for allowlisted docs", () => {
    const withExtra = collectImpact({ ...inputs, changedFiles: ["docs/example-guide.md"] });
    withExtra.commands.push("test:ci");
    const withMissing = collectImpact({ ...inputs, changedFiles: ["docs/example-guide.md"] });
    withMissing.commands = withMissing.commands.filter((command) => command !== "docs:test");

    expect(
      decideCiScope({ eventName: "pull_request", impact: withExtra }).safeDocsBlockers,
    ).toContain("extra-command:test:ci");
    expect(
      decideCiScope({ eventName: "pull_request", impact: withMissing }).safeDocsBlockers,
    ).toContain("missing-light-command:docs:test");
  });

  it("blocks authorities and manual validators from the docs shortcut", () => {
    const withAuthority = collectImpact({ ...inputs, changedFiles: ["docs/example-guide.md"] });
    withAuthority.authorities = [
      {
        id: "synthetic",
        sourceOfTruth: "docs/example-guide.md",
        validator: "docs:test",
        ciStatus: "hard",
        runtimeStatus: "wired",
        backofficeSurface: null,
      },
    ];
    const withManual = collectImpact({ ...inputs, changedFiles: ["docs/example-guide.md"] });
    withManual.manualValidators = ["synthetic:manual"];

    expect(decideCiScope({ eventName: "pull_request", impact: withAuthority })).toMatchObject({
      runHeavy: true,
      safeDocsOnly: false,
      highRisk: true,
    });
    expect(
      decideCiScope({ eventName: "pull_request", impact: withManual }).safeDocsBlockers,
    ).toContain("manual-validator");
  });

  it("stays heavy for overlapping runtime Markdown even if editable docs policy matches all", () => {
    const policy = structuredClone(inputs.policy);
    policy.pathGroups.docs = ["**"];

    for (const path of [
      "config/prompt-core/00-core-contract.md",
      "data/dossiers/hard/openai-chat/instructions.md",
    ]) {
      const impact = collectImpact({ ...inputs, policy, changedFiles: [path] });
      expect(decideCiScope({ eventName: "pull_request", impact }), path).toMatchObject({
        runHeavy: true,
        safeDocsOnly: false,
      });
    }
  });

  it.each([
    "docs/schemas/strict/new.schema.json",
    "docs/decisions/security-boundary.md",
    "AGENTS.md",
    ".github/workflows/ci.yml",
    "scripts/db/run-migrations.ts",
    "package-lock.json",
  ])("keeps protected or high-risk path %s on full CI even as a draft", (path) => {
    const result = decide([path], { isDraft: true });

    expect(result.runHeavy).toBe(true);
    expect(result.highRisk).toBe(true);
    expect(result.safeDocsOnly).toBe(false);
  });

  it("fails an unknown repository area into full CI", () => {
    const result = decide(["new-zone/value.custom"], { isDraft: true });

    expect(result).toMatchObject({ runHeavy: true, highRisk: true });
    expect(result.highRiskReasons).toContain("unclassified");
  });

  it("fails classified but ownerless runtime into full CI", () => {
    const result = decide(["src/components/ExampleCard.tsx"], { isDraft: true });

    expect(result).toMatchObject({ runHeavy: true, highRisk: true });
    expect(result.highRiskReasons).toContain("unmapped-runtime");
  });

  it("defers owned low-risk runtime checks while a PR is a draft", () => {
    const result = decide(["src/lib/hooks/chat/useAutoFix.ts"], { isDraft: true });

    expect(result).toMatchObject({
      runHeavy: false,
      safeDocsOnly: false,
      highRisk: false,
      reason: "draft-low-risk",
    });
  });

  it("runs full CI for the same runtime diff when the PR is ready", () => {
    const result = decide(["src/lib/hooks/chat/useAutoFix.ts"]);

    expect(result).toMatchObject({
      runHeavy: true,
      safeDocsOnly: false,
      highRisk: false,
      reason: "ready-runtime",
    });
  });

  it("treats ready_for_review as ready even if the payload draft flag is stale", () => {
    const result = decide(["src/lib/hooks/chat/useAutoFix.ts"], {
      eventAction: "ready_for_review",
      isDraft: true,
    });

    expect(result).toMatchObject({ runHeavy: true, reason: "ready-runtime" });
  });

  it("fails an empty or unprovable PR diff into full CI", () => {
    const result = decide([], { isDraft: true });

    expect(result).toMatchObject({ runHeavy: true, highRisk: true });
    expect(result.highRiskReasons).toContain("empty-diff");
  });

  it("runs full CI for every non-PR event without trusting changed-file scope", () => {
    for (const eventName of ["push", "workflow_dispatch", "unknown-event"]) {
      expect(decide(["README.md"], { eventName })).toMatchObject({
        runHeavy: true,
        safeDocsOnly: false,
      });
    }
  });

  it("includes both sides of a rename before deciding scope", () => {
    const baseSha = "a".repeat(40);
    const headSha = "b".repeat(40);
    const result = resolveCiScope({
      eventName: "pull_request",
      isDraft: true,
      baseSha,
      headSha,
      inputs,
      gitCommand: (() => ({
        status: 0,
        stdout: "R100\0.github/workflows/ci.yml\0docs/ci-history.md\0",
        stderr: "",
      })) as never,
    });

    expect(result.files).toEqual([".github/workflows/ci.yml", "docs/ci-history.md"]);
    expect(result).toMatchObject({ runHeavy: true, highRisk: true });
  });

  it("falls back to full CI when changed-file discovery is malformed", () => {
    const result = resolveCiScope({
      eventName: "pull_request",
      isDraft: true,
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      inputs,
      gitCommand: (() => ({
        status: 0,
        stdout: "R100\0docs/old.md\0",
        stderr: "",
      })) as never,
    });

    expect(result).toMatchObject({
      runHeavy: true,
      safeDocsOnly: false,
      highRisk: true,
      reason: "classification-error",
    });
    expect(result.classificationError).toContain("missing its destination");
  });
});
