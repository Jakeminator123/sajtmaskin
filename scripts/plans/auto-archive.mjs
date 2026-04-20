#!/usr/bin/env node
/**
 * scripts/plans/auto-archive.mjs
 *
 * Audit-rapport `02-forbattringar.md` §1.7 / Tier B #22 — håller
 * `docs/plans/active/` rensat genom att flagga (eller flytta) plan-filer
 * vars status-rad signalerar att de är klara.
 *
 * Pragmatisk variant istället för audit-rapportens YAML-frontmatter-approach
 * — våra plan-filer använder prosa-status ("Status: DONE 2026-04-20",
 * "Status: Stängd", "Status: Closed"), inte frontmatter. Detta script
 * matchar prosa-mönstret + skippar `Kvarvarande-uppgifter.md`/`README.md`
 * (levande listor som aldrig ska flyttas).
 *
 * Default: dry-run. Visa vilka som SKULLE flyttas. `--apply` kör `git mv`.
 *
 * Användning:
 *   npm run plans:archive              # dry-run
 *   npm run plans:archive -- --apply   # faktiskt flytta
 *
 * När en plan flyttas till `docs/plans/avklarat/` ska du även lägga till
 * en rad i `docs/plans/avklarat/README.md` så historiken är spårbar.
 * Scriptet skriver inte till README — det är medvetet manuellt så att
 * meningsfull leveransbeskrivning skrivs av människa eller agent som
 * faktiskt vet vad planen levererade.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const ACTIVE_DIR = join(REPO_ROOT, "docs", "plans", "active");
const ARCHIVE_DIR = join(REPO_ROOT, "docs", "plans", "avklarat");

// Files we never archive even if they look "done" — they are living
// lists, master indexes, or canonical pointers.
const NEVER_ARCHIVE = new Set([
  "README.md",
  "Kvarvarande-uppgifter.md",
]);

// Status patterns that signal a plan is finished. Matched case-insensitively
// against the first ~10 lines of the file (where status headers live).
// Intentionally conservative: "Active (Steg 2 KLART)" still counts as
// active because it has "Active" prefix even though one step is done.
const DONE_PATTERNS = [
  /^Status:\s*DONE\b/im,
  /^Status:\s*Closed\b/im,
  /^Status:\s*Stängd\b/im,
  /^Status:\s*Avslutad\b/im,
  /^Status:\s*\*\*DONE\b/im,
  /^Status:\s*\*\*Closed\b/im,
  /^Status:\s*\*\*Stängd\b/im,
];

const ACTIVE_PATTERN = /^Status:\s*\*?\*?Active\b/im;

function readHeader(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    return text.split(/\r?\n/).slice(0, 12).join("\n");
  } catch {
    return "";
  }
}

function classifyPlan(filePath, fileName) {
  if (NEVER_ARCHIVE.has(fileName)) {
    return { kind: "skip", reason: "never-archive (living list)" };
  }
  const header = readHeader(filePath);
  if (!header.trim()) {
    return { kind: "skip", reason: "empty file" };
  }
  if (ACTIVE_PATTERN.test(header)) {
    return { kind: "active", reason: "Status: Active" };
  }
  for (const pat of DONE_PATTERNS) {
    if (pat.test(header)) {
      return { kind: "archive", reason: `matched ${pat}` };
    }
  }
  return { kind: "unknown", reason: "no Status header recognised" };
}

function listActivePlans() {
  let entries;
  try {
    entries = readdirSync(ACTIVE_DIR);
  } catch (err) {
    console.error(`[plans:archive] cannot read ${ACTIVE_DIR}: ${err.message}`);
    process.exit(2);
  }
  return entries
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      name,
      path: join(ACTIVE_DIR, name),
    }))
    .filter(({ path }) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    });
}

function gitMove(fromAbs, toAbs) {
  const fromRel = relative(REPO_ROOT, fromAbs).replace(/\\/g, "/");
  const toRel = relative(REPO_ROOT, toAbs).replace(/\\/g, "/");
  execFileSync("git", ["mv", fromRel, toRel], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

function main() {
  const apply = process.argv.includes("--apply");
  const plans = listActivePlans();
  const buckets = { archive: [], active: [], skip: [], unknown: [] };

  for (const plan of plans) {
    const verdict = classifyPlan(plan.path, plan.name);
    buckets[verdict.kind].push({ ...plan, ...verdict });
  }

  console.log(
    `[plans:archive] mode=${apply ? "APPLY" : "dry-run"}  ` +
      `active=${buckets.active.length}  ` +
      `archive-candidate=${buckets.archive.length}  ` +
      `skip=${buckets.skip.length}  ` +
      `unknown=${buckets.unknown.length}`,
  );

  if (buckets.archive.length === 0) {
    console.log("[plans:archive] nothing to archive.");
    if (buckets.unknown.length > 0) {
      console.log(
        `[plans:archive] note: ${buckets.unknown.length} plan(s) had no recognised Status header — review manually:`,
      );
      for (const p of buckets.unknown) console.log(`  - ${p.name}`);
    }
    return;
  }

  console.log("\narchive candidates:");
  for (const p of buckets.archive) {
    console.log(`  ${p.name}  (${p.reason})`);
  }

  if (!apply) {
    console.log(
      "\n[plans:archive] dry-run — no files moved. Re-run with --apply to commit the move.",
    );
    return;
  }

  for (const p of buckets.archive) {
    const target = join(ARCHIVE_DIR, p.name);
    console.log(`[plans:archive] git mv ${p.name} -> avklarat/`);
    try {
      gitMove(p.path, target);
    } catch (err) {
      console.error(
        `[plans:archive] git mv failed for ${p.name}: ${err.message}`,
      );
      process.exit(1);
    }
  }

  console.log(
    `\n[plans:archive] moved ${buckets.archive.length} plan(s). ` +
      "Remember to add corresponding rows in docs/plans/avklarat/README.md " +
      "describing what each plan delivered, and commit the changes.",
  );
}

main();
