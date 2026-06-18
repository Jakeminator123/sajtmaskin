#!/usr/bin/env node
/**
 * check-term-coverage.mjs - grandmaster activity C2 (ordlista-check), LIGHT + warn-FIRST.
 *
 * Scans source + docs and WARNS (never blocks) about:
 *   A. Forbidden aliases from the forvaxlingstabell in .cursor/rules/terminology.mdc
 *      (seeded in config/naming-dictionary.json), e.g. demoUrl -> previewUrl.
 *   B. Unknown "hard" English PascalCase tech terms in docs prose that are present in
 *      neither docs/architecture/glossary.md nor config/naming-dictionary.json (advisory).
 *
 * Deliberately SOFTER than the Sajtbyggare term-check: no 1500-row allowlist, no hard
 * enforcement. This script ALWAYS exits 0 - turning any of this into a blocking gate is a
 * separate, later decision (see docs/plans/active/grandmaster/aktiviteter/C2-ordlista-check.md).
 *
 * Run from repo root:
 *   npm run check:terms
 *   node scripts/dev/check-term-coverage.mjs
 *
 * Regex note: matches use Unicode-aware boundaries (\p{L}/\p{N} with the u flag), never
 * ASCII \b - see .cursor/rules/unicode-regex.mdc.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

const SCAN_DIRS = ["src", "docs", "scripts", "config", "preview-host", "services"];
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".mdx"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".git",
  "dist",
  "build",
  "coverage",
  "_archived",
  "_parkering",
]);

// Definition/meta files that obviously contain the aliases (they define them) - skip so
// the check never flags its own seed data.
const EXCLUDE_REL = new Set(
  [
    "config/naming-dictionary.json",
    "docs/architecture/glossary.md",
    "scripts/dev/check-term-coverage.mjs",
  ].map((p) => p.replace(/\//g, path.sep)),
);

const MAX_PER_ALIAS = 12;
const MAX_UNKNOWN_TERMS = 25;

// Unicode-aware word boundaries (NEVER ASCII \b - see .cursor/rules/unicode-regex.mdc).
const WB_L = "(?<![\\p{L}\\p{N}_])";
const WB_R = "(?![\\p{L}\\p{N}_])";

// PascalCase neologism shape: at least two "Upper + lower/digit" humps (BuildSpec, SnapshotBrief).
const CAMEL_RX = /(?<![\p{L}\p{N}_])(?:\p{Lu}[\p{Ll}\d]+){2,}(?![\p{L}\p{N}_])/gu;

function loadJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
  } catch (err) {
    console.log(`[check:terms] WARN: kunde inte lasa ${rel} (${err.message}) - hoppar over.`);
    return null;
  }
}

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

function collectFiles() {
  const files = [];
  for (const top of SCAN_DIRS) {
    const abs = path.join(repoRoot, top);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(repoRoot, file);
      if (EXCLUDE_REL.has(rel)) continue;
      let text;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      files.push({
        rel,
        relPosix: rel.split(path.sep).join("/"),
        top,
        ext: path.extname(file),
        text,
      });
    }
  }
  return files;
}

function buildAliasRegex(alias, caseSensitive) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`${WB_L}${escaped}${WB_R}`, caseSensitive ? "gu" : "giu");
}

function normalizeTerm(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function stripCodeFromMarkdown(text) {
  // Drop fenced code blocks and inline code so we only inspect human prose.
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
}

function runForbiddenAliases(files, dict) {
  const aliases = Array.isArray(dict?.forbiddenAliases) ? dict.forbiddenAliases : [];
  console.log("== A. Forbjudna alias (forvaxlingstabell, terminology.mdc) ==");
  if (aliases.length === 0) {
    console.log("  (inga alias i naming-dictionary.json)");
    return 0;
  }
  let grandTotal = 0;
  for (const entry of aliases) {
    const { alias, canonical, note, caseSensitive, scope, ignorePathContains } = entry;
    if (!alias) continue;
    const rx = buildAliasRegex(alias, caseSensitive === true);
    const scopeDirs = Array.isArray(scope) && scope.length ? scope : null;
    const ignore = Array.isArray(ignorePathContains) ? ignorePathContains : [];
    const hits = [];
    for (const f of files) {
      if (scopeDirs && !scopeDirs.includes(f.top)) continue;
      if (ignore.some((frag) => f.relPosix.includes(frag))) continue;
      const lines = f.text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        rx.lastIndex = 0;
        if (rx.test(lines[i])) {
          hits.push({ rel: f.relPosix, line: i + 1, snippet: lines[i].trim().slice(0, 120) });
        }
      }
    }
    grandTotal += hits.length;
    if (hits.length === 0) continue;
    const filesWith = new Set(hits.map((h) => h.rel)).size;
    console.log("");
    console.log(`WARN  ${alias} -> ${canonical}   (${hits.length} traffar i ${filesWith} filer)`);
    if (note) console.log(`      ${note}`);
    for (const h of hits.slice(0, MAX_PER_ALIAS)) {
      console.log(`      ${h.rel}:${h.line}  ${h.snippet}`);
    }
    if (hits.length > MAX_PER_ALIAS) {
      console.log(`      ... (+${hits.length - MAX_PER_ALIAS} fler traffar)`);
    }
  }
  console.log("");
  console.log(`A: ${grandTotal} alias-traff(ar) totalt.`);
  return grandTotal;
}

function runUnknownTerms(files, dict, glossaryText) {
  console.log("");
  console.log("== B. Okanda tech-begrepp (advisory; saknas i glossary + naming-dictionary) ==");

  const blobParts = [glossaryText || ""];
  for (const t of dict?.canonicalTerms || []) blobParts.push(t);
  for (const t of dict?.knownTechTerms || []) blobParts.push(t);
  for (const e of dict?.forbiddenAliases || []) {
    blobParts.push(e.alias || "");
    blobParts.push(e.canonical || "");
  }
  const blob = normalizeTerm(blobParts.join(" "));

  const seen = new Map(); // term -> { count, first }
  for (const f of files) {
    if ((f.ext !== ".md" && f.ext !== ".mdx") || f.top !== "docs") continue;
    const lines = stripCodeFromMarkdown(f.text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(CAMEL_RX)) {
        const term = m[0];
        const norm = normalizeTerm(term);
        if (norm.length < 6) continue;
        if (blob.includes(norm)) continue; // already a known glossary/dictionary term
        const rec = seen.get(term) || { count: 0, first: `${f.relPosix}:${i + 1}` };
        rec.count += 1;
        seen.set(term, rec);
      }
    }
  }

  if (seen.size === 0) {
    console.log("  (inga okanda PascalCase-begrepp i docs-prosa)");
    console.log("");
    console.log("B: 0 okanda begrepp.");
    return 0;
  }

  const sorted = [...seen.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(
    `  ${seen.size} unika kandidat(er). Visar topp ${Math.min(MAX_UNKNOWN_TERMS, seen.size)} ` +
      "(advisory - lagg i glossary/naming-dictionary om de ar riktiga begrepp):",
  );
  for (const [term, rec] of sorted.slice(0, MAX_UNKNOWN_TERMS)) {
    console.log(`WARN  okant begrepp "${term}" (${rec.count} traffar)  forst: ${rec.first}`);
  }
  if (seen.size > MAX_UNKNOWN_TERMS) {
    console.log(`  ... (+${seen.size - MAX_UNKNOWN_TERMS} fler unika kandidater)`);
  }
  console.log("");
  console.log(`B: ${seen.size} unika okanda begrepp.`);
  return seen.size;
}

function main() {
  console.log("[check:terms] Sajtmaskin ordlista-check (light, warn-forst - blockerar ALDRIG)");
  console.log(
    "[check:terms] Kalla: .cursor/rules/terminology.mdc + docs/architecture/glossary.md + config/naming-dictionary.json",
  );
  console.log("");

  const dict = loadJson("config/naming-dictionary.json");
  let glossaryText = "";
  try {
    glossaryText = fs.readFileSync(path.join(repoRoot, "docs", "architecture", "glossary.md"), "utf8");
  } catch {
    console.log("[check:terms] WARN: glossary.md saknas - section B kor utan glossary-membership.");
  }

  const files = collectFiles();
  const aliasHits = dict ? runForbiddenAliases(files, dict) : 0;
  const unknown = runUnknownTerms(files, dict || {}, glossaryText);

  console.log("");
  console.log(
    `[check:terms] Klart. A=${aliasHits} alias-traffar, B=${unknown} okanda begrepp. ` +
      "EXIT 0 (warn-forst, blockerar inte).",
  );
  // Warn-first by design: never fail the process. Blocking is a separate later decision.
  process.exit(0);
}

main();
