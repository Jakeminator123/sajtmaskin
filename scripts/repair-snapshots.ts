#!/usr/bin/env npx tsx
/**
 * Repair historical engine snapshots that accidentally persisted
 * runtime-provided stub files (e.g. components/ui/*.tsx).
 *
 * Usage:
 *   npx tsx scripts/repair-snapshots.ts           # dry-run (default)
 *   npx tsx scripts/repair-snapshots.ts --apply   # apply changes
 *
 * Idempotent: running multiple times produces the same result.
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { isRuntimeProvidedFilePath } from "../src/lib/gen/runtime-imports";

const DB_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "sajtmaskin.db");

const dryRun = !process.argv.includes("--apply");

interface VersionRow {
  id: string;
  chat_id: string;
  version_number: number;
  files_json: string;
}

interface FileEntry {
  path: string;
  content: string;
  language?: string;
}

function isStubFile(file: FileEntry): boolean {
  return file.content.includes('data-stub="') && file.content.includes("[") && file.content.length < 800;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log(`Database not found at ${DB_PATH}. Nothing to repair.`);
    process.exit(0);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  const versions = db
    .prepare("SELECT id, chat_id, version_number, files_json FROM versions ORDER BY chat_id, version_number")
    .all() as VersionRow[];

  console.log(`Found ${versions.length} versions to inspect.`);
  if (dryRun) console.log("DRY RUN — no changes will be written.\n");

  let repairedCount = 0;
  let strippedFilesTotal = 0;

  const updateStmt = db.prepare("UPDATE versions SET files_json = ? WHERE id = ?");

  for (const version of versions) {
    let files: FileEntry[];
    try {
      files = JSON.parse(version.files_json) as FileEntry[];
    } catch {
      console.warn(`  [skip] Version ${version.id}: malformed JSON`);
      continue;
    }

    const toStrip = files.filter(
      (f) => isRuntimeProvidedFilePath(f.path) && isStubFile(f),
    );

    if (toStrip.length === 0) continue;

    const cleanFiles = files.filter((f) => !toStrip.includes(f));
    const stripped = toStrip.map((f) => f.path);

    console.log(
      `  Version ${version.id} (chat ${version.chat_id}, v${version.version_number}): ` +
        `strip ${stripped.length} stub(s): ${stripped.join(", ")}`,
    );

    if (!dryRun) {
      updateStmt.run(JSON.stringify(cleanFiles), version.id);
    }

    repairedCount++;
    strippedFilesTotal += stripped.length;
  }

  console.log(
    `\nDone. ${repairedCount} version(s) ${dryRun ? "would be" : ""} repaired, ` +
      `${strippedFilesTotal} stub file(s) ${dryRun ? "would be" : ""} stripped.`,
  );

  db.close();
}

main();
