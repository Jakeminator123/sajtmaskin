#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectImpact, loadWorkflowInputs, parseGitNameStatus } from "./path-impact.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Runtimekod med en känd owner får vänta på full CI tills en draft märks ready.
// Dessa ytor är däremot för riskfyllda för att någonsin ta draft-genvägen: de
// styr CI, dependencies, data-/control-plane eller fristående verifieringslanes.
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
 * after a PR is ready. Drafts may also defer ordinary runtime checks, because
 * GitHub cannot merge a draft and `ready_for_review` starts a fresh full run.
 * Protected, unknown and control-plane-like paths always stay fail-closed.
 */
export function decideCiScope({ eventName, eventAction = "", isDraft = false, impact }) {
  const event = String(eventName ?? "").trim();
  const action = String(eventAction ?? "").trim();
  const files = impact?.files ?? [];
  const docs = new Set(impact?.groups?.docs ?? []);
  const highRiskReasons = [];

  if (files.length === 0) highRiskReasons.push("empty-diff");
  if (nonEmpty(impact?.protectedFiles)) highRiskReasons.push("protected");
  if (nonEmpty(impact?.unclassifiedFiles)) highRiskReasons.push("unclassified");
  if (nonEmpty(impact?.unmappedRuntimeFiles)) highRiskReasons.push("unmapped-runtime");
  if ((impact?.authorities ?? []).some((entry) => entry.ciStatus === "hard")) {
    highRiskReasons.push("hard-authority");
  }
  for (const group of HIGH_RISK_GROUPS) {
    if (nonEmpty(impact?.groups?.[group])) highRiskReasons.push(group);
  }

  const highRisk = highRiskReasons.length > 0;
  const safeDocsBlockers = collectSafeDocsBlockers({ impact, files, docs, highRisk });
  const safeDocsOnly =
    event === "pull_request" && files.length > 0 && safeDocsBlockers.length === 0;

  const effectiveDraft =
    action === "ready_for_review"
      ? false
      : action === "converted_to_draft"
        ? true
        : booleanValue(isDraft);

  let runHeavy = true;
  let reason = `trusted-${event || "unknown"}-full`;
  if (event === "pull_request") {
    if (highRisk) {
      reason = `high-risk:${highRiskReasons.join(",")}`;
    } else if (safeDocsOnly) {
      runHeavy = false;
      reason = "safe-docs-only";
    } else if (effectiveDraft) {
      runHeavy = false;
      reason = "draft-low-risk";
    } else {
      reason = "ready-runtime";
    }
  }

  return {
    runHeavy,
    safeDocsOnly,
    highRisk,
    reason,
    files,
    highRiskReasons,
    safeDocsBlockers,
  };
}

export function changedFilesForPullRequest({
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand = spawnSync,
}) {
  const validSha = /^[0-9a-f]{40,64}$/iu;
  if (!validSha.test(String(baseSha ?? "")) || !validSha.test(String(headSha ?? ""))) {
    throw new Error("pull-request scope requires valid base and head SHAs");
  }

  const result = gitCommand(
    "git",
    ["diff", "--name-status", "-z", "--diff-filter=ACDMRTUXB", `${baseSha}...${headSha}`],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      shell: false,
    },
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
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand = spawnSync,
  inputs,
}) {
  const event = String(eventName ?? "").trim();
  if (event !== "pull_request") {
    return {
      runHeavy: true,
      safeDocsOnly: false,
      highRisk: true,
      reason: `trusted-${event || "unknown"}-full`,
      files: [],
      highRiskReasons: ["trusted-event"],
      safeDocsBlockers: ["trusted-event"],
      classificationError: null,
    };
  }

  try {
    const changedFiles = changedFilesForPullRequest({ baseSha, headSha, cwd, gitCommand });
    const impact = collectImpact({
      ...(inputs ?? loadWorkflowInputs(cwd)),
      changedFiles,
    });
    return {
      ...decideCiScope({ eventName: event, eventAction, isDraft, impact }),
      classificationError: null,
    };
  } catch (error) {
    return {
      runHeavy: true,
      safeDocsOnly: false,
      highRisk: true,
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

function main() {
  const decision = resolveCiScope({
    eventName: process.env.GITHUB_EVENT_NAME,
    eventAction: process.env.SAJTMASKIN_PR_ACTION,
    isDraft: process.env.SAJTMASKIN_PR_DRAFT,
    baseSha: process.env.SAJTMASKIN_PR_BASE_SHA,
    headSha: process.env.SAJTMASKIN_PR_HEAD_SHA,
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
    writeOutput(outputPath, "high_risk", decision.highRisk);
    writeOutput(outputPath, "reason", decision.reason);
  }

  console.log(
    `[ci-scope] heavy=${decision.runHeavy} docs-only=${decision.safeDocsOnly} ` +
      `high-risk=${decision.highRisk} reason=${decision.reason} files=${decision.files.length}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
