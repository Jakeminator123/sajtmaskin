#!/usr/bin/env node
/**
 * Rewrite manifest.ts files: strip inline files block, add loadScaffoldFiles() import.
 *
 * Usage: node scripts/scaffolds/rewrite-manifests-to-loader.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const SCAFFOLDS_DIR = resolve(process.cwd(), "src/lib/gen/scaffolds");
const DRY_RUN = process.argv.includes("--dry-run");

function getScaffoldDirs() {
  return readdirSync(SCAFFOLDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SCAFFOLDS_DIR, d.name, "manifest.ts")))
    .map((d) => d.name);
}

function findFilesBlock(src) {
  const match = src.match(/\bfiles:\s*\[/);
  if (!match) return null;

  const start = match.index;
  let depth = 0;
  let inBlock = false;

  for (let i = start; i < src.length; i++) {
    if (src[i] === "[") { depth++; inBlock = true; }
    if (src[i] === "]") {
      depth--;
      if (inBlock && depth === 0) {
        let end = i + 1;
        if (src[end] === ",") end++;
        // Skip trailing whitespace/newline
        while (end < src.length && (src[end] === " " || src[end] === "\n" || src[end] === "\r")) end++;
        return { start, end };
      }
    }
  }
  return null;
}

function rewriteManifest(scaffoldId) {
  const manifestPath = join(SCAFFOLDS_DIR, scaffoldId, "manifest.ts");
  let src = readFileSync(manifestPath, "utf-8");

  // Find and remove the files block
  const block = findFilesBlock(src);
  if (!block) {
    console.log(`  ${scaffoldId}: no files block found (skipping)`);
    return false;
  }

  // Extract the scaffold id from the file for the loadScaffoldFiles call
  const idMatch = src.match(/id:\s*"([^"]+)"/);
  const id = idMatch ? idMatch[1] : scaffoldId;

  // Replace files block with loadScaffoldFiles call
  const replacement = `files: loadScaffoldFiles("${id}"),\n`;
  src = src.slice(0, block.start) + replacement + src.slice(block.end);

  // Add import if not already present
  if (!src.includes("loadScaffoldFiles")) {
    const importLine = 'import { loadScaffoldFiles } from "../load-scaffold-files";\n';
    // Insert after the existing import line
    const existingImportEnd = src.indexOf(';\n', src.indexOf('import '));
    if (existingImportEnd !== -1) {
      src = src.slice(0, existingImportEnd + 2) + importLine + src.slice(existingImportEnd + 2);
    } else {
      src = importLine + src;
    }
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${scaffoldId}: would rewrite (${src.length} chars)`);
    console.log(`    First 200 chars: ${src.slice(0, 200).replace(/\n/g, "\\n")}`);
  } else {
    writeFileSync(manifestPath, src, "utf-8");
    console.log(`  ${scaffoldId}: rewritten`);
  }
  return true;
}

function main() {
  const scaffoldDirs = getScaffoldDirs();
  console.log(`Rewriting ${scaffoldDirs.length} manifests`);

  let rewritten = 0;
  for (const scaffoldId of scaffoldDirs) {
    if (rewriteManifest(scaffoldId)) rewritten++;
  }

  console.log(`\nDone: ${rewritten}/${scaffoldDirs.length} manifests rewritten`);
  if (DRY_RUN) console.log("(dry-run mode — no files modified)");
}

main();
