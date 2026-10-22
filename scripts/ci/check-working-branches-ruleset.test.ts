import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { evaluateWorkingBranchesRuleset } from "./check-working-branches-ruleset.mjs";

const spec = JSON.parse(readFileSync(resolve(
  ".github/rulesets/protect-working-branches.expected.json",
), "utf8"));
const matching = () => ({ id: 123, ...structuredClone(spec.expected) });

describe("Working-branch deletion protection", () => {
  it("protects all working branches with no app bypass and no push or merge restrictions", () => {
    expect(spec.repository).toBe("Jakeminator123/sajtmaskin");
    expect(spec.expected.target).toBe("branch");
    expect(spec.expected.enforcement).toBe("active");
    expect(spec.expected.conditions).toEqual({ ref_name: {
      include: ["~ALL"], exclude: ["refs/heads/master", "refs/heads/preview"],
    } });
    expect(spec.expected.rules).toEqual([{ type: "deletion" }]);
    expect(spec.expected.bypass_actors).toEqual([
      { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" },
    ]);
    expect(evaluateWorkingBranchesRuleset(matching(), spec)).toEqual([]);
  });

  it.each([
    ["enforcement", "disabled"],
    ["target", "tag"],
    ["rules", []],
    ["rules", [{ type: "deletion" }, { type: "update" }]],
    ["conditions", { ref_name: { include: ["refs/heads/codex/*"], exclude: [] } }],
    ["bypass_actors", [
      { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" },
      { actor_id: 999, actor_type: "Integration", bypass_mode: "always" },
    ]],
  ])("rejects live drift in %s", (field, value) => {
    const live = matching();
    live[field] = value;
    expect(evaluateWorkingBranchesRuleset(live, spec)).toEqual([
      "working-branches ruleset drift: " + field,
    ]);
  });

  it("ignores API metadata and order but rejects missing policy fields", () => {
    const live = matching();
    live.created_at = "2026-10-22T00:00:00Z";
    live.conditions.ref_name.exclude.reverse();
    expect(evaluateWorkingBranchesRuleset(live, spec)).toEqual([]);
    const incomplete = structuredClone(spec);
    delete incomplete.expected.bypass_actors;
    expect(evaluateWorkingBranchesRuleset(live, incomplete)).toEqual([
      "invalid working-branches ruleset spec",
    ]);
  });

  it("audits in the existing read-only job even when the master audit fails", () => {
    const workflow = parse(readFileSync(resolve(
      ".github/workflows/master-ruleset-drift.yml",
    ), "utf8"));
    expect(workflow.permissions).toEqual({ contents: "read" });
    const job = workflow.jobs["protect-master"];
    expect(job.permissions).toEqual({ contents: "read" });
    const step = job.steps.find((item: { run?: string }) =>
      item.run === "node scripts/ci/check-working-branches-ruleset.mjs --read-only");
    expect(step).toBeDefined();
    expect(step.if).toBe("${{ !cancelled() }}");
    expect(step.env.GITHUB_TOKEN).toBe("${{ github.token }}");
    expect(workflow.on.pull_request).toBeUndefined();
    expect(workflow.on.pull_request_target).toBeUndefined();
  });

  it.each([
    ["ok", 0, "matches versioned policy", []],
    ["disabled", 1, "ruleset drift: enforcement", []],
    ["bypass", 1, "ruleset drift: bypass_actors", []],
    ["absent", 1, "expected exactly one", []],
    ["duplicate", 1, "expected exactly one", []],
    ["list-failed", 1, "ruleset list failed: 403", []],
    ["read-failed", 1, "ruleset read failed: 404", []],
    ["partial", 1, "ruleset list is incomplete", []],
    ["invalid-list", 1, "invalid ruleset list", []],
    ["wrong-repository", 1, "repository mismatch", []],
    ["hidden-bypass", 1, "ruleset drift: bypass_actors", []],
    ["hidden-bypass", 0, "bypass actors UNVERIFIED", ["--read-only"]],
    ["hidden-bypass-disabled", 1, "ruleset drift: enforcement", ["--read-only"]],
    ["bypass", 1, "ruleset drift: bypass_actors", ["--read-only"]],
    ["null-bypass", 1, "ruleset drift: bypass_actors", ["--read-only"]],
    ["ok", 0, "including bypass actors", ["--read-only"]],
    ["ok", 1, "unknown argument", ["--read-onli"]],
  ])("real CLI verifies %s with arguments %j", (mode, status, message, cliArgs) => {
    const source = String.raw`
      import { pathToFileURL } from "node:url";
      const [target, mode, rawLive, rawArgs] = process.argv.slice(1);
      process.argv = [process.execPath, target, ...JSON.parse(rawArgs)];
      const live = JSON.parse(rawLive);
      const api = "https://api.github.com/repos/Jakeminator123/sajtmaskin/rulesets";
      if (mode === "disabled" || mode === "hidden-bypass-disabled") live.enforcement = "disabled";
      if (mode.startsWith("hidden-bypass")) delete live.bypass_actors;
      if (mode === "null-bypass") live.bypass_actors = null;
      if (mode === "bypass") live.bypass_actors.push({ actor_id: 999, actor_type: "Integration", bypass_mode: "always" });
      globalThis.fetch = async (url, options) => {
        if (options?.method && options.method !== "GET") throw new Error("Unexpected mutation");
        if (String(url) === api + "?per_page=100") return {
          ok: mode !== "list-failed", status: 403,
          headers: { get: () => mode === "partial" ? '<next>; rel="next"' : null },
          json: async () => mode === "invalid-list" ? {} : mode === "absent" ? [] : mode === "duplicate" ? [live, live] : [live],
        };
        if (String(url) === api + "/123") return {
          ok: mode !== "read-failed", status: 404, json: async () => live,
        };
        throw new Error("Unexpected URL; no network allowed");
      };
      await import(pathToFileURL(target).href);
    `;
    const result = spawnSync(process.execPath, [
      "--input-type=module", "--eval", source,
      resolve("scripts/ci/check-working-branches-ruleset.mjs"), mode,
      JSON.stringify(matching()), JSON.stringify(cliArgs),
    ], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "", GITHUB_STEP_SUMMARY: "",
        GITHUB_REPOSITORY: mode === "wrong-repository" ? "other/repository" : spec.repository },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(status);
    expect(result.stdout + result.stderr).toContain(message);
    if (mode === "hidden-bypass" && status === 0) {
      expect(result.stderr).toContain("::warning::Partial working-branch audit");
      expect(result.stdout).not.toContain("matches versioned policy");
    }
  });
});
