/**
 * Enforces the dossier re-verification cadence owned by
 * config/dossier-verification-policy.json.
 *
 * `lastVerified` is evidence of a human acceptance pass, not a curation date.
 * Hard/provider-coupled dossiers age out sooner because provider APIs, SDKs and
 * webhook contracts drift faster than self-contained UI building blocks.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function utcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Pure policy evaluation for tests and the CLI.
 *
 * @param {{ dossiers: Array<{ id: string, class: "hard" | "soft", lastVerified: unknown, verificationStatus?: unknown }>, policy: { hardMaxAgeDays: number, softMaxAgeDays: number, warningWindowDays: number }, now?: Date }} input
 */
export function evaluateVerificationFreshness({ dossiers, policy, now = new Date() }) {
  const current = [];
  const warnings = [];
  const stale = [];
  const invalid = [];
  const future = [];
  const unverified = [];
  const today = utcDay(now);

  for (const dossier of dossiers) {
    if (dossier.verificationStatus === "unverified") {
      unverified.push({ ...dossier, reason: "acceptance-not-completed" });
      continue;
    }
    if (
      dossier.verificationStatus !== undefined &&
      dossier.verificationStatus !== "accepted"
    ) {
      invalid.push({ ...dossier, reason: "invalid-verification-status" });
      continue;
    }
    const verifiedAt = parseIsoDate(dossier.lastVerified);
    if (!verifiedAt) {
      invalid.push({ ...dossier, reason: "invalid-date" });
      continue;
    }
    const ageDays = Math.floor((today - verifiedAt.getTime()) / DAY_MS);
    if (ageDays < 0) {
      future.push({ ...dossier, ageDays });
      continue;
    }
    const maxAgeDays =
      dossier.class === "hard" ? policy.hardMaxAgeDays : policy.softMaxAgeDays;
    const row = {
      id: dossier.id,
      class: dossier.class,
      lastVerified: dossier.lastVerified,
      ageDays,
      maxAgeDays,
      daysRemaining: maxAgeDays - ageDays,
    };
    if (ageDays > maxAgeDays) stale.push(row);
    else if (row.daysRemaining <= policy.warningWindowDays) warnings.push(row);
    else current.push(row);
  }

  return { current, warnings, stale, invalid, future, unverified };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listDossiers(root) {
  const dossiers = [];
  for (const klass of ["hard", "soft"]) {
    const classRoot = join(root, klass);
    if (!existsSync(classRoot)) continue;
    for (const entry of readdirSync(classRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const manifestPath = join(classRoot, entry.name, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      dossiers.push({
        id: entry.name,
        class: klass,
        lastVerified: manifest.lastVerified,
        verificationStatus: manifest.verificationStatus,
      });
    }
  }
  return dossiers;
}

function validatePolicy(policy) {
  for (const key of ["hardMaxAgeDays", "softMaxAgeDays", "warningWindowDays"]) {
    if (!Number.isInteger(policy[key]) || policy[key] < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  if (
    policy.warningWindowDays > policy.hardMaxAgeDays ||
    policy.warningWindowDays > policy.softMaxAgeDays
  ) {
    throw new Error("warningWindowDays cannot exceed a class max-age");
  }
}

function printRows(label, rows) {
  if (rows.length === 0) return;
  console.log(`\n${label}`);
  for (const row of rows) {
    if ("daysRemaining" in row) {
      console.log(
        `  - ${row.class}/${row.id}: ${row.lastVerified} (${row.ageDays} dagar, ${row.daysRemaining} kvar)`,
      );
    } else {
      console.log(`  - ${row.class}/${row.id}: ${String(row.lastVerified)}`);
    }
  }
}

function main() {
  const root = resolve(process.cwd());
  const wantJson = process.argv.includes("--json");
  const policy = readJson(join(root, "config", "dossier-verification-policy.json"));
  validatePolicy(policy);
  const result = evaluateVerificationFreshness({
    dossiers: listDossiers(join(root, "data", "dossiers")),
    policy,
  });
  const failed =
    result.stale.length +
      result.invalid.length +
      result.future.length +
      result.unverified.length >
    0;

  if (wantJson) {
    process.stdout.write(JSON.stringify({ ok: !failed, policy, ...result }));
    process.exit(failed ? 1 : 0);
  }

  console.log(
    `Dossier evidence — ${result.current.length} current, ${result.warnings.length} due soon, ${result.stale.length} stale, ${result.unverified.length} unverified`,
  );
  printRows("Due within warning window:", result.warnings);
  printRows("STALE (run the acceptance checklist before changing lastVerified):", result.stale);
  printRows("UNVERIFIED (lastVerified is not acceptance evidence):", result.unverified);
  printRows("INVALID lastVerified:", result.invalid);
  printRows("FUTURE lastVerified (not valid evidence):", result.future);

  if (failed) {
    console.error("\nDossier freshness failed.");
    process.exit(1);
  }
  console.log("\nAll dossiers have accepted, current verification evidence.");
}

function isInvokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) main();
