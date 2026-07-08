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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

const SCAN_DIRS = ["src", "scripts", "preview-host", "services"];
const EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".git",
  "dist",
  "build",
  "coverage",
]);

// `.includes("..")` / `.indexOf("..")` with either quote style.
const DANGEROUS = /\.(?:includes|indexOf)\(\s*(?:"\.\."|'\.\.')\s*\)/;
const COMMENT_HINT = /^\s*(\/\/|\*|\/\*|#)/;
const ALLOW_COMMENT = /traversal-substring-allow/i;

// Self-reference so the guard doesn't flag its own message/pattern literals.
const ALLOWLIST_FILES = new Set(
  ["scripts/dev/check-traversal-guards.mjs"].map((p) => p.replace(/\//g, path.sep)),
);

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && EXT.has(path.extname(entry.name))) yield full;
  }
}

const offenders = [];
for (const rel of SCAN_DIRS) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!DANGEROUS.test(text)) continue;
    const relPath = path.relative(repoRoot, file);
    if (ALLOWLIST_FILES.has(relPath)) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!DANGEROUS.test(line)) return;
      if (COMMENT_HINT.test(line)) return; // explanatory comments are fine
      if (ALLOW_COMMENT.test(line)) return; // opt-out via `traversal-substring-allow`
      offenders.push({
        file: relPath,
        line: idx + 1,
        snippet: line.trim().slice(0, 160),
      });
    });
  }
}

if (offenders.length === 0) {
  console.log(
    "[check-traversal-guards] OK — no substring-based '..' traversal checks",
  );
  process.exit(0);
}

console.error(
  "[check-traversal-guards] FAIL — substring-based '..' traversal check found",
);
console.error("");
console.error(
  "`p.includes(\"..\")` also matches literal Next.js catch-all directories",
);
console.error(
  "([...slug], [[...slug]]) and silently drops those files from export/verify",
);
console.error(
  "lanes (Codex P1 on PR #396). Use hasTraversalSegment() from",
);
console.error(
  "src/lib/utils/path-utils.ts (or split('/')-segment checks in .mjs scripts).",
);
console.error(
  "Justified single-filename cases: add `traversal-substring-allow` in a",
);
console.error("comment on the same line, with a short motivation.");
console.error("");
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}  ${o.snippet}`);
}
console.error("");
console.error(`Found ${offenders.length} occurrence(s).`);
process.exit(1);
