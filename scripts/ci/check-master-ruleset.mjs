import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_SPEC_PATH = resolve(
  ROOT,
  ".github/rulesets/protect-master.expected.json",
);
export const DEFAULT_POLICY_PATH = resolve(ROOT, "config/agent-workflow.json");
export const REQUIRED_CHECKS_SOURCE = "config/agent-workflow.json#requiredChecks";

function stableStrings(values) {
  return [...values].map(String).sort();
}

function statusCheckKey(check) {
  const integrationId =
    check && check.integration_id !== undefined && check.integration_id !== null
      ? String(check.integration_id)
      : "";
  return String(check?.context ?? "") + "\u0000" + integrationId;
}

function findRules(live, type) {
  return Array.isArray(live?.rules)
    ? live.rules.filter((rule) => rule?.type === type)
    : [];
}

function expectEqual(issues, label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(
      label +
        " drifted: expected " +
        JSON.stringify(expected) +
        ", got " +
        JSON.stringify(actual),
    );
  }
}

function expectExactlyOneRule(issues, live, type) {
  const rules = findRules(live, type);
  if (rules.length !== 1) {
    issues.push("expected exactly one " + type + " rule, got " + rules.length);
    return null;
  }
  return rules[0];
}

export function resolveExpectedStatusChecks(spec, policy) {
  const seen = new Set();
  const checks = [];
  const fromPolicy = Array.isArray(policy?.requiredChecks) ? policy.requiredChecks : [];
  const extra = spec?.expected?.required_status_checks?.additional_status_checks ?? [];

  for (const check of [
    ...fromPolicy.map((context) => ({ context: String(context) })),
    ...extra,
  ]) {
    const key = statusCheckKey(check);
    if (seen.has(key)) continue;
    seen.add(key);
    checks.push(check);
  }
  return checks;
}

function evaluateSpecIntegrity(spec, policy) {
  const issues = [];
  const expected = spec?.expected;

  if (spec?.schemaVersion !== 1 || !expected) {
    return ["invalid expected ruleset spec"];
  }
  if (!Array.isArray(policy?.requiredChecks) || policy.requiredChecks.length === 0) {
    return ["invalid agent-workflow requiredChecks"];
  }
  if (expected.deletion !== true) {
    issues.push("expected spec must require deletion");
  }
  if (expected.non_fast_forward !== true) {
    issues.push("expected spec must require non_fast_forward");
  }
  const requiredMethods = expected.pull_request?.allowed_merge_methods_must_include;
  if (!Array.isArray(requiredMethods) || !requiredMethods.includes("squash")) {
    issues.push("expected spec must require squash in allowed_merge_methods");
  }
  if (expected.required_status_checks?.required_status_checks_source !== REQUIRED_CHECKS_SOURCE) {
    issues.push(
      "required status checks must be sourced from " + REQUIRED_CHECKS_SOURCE,
    );
  }
  if (Array.isArray(expected.required_status_checks?.required_status_checks)) {
    issues.push(
      "expected spec must not copy requiredChecks; use additional_status_checks",
    );
  }
  return issues;
}

export function evaluateMasterRuleset(live, spec, policy) {
  const specIssues = evaluateSpecIntegrity(spec, policy);
  if (specIssues.length > 0) return specIssues;

  const issues = [];
  const expected = spec.expected;

  expectEqual(issues, "ruleset id", live?.id, spec.rulesetId);
  expectEqual(issues, "ruleset name", live?.name, expected.name);
  expectEqual(issues, "ruleset target", live?.target, expected.target);
  expectEqual(issues, "ruleset enforcement", live?.enforcement, expected.enforcement);
  expectEqual(
    issues,
    "included refs",
    stableStrings(live?.conditions?.ref_name?.include ?? []),
    stableStrings(expected.conditions.ref_name.include),
  );
  expectEqual(
    issues,
    "excluded refs",
    stableStrings(live?.conditions?.ref_name?.exclude ?? []),
    stableStrings(expected.conditions.ref_name.exclude),
  );

  expectExactlyOneRule(issues, live, "deletion");
  expectExactlyOneRule(issues, live, "non_fast_forward");

  const pullRequestRule = expectExactlyOneRule(issues, live, "pull_request");
  if (pullRequestRule) {
    const parameters = pullRequestRule.parameters ?? {};
    expectEqual(
      issues,
      "required approving review count",
      parameters.required_approving_review_count,
      expected.pull_request.required_approving_review_count,
    );
    expectEqual(
      issues,
      "required review thread resolution",
      parameters.required_review_thread_resolution,
      expected.pull_request.required_review_thread_resolution,
    );

    const actualMethods = (parameters.allowed_merge_methods ?? []).map(String);
    for (const method of expected.pull_request.allowed_merge_methods_must_include) {
      if (!actualMethods.includes(method)) {
        issues.push(
          "allowed merge methods missing " +
            method +
            ": got " +
            JSON.stringify(actualMethods),
        );
      }
    }
  }

  const statusRule = expectExactlyOneRule(issues, live, "required_status_checks");
  if (statusRule) {
    const parameters = statusRule.parameters ?? {};
    expectEqual(
      issues,
      "strict required status checks",
      parameters.strict_required_status_checks_policy,
      expected.required_status_checks.strict_required_status_checks_policy,
    );
    expectEqual(
      issues,
      "status checks on branch creation",
      parameters.do_not_enforce_on_create,
      expected.required_status_checks.do_not_enforce_on_create,
    );

    const actualChecks = (parameters.required_status_checks ?? [])
      .map(statusCheckKey)
      .sort();
    const expectedChecks = resolveExpectedStatusChecks(spec, policy)
      .map(statusCheckKey)
      .sort();
    expectEqual(issues, "required status checks", actualChecks, expectedChecks);
  }

  return issues;
}

export async function loadExpectedSpec(path = DEFAULT_SPEC_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadWorkflowPolicy(path = DEFAULT_POLICY_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fetchLiveRuleset(spec) {
  const repository = process.env.GITHUB_REPOSITORY || spec.repository;
  if (repository !== spec.repository) {
    throw new Error(
      "repository mismatch: expected " +
        spec.repository +
        ", got " +
        repository,
    );
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sajtmaskin-ruleset-drift-check",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = "Bearer " + token;

  const response = await fetch(
    "https://api.github.com/repos/" +
      repository +
      "/rulesets/" +
      spec.rulesetId,
    { headers },
  );
  if (!response.ok) {
    throw new Error(
      "GitHub ruleset read failed: " +
        response.status +
        " " +
        (await response.text()),
    );
  }
  return response.json();
}

async function main() {
  const spec = await loadExpectedSpec();
  const policy = await loadWorkflowPolicy();
  const live = await fetchLiveRuleset(spec);
  const issues = evaluateMasterRuleset(live, spec, policy);

  if (issues.length === 0) {
    console.log(
      "Protect master matches " +
        ".github/rulesets/protect-master.expected.json" +
        " + " +
        REQUIRED_CHECKS_SOURCE,
    );
    return;
  }

  for (const issue of issues) {
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error("::error title=Protect master drift::" + issue);
    } else {
      console.error("- " + issue);
    }
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
