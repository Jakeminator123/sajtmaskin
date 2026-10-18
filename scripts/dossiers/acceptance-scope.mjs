#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changedFilesForEvent } from "../workflow/ci-scope.mjs";
import { pathMatchesPattern } from "../workflow/path-impact.mjs";
import { verifiedPushBaseline } from "../workflow/push-baseline.mjs";
import { DOSSIER_ACCEPTANCE_PATHS } from "./acceptance-paths.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function matchesAcceptanceContract(path) {
  return DOSSIER_ACCEPTANCE_PATHS.some((pattern) => pathMatchesPattern(path, pattern));
}

/**
 * Decide whether this event must run the expensive dossier matrix.
 *
 * PRs and proven fast-forward preview pushes use the same path contract.
 * Other events and classification errors run the complete matrix.
 *
 * @param {{
 *   eventName?: string,
 *   ref?: string,
 *   baselineVerified?: boolean,
 *   baseSha?: string,
 *   headSha?: string,
 *   cwd?: string,
 *   gitCommand?: (...args: unknown[]) => { status?: number, stdout?: string, stderr?: string, error?: Error },
 * }} [input]
 */
export function decideAcceptanceScope({
  eventName,
  ref = "",
  baselineVerified = false,
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand,
} = {}) {
  const event = String(eventName ?? "").trim();
  if (event !== "pull_request" && !(event === "push" && ref === "refs/heads/preview" && baselineVerified)) {
    return {
      runMatrix: true,
      reason: `trusted-${event || "unknown"}-full`,
      files: [],
      matched: [],
      classificationError: null,
    };
  }

  try {
    const files = changedFilesForEvent({ eventName: event, baseSha, headSha, cwd, gitCommand });
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

async function main() {
  const baselineVerified = process.env.GITHUB_EVENT_NAME === "push" &&
    process.env.GITHUB_REF === "refs/heads/preview" &&
    await verifiedPushBaseline({ workflow: "dossier-acceptance.yml" });
  const decision = decideAcceptanceScope({
    baselineVerified,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
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
