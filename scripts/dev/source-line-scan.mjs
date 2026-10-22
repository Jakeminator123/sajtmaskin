/**
 * Shared line scanner for the preflight source guards
 * (`check-unicode-regex.mjs`, `check-traversal-guards.mjs`).
 *
 * Fail-closed: a scan directory that does not exist throws instead of being
 * skipped. A renamed or removed directory used to make both guards pass
 * silently (they kept scanning `services/` long after it was deleted).
 */
import fs from "node:fs";
import path from "node:path";

export const SOURCE_SCAN_DIRS = Object.freeze(["src", "scripts", "preview-host"]);

const EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx"]);
const IGNORE_DIRS = new Set(["node_modules", ".next", ".turbo", ".git", "dist", "build", "coverage"]);
const COMMENT_HINT = /^\s*(\/\/|\*|\/\*|#)/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && EXT.has(path.extname(entry.name))) yield full;
  }
}

/**
 * Returns `{ file, line, snippet }` for every non-comment line matching
 * `dangerous`, unless the line carries `allowComment` or the file is in
 * `allowlistFiles` (repo-relative, forward slashes).
 *
 * @param {{
 *   repoRoot: string,
 *   dangerous: RegExp,
 *   allowComment: RegExp,
 *   allowlistFiles?: readonly string[],
 *   scanDirs?: readonly string[],
 * }} options
 * @returns {{ file: string, line: number, snippet: string }[]}
 */
export function findLineOffenders({
  repoRoot,
  dangerous,
  allowComment,
  allowlistFiles = [],
  scanDirs = SOURCE_SCAN_DIRS,
}) {
  const allowlist = new Set(allowlistFiles);
  const offenders = [];
  for (const rel of scanDirs) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`scan directory "${rel}" does not exist; update SOURCE_SCAN_DIRS`);
    }
    for (const file of walk(abs)) {
      const text = fs.readFileSync(file, "utf8");
      if (!dangerous.test(text)) continue;
      const relPath = path.relative(repoRoot, file).split(path.sep).join("/");
      if (allowlist.has(relPath)) continue;
      text.split(/\r?\n/).forEach((line, idx) => {
        if (!dangerous.test(line)) return;
        if (COMMENT_HINT.test(line)) return; // explanatory comments are fine
        if (allowComment.test(line)) return; // explicit opt-out marker
        offenders.push({ file: relPath, line: idx + 1, snippet: line.trim().slice(0, 160) });
      });
    }
  }
  return offenders;
}
