#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, SHA, assertClean, assertReviewRuntime, command, git, runBugpass, validateReview } from "./bugpass.mjs";

const CACHE = join(ROOT, "node_modules/.cache/sajtmaskin-preview");

export function validatePrepared(receipt, base, head) {
  if (!SHA.test(base) || !SHA.test(head) || receipt?.version !== 1 || receipt.base !== base ||
      receipt.head !== head || receipt.verification !== "verify:pr" || !receipt.verifiedAt) {
    throw new Error("No current prepared preview receipt. Run npm run preview:prepare.");
  }
  validateReview(receipt.review, base, head);
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
    requireConfirmation(process.env.SAJTMASKIN_PREVIEW_PUSH_CONFIRM, args[2]);
    checkPrepared(args[1], args[2]);
    return;
  }
  if (!(args.length === 1 && args[0] === "--prepare") &&
      !(args.length === 2 && args[0] === "--confirm" && SHA.test(args[1]))) {
    throw new Error("Use npm run preview:prepare, then npm run preview:push -- --confirm <approved HEAD SHA>.");
  }
  const { base, head } = previewState();
  if (args[0] === "--prepare") {
    assertReviewRuntime();
    command(process.execPath, ["scripts/workflow/verify-pr.mjs", "--plan", "--no-fetch", "--base", base], { stdio: "inherit" });
    command(process.execPath, ["scripts/workflow/verify-pr.mjs", "--no-fetch", "--base", base], { stdio: "inherit" });
    const review = runBugpass(base);
    const current = previewState();
    if (current.base !== base || current.head !== head) throw new Error("Preview or HEAD moved during preparation; prepare again.");
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(join(CACHE, `${head}.json`), JSON.stringify({
      ...review, version: 1, verification: "verify:pr", verifiedAt: new Date().toISOString(),
    }, null, 2));
    console.log(`[preview] Prepared ${head}. Nothing pushed. Ask Jakob: Är du säker på att du vill pusha till preview?`);
    return;
  }
  requireConfirmation(args[1], head);
  checkPrepared(base, head);
  command("git", ["push", "origin", `${head}:refs/heads/preview`], {
    stdio: "inherit", env: { ...process.env, SAJTMASKIN_PREVIEW_PUSH_CONFIRM: head },
  });
  console.log("[preview] Pushed. Verify GitHub push-CI and Vercel READY separately; this is not production acceptance.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`[preview] STOP: ${error.message}`); process.exitCode = 1; }
}
