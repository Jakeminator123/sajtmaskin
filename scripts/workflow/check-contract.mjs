#!/usr/bin/env node
import Ajv2020 from "ajv/dist/2020.js";
import yaml from "js-yaml";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SAFE_DOCS_COMMANDS } from "./ci-scope.mjs";
import { PATH_GROUP_FLOORS } from "./path-impact.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Avsiktlig konstitutionell duplicering. Den redigerbara policyn får lägga till
// skydd, men får inte kunna sänka sin egen verifiering och sedan godkänna sig
// själv. Att ändra golvet kräver därför en synlig kod- och teständring under
// scripts/workflow/.
export const POLICY_FLOORS = Object.freeze({
  retiredBugIdsSha256: "6cb7f4b94e167f05471dd6c08ae928672927a41a972856992ca2a1cbd54b5634",
  requiredChecks: [
    "quality",
    "backoffice-tests",
    "schema-drift",
    "build",
    "review-window",
    "dossier-acceptance",
  ],
  // Required checks that are not published by the canonical CI workflow.
  // `review-window` is owned by the trusted default-branch controller, not a
  // PR-head job, and is filtered out before this map is consulted.
  requiredCheckOwners: {
    "dossier-acceptance": "dossier-acceptance.yml",
  },
  manualMergePathPrefixes: [
    ".github/workflows/",
    "scripts/ci/",
    "scripts/pr-review/",
    "scripts/workflow/check-contract.mjs",
    "scripts/workflow/ci-scope.mjs",
    "scripts/workflow/path-impact.mjs",
    "config/agent-workflow.json",
    "config/control-plane/policy-registry.json",
    "config/control-plane/schema-registry.json",
    "config/backoffice/domain-map.json",
  ],
  review: {
    requiredCheckWorkflow: {
      path: ".github/workflows/ci.yml",
      event: "pull_request",
    },
    qualifyingCheckPatterns: ["trusted-pr-ai-review"],
    securityVetoCheckPatterns: ["gitguardian"],
    deploymentCheckNames: ["Vercel"],
  },
  verificationProfiles: {
    always: ["workflow:contract"],
    docs: ["docs:check", "docs:links", "docs:test"],
    controlPlane: ["control-plane:check"],
    agent: ["check:agent-context"],
    runtime: ["typecheck", "test:ci", "lint"],
    backoffice: ["backoffice:test"],
    database: ["db:schema-drift", "db:blob-sync-unit"],
    dependencies: ["baseline-deps:verify", "baseline-deps:tree"],
    ci: ["typecheck", "test:ci"],
    previewHost: ["preview-host:verify"],
    observability: ["observability:test"],
    e2e: ["test:e2e:contract"],
    full: ["lint", "knip:files"],
  },
  pathGroups: PATH_GROUP_FLOORS,
  protectedPaths: [
    ".github/**",
    "package.json",
    "package-lock.json",
    ".node-version",
    "AGENTS.md",
    ".agents/skills/**",
    ".codex/**",
    ".cursor/rules/**",
    ".cursor/hooks/**",
    ".cursor/hooks.json",
    ".cursor/**",
    "config/agent-workflow.json",
    "docs/schemas/**",
    "docs/decisions/**",
    "BUG-SWARM-BACKLOG.md",
    "src/app/api/**",
    "src/lib/api/**",
    "src/lib/auth/**",
    "src/lib/db/**",
    "src/lib/gen/**",
    "src/lib/models/**",
    "src/lib/providers/**",
    "src/lib/integrations/**",
    "scripts/db/**",
    "drizzle/**",
    "config/env-policy.json",
    "**/migrations/**",
  ],
  branchPrefixExemptActors: ["dependabot[bot]"],
  immutableRemoteBranchPatterns: ["*BRA*", "rescue/*"],
  protectedBranchPatterns: [
    "master",
    "main",
    "ema",
    "*BRA*",
    "rescue/*",
    "dependabot/*",
    "archive/*",
  ],
});

function read(root, path) {
  return readFileSync(resolve(root, path), "utf8");
}

function json(root, path) {
  return JSON.parse(read(root, path));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function workflowJob(source, name) {
  const marker = new RegExp(`^  ${escapeRegExp(name)}:\\s*$`, "m");
  const start = source.search(marker);
  if (start < 0) return null;
  const remainder = source.slice(start);
  const firstLineEnd = remainder.indexOf("\n");
  if (firstLineEnd < 0) return remainder;
  const nextJobOffset = remainder.slice(firstLineEnd + 1).search(/^  [a-zA-Z0-9_-]+:\s*$/m);
  const end = nextJobOffset < 0 ? remainder.length : firstLineEnd + 1 + nextJobOffset;
  return remainder.slice(0, end);
}

function workflowEvents(document) {
  const trigger = document?.on;
  if (typeof trigger === "string") return new Set([trigger]);
  if (Array.isArray(trigger)) return new Set(trigger.map(String));
  if (trigger && typeof trigger === "object") return new Set(Object.keys(trigger));
  return new Set();
}

function grantsWrite(permission) {
  if (typeof permission === "string") return permission.toLowerCase() === "write-all";
  if (!permission || typeof permission !== "object") return false;
  return Object.values(permission).some(
    (value) => typeof value === "string" && value.toLowerCase() === "write",
  );
}

export function evaluatePrHeadWorkflowPermissions(workflowSources) {
  const errors = [];
  for (const workflow of workflowSources) {
    let document;
    try {
      document = yaml.load(workflow.source);
    } catch (error) {
      errors.push(
        `${workflow.name} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    if (!workflowEvents(document).has("pull_request")) continue;
    if (document?.permissions === undefined) {
      errors.push(
        `${workflow.name} pull_request workflow must declare explicit read-only permissions`,
      );
      continue;
    }
    if (grantsWrite(document.permissions)) {
      errors.push(
        `${workflow.name} runs PR-head workflow code and must not receive write permissions`,
      );
    }
    for (const [jobName, job] of Object.entries(document.jobs ?? {})) {
      if (grantsWrite(job?.permissions)) {
        errors.push(
          `${workflow.name} job ${jobName} runs PR-head workflow code and must not receive write permissions`,
        );
      }
    }
  }
  return errors;
}

export function requiredCheckOwnerSpec(check, policy = POLICY_FLOORS) {
  const canonical = policy.review?.requiredCheckWorkflow ?? POLICY_FLOORS.review.requiredCheckWorkflow;
  const owners = {
    ...POLICY_FLOORS.requiredCheckOwners,
    ...(policy.requiredCheckOwners ?? {}),
  };
  const owner = owners[check];
  if (!owner) {
    return {
      path: canonical.path,
      event: canonical.event,
      file: String(canonical.path ?? "")
        .split("/")
        .at(-1),
    };
  }
  if (typeof owner === "string") {
    return {
      path: `.github/workflows/${owner}`,
      event: "pull_request",
      file: owner,
    };
  }
  return {
    path: owner.path,
    event: owner.event ?? "pull_request",
    file: String(owner.path ?? "")
      .split("/")
      .at(-1),
  };
}

function ownerWorkflowForRequiredCheck(check, policy = POLICY_FLOORS) {
  return requiredCheckOwnerSpec(check, policy).file;
}

export function evaluateReservedWorkflowCheckNames(workflowSources, policy = POLICY_FLOORS) {
  const errors = [];
  const coreNames = new Set(
    (policy.requiredChecks ?? [])
      .map((name) => String(name).trim().toLowerCase())
      .filter((name) => name && name !== "review-window"),
  );
  const reviewPatterns = (policy.review?.qualifyingCheckPatterns ?? [])
    .map((pattern) => String(pattern).trim().toLowerCase())
    .filter(Boolean);
  const canonicalCoreCounts = new Map([...coreNames].map((name) => [name, 0]));
  for (const workflow of workflowSources) {
    if (/^review-window\.ya?ml$/iu.test(workflow.name)) {
      errors.push(`${workflow.name} is retired; the default-branch controller owns review-window`);
    }
    let document;
    try {
      document = yaml.load(workflow.source);
    } catch {
      continue;
    }
    for (const [jobId, job] of Object.entries(document?.jobs ?? {})) {
      const publishedName = String(job?.name ?? jobId).trim();
      if (publishedName.includes("${{")) {
        errors.push(
          `${workflow.name} job ${jobId} has a dynamic check name that cannot be proven non-reserved`,
        );
      }
      const identities = new Set([String(jobId).trim().toLowerCase(), publishedName.toLowerCase()]);
      for (const identity of identities) {
        if (identity === "review-window") {
          errors.push(`${workflow.name} job ${jobId} may not use reserved identity review-window`);
        }
        if (coreNames.has(identity)) {
          const owner = ownerWorkflowForRequiredCheck(identity, policy);
          if (workflow.name !== owner) {
            errors.push(
              `${workflow.name} job ${jobId} may not use canonical CI identity ${identity}`,
            );
          } else if (identity === publishedName.toLowerCase()) {
            canonicalCoreCounts.set(identity, (canonicalCoreCounts.get(identity) ?? 0) + 1);
          }
        }
        const reviewPattern = reviewPatterns.find((pattern) => identity.includes(pattern));
        if (reviewPattern) {
          errors.push(
            `${workflow.name} job ${jobId} may not impersonate review evidence pattern ${reviewPattern}`,
          );
        }
      }
    }
  }
  for (const [name, count] of canonicalCoreCounts) {
    if (count !== 1) {
      const owner = ownerWorkflowForRequiredCheck(name, policy);
      errors.push(`${owner || "canonical CI workflow"} must publish ${name} exactly once (found ${count})`);
    }
  }
  return errors;
}

export function evaluateRetiredBugIdFloor(source) {
  const ledgerBlock =
    /const RETIRED_ID_LEDGER = Object\.freeze\(\[([\s\S]*?)\]\);/u.exec(source)?.[1] ?? "";
  const retiredIds = [...ledgerBlock.matchAll(/"(SM-\d{3})"/gu)].map((match) => match[1]);
  const digest = createHash("sha256").update(retiredIds.join("\n")).digest("hex");
  return digest === POLICY_FLOORS.retiredBugIdsSha256
    ? []
    : ["immutable retired bug-ID floor changed — historical SM ids must never become reusable"];
}

function values(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null) return [];
  return [String(value)];
}

function includesEvery(actual, required) {
  const available = new Set(values(actual));
  return required.every((value) => available.has(value));
}

function normalizedExpression(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ");
}

function hasExactExpression(actual, expected) {
  return normalizedExpression(actual) === normalizedExpression(expected);
}

const TRUSTED_MASTER_PUSH_OR_DISPATCH =
  "${{ github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') }}";
const REJECT_NON_MASTER_DISPATCH =
  "${{ github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/master' }}";
// Oberoende från controllerns GATE_PR_ACTIONS: workflow-jobbet måste filtrera
// innan GitHub placerar körningen i cancel-in-progress-gruppen. Annars kan ett
// no-op-event avbryta den riktiga gate-körningen utan att publicera ett avslut.
const TRUSTED_REVIEW_GATE_JOB_IF =
  "github.event_name == 'pull_request_target' && " +
  "( github.event.action == 'opened' || github.event.action == 'reopened' || " +
  "github.event.action == 'synchronize' || github.event.action == 'ready_for_review' )";
const TRUSTED_REVIEW_GATE_CONCURRENCY =
  "trusted-review-window-${{ github.event.pull_request.number || github.event.issue.number }}";
// Oberoende golv: ci-scope får inte krympa sin egen allowlist och sedan använda
// samma krympta lista som bevis för att light-lanen täcker allt den lovar.
const SAFE_DOCS_COMMAND_FLOOR = Object.freeze([
  "workflow:contract",
  "docs:check",
  "docs:links",
  "docs:test",
  "plans:history:check",
  "check:terms:contract",
]);
const DB_BLOB_PR_PATH_FLOOR = Object.freeze([
  ".github/workflows/db-blob-sync-check.yml",
  "requirements.dbtest.txt",
  "scripts/db/**/*.py",
]);
const E2E_CONTRACT_SCRIPT = "playwright test -c playwright.deploy-smoke.config.ts --list";

function hasExactStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const values = new Set(actual.map(String));
  return values.size === actual.length && expected.every((value) => values.has(value));
}

const DOSSIER_ACCEPTANCE_MATRIX_IF =
  "${{ !cancelled() && needs.scope.result == 'success' && (github.event_name != 'pull_request' || needs.scope.outputs.run_matrix == 'true') }}";
const DOSSIER_ACCEPTANCE_BUILD_IF = "${{ !cancelled() && needs.discover.result == 'success' }}";

export function evaluateDossierAcceptanceWorkflow(source) {
  const errors = [];
  let document;
  try {
    document = yaml.load(source);
  } catch (error) {
    return [
      `dossier-acceptance is not valid YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }

  const pullRequest = document?.on?.pull_request;
  if (pullRequest === undefined) {
    errors.push("dossier-acceptance must run on every pull_request");
  } else if (pullRequest && typeof pullRequest === "object" && pullRequest.paths) {
    errors.push("dossier-acceptance must not path-filter the pull_request trigger");
  }
  const requiredTypes = [
    "opened",
    "synchronize",
    "reopened",
    "ready_for_review",
    "converted_to_draft",
  ];
  if (pullRequest && typeof pullRequest === "object" && !includesEvery(pullRequest.types, requiredTypes)) {
    errors.push("dossier-acceptance pull_request events must rerun when draft readiness changes");
  }

  const scope = document?.jobs?.scope;
  if (
    !scope ||
    !scope.outputs?.run_matrix ||
    !scope.steps?.some((step) => step.run === "node scripts/dossiers/acceptance-scope.mjs")
  ) {
    errors.push("dossier-acceptance scope must publish fail-closed run_matrix");
  }

  for (const jobName of ["discover", "dependency-registry"]) {
    const job = document?.jobs?.[jobName];
    if (!values(job?.needs).includes("scope") || !hasExactExpression(job?.if, DOSSIER_ACCEPTANCE_MATRIX_IF)) {
      errors.push(`${jobName} may run the expensive dossier matrix only after a successful in-scope decision`);
    }
  }

  const keyless = document?.jobs?.["keyless-production-build"];
  if (
    !includesEvery(keyless?.needs, ["scope", "discover"]) ||
    !hasExactExpression(keyless?.if, DOSSIER_ACCEPTANCE_BUILD_IF)
  ) {
    errors.push("keyless-production-build may run only after a successful in-scope discover job");
  }

  if (!hasExactExpression(document?.jobs?.["verification-evidence"]?.if, "github.event_name != 'pull_request'")) {
    errors.push("verification-evidence must stay off pull-request runs");
  }

  const aggregate = document?.jobs?.["dossier-acceptance"];
  const aggregateNeeds = [
    "scope",
    "discover",
    "verification-evidence",
    "dependency-registry",
    "keyless-production-build",
  ];
  if (!includesEvery(aggregate?.needs, aggregateNeeds)) {
    errors.push("dossier-acceptance must aggregate scope, discover, evidence, registry and keyless builds");
  }
  if (!hasExactExpression(aggregate?.if, "${{ !cancelled() }}")) {
    errors.push(
      "dossier-acceptance must publish after failed/skipped dependencies without surviving cancellation",
    );
  }

  return errors;
}

export function evaluateTrustedReviewWindowGate(source) {
  let document;
  try {
    document = yaml.load(source);
  } catch (error) {
    return [
      `merge-ready freshness is not valid YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }

  const gate = document?.jobs?.["trusted-review-window"];
  const errors = [];
  if (document?.concurrency !== undefined) {
    errors.push(
      "merge-ready freshness must not use workflow-level concurrency across independent controller jobs",
    );
  }
  if (!hasExactExpression(gate?.if, TRUSTED_REVIEW_GATE_JOB_IF)) {
    errors.push(
      "trusted review-window job may enter gate concurrency only for opened, reopened, synchronize and ready_for_review",
    );
  }
  if (!hasExactExpression(gate?.concurrency?.group, TRUSTED_REVIEW_GATE_CONCURRENCY)) {
    errors.push("trusted review-window concurrency must remain isolated per pull request");
  }
  if (gate?.concurrency?.["cancel-in-progress"] !== true) {
    errors.push("trusted review-window must still cancel stale runs for a newer real gate event");
  }
  if (!gate?.steps?.some((step) => step.run === "node scripts/ci/trusted-review-window.mjs gate")) {
    errors.push("trusted review-window gate job must invoke the default-branch controller");
  }
  return errors;
}

/**
 * CI scoping is allowed only inside the workflow. Required job identities must
 * still finish with success, while missing scope output always selects heavy.
 */
export function evaluateCiScopeWorkflow(source, packageScripts) {
  const errors = [];
  let document;
  try {
    document = yaml.load(source);
  } catch (error) {
    return [`CI is not valid YAML: ${error instanceof Error ? error.message : String(error)}`];
  }

  const pullRequest = document?.on?.pull_request;
  const requiredTypes = [
    "opened",
    "synchronize",
    "reopened",
    "ready_for_review",
    "converted_to_draft",
  ];
  if (!includesEvery(pullRequest?.types, requiredTypes)) {
    errors.push("CI pull_request events must rerun scope when draft readiness changes");
  }

  if (!hasExactExpression(document?.concurrency?.group, "ci-${{ github.ref }}")) {
    errors.push("CI concurrency must serialize runs per ref, including master migrations");
  }
  if (
    !hasExactExpression(
      document?.concurrency?.["cancel-in-progress"],
      "${{ github.event_name == 'pull_request' }}",
    )
  ) {
    errors.push("CI may cancel stale PR runs but must never cancel a running master migration");
  }

  const scope = document?.jobs?.scope;
  if (
    !scope ||
    !scope.outputs?.run_heavy ||
    !scope.outputs?.safe_docs_only ||
    !scope.steps?.some((step) => step.run === "node scripts/workflow/ci-scope.mjs") ||
    !scope.steps?.some((step) =>
      hasExactExpression(step.env?.SAJTMASKIN_PR_ACTION, "${{ github.event.action }}"),
    )
  ) {
    errors.push("CI scope job must publish fail-closed profile and draft-action outputs");
  }

  const qualityCore = document?.jobs?.["quality-core"];
  if (
    !values(qualityCore?.needs).includes("scope") ||
    !hasExactExpression(
      qualityCore?.if,
      "${{ !cancelled() && (needs.scope.result != 'success' || needs.scope.outputs.run_heavy != 'false') }}",
    )
  ) {
    errors.push("quality-core may defer work only on an explicit successful light scope");
  }
  const e2eContract = qualityCore?.steps?.find((step) => step.run === "npm run test:e2e:contract");
  if (
    !e2eContract ||
    Object.hasOwn(e2eContract, "continue-on-error") ||
    e2eContract.if !== undefined
  ) {
    errors.push("heavy quality-core must block unconditionally on Playwright E2E discovery");
  }
  if (packageScripts?.["test:e2e:contract"] !== E2E_CONTRACT_SCRIPT) {
    errors.push("test:e2e:contract must retain its exact Playwright discovery command");
  }

  const qualityContracts = document?.jobs?.["quality-contracts"];
  if (
    !values(qualityContracts?.needs).includes("scope") ||
    !hasExactExpression(qualityContracts?.if, "${{ !cancelled() }}")
  ) {
    errors.push("quality-contracts must run after every non-cancelled scope result");
  }
  if (
    SAFE_DOCS_COMMANDS.length !== SAFE_DOCS_COMMAND_FLOOR.length ||
    !SAFE_DOCS_COMMAND_FLOOR.every((command) => SAFE_DOCS_COMMANDS.includes(command))
  ) {
    errors.push("safe docs command allowlist changed below its independent security floor");
  }
  for (const command of SAFE_DOCS_COMMAND_FLOOR) {
    const step = qualityContracts?.steps?.find(
      (candidate) => candidate.run === `npm run ${command}`,
    );
    const expectedCondition =
      command === "docs:test"
        ? "${{ !cancelled() && needs.scope.result == 'success' && needs.scope.outputs.safe_docs_only == 'true' }}"
        : "${{ !cancelled() }}";
    if (!step || !hasExactExpression(step.if, expectedCondition)) {
      errors.push(`light docs scope requires guarded quality-contract coverage for ${command}`);
    }
  }

  const heavyFallback =
    "${{ needs.scope.result != 'success' || needs.scope.outputs.run_heavy != 'false' }}";
  for (const jobName of ["build", "backoffice-tests", "schema-drift", "dead-code"]) {
    const job = document?.jobs?.[jobName];
    if (!job || !values(job.needs).includes("scope")) {
      errors.push(`${jobName} must consume the shared CI scope`);
      continue;
    }
    if (!hasExactExpression(job.if, "${{ !cancelled() }}")) {
      errors.push(`${jobName} must still publish a successful required check on light scope`);
    }
    if (!hasExactExpression(job.env?.RUN_HEAVY, heavyFallback)) {
      errors.push(`${jobName} must fall back to heavy when CI scope is missing or failed`);
    }
    const report = job.steps?.find((step) => step.name === "Report light CI scope");
    if (!hasExactExpression(report?.if, "${{ env.RUN_HEAVY == 'false' }}")) {
      errors.push(`${jobName} must run an explicit successful light-scope receipt`);
    }
    const unguardedHeavy = (job.steps ?? []).filter(
      (step) =>
        step.name !== "Report light CI scope" &&
        !hasExactExpression(step.if, "${{ env.RUN_HEAVY == 'true' }}"),
    );
    if (unguardedHeavy.length > 0) {
      errors.push(`${jobName} has heavy steps outside the shared scope guard`);
    }
  }

  const qualityNeeds = [
    "scope",
    "quality-core",
    "quality-contracts",
    "preview-host-guards",
    "dead-code",
  ];
  if (!includesEvery(document?.jobs?.quality?.needs, qualityNeeds)) {
    errors.push("quality must aggregate scope, core, contracts, preview-host and dead-code");
  }
  if (!hasExactExpression(document?.jobs?.quality?.if, "${{ !cancelled() }}")) {
    errors.push(
      "quality must publish after failed/skipped dependencies without surviving cancellation",
    );
  }

  const deadCode = document?.jobs?.["dead-code"];
  const advisoryKnip = deadCode?.steps?.find((step) => step.run === "npm run knip || true");
  const orphanGate = deadCode?.steps?.find((step) => step.run === "npm run knip:files");
  if (!advisoryKnip || !orphanGate || Object.hasOwn(orphanGate, "continue-on-error")) {
    errors.push("heavy dead-code must retain advisory knip and a blocking orphan-file gate");
  }

  for (const jobName of ["prod-migrations-apply", "prod-migrations-applied", "db-schema-parity"]) {
    if (!hasExactExpression(document?.jobs?.[jobName]?.if, TRUSTED_MASTER_PUSH_OR_DISPATCH)) {
      errors.push(`${jobName} may receive live credentials only on trusted master events`);
    }
  }
  if (
    !includesEvery(document?.jobs?.["prod-migrations-apply"]?.needs, [
      "quality",
      "schema-drift",
      "build",
      "backoffice-tests",
    ])
  ) {
    errors.push("prod migrations must wait for every blocking CI lane");
  }

  return errors;
}

function containsSecretExpression(value) {
  return /\bsecrets\s*(?:\.|\[)/u.test(JSON.stringify(value ?? null));
}

function hasFailingManualRefRejection(document) {
  const job = document?.jobs?.["reject-untrusted-manual-ref"];
  const rejectingStep = job?.steps?.find(
    (step) =>
      step.name === "Reject secret-bearing dispatch outside master" &&
      String(step.run ?? "")
        .trim()
        .endsWith("exit 1") &&
      step["continue-on-error"] === undefined,
  );
  return (
    hasExactExpression(job?.if, REJECT_NON_MASTER_DISPATCH) &&
    job?.["continue-on-error"] === undefined &&
    Boolean(rejectingStep) &&
    !containsSecretExpression(job)
  );
}

/**
 * Repo secrets may never be evaluated by code checked out from a manually
 * selected feature ref. The explicit rejection job makes that misuse red;
 * exact job/step guards keep the secret-bearing paths closed independently.
 */
export function evaluateSecretWorkflowDispatches(dbBlobSource, dbParitySource) {
  const errors = [];
  const workflows = [];
  for (const [name, source] of [
    ["db-blob-sync-check.yml", dbBlobSource],
    ["db-schema-parity.yml", dbParitySource],
  ]) {
    try {
      workflows.push([name, yaml.load(source)]);
    } catch (error) {
      errors.push(
        `${name} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (errors.length > 0) return errors;

  const documents = Object.fromEntries(workflows);
  const blob = documents["db-blob-sync-check.yml"];
  const parity = documents["db-schema-parity.yml"];
  for (const [name, document] of workflows) {
    const workflowLevel = { ...(document ?? {}), jobs: {} };
    if (containsSecretExpression(workflowLevel)) {
      errors.push(`${name} may not expose repo secrets at workflow level`);
    }
    if (!hasFailingManualRefRejection(document)) {
      errors.push(`${name} must fail visibly before a non-master manual dispatch can run`);
    }
  }

  const blobEvents = blob?.on;
  if (
    !hasExactStringSet(blobEvents?.pull_request?.branches, ["master"]) ||
    !hasExactStringSet(blobEvents?.pull_request?.paths, DB_BLOB_PR_PATH_FLOOR) ||
    blobEvents?.pull_request?.["paths-ignore"] !== undefined
  ) {
    errors.push("DB/Blob PR trigger must use the exact executable-input path allowlist");
  }
  if (
    !hasExactStringSet(blobEvents?.push?.branches, ["master"]) ||
    blobEvents?.push?.paths !== undefined ||
    blobEvents?.push?.["paths-ignore"] !== undefined ||
    !Object.hasOwn(blobEvents ?? {}, "workflow_dispatch")
  ) {
    errors.push("DB/Blob live verification must remain unfiltered on master and dispatch");
  }

  const blobJob = blob?.jobs?.["db-blob-sync"];
  const trustedBlobJob =
    "${{ github.event_name == 'pull_request' || (github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')) }}";
  if (!hasExactExpression(blobJob?.if, trustedBlobJob)) {
    errors.push("DB/Blob job must exclude non-master manual refs before checkout");
  }
  if (Object.hasOwn(blobJob ?? {}, "continue-on-error")) {
    errors.push("DB/Blob verification job must remain blocking on relevant events");
  }
  if (containsSecretExpression({ ...blobJob, steps: [] })) {
    errors.push("DB/Blob secrets must stay on an individually master-guarded step");
  }
  const blobInstall = blobJob?.steps?.find(
    (step) =>
      step.run === "python -m pip install --disable-pip-version-check -r requirements.dbtest.txt",
  );
  const blobUnit = blobJob?.steps?.find(
    (step) =>
      step["working-directory"] === "scripts/db" &&
      step.run === "python -m unittest test_pydatabastest -v",
  );
  const blobPrSmoke = blobJob?.steps?.find(
    (step) =>
      step.run === "python scripts/db/pydatabastest.py --ci" &&
      hasExactExpression(step.if, "${{ github.event_name == 'pull_request' }}"),
  );
  if (
    !blobInstall ||
    blobInstall.if !== undefined ||
    Object.hasOwn(blobInstall, "continue-on-error") ||
    !blobUnit ||
    blobUnit.if !== undefined ||
    Object.hasOwn(blobUnit, "continue-on-error") ||
    !blobPrSmoke ||
    Object.hasOwn(blobPrSmoke, "continue-on-error") ||
    containsSecretExpression(blobPrSmoke)
  ) {
    errors.push("DB/Blob PR smoke must execute every allowlisted Python input without secrets");
  }
  let blobSecretSteps = 0;
  for (const [jobName, job] of Object.entries(blob?.jobs ?? {})) {
    if (jobName !== "db-blob-sync" && containsSecretExpression(job)) {
      errors.push("DB/Blob secrets must stay inside the guarded DB/Blob job");
    }
    for (const step of job?.steps ?? []) {
      if (!containsSecretExpression(step)) continue;
      blobSecretSteps += 1;
      if (
        jobName !== "db-blob-sync" ||
        !hasExactExpression(step.if, TRUSTED_MASTER_PUSH_OR_DISPATCH) ||
        Object.hasOwn(step, "continue-on-error")
      ) {
        errors.push(
          "every DB/Blob secret-bearing step must block and require trusted master explicitly",
        );
      }
    }
  }
  if (blobSecretSteps === 0) {
    errors.push("DB/Blob workflow lost its guarded live verification step");
  }

  const parityJob = parity?.jobs?.["db-schema-parity-scheduled"];
  const trustedParityJob =
    "${{ github.ref == 'refs/heads/master' && (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') }}";
  if (!hasExactExpression(parityJob?.if, trustedParityJob)) {
    errors.push("scheduled schema parity must exclude non-master manual refs before checkout");
  }
  let paritySecretSteps = 0;
  for (const [jobName, job] of Object.entries(parity?.jobs ?? {})) {
    if (!containsSecretExpression(job)) continue;
    paritySecretSteps += (job.steps ?? []).filter(containsSecretExpression).length;
    if (jobName !== "db-schema-parity-scheduled") {
      errors.push("schema-parity secrets must stay inside the master-guarded job");
    }
  }
  if (paritySecretSteps === 0) {
    errors.push("schema-parity workflow lost its guarded live verification step");
  }

  return errors;
}

export function evaluatePolicyFloors(policy) {
  const errors = [];
  const requireValues = (label, actual, floor) => {
    const values = new Set(Array.isArray(actual) ? actual : []);
    for (const required of floor) {
      if (!values.has(required)) errors.push(`${label} security floor missing: ${required}`);
    }
  };

  requireValues("requiredChecks", policy.requiredChecks, POLICY_FLOORS.requiredChecks);
  requireValues(
    "manualMergePathPrefixes",
    policy.manualMergePathPrefixes,
    POLICY_FLOORS.manualMergePathPrefixes,
  );
  if (
    policy.review?.requiredCheckWorkflow?.path !==
      POLICY_FLOORS.review.requiredCheckWorkflow.path ||
    policy.review?.requiredCheckWorkflow?.event !== POLICY_FLOORS.review.requiredCheckWorkflow.event
  ) {
    errors.push("review.requiredCheckWorkflow security floor changed");
  }
  requireValues(
    "review.qualifyingCheckPatterns",
    policy.review?.qualifyingCheckPatterns,
    POLICY_FLOORS.review.qualifyingCheckPatterns,
  );
  requireValues(
    "review.securityVetoCheckPatterns",
    policy.review?.securityVetoCheckPatterns,
    POLICY_FLOORS.review.securityVetoCheckPatterns,
  );
  requireValues(
    "review.deploymentCheckNames",
    policy.review?.deploymentCheckNames,
    POLICY_FLOORS.review.deploymentCheckNames,
  );
  const qualifyingPatterns = new Set(
    (policy.review?.qualifyingCheckPatterns ?? []).map((pattern) => pattern.toLowerCase()),
  );
  for (const vetoPattern of policy.review?.securityVetoCheckPatterns ?? []) {
    if (qualifyingPatterns.has(vetoPattern.toLowerCase())) {
      errors.push(`security veto pattern must not qualify as review receipt: ${vetoPattern}`);
    }
  }
  for (const [profile, floor] of Object.entries(POLICY_FLOORS.verificationProfiles)) {
    requireValues(`verificationProfiles.${profile}`, policy.verificationProfiles?.[profile], floor);
  }
  for (const [group, floor] of Object.entries(POLICY_FLOORS.pathGroups)) {
    requireValues(`pathGroups.${group}`, policy.pathGroups?.[group], floor);
  }
  requireValues("protectedPaths", policy.protectedPaths, POLICY_FLOORS.protectedPaths);
  requireValues(
    "immutableRemoteBranchPatterns",
    policy.immutableRemoteBranchPatterns,
    POLICY_FLOORS.immutableRemoteBranchPatterns,
  );
  requireValues(
    "protectedBranchPatterns",
    policy.protectedBranchPatterns,
    POLICY_FLOORS.protectedBranchPatterns,
  );

  const allowedExemptActors = new Set(
    POLICY_FLOORS.branchPrefixExemptActors.map((actor) => actor.toLowerCase()),
  );
  for (const actor of policy.branchPrefixExemptActors ?? []) {
    if (!allowedExemptActors.has(String(actor).toLowerCase())) {
      errors.push(`branchPrefixExemptActors contains non-approved actor: ${actor}`);
    }
  }
  return errors;
}

/** @param {any} policy @param {Record<string, string | undefined>} [env] */
export function evaluateCiBranch(policy, env = process.env) {
  const event = (env.GITHUB_EVENT_NAME ?? "").trim();
  if (env.GITHUB_ACTIONS !== "true" || !["pull_request", "pull_request_target"].includes(event)) {
    return null;
  }

  const prefixes = policy.allowedBranchPrefixes ?? [];
  if (prefixes.length === 0) return null;

  const actor = (env.GITHUB_ACTOR ?? "").trim().toLowerCase();
  const exemptActors = new Set(
    (policy.branchPrefixExemptActors ?? []).map((login) => login.toLowerCase()),
  );
  if (actor && exemptActors.has(actor)) return null;

  const base = (env.GITHUB_BASE_REF ?? "").trim();
  if (base && base !== policy.trunk) return null;

  const branch = (env.GITHUB_HEAD_REF ?? "").trim();
  if (!branch) return "CI branch policy saknar GITHUB_HEAD_REF för pull request";
  if (!prefixes.some((prefix) => branch.startsWith(prefix))) {
    return `PR-branch \"${branch}\" saknar tillåtet prefix (${prefixes.join(", ")})`;
  }
  return null;
}

export function evaluateWorkflowContract(root = REPO_ROOT, env = process.env) {
  const errors = [];
  const policy = json(root, "config/agent-workflow.json");
  const schema = json(root, "docs/schemas/strict/agent-workflow.schema.json");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validate(policy)) {
    for (const error of validate.errors ?? []) {
      errors.push(`agent-workflow schema: ${error.instancePath || "/"} ${error.message}`);
    }
  }
  errors.push(...evaluatePolicyFloors(policy));
  if (typeof policy.directMaster?.allowed !== "boolean") {
    errors.push("directMaster.allowed must be a boolean");
  }
  if (policy.review.maxBotWaitSeconds < policy.review.minHeadAgeSeconds) {
    errors.push("max bot wait must not be shorter than the current-head review window");
  }
  if (policy.review.maxSignoffWaitSeconds < policy.review.maxBotWaitSeconds) {
    errors.push("max sign-off wait must not be shorter than the bot wait deadline");
  }
  const ciBranchError = evaluateCiBranch(policy, env);
  if (ciBranchError) errors.push(ciBranchError);

  const pkg = json(root, "package.json");
  const commands = new Set(Object.values(policy.verificationProfiles).flat());
  for (const command of commands) {
    if (!pkg.scripts?.[command])
      errors.push(`verification command missing in package.json: ${command}`);
  }
  if (String(pkg.scripts?.["test:ci"] ?? "").includes("godnatt")) {
    errors.push("test:ci must not invoke godnatt-bugg; keep that command on-demand");
  }
  if (!pkg.scripts?.["test:godnatt-bugg"]) {
    errors.push("test:godnatt-bugg command missing in package.json");
  }

  const schemas = json(root, "config/control-plane/schema-registry.json").entries;
  const policies = json(root, "config/control-plane/policy-registry.json").entries;
  if (!schemas.some((entry) => entry.id === "agent-workflow-schema")) {
    errors.push("control-plane missing agent-workflow-schema");
  }
  for (const id of ["agent-context-policy", "agent-workflow-policy"]) {
    if (!policies.some((entry) => entry.id === id)) errors.push(`control-plane missing ${id}`);
  }

  const backlogValidator = read(root, "scripts/dev/check-bug-backlog.mjs");
  errors.push(...evaluateRetiredBugIdFloor(backlogValidator));

  const prAiReview = read(root, ".github/workflows/pr-ai-review.yml");
  const prAiReviewer = read(root, "scripts/pr-review/run.mjs");
  const prAiAutomation = read(root, "scripts/pr-review/automation.mjs");
  const prAiReceipt = read(root, "scripts/pr-review/receipt.mjs");
  if (
    !prAiReview.includes("checks: write") ||
    !prAiReview.includes("id: review") ||
    !prAiReview.includes("if: steps.review.outcome == 'success'") ||
    !prAiReview.includes("run: node scripts/pr-review/receipt.mjs") ||
    !prAiReviewer.includes("writeReviewRunResult(env.PR_REVIEW_RESULT_PATH, result)") ||
    !prAiAutomation.includes('kind: "receipt-recovery"') ||
    !prAiAutomation.includes("verifiedCurrentReview") ||
    !prAiAutomation.includes("resolutionLedger") ||
    !prAiAutomation.includes("snapshot?.headSha === review.commitId") ||
    !prAiReceipt.includes('TRUSTED_REVIEW_CHECK_NAME = "trusted-pr-ai-review"') ||
    !prAiReceipt.includes("publishedReview?.reviewId === reviewId") ||
    !prAiReceipt.includes("runResult.review.headSha !== currentHeadSha") ||
    !prAiReceipt.includes('path: "/check-runs"')
  ) {
    errors.push(
      "trusted PR AI receipt must require a successful qualifying review of the live PR head",
    );
  }

  const freshness = read(root, ".github/workflows/merge-ready-freshness.yml");
  errors.push(...evaluateTrustedReviewWindowGate(freshness));
  if (!freshness.includes("pull_request_target:")) {
    errors.push("merge-ready freshness must use trusted pull_request_target");
  }
  if (!freshness.includes("ref: ${{ github.event.repository.default_branch }}")) {
    errors.push("merge-ready freshness must checkout trusted default branch");
  }
  if (/sender\.login != 'github-actions\[bot\]'/.test(freshness)) {
    errors.push("merge-ready freshness must not ignore PR AI findings from github-actions[bot]");
  }
  const freshnessValidator = read(root, "scripts/ci/merge-ready-freshness.mjs");
  const trustedReviewWindow = read(root, "scripts/ci/trusted-review-window.mjs");
  const workflowSources = readdirSync(resolve(root, ".github/workflows"))
    .filter((name) => /\.ya?ml$/u.test(name))
    .map((name) => ({ name, source: read(root, `.github/workflows/${name}`) }));
  errors.push(...evaluateReservedWorkflowCheckNames(workflowSources, policy));
  errors.push(...evaluatePrHeadWorkflowPermissions(workflowSources));
  for (const workflow of workflowSources) {
    let events = new Set();
    try {
      events = workflowEvents(yaml.load(workflow.source));
    } catch {
      continue;
    }
    if (events.has("pull_request_review") || events.has("pull_request_review_comment")) {
      errors.push(
        `${workflow.name} must not listen to PR-ref review events; final merge re-reads reviews from trusted issue_comment code`,
      );
    }
  }
  const dependabotWorkflow =
    workflowSources.find(({ name }) => name === "dependabot-safe-classify.yml")?.source ?? "";
  let dependabotEvents = new Set();
  try {
    dependabotEvents = workflowEvents(yaml.load(dependabotWorkflow));
  } catch {
    // Den generella YAML-valideringen ovan rapporterar det exakta parse-felet.
  }
  if (
    !dependabotEvents.has("pull_request_target") ||
    dependabotEvents.has("pull_request") ||
    dependabotWorkflow.includes("actions/checkout") ||
    dependabotWorkflow.includes("gh pr merge") ||
    dependabotWorkflow.includes("DEPENDABOT_AUTOMERGE_ENABLED") ||
    !dependabotWorkflow.includes("if: always()") ||
    !dependabotWorkflow.includes("steps.meta.outcome == 'success'") ||
    !dependabotWorkflow.includes("--force") ||
    !dependabotWorkflow.includes('--remove-label "dependabot-patch-safe"') ||
    !dependabotWorkflow.includes("github.event.pull_request.user.login == 'dependabot[bot]'") ||
    !dependabotWorkflow.includes(
      "github.event.pull_request.head.repo.full_name == github.repository",
    )
  ) {
    errors.push(
      "Dependabot classifier must run default-branch code, never checkout PR-head or merge",
    );
  }
  let privilegedEvents = [];
  try {
    privilegedEvents = [...workflowEvents(yaml.load(freshness))];
  } catch {
    // Den generella YAML-valideringen ovan rapporterar det exakta parse-felet.
  }
  if (
    privilegedEvents.length !== 3 ||
    !["pull_request_target", "issue_comment", "push"].every((event) =>
      privilegedEvents.includes(event),
    )
  ) {
    errors.push(
      "write-capable merge-ready workflow may only use default-branch pull_request_target, issue_comment and master push events",
    );
  }
  if (
    !freshnessValidator.includes(
      'TRUSTED_SIGNOFF_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"])',
    ) ||
    !freshnessValidator.includes('type !== "user"') ||
    !freshnessValidator.includes("export function validateMergeReadySignoff")
  ) {
    errors.push("merge-ready sign-off must be human-authored and identity-bound");
  }
  if (
    !freshness.includes("actions: read") ||
    !freshness.includes("checks: write") ||
    !freshness.includes("node scripts/ci/trusted-review-window.mjs gate") ||
    !freshness.includes("node scripts/ci/trusted-review-window.mjs invalidate-base") ||
    !trustedReviewWindow.includes('const CHECK_NAME = "review-window"') ||
    !trustedReviewWindow.includes(
      'const EXTERNAL_ID_PREFIX = "sajtmaskin-trusted-review-window:v1:"',
    ) ||
    !trustedReviewWindow.includes("head_sha: headSha") ||
    !trustedReviewWindow.includes('conclusion: "action_required"') ||
    !trustedReviewWindow.includes("validateMergeReadySignoff") ||
    !trustedReviewWindow.includes("latestInvalidatingFindingEpoch") ||
    !trustedReviewWindow.includes("validateTrustedPrAiEvidence") ||
    !trustedReviewWindow.includes("/actions/runs?check_suite_id=") ||
    !trustedReviewWindow.includes("job.check_run_url") ||
    !trustedReviewWindow.includes("fullDatabaseId") ||
    !trustedReviewWindow.includes("updatedAt") ||
    !trustedReviewWindow.includes('endsWith("[bot]")') ||
    !trustedReviewWindow.includes("review.updated_at") ||
    !trustedReviewWindow.includes("policy.review.requiredCheckWorkflow") ||
    !trustedReviewWindow.includes("requiredCheckOwnerSpec") ||
    !trustedReviewWindow.includes("latest owned required-check workflow/job") ||
    !trustedReviewWindow.includes("run.provenance?.workflowRun?.created_at") ||
    !trustedReviewWindow.includes("manualMergeFiles") ||
    !trustedReviewWindow.includes("policy.requiredChecks.filter") ||
    !trustedReviewWindow.includes("policy.review.maxSignoffWaitSeconds") ||
    !trustedReviewWindow.includes("export function shouldRunTrustedGate") ||
    !trustedReviewWindow.includes("export function isIntegrityGateFailure")
  ) {
    errors.push(
      "trusted default-branch controller must publish the head-bound required review-window",
    );
  }
  if (
    !trustedReviewWindow.includes("new Set(policy.review.deploymentCheckNames ?? [])") ||
    !trustedReviewWindow.includes("deploymentPending === 0") ||
    !trustedReviewWindow.includes("deploymentFailed === 0")
  ) {
    errors.push(
      "trusted review-window must block exact present deployment failures or pending runs",
    );
  }
  if (
    !freshness.includes("node scripts/ci/trusted-review-window.mjs merge") ||
    !freshness.includes("group: trusted-master-merge") ||
    !freshness.includes("actions: write") ||
    !freshness.includes("contents: write") ||
    !freshness.includes("COMMENT_ID: ${{ github.event.comment.id }}") ||
    !freshnessValidator.includes("validateMergeExecuteMandate") ||
    !freshnessValidator.includes("TRUSTED_SIGNOFF_ASSOCIATIONS.has(association)") ||
    !trustedReviewWindow.includes("mergeEvidenceFingerprint") ||
    !trustedReviewWindow.includes("const second = await readAndValidate()") ||
    !trustedReviewWindow.includes("const final = await readAndValidate()") ||
    !trustedReviewWindow.includes('body: { sha: expectedHeadSha, merge_method: "squash" }') ||
    !trustedReviewWindow.includes("/compare/${liveBaseSha}...${expectedHeadSha}") ||
    !trustedReviewWindow.includes(
      "await invalidateForBasePush({ client, baseSha: mergedBaseSha })",
    ) ||
    !trustedReviewWindow.includes('for (const workflow of ["ci.yml", "db-blob-sync-check.yml"])') ||
    !trustedReviewWindow.includes("POST_MERGE_VERIFICATION_FAILED")
  ) {
    errors.push(
      "final merge must require a trusted exact mandate, stable double live evidence and expected-head squash CAS",
    );
  }

  const ci = read(root, ".github/workflows/ci.yml");
  const dbBlobSync = read(root, ".github/workflows/db-blob-sync-check.yml");
  const dbSchemaParity = read(root, ".github/workflows/db-schema-parity.yml");
  const dossierAcceptance = read(root, ".github/workflows/dossier-acceptance.yml");
  errors.push(...evaluateCiScopeWorkflow(ci, pkg.scripts));
  errors.push(...evaluateDossierAcceptanceWorkflow(dossierAcceptance));
  errors.push(...evaluateSecretWorkflowDispatches(dbBlobSync, dbSchemaParity));
  if (!ci.includes("workflow_dispatch: {}") || !dbBlobSync.includes("workflow_dispatch: {}")) {
    errors.push("post-merge CI and DB/blob verification must remain workflow-dispatchable");
  }
  if (!/^permissions:\s*\n\s+contents:\s+read\s*\n\s+pull-requests:\s+read\s*$/mu.test(ci)) {
    errors.push("PR-head CI must have only read access to contents and pull requests");
  }
  const checkoutCount = (ci.match(/uses:\s+actions\/checkout@v7/gu) ?? []).length;
  const nonPersistingCheckoutCount = (ci.match(/persist-credentials:\s+false/gu) ?? []).length;
  if (checkoutCount === 0 || nonPersistingCheckoutCount !== checkoutCount) {
    errors.push("every PR-head CI checkout must disable persisted GitHub credentials");
  }
  const allWorkflowJobs = `${ci}\n${freshness}\n${dossierAcceptance}`;
  for (const check of policy.requiredChecks) {
    // `review-window` is a policy-owned check run published by the trusted
    // default-branch controller above, not a PR-head workflow job.
    if (check === "review-window") continue;
    if (!new RegExp(`^  ${escapeRegExp(check)}:`, "m").test(allWorkflowJobs)) {
      errors.push(`required check has no workflow job: ${check}`);
    }
  }
  for (const job of ["quality-core", "quality-contracts", "quality"]) {
    if (!new RegExp(`^  ${job}:`, "m").test(ci)) errors.push(`CI missing ${job} job`);
  }
  const deadCodeJob = workflowJob(ci, "dead-code");
  if (!deadCodeJob) errors.push("CI missing dead-code job");
  const previewHostJob = workflowJob(ci, "preview-host-guards");
  if (
    !previewHostJob ||
    !/working-directory: preview-host[\s\S]*?run: npm ci --no-audit --no-fund/.test(
      previewHostJob,
    ) ||
    !String(pkg.scripts?.["preview-host:verify"] ?? "").startsWith("npm --prefix preview-host ci ")
  ) {
    errors.push("preview-host verification must use its tracked lockfile through npm ci");
  }

  const gitRule = read(root, ".cursor/rules/git.mdc");
  if (!gitRule.includes("config/agent-workflow.json")) {
    errors.push("git.mdc must route workflow values to config/agent-workflow.json");
  }
  if (!/force-push/i.test(gitRule)) errors.push("git.mdc must explicitly forbid force-push");
  const mergeRule = read(root, ".cursor/rules/pr-merge.mdc");
  if (!mergeRule.includes("config/agent-workflow.json")) {
    errors.push("pr-merge.mdc must route checks and timing to config/agent-workflow.json");
  }
  const agentEntry = read(root, "AGENTS.md");
  const workflowRule = read(root, ".cursor/rules/workflow.mdc");
  const prWorkflow = read(root, ".agents/skills/pr-workflow/SKILL.md");
  for (const [name, source] of [
    ["AGENTS.md", agentEntry],
    ["pr-workflow skill", prWorkflow],
    ["workflow.mdc", workflowRule],
  ]) {
    if (
      !source.includes("npm run verify:pr -- --plan") ||
      !/(?:GitHub Actions|\bCI\b)/u.test(source) ||
      !/rikt(?:ade kontroller|at)/iu.test(source)
    ) {
      errors.push(`${name} must assign local planning/targeted checks and full verification to CI`);
    }
    if (/`npm run verify:pr` före push|efter ny head-SHA:\s*kör lokal verifiering/iu.test(source)) {
      errors.push(`${name} must not require a bare full local verify:pr run for every push or SHA`);
    }
  }
  if (!mergeRule.includes("required GitHub-checks") || /Kör `npm run verify:pr`/u.test(mergeRule)) {
    errors.push(
      "pr-merge.mdc must use current-head GitHub checks instead of a bare local full run",
    );
  }

  const hooks = json(root, ".cursor/hooks.json");
  const beforeShell = hooks.hooks?.beforeShellExecution ?? [];
  const commitGuard = beforeShell.find((hook) => /commit-guard\.mjs$/.test(hook.command));
  if (!commitGuard || commitGuard.failClosed !== true) {
    errors.push("Cursor commit guard must use shared impact logic and fail closed");
  }
  const worktreeGuard = beforeShell.find((hook) => /worktree-force-guard\.mjs$/.test(hook.command));
  if (!worktreeGuard || worktreeGuard.failClosed !== true) {
    errors.push("Cursor worktree removal guard must fail closed");
  }
  if (!existsSync(resolve(root, ".github/pull_request_template.md"))) {
    errors.push("missing pull request template");
  } else {
    const template = read(root, ".github/pull_request_template.md");
    if (!template.includes("npm run verify:pr -- --plan")) {
      errors.push("pull request template must require the local verify:pr plan");
    }
    if (/^- \[ \] `npm run verify:pr`\s*$/mu.test(template)) {
      errors.push("pull request template must not require a bare full local verify:pr run");
    }
    if (!template.includes("Körda riktade kontroller")) {
      errors.push("pull request template must record targeted local checks");
    }
    if (!template.includes("aktuell head-SHA")) {
      errors.push("pull request template must require GitHub checks for the current head SHA");
    }
  }
  const hookInstaller = read(root, "scripts/dev/install-git-hooks.mjs");
  if (
    !hookInstaller.includes('"pre-push"') ||
    !hookInstaller.includes("npm run verify:pr -- --plan")
  ) {
    errors.push("managed git hooks must install the fail-closed verify:pr --plan pre-push gate");
  }
  if (commitGuard?.matcher === ".*" || worktreeGuard?.matcher === ".*") {
    errors.push("Cursor shell guards must not match every command");
  }
  if (!String(pkg.scripts?.["backoffice:test"] ?? "").includes("assert-git-checkout-unchanged")) {
    errors.push("backoffice:test must wrap the suite in the checkout-isolation guard");
  }
  if (!hookInstaller.includes("refs/heads/*BRA*|refs/heads/rescue/*")) {
    errors.push("managed pre-push must reject every update to immutable backup branches");
  }
  if (
    !hookInstaller.includes("git status --porcelain --untracked-files=normal") ||
    !hookInstaller.includes("existingVersion > desiredVersion") ||
    !hookInstaller.includes("SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA")
  ) {
    errors.push(
      "managed pre-push must bind clean HEAD, block hook downgrades and proof-gate remote delete",
    );
  }
  const godnattCleanup = read(root, ".agents/skills/godnatt-bugg/references/pr-merge-cleanup.md");
  if (
    !godnattCleanup.includes("REMOTE_SHA=${REMOTE_REF%%[[:space:]]*}") ||
    !godnattCleanup.includes('--force-with-lease="refs/heads/$PASS_BRANCH:$PASS_SHA"') ||
    !godnattCleanup.includes('SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA="$PASS_SHA"')
  ) {
    errors.push("Godnatt cleanup must lease remote deletion to the exact merged head SHA");
  }
  if (!prWorkflow.includes("npm run hooks:install")) {
    errors.push("canonical PR workflow must install the managed local hooks");
  }
  if (
    !prWorkflow.includes("rapporteras som `FRI`") ||
    prWorkflow.indexOf("npm run tidy`") > prWorkflow.indexOf("npm run worktree:remove")
  ) {
    errors.push("canonical cleanup must require tidy FRI proof before worktree removal");
  }
  const worktreeWrapper = read(root, "scripts/cursor/worktree.mjs");
  if (
    !worktreeWrapper.includes("classifyRemovalLifecycle") ||
    !worktreeWrapper.includes("lifecycle.openHeads.has(branch)") ||
    !worktreeWrapper.includes("SAJTMASKIN_DISCARD_REASON")
  ) {
    errors.push("worktree removal wrapper must recompute PR/merge lifecycle fail-closed");
  }
  if (
    !worktreeWrapper.includes('const source = join(mainWorktree, ".cursor", "mcp.json.example")') ||
    worktreeWrapper.includes('const live = join(mainWorktree, ".cursor", "mcp.json")')
  ) {
    errors.push("worktree setup must seed MCP only from the tracked public example");
  }
  const worktreeIncludeEntries = read(root, ".worktreeinclude")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const sensitiveWorktreeIncludes = worktreeIncludeEntries.filter((entry) =>
    /(^|[\\/])\.env($|[.\\/])|(^|[\\/])mcp\.json$|secret|credential|token/iu.test(entry),
  );
  if (sensitiveWorktreeIncludes.length > 0) {
    errors.push(
      `.worktreeinclude must not copy machine-local secrets: ${sensitiveWorktreeIncludes.join(", ")}`,
    );
  }
  const codexConfig = read(root, ".codex/config.toml");
  if (
    !/^approval_policy\s*=\s*"on-request"\s*$/mu.test(codexConfig) ||
    !/^sandbox_mode\s*=\s*"workspace-write"\s*$/mu.test(codexConfig) ||
    !/^web_search\s*=\s*"cached"\s*$/mu.test(codexConfig) ||
    /danger-full-access|web_search\s*=\s*"live"/u.test(codexConfig)
  ) {
    errors.push("project Codex defaults must remain interactive, workspace-scoped and cached");
  }
  const decide818 = read(root, ".agents/skills/818-swarm-decide/SKILL.md");
  if (!decide818.includes("../pr-workflow/SKILL.md") || !decide818.includes("before writing")) {
    errors.push("818 decision flow must enter canonical pr-workflow before edits");
  }
  const tidySource = read(root, "scripts/dev/tidy.mjs");
  if (!tidySource.includes("config/agent-workflow.json") || tidySource.includes("SKYDDADE = [")) {
    errors.push("tidy protected branch patterns must come from central workflow policy");
  }
  const gitignore = read(root, ".gitignore");
  if (!gitignore.includes("!.agents/skills/pr-workflow/**")) {
    errors.push(".gitignore must publish the canonical pr-workflow skill to fresh clones");
  }
  if (!gitignore.split(/\r?\n/u).includes(".cursor/worktrees/")) {
    errors.push(".gitignore must ignore nested Cursor worktrees under .cursor/");
  }
  if (!read(root, ".cursorignore").split(/\r?\n/u).includes(".cursor/worktrees/")) {
    errors.push(".cursorignore must block reads of nested .cursor/worktrees");
  }

  return { errors, policy };
}

function main() {
  const { errors, policy } = evaluateWorkflowContract();
  if (errors.length > 0) {
    for (const error of errors) console.error(`[workflow-contract] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[workflow-contract] OK — trunk=${policy.trunk}, review=${policy.review.minHeadAgeSeconds}s, checks=${policy.requiredChecks.join(",")}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
