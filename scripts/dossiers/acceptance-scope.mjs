#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changedFilesForPullRequest } from "../workflow/ci-scope.mjs";
import { pathMatchesPattern } from "../workflow/path-impact.mjs";
import { DOSSIER_ACCEPTANCE_PATHS } from "./acceptance-paths.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function matchesAcceptanceContract(path) {
  return DOSSIER_ACCEPTANCE_PATHS.some((pattern) => pathMatchesPattern(path, pattern));
}

/**
 * Decide whether this event must run the expensive dossier matrix.
 *
 * Non-PR events always run. PR classification errors fail closed to the
 * matrix so a broken diff never looks like a legitimate skip. An empty or
 * out-of-contract PR diff is a legitimate skip.
 */
export function decideAcceptanceScope({
  eventName,
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand,
} = {}) {
  const event = String(eventName ?? "").trim();
  if (event !== "pull_request") {
    return {
      runMatrix: true,
      reason: `trusted-${event || "unknown"}-full`,
      files: [],
      matched: [],
      classificationError: null,
    };
  }

  try {
    const files = changedFilesForPullRequest({ baseSha, headSha, cwd, gitCommand });
    const matched = files.filter((path) => matchesAcceptanceContract(path));
    if (matched.length === 0) {
      return {
        runMatrix: false,
        reason: files.length === 0 ? "empty-diff" : "out-of-contract",
        files,
        matched,
        classificationError: null,
      };
    }
    return {
      runMatrix: true,
      reason: "in-contract",
      files,
      matched,
      classificationError: null,
    };
  } catch (error) {
    return {
      runMatrix: true,
      reason: "classification-error",
      files: [],
      matched: [],
      classificationError: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeOutput(path, key, value) {
  appendFileSync(path, `${key}=${String(value)}\n`, "utf8");
}

function main() {
  const decision = decideAcceptanceScope({
    eventName: process.env.GITHUB_EVENT_NAME,
    baseSha: process.env.SAJTMASKIN_PR_BASE_SHA,
    headSha: process.env.SAJTMASKIN_PR_HEAD_SHA,
  });

  if (decision.classificationError) {
    console.warn(
      "::warning title=Dossier acceptance fell back to full matrix::Changed-file classification failed; the matrix will run.",
    );
    console.warn(
      `[acceptance-scope] classification detail: ${decision.classificationError.replace(/[\r\n]+/gu, " ")}`,
    );
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    writeOutput(outputPath, "run_matrix", decision.runMatrix);
    writeOutput(outputPath, "reason", decision.reason);
  }

  console.log(
    `[acceptance-scope] matrix=${decision.runMatrix} reason=${decision.reason} ` +
      `files=${decision.files.length} matched=${decision.matched.length}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
