#!/usr/bin/env node
/**
 * One-shot extraction: parse inline files from scaffold manifest.ts → real files under files/.
 *
 * Usage: node scripts/scaffolds/extract-scaffold-files.mjs [--dry-run]
 *
 * After running, each scaffold will have a files/ directory with real .tsx/.css files.
 * The manifest.ts files must then be manually updated to use loadScaffoldFiles().
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const SCAFFOLDS_DIR = resolve(process.cwd(), "src/lib/gen/scaffolds");
const DRY_RUN = process.argv.includes("--dry-run");

function getScaffoldDirs() {
  return readdirSync(SCAFFOLDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SCAFFOLDS_DIR, d.name, "manifest.ts")))
    .map((d) => d.name);
}

function extractFilesFromManifest(manifestPath) {
  const src = readFileSync(manifestPath, "utf-8");
  const files = [];

  const filesBlockMatch = src.match(/\bfiles:\s*\[/);
  if (!filesBlockMatch) return { files, filesBlockStart: -1, filesBlockEnd: -1 };

  const filesBlockStart = filesBlockMatch.index;
  let depth = 0;
  let filesBlockEnd = -1;
  let inBlock = false;

  for (let i = filesBlockStart; i < src.length; i++) {
    if (src[i] === "[") { depth++; inBlock = true; }
    if (src[i] === "]") {
      depth--;
      if (inBlock && depth === 0) {
        filesBlockEnd = i + 1;
        // Include trailing comma if present
        if (src[filesBlockEnd] === ",") filesBlockEnd++;
        break;
      }
    }
  }

  const block = src.slice(filesBlockStart, filesBlockEnd);

  // Parse individual file entries using regex for path and then extracting content between backticks
  const entryRegex = /\{\s*path:\s*"([^"]+)",\s*content:\s*`/g;
  let match;
  while ((match = entryRegex.exec(block)) !== null) {
    const filePath = match[1];
    const contentStart = match.index + match[0].length;

    // Find the closing backtick — handle escaped backticks
    let contentEnd = -1;
    for (let i = contentStart; i < block.length; i++) {
      if (block[i] === "`" && block[i - 1] !== "\\") {
        contentEnd = i;
        break;
      }
    }

    if (contentEnd === -1) {
      console.warn(`  Warning: could not find closing backtick for ${filePath}`);
      continue;
    }

    let content = block.slice(contentStart, contentEnd);
    // Unescape template literal escapes
    content = content.replace(/\\`/g, "`");
    content = content.replace(/\\\$/g, "$");

    files.push({ path: filePath, content });
  }

  return { files, filesBlockStart, filesBlockEnd };
}

function main() {
  const scaffoldDirs = getScaffoldDirs();
  console.log(`Found ${scaffoldDirs.length} scaffolds to extract`);

  let totalFiles = 0;
  const summary = [];

  for (const scaffoldId of scaffoldDirs) {
    const manifestPath = join(SCAFFOLDS_DIR, scaffoldId, "manifest.ts");
    const { files } = extractFilesFromManifest(manifestPath);

    if (files.length === 0) {
      console.log(`  ${scaffoldId}: no files found (skipping)`);
      continue;
    }

    const filesDir = join(SCAFFOLDS_DIR, scaffoldId, "files");

    for (const file of files) {
      const targetPath = join(filesDir, file.path);
      const targetDir = dirname(targetPath);

      if (DRY_RUN) {
        console.log(`  [dry-run] Would write ${targetPath} (${file.content.length} chars)`);
      } else {
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(targetPath, file.content, "utf-8");
      }
    }

    totalFiles += files.length;
    summary.push({ scaffoldId, fileCount: files.length });
    console.log(`  ${scaffoldId}: extracted ${files.length} files`);
  }

  console.log(`\nTotal: ${totalFiles} files across ${summary.length} scaffolds`);
  if (DRY_RUN) {
    console.log("(dry-run mode — no files written)");
  }

  console.log("\nSummary:");
  for (const { scaffoldId, fileCount } of summary) {
    console.log(`  ${scaffoldId}: ${fileCount} files`);
  }
}

main();
