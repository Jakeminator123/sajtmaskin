import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  REQUIRED_CHECKS_SOURCE,
  evaluateMasterRuleset,
  resolveExpectedStatusChecks,
} from "./check-master-ruleset.mjs";

const spec = JSON.parse(
  readFileSync(resolve(".github/rulesets/protect-master.expected.json"), "utf8"),
);

type StatusCheck = { context: string; integration_id?: number };

type RulesetRule = {
  type: string;
  parameters?: {
    required_approving_review_count?: number;
    required_review_thread_resolution?: boolean;
    allowed_merge_methods?: string[];
    strict_required_status_checks_policy?: boolean;
    do_not_enforce_on_create?: boolean;
    required_status_checks?: StatusCheck[];
  };
};

type LiveRuleset = {
  id: number;
  name: string;
  target: string;
  enforcement: string;
  bypass_actors?: unknown;
  conditions: unknown;
  rules: RulesetRule[];
};

function matchingLiveRuleset(activeSpec = spec): LiveRuleset {
  return {
    id: activeSpec.rulesetId,
    name: activeSpec.expected.name,
    target: activeSpec.expected.target,
    enforcement: activeSpec.expected.enforcement,
    bypass_actors: structuredClone(activeSpec.expected.bypass_actors),
    conditions: structuredClone(activeSpec.expected.conditions),
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count:
            activeSpec.expected.pull_request.required_approving_review_count,
          required_review_thread_resolution:
            activeSpec.expected.pull_request.required_review_thread_resolution,
          allowed_merge_methods: ["merge", "squash", "rebase"],
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy:
            activeSpec.expected.required_status_checks.strict_required_status_checks_policy,
          do_not_enforce_on_create:
            activeSpec.expected.required_status_checks.do_not_enforce_on_create,
          required_status_checks: resolveExpectedStatusChecks(activeSpec),
        },
      },
    ],
  };
}

function rule(live: LiveRuleset, type: string): RulesetRule {
  const found = live.rules.find((item) => item.type === type);
  if (!found?.parameters) {
    throw new Error("missing parameterized rule " + type);
  }
  return found;
}

describe("Protect master ruleset drift", () => {
  it("runs the real CLI independently of agent policy while failing on ruleset drift", () => {
    const source = String.raw`
      import fs from "node:fs/promises";
      import { syncBuiltinESMExports } from "node:module";
      import { pathToFileURL } from "node:url";
      const [target, expectedUrl, rawLive, rawArgs] = process.argv.slice(1);
      process.argv = [process.execPath, target, ...JSON.parse(rawArgs)];
      const readFile = fs.readFile;
      fs.readFile = async (path, ...args) => {
        if (String(path).replaceAll("\\", "/").endsWith("/config/agent-workflow.json")) {
          throw new Error("Unrelated agent policy must not be read");
        }
        return readFile(path, ...args);
      };
      fs.appendFile = async (path, content) => {
        if (path !== "stubbed-summary") throw new Error("Unexpected summary path");
        console.log("SUMMARY:" + content);
      };
      syncBuiltinESMExports();
      globalThis.fetch = async (url, options) => {
        if (options?.method && options.method !== "GET") throw new Error("Unexpected mutation");
        if (String(url) !== expectedUrl) throw new Error("Unexpected URL; no network allowed");
        return { ok: true, json: async () => JSON.parse(rawLive) };
      };
      await import(pathToFileURL(target).href);
    `;
    const missingProtection = matchingLiveRuleset();
    missingProtection.rules = missingProtection.rules.filter(
      (item) => item.type !== "non_fast_forward",
    );
    const hiddenBypass = matchingLiveRuleset();
    delete hiddenBypass.bypass_actors;
    const hiddenBypassWithDrift = structuredClone(hiddenBypass);
    hiddenBypassWithDrift.enforcement = "disabled";
    const nullBypass = matchingLiveRuleset();
    nullBypass.bypass_actors = null;
    const extraBypass = matchingLiveRuleset();
    extraBypass.bypass_actors = [
      ...spec.expected.bypass_actors,
      { actor_id: 999, actor_type: "Integration", bypass_mode: "always" },
    ];
    const cases: Array<{
      live: LiveRuleset; status: number; output: string; args?: string[];
    }> = [
      { live: matchingLiveRuleset(), status: 0, output: "Protect master matches" },
      { live: matchingLiveRuleset(), status: 0, output: "including bypass actors", args: ["--read-only"] },
      {
        live: missingProtection,
        status: 1,
        output: "expected exactly one non_fast_forward rule, got 0",
      },
      { live: hiddenBypass, status: 1, output: "bypass actors UNVERIFIED" },
      { live: hiddenBypass, status: 0, output: "PARTIAL audit", args: ["--read-only"] },
      { live: hiddenBypassWithDrift, status: 1, output: "ruleset enforcement drifted", args: ["--read-only"] },
      { live: nullBypass, status: 1, output: "invalid bypass_actors", args: ["--read-only"] },
      { live: extraBypass, status: 1, output: "bypass actors drifted", args: ["--read-only"] },
      { live: matchingLiveRuleset(), status: 1, output: "unknown argument", args: ["--read-onli"] },
    ];
    for (const { live, status, output, args = [] } of cases) {
      const result = spawnSync(process.execPath, [
        "--input-type=module", "--eval", source,
        resolve("scripts/ci/check-master-ruleset.mjs"),
        `https://api.github.com/repos/${spec.repository}/rulesets/${spec.rulesetId}`,
        JSON.stringify(live),
        JSON.stringify(args),
      ], {
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          GITHUB_REPOSITORY: spec.repository,
          GITHUB_TOKEN: "",
          GH_TOKEN: "",
          GITHUB_ACTIONS: "false",
          GITHUB_STEP_SUMMARY: "stubbed-summary",
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(status);
      expect(result.stdout + result.stderr).toContain(output);
      if (live.bypass_actors === undefined && status === 0) {
        expect(result.stderr).toContain("::warning::Partial Protect master audit");
        expect(result.stderr).toContain("bypass actors UNVERIFIED");
        expect(result.stdout).toContain("SUMMARY:\n### Protect master: PARTIAL audit");
        expect(result.stdout + result.stderr).not.toContain("Protect master matches");
      }
    }
  });

  it("accepts the versioned expected state", () => {
    expect(spec.expected.bypass_actors).toEqual([
      { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" },
    ]);
    expect(evaluateMasterRuleset(matchingLiveRuleset(), spec)).toEqual([]);
  });

  it.each(["Integration", "User"])("rejects an additional %s bypass in both modes", (actorType) => {
    const live = matchingLiveRuleset();
    live.bypass_actors = [
      ...spec.expected.bypass_actors,
      { actor_id: 999, actor_type: actorType, bypass_mode: "always" },
    ];
    for (const readOnly of [false, true]) {
      expect(evaluateMasterRuleset(live, spec, { readOnly })).toEqual([
        expect.stringContaining("bypass actors drifted"),
      ]);
    }
  });

  it("rejects removed actors and changed bypass modes", () => {
    for (const actors of [[], [
      { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "pull_request" },
    ], [
      { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "exempt" },
    ]]) {
      const live = matchingLiveRuleset();
      live.bypass_actors = actors;
      expect(evaluateMasterRuleset(live, spec)).toEqual([
        expect.stringContaining("bypass actors drifted"),
      ]);
    }
  });

  it("compares bypass actors independently of array and object-key order", () => {
    const orderedSpec = structuredClone(spec);
    orderedSpec.expected.bypass_actors.push({
      actor_id: 999, actor_type: "Integration", bypass_mode: "pull_request",
    });
    const live = matchingLiveRuleset(orderedSpec);
    live.bypass_actors = [
      { bypass_mode: "pull_request", actor_type: "Integration", actor_id: 999 },
      { bypass_mode: "always", actor_type: "RepositoryRole", actor_id: 5 },
    ];
    const before = structuredClone(live);
    expect(evaluateMasterRuleset(live, orderedSpec)).toEqual([]);
    expect(live).toEqual(before);
  });

  it("requires explicit read-only mode to tolerate omitted bypass actors", () => {
    const live = matchingLiveRuleset();
    delete live.bypass_actors;
    expect(evaluateMasterRuleset(live, spec)).toEqual([
      expect.stringContaining("bypass actors UNVERIFIED"),
    ]);
    expect(evaluateMasterRuleset(live, spec, { readOnly: true })).toEqual([]);
    live.enforcement = "disabled";
    expect(evaluateMasterRuleset(live, spec, { readOnly: true })).toEqual([
      expect.stringContaining("ruleset enforcement drifted"),
    ]);
  });

  const malformedBypassActors = [
    null,
    {},
    "hidden",
    [null],
    [{}],
    [{ actor_id: "5", actor_type: "RepositoryRole", bypass_mode: "always" }],
    [{ actor_id: 0, actor_type: "RepositoryRole", bypass_mode: "always" }],
    [{ actor_id: -1, actor_type: "RepositoryRole", bypass_mode: "always" }],
    [{ actor_id: 1.5, actor_type: "RepositoryRole", bypass_mode: "always" }],
    [{ actor_id: Number.MAX_SAFE_INTEGER + 1, actor_type: "RepositoryRole", bypass_mode: "always" }],
    [{ actor_id: null, actor_type: "RepositoryRole", bypass_mode: "always" }],
    [{ actor_id: 5, actor_type: "UnknownActor", bypass_mode: "always" }],
    [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "unknown" }],
    [{ actor_id: 5, actor_type: "RepositoryRole" }],
    [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always", unexpected: true }],
    [spec.expected.bypass_actors[0], spec.expected.bypass_actors[0]],
  ];

  it.each(malformedBypassActors.map((actors, index) => [index, actors] as const))(
    "fails closed for malformed visible bypass actors case %s in both modes",
    (_index, actors) => {
      const live = matchingLiveRuleset();
      live.bypass_actors = actors;
      for (const readOnly of [false, true]) {
        expect(evaluateMasterRuleset(live, spec, { readOnly })).toEqual([
          expect.stringContaining("bypass actors UNVERIFIED: invalid bypass_actors"),
        ]);
      }
    },
  );

  it.each([undefined, ...malformedBypassActors].map((actors, index) => [index, actors] as const))(
    "rejects missing or malformed expected bypass actors case %s",
    (_index, actors) => {
      const invalidSpec = structuredClone(spec);
      invalidSpec.expected.bypass_actors = actors;
      for (const readOnly of [false, true]) {
        expect(evaluateMasterRuleset(matchingLiveRuleset(), invalidSpec, { readOnly })).toEqual([
          "expected spec must list valid bypass_actors",
        ]);
      }
    },
  );

  it("keeps GitHub ruleset checks inline and independent of agent-workflow", () => {
    expect(spec.expected.required_status_checks.required_status_checks_source).toBe(
      REQUIRED_CHECKS_SOURCE,
    );
    expect(spec.expected.pull_request.required_review_thread_resolution).toBe(true);
    expect(spec.expected.required_status_checks.strict_required_status_checks_policy).toBe(true);

    const contexts = resolveExpectedStatusChecks(spec).map((check: StatusCheck) => check.context);
    expect(contexts).toEqual([
      "quality",
      "backoffice-tests",
      "schema-drift",
      "build",
      "dossier-acceptance",
      "dossier-acceptance-master",
      "GitGuardian Security Checks",
    ]);
    expect(contexts).not.toContain("review-window");
  });

  it("rejects live master protection without the full-catalog receipt", () => {
    const live = matchingLiveRuleset();
    const status = rule(live, "required_status_checks").parameters!;
    status.required_status_checks = status.required_status_checks!.filter(
      check => check.context !== "dossier-acceptance-master",
    );
    expect(evaluateMasterRuleset(live, spec)).toEqual([
      expect.stringContaining("required status checks"),
    ]);
  });

  it("treats a tighter live GitHub ruleset as drift until expected is changed", () => {
    const live = matchingLiveRuleset();
    rule(live, "pull_request").parameters!.required_review_thread_resolution = false;
    rule(live, "required_status_checks").parameters!.strict_required_status_checks_policy = false;
    rule(live, "required_status_checks").parameters!.required_status_checks = [
      ...rule(live, "required_status_checks").parameters!.required_status_checks!,
      { context: "unexpected-check" },
    ];

    expect(evaluateMasterRuleset(live, spec)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("required review thread resolution"),
        expect.stringContaining("strict required status checks"),
        expect.stringContaining("required status checks"),
      ]),
    );
  });

  it("keeps the declared native approval count exact", () => {
    const live = matchingLiveRuleset();
    rule(live, "pull_request").parameters!.required_approving_review_count = 1;

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      expect.stringContaining("required approving review count"),
    ]);
  });

  it("fails closed when deletion or non_fast_forward disappears", () => {
    const withoutDeletion = matchingLiveRuleset();
    withoutDeletion.rules = withoutDeletion.rules.filter((item) => item.type !== "deletion");
    expect(evaluateMasterRuleset(withoutDeletion, spec)).toEqual([
      "expected exactly one deletion rule, got 0",
    ]);

    const withoutNff = matchingLiveRuleset();
    withoutNff.rules = withoutNff.rules.filter((item) => item.type !== "non_fast_forward");
    expect(evaluateMasterRuleset(withoutNff, spec)).toEqual([
      "expected exactly one non_fast_forward rule, got 0",
    ]);
  });

  it("fails closed when squash is removed from allowed merge methods", () => {
    const live = matchingLiveRuleset();
    rule(live, "pull_request").parameters!.allowed_merge_methods = ["merge", "rebase"];

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      'allowed merge methods missing squash: got ["merge","rebase"]',
    ]);
  });

  it("fails closed when a protected rule disappears", () => {
    const live = matchingLiveRuleset();
    live.rules = live.rules.filter((item) => item.type !== "required_status_checks");

    expect(evaluateMasterRuleset(live, spec)).toEqual([
      "expected exactly one required_status_checks rule, got 0",
    ]);
  });

  it("does not run on pull_request so PR CI cannot go red from GitHub UI drift", () => {
    const workflow = parse(readFileSync(
      resolve(".github/workflows/master-ruleset-drift.yml"), "utf8",
    )) as {
      on?: {
        push?: { branches?: string[] };
        schedule?: Array<{ cron?: string }>;
      };
    };
    const triggers = workflow.on ?? {};

    expect(Object.keys(triggers).sort()).toEqual(["push", "schedule", "workflow_dispatch"]);
    expect(triggers.push).toEqual({ branches: ["master"] });
    expect(triggers.schedule).toEqual([{ cron: "17 5 * * *" }]);
  });

  it("uses explicit partial mode without broadening the scheduled token permissions", () => {
    const workflow = parse(readFileSync(
      resolve(".github/workflows/master-ruleset-drift.yml"), "utf8",
    ));
    expect(workflow.permissions).toEqual({ contents: "read" });
    const job = workflow.jobs["protect-master"];
    expect(job.permissions).toEqual({ contents: "read" });
    const step = job.steps.find((item: { run?: string }) =>
      item.run === "node scripts/ci/check-master-ruleset.mjs --read-only");
    expect(step).toBeDefined();
    expect(step.env.GITHUB_TOKEN).toBe("${{ github.token }}");
  });
});
