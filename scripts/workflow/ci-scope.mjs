#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectImpact, loadWorkflowInputs, parseGitNameStatus } from "./path-impact.mjs";
import { verifiedPushBaseline } from "./push-baseline.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Vanlig klassificerad runtime får vänta på full CI tills en draft märks ready;
// control-plane-registret är inte en komplett owner-map, så saknad registerowner
// är information och inte i sig högrisk. Dessa ytor är däremot för riskfyllda
// för att någonsin ta draft-genvägen: de styr CI, dependencies, data-/control-
// plane eller fristående verifieringslanes.
export const HIGH_RISK_GROUPS = Object.freeze([
  "agent",
  "controlPlane",
  "backoffice",
  "database",
  "dependencies",
  "ci",
  "previewHost",
  "observability",
  "e2e",
]);

// Den lätta profilen kör exakt dessa impact-kommandon i quality-contracts.
// Allt annat kräver full CI, även om den redigerbara path-policyn också råkar
// matcha filändelsen som dokumentation.
export const SAFE_DOCS_COMMANDS = Object.freeze([
  "workflow:contract",
  "test:discovery:check",
  "docs:check",
  "docs:links",
  "docs:test",
  "plans:history:check",
  "check:terms:contract",
]);

const SAFE_DOCS_COMMAND_SET = new Set(SAFE_DOCS_COMMANDS);
const SAFE_DOCS_EXTENSION = /\.(?:md|mdx)$/iu;

function nonEmpty(values) {
  return Array.isArray(values) && values.length > 0;
}

function booleanValue(value) {
  return value === true || String(value).trim().toLowerCase() === "true";
}

function isAllowlistedDocsPath(path) {
  return path === "README.md" || (path.startsWith("docs/") && SAFE_DOCS_EXTENSION.test(path));
}

function collectSafeDocsBlockers({ impact, files, docs, highRisk }) {
  const blockers = [];
  if (highRisk) blockers.push("high-risk");
  if (!files.every((path) => docs.has(path))) blockers.push("not-exclusively-docs-group");
  if (!files.every(isAllowlistedDocsPath)) blockers.push("outside-safe-docs-allowlist");

  const nonDocsGroups = Object.entries(impact?.groups ?? {})
    .filter(([group, paths]) => group !== "docs" && nonEmpty(paths))
    .map(([group]) => group);
  for (const group of nonDocsGroups) blockers.push(`non-docs-group:${group}`);

  if (nonEmpty(impact?.backofficePages)) blockers.push("backoffice-page");
  if (nonEmpty(impact?.authorities)) blockers.push("authority");
  if (nonEmpty(impact?.manualValidators)) blockers.push("manual-validator");

  const commands = new Set(impact?.commands ?? []);
  for (const command of commands) {
    if (!SAFE_DOCS_COMMAND_SET.has(command)) blockers.push(`extra-command:${command}`);
  }
  for (const command of SAFE_DOCS_COMMANDS) {
    if (!commands.has(command)) blockers.push(`missing-light-command:${command}`);
  }
  return [...new Set(blockers)];
}

/**
 * Decide which CI profile is safe for one already-classified diff.
 *
 * Only an exclusive, non-protected documentation diff may skip heavy checks
 * on ready PRs or proven preview pushes. Master stays full. Drafts may also
 * defer ordinary runtime checks, because
 * GitHub cannot merge a draft and `ready_for_review` starts a fresh full run.
 * Protected, unknown and control-plane-like paths always stay fail-closed.
 */
export function decideCiScope({
  eventName,
  eventAction = "",
  isDraft = false,
  ref = "",
  baseRef = "",
  impact,
}) {
  const event = String(eventName ?? "").trim();
  const action = String(eventAction ?? "").trim();
  const scopedEvent =
    (event === "pull_request" && baseRef !== "master") ||
    (event === "push" && ref === "refs/heads/preview");
  const files = impact?.files ?? [];
  const docs = new Set(impact?.groups?.docs ?? []);
  const highRiskReasons = [];

  if (files.length === 0) highRiskReasons.push("empty-diff");
  if (nonEmpty(impact?.protectedFiles)) highRiskReasons.push("protected");
  if (nonEmpty(impact?.unclassifiedFiles)) highRiskReasons.push("unclassified");
  if ((impact?.authorities ?? []).some((entry) => entry.ciStatus === "hard")) {
    highRiskReasons.push("hard-authority");
  }
  for (const group of HIGH_RISK_GROUPS) {
    if (nonEmpty(impact?.groups?.[group])) highRiskReasons.push(group);
  }

  const highRisk = highRiskReasons.length > 0;
  const runPreviewHost =
    !scopedEvent ||
    files.length === 0 ||
    nonEmpty(impact?.unclassifiedFiles) ||
    nonEmpty(impact?.groups?.previewHost) ||
    nonEmpty(impact?.groups?.ci) ||
    nonEmpty(impact?.groups?.dependencies);
  const safeDocsBlockers = collectSafeDocsBlockers({ impact, files, docs, highRisk });
  const safeDocsOnly = scopedEvent && files.length > 0 && safeDocsBlockers.length === 0;

  const effectiveDraft =
    action === "ready_for_review"
      ? false
      : action === "converted_to_draft"
        ? true
        : booleanValue(isDraft);

  let runHeavy = true;
  let reason = `trusted-${event || "unknown"}-full`;
  if (scopedEvent) {
    if (highRisk) {
      reason = `high-risk:${highRiskReasons.join(",")}`;
    } else if (safeDocsOnly) {
      runHeavy = false;
      reason = "safe-docs-only";
    } else if (event === "pull_request" && effectiveDraft) {
      runHeavy = false;
      reason = "draft-low-risk";
    } else {
      reason = event === "push" ? "preview-runtime" : "ready-runtime";
    }
  }

  return {
    runHeavy,
    safeDocsOnly,
    highRisk,
    runPreviewHost,
    reason,
    files,
    highRiskReasons,
    safeDocsBlockers,
  };
}

// PRs compare against the merge base; pushes compare the exact previous tip.
// A new/recreated branch or non-fast-forward push is not a provable shortcut.
export function changedFilesForEvent({
  eventName,
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand = spawnSync,
}) {
  const validSha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
  if (![baseSha, headSha].every((sha) => validSha.test(String(sha ?? "")) && !/^0+$/u.test(sha))) {
    throw new Error("changed-file scope requires valid nonzero base and head SHAs");
  }
  if (eventName !== "pull_request" && eventName !== "push") {
    throw new Error("changed-file scope only supports PR and push events");
  }
  const options = { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: false };
  if (eventName === "push") {
    const ancestor = gitCommand("git", ["merge-base", "--is-ancestor", baseSha, headSha], options);
    if (ancestor.error) throw ancestor.error;
    if (ancestor.status !== 0) throw new Error("push base is missing or not an ancestor of head");
  }

  const result = gitCommand(
    "git",
    [
      "diff",
      "--name-status",
      "-z",
      "--diff-filter=ACDMRTUXB",
      `${baseSha}${eventName === "push" ? ".." : "..."}${headSha}`,
    ],
    options,
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git diff failed").trim());
  }
  return parseGitNameStatus(result.stdout);
}

/**
 * Resolve a workflow event into a CI decision. Classification errors never
 * become a shortcut: they return the heavy profile and keep required checks
 * alive. A syntax/startup error in this file still makes the workflow jobs use
 * their own `scope.result/output` fallback to heavy.
 */
export function resolveCiScope({
  eventName,
  eventAction = "",
  isDraft = false,
  ref = "",
  baseRef = "",
  baselineVerified = false,
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand = spawnSync,
  inputs,
}) {
  const event = String(eventName ?? "").trim();
  if (
    (event !== "pull_request" && !(event === "push" && ref === "refs/heads/preview" && baselineVerified)) ||
    (event === "pull_request" && baseRef === "master")
  ) {
    return {
      runHeavy: true,
      safeDocsOnly: false,
      highRisk: true,
      runPreviewHost: true,
      reason: `trusted-${event || "unknown"}-full`,
      files: [],
      highRiskReasons: ["trusted-event"],
      safeDocsBlockers: ["trusted-event"],
      classificationError: null,
    };
  }

  try {
    const changedFiles = changedFilesForEvent({
      eventName: event,
      baseSha,
      headSha,
      cwd,
      gitCommand,
    });
    const impact = collectImpact({
      ...(inputs ?? loadWorkflowInputs(cwd)),
      changedFiles,
    });
    return {
      ...decideCiScope({ eventName: event, eventAction, isDraft, ref, baseRef, impact }),
      classificationError: null,
    };
  } catch (error) {
    return {
      runHeavy: true,
      safeDocsOnly: false,
      highRisk: true,
      runPreviewHost: true,
      reason: "classification-error",
      files: [],
      highRiskReasons: ["classification-error"],
      safeDocsBlockers: ["classification-error"],
      classificationError: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeOutput(path, key, value) {
  appendFileSync(path, `${key}=${String(value)}\n`, "utf8");
}

async function main() {
  const baselineVerified = process.env.GITHUB_EVENT_NAME === "push" &&
    process.env.GITHUB_REF === "refs/heads/preview" &&
    await verifiedPushBaseline({ workflow: "ci.yml" });
  const decision = resolveCiScope({
    baselineVerified,
    eventName: process.env.GITHUB_EVENT_NAME,
    eventAction: process.env.SAJTMASKIN_PR_ACTION,
    isDraft: process.env.SAJTMASKIN_PR_DRAFT,
    ref: process.env.GITHUB_REF,
    baseRef: process.env.GITHUB_BASE_REF,
    baseSha:
      process.env.GITHUB_EVENT_NAME === "push"
        ? process.env.SAJTMASKIN_PUSH_BASE_SHA
        : process.env.SAJTMASKIN_PR_BASE_SHA,
    headSha:
      process.env.GITHUB_EVENT_NAME === "push"
        ? process.env.GITHUB_SHA
        : process.env.SAJTMASKIN_PR_HEAD_SHA,
  });

  if (decision.classificationError) {
    console.warn(
      "::warning title=CI scope fell back to full::Changed-file classification failed; full CI will run.",
    );
    console.warn(
      `[ci-scope] classification detail: ${decision.classificationError.replace(/[\r\n]+/gu, " ")}`,
    );
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    writeOutput(outputPath, "run_heavy", decision.runHeavy);
    writeOutput(outputPath, "safe_docs_only", decision.safeDocsOnly);
    writeOutput(outputPath, "run_preview_host", decision.runPreviewHost);
    writeOutput(outputPath, "high_risk", decision.highRisk);
    writeOutput(outputPath, "reason", decision.reason);
  }

  console.log(
    `[ci-scope] heavy=${decision.runHeavy} docs-only=${decision.safeDocsOnly} ` +
      `high-risk=${decision.highRisk} reason=${decision.reason} files=${decision.files.length}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
