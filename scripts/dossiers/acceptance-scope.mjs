#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changedFilesForEvent } from "../workflow/ci-scope.mjs";
import { pathMatchesPattern } from "../workflow/path-impact.mjs";
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
 * PRs to master (promote) and every scheduled/manual run build the complete
 * catalog. Preview PRs and Preview pushes never run it; they only report which
 * dossiers their diff touches (`deferredDossiers`).
 *
 * @param {{
 *   eventName?: string,
 *   ref?: string,
 *   baseRef?: string,
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
  baseSha,
  headSha,
  cwd = REPO_ROOT,
  gitCommand,
} = {}) {
  const event = String(eventName ?? "").trim();
  // A corrupt catalog is a failed classifier, never a green empty matrix.
  const catalog = acceptanceCatalog(cwd);
  const full = { dossiers: catalog.map(entry => entry.id), matrixMode: "full" };
  // Production and an absent/unknown target must build the complete current
  // catalog before merge. This is the promote gate.
  if (event === "pull_request" && baseRef !== "preview") {
    return { ...full, runMatrix: true, reason: "non-preview-pr-full", files: [], matched: [], classificationError: null };
  }
  // Ägarbeslut 2026-10-22 (docs/decisions/README.md): the matrix — one isolated
  // install + typecheck + production build per dossier — was the single
  // largest GitHub Actions cost, and it ran on every Preview PR head and every
  // Preview push. It now runs only where code heads for production (PRs to
  // master, i.e. promote) plus the weekly schedule and manual runs. Preview
  // PRs and pushes still classify the diff so the log names what the promote
  // run will cover; nothing they report can turn the matrix on.
  if ((event === "pull_request" && baseRef === "preview") || (event === "push" && ref === "refs/heads/preview")) {
    let files = [];
    let matched = [];
    let classificationError = null;
    try {
      files = changedFilesForEvent({ eventName: event, baseSha, headSha, cwd, gitCommand });
      matched = files.filter((path) => matchesAcceptanceContract(path));
    } catch (error) {
      classificationError = error instanceof Error ? error.message : String(error);
    }
    const wouldSelect = matched.length > 0
      ? selectAffectedDossiers(matched, catalog)
      : { dossiers: [], matrixMode: "none" };
    return {
      dossiers: [],
      matrixMode: "none",
      runMatrix: false,
      reason: "deferred-to-promote",
      files,
      matched,
      deferredDossiers: wouldSelect.dossiers,
      classificationError,
    };
  }
  return {
    ...full,
    runMatrix: true,
    reason: `trusted-${event || "unknown"}-full`,
    files: [],
    matched: [],
    classificationError: null,
  };
}

function writeOutput(path, key, value) {
  appendFileSync(path, `${key}=${String(value)}\n`, "utf8");
}

async function main() {
  const decision = decideAcceptanceScope({
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
      decision.runMatrix
        ? "::warning title=Dossier acceptance fell back to full matrix::Changed-file classification failed; the matrix will run."
        : "::warning title=Dossier acceptance classification failed::The matrix is deferred to promote either way; only the informational diff summary is missing.",
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
      `files=${decision.files.length} matched=${decision.matched.length} selected=${decision.dossiers.length} mode=${decision.matrixMode}` +
      (decision.reason === "deferred-to-promote"
        ? ` deferred=${decision.deferredDossiers.length ? decision.deferredDossiers.join(",") : "none"}`
        : ""),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
