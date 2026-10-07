#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, SHA, assertClean, assertReviewRuntime, command, git, runBugpass, loadReview } from "./bugpass.mjs";
import { reviewStatus, nextRound, followUpDigest, validateReviewChain } from "./bugpass-state.mjs";

const CACHE = join(ROOT, "node_modules/.cache/sajtmaskin-preview");

export function validatePrepared(receipt, base, head) {
  if (!SHA.test(base) || !SHA.test(head) || receipt?.version !== 3 || receipt.base !== base ||
      receipt.head !== head || receipt.verification !== "verify:pr:plan" ||
      !Number.isFinite(Date.parse(receipt.plannedAt)) || receipt.postPushReview !== "required") {
    throw new Error("No current prepared preview receipt. Run npm run preview:prepare.");
  }
}

// Same local contract as PRs: plan here, targeted tests by the author, full CI remotely.
// This receipt deliberately does not attest that any tests or model review ran.
export function preparePreview(base, head, previous, actions) {
  actions.plan(base);
  const current = actions.readState();
  if (current.base !== base || current.head !== head) throw new Error("Preview or HEAD moved during preparation; prepare again.");
  return {
    version: 3, base, head, verification: "verify:pr:plan", plannedAt: new Date().toISOString(),
    postPushReview: "required", previous: previous ? { base: previous.base, head: previous.head } : null,
    previousContext: followUpDigest(previous),
  };
}

export function requireConfirmation(value, head) {
  if (!SHA.test(head) || value !== head) throw new Error(
    `Är du säker på att du vill pusha ${head} till preview? Bekräfta först, kör sedan npm run preview:push -- --confirm ${head}`);
}

export function checkPrepared(base, head) {
  assertClean();
  if (git(["rev-parse", "HEAD"]) !== head) throw new Error("Prepared HEAD changed.");
  const receipt = JSON.parse(readFileSync(join(CACHE, `${head}.json`), "utf8"));
  validatePrepared(receipt, base, head);
  return receipt;
}

// Publishing and reviewing are separate states. A review failure cannot undo a successful push.
export function reviewPublished(publication) {
  if (publication.version !== 2 || !SHA.test(publication.base) || !SHA.test(publication.head) ||
      !Number.isFinite(Date.parse(publication.publishedAt))) throw new Error("Invalid publication receipt.");
  git(["merge-base", "--is-ancestor", publication.head, "HEAD"]);
  const live = git(["ls-remote", "origin", "refs/heads/preview"]).split(/\s/)[0];
  if (live !== publication.head) throw new Error("Published preview was superseded; coordinate with its current owner before review/fix.");
  const result = runBugpass(publication.base, publication.previous, publication.publishedAt, publication.head);
  const status = reviewStatus(result.review, result.decisions);
  console.log(`[preview] PUBLISHED ${publication.head}; review ${status}. CI and Vercel must be checked separately.`);
  if (!["clear", "acceptable-with-follow-up"].includes(status)) process.exitCode = 2;
  return result;
}

export function selectPreviousReview(base, explicit, publication, readReview = loadReview) {
  let previous = explicit ? readReview(explicit.base, explicit.head) : null;
  if (previous) validateReviewChain(previous, readReview);
  if (previous && previous.head !== base) throw new Error("Follow-up must start from the reviewed live preview head.");
  if (publication) {
    if (publication.version !== 2 || publication.head !== base || !SHA.test(publication.base)) throw new Error("Invalid previous publication receipt.");
    // Missing/incomplete review also stops. Never erase pending work by starting a new cycle.
    const publishedReview = readReview(publication.base, publication.head);
    validateReviewChain(publishedReview, readReview);
    if (publishedReview.publishedAt !== publication.publishedAt) throw new Error("Previous publication still needs its post-push review.");
    if (["needs-triage", "needs-fix", "incomplete"].includes(reviewStatus(publishedReview.review, publishedReview.decisions))) {
      if (previous && (previous.base !== publishedReview.base || previous.head !== publishedReview.head)) throw new Error("Cannot bypass the unresolved publication review.");
      previous = publishedReview;
    }
  }
  nextRound(previous);
  return previous;
}

function previousPublication(base) {
  const file = join(CACHE, `${base}.published.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

export function publishAndReview(base, head, prepared, actions) {
  actions.push(); // Failure here must never start a review or claim publication.
  const publication = { version: 2, base, head, previous: prepared.previous, publishedAt: new Date().toISOString() };
  console.log(`[preview] PUBLISHED ${head}. Starting independent post-push Buggpass; results return to this publishing agent.`);
  try {
    actions.save(publication);
    return actions.review(publication);
  } catch (error) {
    throw new Error(`PUSH SUCCEEDED but review is not complete: ${error.message}. Do not push again. Resume the recorded publication with --review-published ${head}; if saving failed, run npm run bugpass -- --base ${base} after checking the live head.`);
  }
}

export function previewState() {
  const remote = git(["remote", "get-url", "--push", "--all", "origin"]);
  if (!/^(https:\/\/github\.com\/|git@github\.com:)Jakeminator123\/sajtmaskin(?:\.git)?$/.test(remote)) {
    throw new Error("origin push URL is not the expected Sajtmaskin repository.");
  }
  git(["fetch", "origin", "preview", "--quiet"]);
  const base = git(["rev-parse", "FETCH_HEAD"]);
  const head = git(["rev-parse", "HEAD"]);
  assertClean();
  if (!SHA.test(base) || !SHA.test(head) || base === head) throw new Error("No new preview change.");
  git(["merge-base", "--is-ancestor", base, head]);
  return { base, head };
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--hook" && args.length === 3) {
    if (process.env.SAJTMASKIN_PREVIEW_WRAPPER_HEAD !== args[2]) throw new Error("Use npm run preview:push after human confirmation; raw preview push is not supported.");
    checkPrepared(args[1], args[2]);
    return;
  }
  if (args[0] === "--review-published" && args.length === 2 && SHA.test(args[1])) {
    reviewPublished(JSON.parse(readFileSync(join(CACHE, `${args[1]}.published.json`), "utf8")));
    return;
  }
  const isPrepare = args[0] === "--prepare" && (args.length === 1 ||
    (args.length === 3 && args[1] === "--previous" && /^[a-f0-9]{40}:[a-f0-9]{40}$/.test(args[2])));
  if (!isPrepare &&
      !(args.length === 2 && args[0] === "--confirm" && SHA.test(args[1]))) {
    throw new Error("Use npm run preview:prepare, then npm run preview:push -- --confirm <approved HEAD SHA>.");
  }
  const { base, head } = previewState();
  if (args[0] === "--prepare") {
    const previousPair = args[2]?.split(":");
    const previous = selectPreviousReview(base, previousPair ? { base: previousPair[0], head: previousPair[1] } : null, previousPublication(base));
    const prepared = preparePreview(base, head, previous, {
      plan: () => command(process.execPath, ["scripts/workflow/verify-pr.mjs", "--plan", "--no-fetch", "--base", base], { stdio: "inherit" }),
      readState: previewState,
    });
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(join(CACHE, `${head}.json`), JSON.stringify(prepared, null, 2));
    console.log(`[preview] Plan prepared for ${head}; no tests or model review run. Complete/report relevant targeted checks per workflow.mdc before asking Jakob: Är du säker på att du vill pusha till preview? Nothing pushed.`);
    return;
  }
  requireConfirmation(args[1], head);
  const prepared = checkPrepared(base, head);
  const currentPrevious = selectPreviousReview(base, prepared.previous, previousPublication(base));
  if (followUpDigest(currentPrevious) !== prepared.previousContext) throw new Error("Previous findings/triage changed since preparation; prepare again before publication.");
  assertReviewRuntime(); // Availability/safety only; the actual review starts AFTER successful push.
  publishAndReview(base, head, prepared, {
    push: () => command("git", ["push", "origin", `${head}:refs/heads/preview`], {
      stdio: "inherit", env: { ...process.env, SAJTMASKIN_PREVIEW_WRAPPER_HEAD: head },
    }),
    save: (publication) => writeFileSync(join(CACHE, `${head}.published.json`), JSON.stringify(publication, null, 2)),
    review: reviewPublished,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`[preview] STOP: ${error.message}`); process.exitCode = 1; }
}
