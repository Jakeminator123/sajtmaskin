#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import yaml from "js-yaml";
import { PATH_GROUP_FLOORS } from "./path-impact.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Avsiktlig konstitutionell duplicering. Den redigerbara policyn får lägga till
// skydd, men får inte kunna sänka sin egen verifiering och sedan godkänna sig
// själv. Att ändra golvet kräver därför en synlig kod- och teständring under
// scripts/workflow/.
export const POLICY_FLOORS = Object.freeze({
  retiredBugIdsSha256: "6cb7f4b94e167f05471dd6c08ae928672927a41a972856992ca2a1cbd54b5634",
  requiredChecks: ["quality", "backoffice-tests", "schema-drift", "build", "review-window"],
  manualMergePathPrefixes: [".github/workflows/"],
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
    "codex/workspace",
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

export function evaluateReservedWorkflowCheckNames(workflowSources, policy = POLICY_FLOORS) {
  const errors = [];
  const canonicalWorkflow = String(policy.review?.requiredCheckWorkflow?.path ?? "")
    .split("/")
    .at(-1);
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
          if (workflow.name !== canonicalWorkflow) {
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
      errors.push(
        `${canonicalWorkflow || "canonical CI workflow"} must publish ${name} exactly once (found ${count})`,
      );
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

  const actor = (env.GITHUB_ACTOR ?? "").trim().toLowerCase();
  const exemptActors = new Set(
    (policy.branchPrefixExemptActors ?? []).map((login) => login.toLowerCase()),
  );
  if (actor && exemptActors.has(actor)) return null;

  const base = (env.GITHUB_BASE_REF ?? "").trim();
  if (base && base !== policy.trunk) return null;

  const branch = (env.GITHUB_HEAD_REF ?? "").trim();
  if (!branch) return "CI branch policy saknar GITHUB_HEAD_REF för pull request";
  if (!policy.allowedBranchPrefixes.some((prefix) => branch.startsWith(prefix))) {
    return `PR-branch \"${branch}\" saknar tillåtet prefix (${policy.allowedBranchPrefixes.join(", ")})`;
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
  if (policy.directMaster.allowed !== false) {
    errors.push("direct master must stay closed in the normal agent workflow");
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
    !trustedReviewWindow.includes("run.provenance?.workflowRun?.created_at") ||
    !trustedReviewWindow.includes("manualMergeFiles") ||
    !trustedReviewWindow.includes("policy.requiredChecks.filter") ||
    !trustedReviewWindow.includes("policy.review.maxSignoffWaitSeconds")
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
  const allWorkflowJobs = `${ci}\n${freshness}`;
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
  if (
    !/quality:\s*[\s\S]*?needs:\s*\[quality-core, quality-contracts, preview-host-guards, dead-code\]/m.test(
      ci,
    )
  ) {
    errors.push("quality must aggregate core, contracts, preview-host guards and dead-code gate");
  }
  const deadCodeJob = workflowJob(ci, "dead-code");
  if (!deadCodeJob) {
    errors.push("CI missing dead-code job");
  } else if (
    /paths-filter|steps\.filter|Skip dead-code/.test(deadCodeJob) ||
    !/name: Orphan-file gate \(blocking\)\s*\n\s*run: npm run knip:files/.test(deadCodeJob)
  ) {
    errors.push("dead-code orphan gate must run unconditionally for every CI change");
  }
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
  } else if (!read(root, ".github/pull_request_template.md").includes("npm run verify:pr")) {
    errors.push("pull request template must require verify:pr");
  }
  const hookInstaller = read(root, "scripts/dev/install-git-hooks.mjs");
  if (!hookInstaller.includes('"pre-push"') || !hookInstaller.includes("npm run verify:pr")) {
    errors.push("managed git hooks must install the fail-closed verify:pr pre-push gate");
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
  const prWorkflow = read(root, ".agents/skills/pr-workflow/SKILL.md");
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
