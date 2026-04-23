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

const DANGEROUS = /\\b[\u00C0-\u024F\u1E00-\u1EFF]|[\u00C0-\u024F\u1E00-\u1EFF]\\b/;
const COMMENT_HINT = /^\s*(\/\/|\*|\/\*|#)/;
const ALLOW_COMMENT = /unicode-regex-allow/i;

// Files that exist precisely to demonstrate the bug (so the helper can
// prove it fixes something). Self-reference so the guard doesn't flag its
// own error-message literal.
const ALLOWLIST_FILES = new Set(
  [
    "src/lib/utils/unicode-word-boundary.test.ts",
    "scripts/dev/check-unicode-regex.mjs",
  ].map((p) => p.replace(/\//g, path.sep)),
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
      if (ALLOW_COMMENT.test(line)) return; // opt-out via `// unicode-regex-allow`
      offenders.push({
        file: relPath,
        line: idx + 1,
        snippet: line.trim().slice(0, 160),
      });
    });
  }
}

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
