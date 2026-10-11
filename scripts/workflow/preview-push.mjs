#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, SHA, assertClean, command, git, readyReview, reviewProof } from "./bugpass.mjs";

const CACHE = join(ROOT, "node_modules/.cache/sajtmaskin-preview");

export function validatePrepared(receipt, base, head, proof) {
  if (!SHA.test(base) || !SHA.test(head) || receipt?.version !== 4 || receipt.base !== base || receipt.head !== head ||
      receipt.verification !== "verify:pr:plan" || !Number.isFinite(Date.parse(receipt.plannedAt)) ||
      !/^[a-f0-9]{64}$/.test(proof ?? "") || receipt.reviewProof !== proof)
    throw new Error("No current prepared review/plan receipt. Complete Buggpass, then run npm run preview:prepare.");
}

// The review already exists. Preparation plans tests; it does not claim to run them.
export function preparePreview(base, head, actions) {
  const proof = actions.reviewProof();
  actions.plan(base);
  const current = actions.readState();
  if (current.base !== base || current.head !== head || actions.reviewProof() !== proof)
    throw new Error("Preview, HEAD or review/triage changed during preparation; prepare again.");
  return { version: 4, base, head, verification: "verify:pr:plan", plannedAt: new Date().toISOString(), reviewProof: proof };
}

export function requireConfirmation(value, head) {
  if (!SHA.test(head) || value !== head) throw new Error(
    `Är du säker på att du vill pusha ${head} till preview? Bekräfta först, kör sedan npm run preview:push -- --confirm ${head}`);
}

// Invoked again by pre-push: local reads only, no model/test runner/network calls.
export function checkPrepared(base, head) {
  assertClean(base);
  if (git(["rev-parse", "HEAD"]) !== head) throw new Error("Prepared HEAD changed.");
  const proof = reviewProof(readyReview(base, head));
  const receipt = JSON.parse(readFileSync(join(CACHE, `${head}.json`), "utf8"));
  validatePrepared(receipt, base, head, proof);
  return receipt;
}

export function publishPrepared(base, head, prepared, actions) {
  actions.check();
  actions.push();
  const publication = { version: 3, base, head, reviewProof: prepared.reviewProof, publishedAt: new Date().toISOString() };
  try { actions.save(publication); }
  catch (error) { throw new Error(`PUSH SUCCEEDED but saving its receipt failed: ${error.message}. Do not push again; inspect the live head.`); }
  console.log(`[preview] PUBLISHED ${head}; pre-push Buggpass reused. Follow CI and Vercel separately.`);
  return publication;
}

export function previewState() {
  const remote = git(["remote", "get-url", "--push", "--all", "origin"]);
  if (!/^(https:\/\/github\.com\/|git@github\.com:)Jakeminator123\/sajtmaskin(?:\.git)?$/.test(remote))
    throw new Error("origin push URL is not the expected Sajtmaskin repository.");
  git(["fetch", "origin", "preview", "--quiet"]);
  const base = git(["rev-parse", "FETCH_HEAD"]), head = git(["rev-parse", "HEAD"]);
  assertClean(base);
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
  const prepare = args.length === 1 && args[0] === "--prepare";
  const dryRun = args.length === 1 && args[0] === "--dry-run";
  if (!prepare && !dryRun && !(args.length === 2 && args[0] === "--confirm" && SHA.test(args[1])))
    throw new Error("Use npm run preview:prepare, then preview:push -- --dry-run or --confirm <human-approved SHA>.");
  const { base, head } = previewState();
  if (prepare) {
    const prepared = preparePreview(base, head, {
      reviewProof: () => reviewProof(readyReview(base, head)),
      plan: () => command(process.execPath, ["scripts/workflow/verify-pr.mjs", "--plan", "--committed", "--no-fetch", "--base", base], { stdio: "inherit" }),
      readState: previewState,
    });
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(join(CACHE, `${head}.json`), JSON.stringify(prepared, null, 2));
    console.log(`[preview] Reviewed ${head}; plan prepared. Report actual targeted test results separately. Ask Jakob: Är du säker på att du vill pusha till preview? Nothing pushed.`);
    return;
  }
  const prepared = checkPrepared(base, head);
  if (dryRun) {
    console.log(`[preview] DRY RUN OK ${base}..${head}: current review, triage and plan. No push or new model call. Human confirmation still required.`);
    return;
  }
  requireConfirmation(args[1], head);
  publishPrepared(base, head, prepared, {
    check: () => checkPrepared(base, head),
    push: () => command("git", ["push", "origin", `${head}:refs/heads/preview`], {
      stdio: "inherit", env: { ...process.env, SAJTMASKIN_PREVIEW_WRAPPER_HEAD: head },
    }),
    save: (publication) => writeFileSync(join(CACHE, `${head}.published.json`), JSON.stringify(publication, null, 2)),
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`[preview] STOP: ${error.message}`); process.exitCode = 1; }
}
