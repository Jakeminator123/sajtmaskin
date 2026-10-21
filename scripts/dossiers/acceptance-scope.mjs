#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changedFilesForEvent } from "../workflow/ci-scope.mjs";
import { pathMatchesPattern, PATH_GROUP_FLOORS } from "../workflow/path-impact.mjs";
import { verifiedPushBaseline } from "../workflow/push-baseline.mjs";
import { DOSSIER_ACCEPTANCE_PATHS } from "./acceptance-paths.mjs";
import { acceptanceCatalog } from "./list-acceptance-matrix.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function matchesAcceptanceContract(path) {
  return DOSSIER_ACCEPTANCE_PATHS.some((pattern) => pathMatchesPattern(path, pattern));
}

/** Each acceptance project reads one dossier. Shared scaffold/export/UI inputs
 * (including their transitive consumers) always select the full catalog. A
 * removed/renamed/file-less/unknown dossier cannot prove a smaller matrix. */
export function selectAffectedDossiers(paths, catalog) {
  const all = catalog.map(entry => entry.id);
  const selected = new Set();
  for (const path of paths) {
    // Dependency completion consults every manifest when resolving npm ranges.
    // A manifest can therefore affect consumers outside its own dossier.
    if (path.endsWith("/manifest.json")) return { dossiers: all, matrixMode: "full" };
    const match = /^data\/dossiers\/(hard|soft)\/([a-z0-9][a-z0-9-]*)\//.exec(path);
    if (!match || !catalog.some(entry => entry.class === match[1] && entry.id === match[2])) {
      return { dossiers: all, matrixMode: "full" };
    }
    selected.add(match[2]);
  }
  return selected.size ? { dossiers: [...selected].sort(), matrixMode: "affected" }
    : { dossiers: all, matrixMode: "full" };
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
 *   baseRef?: string,
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
  baseRef = "",
  baselineVerified = false,
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand,
} = {}) {
  const event = String(eventName ?? "").trim();
  // A corrupt catalog is a failed classifier, never a green empty matrix.
  const catalog = acceptanceCatalog(cwd);
  const full = { dossiers: catalog.map(entry => entry.id), matrixMode: "full" };
  // Incremental PR coverage is a Preview-only optimization. Production and an
  // absent/unknown target must build the complete current catalog before merge.
  if (event === "pull_request" && baseRef !== "preview") {
    return { ...full, runMatrix: true, reason: "non-preview-pr-full", files: [], matched: [], classificationError: null };
  }
  if (event !== "pull_request" && !(event === "push" && ref === "refs/heads/preview" && baselineVerified)) {
    return {
      ...full,
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
    const unknown = files.filter(path => !Object.values(PATH_GROUP_FLOORS).flat().some(pattern => pathMatchesPattern(path, pattern)) && !matchesAcceptanceContract(path));
    if (unknown.length) return { ...full, runMatrix: true, reason: "unknown-path", files, matched, classificationError: null };
    if (matched.length === 0) {
      return {
        dossiers: [], matrixMode: "none",
        runMatrix: false,
        reason: files.length === 0 ? "empty-diff" : "out-of-contract",
        files,
        matched,
        classificationError: null,
      };
    }
    return {
      ...selectAffectedDossiers(matched, catalog),
      runMatrix: true,
      reason: "in-contract",
      files,
      matched,
      classificationError: null,
    };
  } catch (error) {
    return {
      ...full,
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
    baseRef: process.env.SAJTMASKIN_PR_BASE_REF,
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
    writeOutput(outputPath, "dossiers", JSON.stringify(decision.dossiers));
    writeOutput(outputPath, "matrix_mode", decision.matrixMode);
  }

  console.log(
    `[acceptance-scope] matrix=${decision.runMatrix} reason=${decision.reason} ` +
      `files=${decision.files.length} matched=${decision.matched.length} selected=${decision.dossiers.length} mode=${decision.matrixMode}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
