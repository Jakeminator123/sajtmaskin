#!/usr/bin/env node
/**
 * Guards against ASCII `\b` regex patterns that sit directly next to a
 * non-ASCII letter (ä/ö/å/é/ü/ñ/…). In JavaScript those patterns silently
 * fail to match in production while unit tests using English stay green —
 * see `.cursor/rules/unicode-regex.mdc` and `src/lib/utils/unicode-word-boundary.ts`.
 *
 * Flags only the genuinely dangerous cases:
 *   - `\b` immediately before a non-ASCII letter  (e.g. `\bändra`)
 *   - non-ASCII letter immediately before `\b`    (e.g. `miljö\b`)
 *
 * Run from repo root:
 *   node scripts/dev/check-unicode-regex.mjs
 * or as part of the preflight.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findLineOffenders } from "./source-line-scan.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const offenders = findLineOffenders({
  repoRoot,
  dangerous: /\\b[À-ɏḀ-ỿ]|[À-ɏḀ-ỿ]\\b/,
  allowComment: /unicode-regex-allow/i,
  // Files that exist precisely to demonstrate the bug, plus this guard's own
  // pattern literal.
  allowlistFiles: ["src/lib/utils/unicode-word-boundary.test.ts", "scripts/dev/check-unicode-regex.mjs"],
});

if (offenders.length === 0) {
  console.log("[check-unicode-regex] OK — no dangerous \\b patterns next to non-ASCII letters");
  process.exit(0);
}

console.error("[check-unicode-regex] FAIL — ASCII \\b directly next to a non-ASCII letter");
console.error("");
console.error("JavaScript's \\b uses ASCII word chars, so `/\\bändra\\b/` silently never matches");
console.error("\"ändra\" in production. Use the helpers in src/lib/utils/unicode-word-boundary.ts");
console.error("instead — see .cursor/rules/unicode-regex.mdc.");
console.error("");
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}  ${o.snippet}`);
}
console.error("");
console.error(`Found ${offenders.length} occurrence(s).`);
process.exit(1);
