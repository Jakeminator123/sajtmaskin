#!/usr/bin/env node
/**
 * Guards against SUBSTRING-based path-traversal checks: `p.includes("..")` /
 * `p.indexOf("..")`. Next.js catch-all route directories (`[...slug]`,
 * `[[...slug]]`) legitimately contain the substring `..` but are literal
 * directory names the OS never resolves specially — a substring check
 * silently DROPS those files (ZIP export, warm verification, quality gate,
 * dossier file injection) while unit tests with plain paths stay green.
 * That is exactly the Codex P1 class from PR #396.
 *
 * Use the segment-based helper instead:
 *   `hasTraversalSegment()` in `src/lib/utils/path-utils.ts`
 * (or an inline `p.split("/").some((s) => s === "..")` in .mjs scripts).
 *
 * Opt-out for justified cases (e.g. single-filename inputs where `/` and `\`
 * are already rejected, so no segments can exist): add the marker
 * `traversal-substring-allow` in a comment on the same line, with a short
 * motivation nearby.
 *
 * Run from repo root:
 *   node scripts/dev/check-traversal-guards.mjs
 * Runs as part of `preflight:common` (CI quality job + Vercel prebuild).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findLineOffenders } from "./source-line-scan.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const offenders = findLineOffenders({
  repoRoot,
  // `.includes("..")` / `.indexOf("..")` with either quote style.
  dangerous: /\.(?:includes|indexOf)\(\s*(?:"\.\."|'\.\.')\s*\)/,
  allowComment: /traversal-substring-allow/i,
  // Self-reference so the guard doesn't flag its own message/pattern literals.
  allowlistFiles: ["scripts/dev/check-traversal-guards.mjs"],
});

if (offenders.length === 0) {
  console.log("[check-traversal-guards] OK — no substring-based '..' traversal checks");
  process.exit(0);
}

console.error("[check-traversal-guards] FAIL — substring-based '..' traversal check found");
console.error("");
console.error("`p.includes(\"..\")` also matches literal Next.js catch-all directories");
console.error("([...slug], [[...slug]]) and silently drops those files from export/verify");
console.error("lanes (Codex P1 on PR #396). Use hasTraversalSegment() from");
console.error("src/lib/utils/path-utils.ts (or split('/')-segment checks in .mjs scripts).");
console.error("Justified single-filename cases: add `traversal-substring-allow` in a");
console.error("comment on the same line, with a short motivation.");
console.error("");
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}  ${o.snippet}`);
}
console.error("");
console.error(`Found ${offenders.length} occurrence(s).`);
process.exit(1);
