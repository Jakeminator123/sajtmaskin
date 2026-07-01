/**
 * Dossier SDK-version drift check — "test all dossiers for a recurring class of bug".
 *
 * Why this exists: dossier component files pin an SDK `apiVersion` string literal
 * (e.g. `new Stripe(..., { apiVersion: "2024-10-28.acacia" })`). The installed
 * SDK's TypeScript types only accept its own current `apiVersion` literal, so a
 * stale pin makes EVERY generation that injects that dossier fail typecheck
 * (TS2322) — a systemic, recurring prod fault. `dossiers:validate-all` only
 * checks manifests/headings/imports, and a full `tsc` over dossier fragments is
 * too noisy (dossier-only packages like @clerk/nextjs aren't installed in this
 * repo). This check is the targeted, zero-false-positive middle ground: it
 * compares each pinned SDK apiVersion against the version the INSTALLED SDK
 * actually expects.
 *
 *   node scripts/dossiers/check-sdk-versions.mjs          # human-readable, exit 1 on drift
 *   node scripts/dossiers/check-sdk-versions.mjs --json    # machine-readable (backoffice)
 *
 * Extensible: add an entry to SDK_VERSION_SOURCES to cover another SDK whose
 * types pin a version literal.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const DOSSIERS_ROOT = join(ROOT, "data", "dossiers");
const wantJson = process.argv.includes("--json");

/**
 * Each entry maps an SDK to:
 *  - `importMatch`: how to detect a file uses this SDK (bare specifier).
 *  - `expected()`: resolve the version literal the INSTALLED SDK expects, read
 *    from its own generated types so it tracks `npm install`/upgrades.
 * Returns null when the SDK isn't installed (skip — nothing to compare against).
 */
const SDK_VERSION_SOURCES = {
  stripe: {
    label: "stripe",
    importMatch: /from\s+["']stripe["']/,
    expected() {
      // stripe SDK generates types/apiVersion.d.ts: `export const ApiVersion = '<v>';`
      const p = join(ROOT, "node_modules", "stripe", "types", "apiVersion.d.ts");
      if (!existsSync(p)) return null;
      const m = readFileSync(p, "utf8").match(/ApiVersion\s*=\s*['"]([^'"]+)['"]/);
      return m ? m[1] : null;
    },
  },
};

// Pinned apiVersion literal in a dossier file: `apiVersion: "…"`.
const API_VERSION_RE = /apiVersion\s*:\s*["']([^"']+)["']/;

function listFilesRecursive(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(DOSSIERS_ROOT)) {
    const msg = "data/dossiers not found.";
    if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exit(1);
  }

  const files = [
    ...listFilesRecursive(join(DOSSIERS_ROOT, "hard")),
    ...listFilesRecursive(join(DOSSIERS_ROOT, "soft")),
  ];

  const drifts = [];
  const checked = [];
  const skipped = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const apiMatch = content.match(API_VERSION_RE);
    if (!apiMatch) continue;
    const pinned = apiMatch[1];
    const rel = file.replace(ROOT + "\\", "").replace(ROOT + "/", "").replace(/\\/g, "/");

    // Attribute the pin to an SDK by its import.
    let matchedSdk = null;
    for (const [, sdk] of Object.entries(SDK_VERSION_SOURCES)) {
      if (sdk.importMatch.test(content)) {
        matchedSdk = sdk;
        break;
      }
    }
    if (!matchedSdk) {
      // A pinned apiVersion we can't attribute to a known SDK — surface as a
      // skip so it's visible but never a false-positive failure.
      skipped.push({ file: rel, pinned, reason: "unrecognized-sdk" });
      continue;
    }
    const expected = matchedSdk.expected();
    if (!expected) {
      skipped.push({ file: rel, pinned, reason: `${matchedSdk.label}-not-installed` });
      continue;
    }
    checked.push({ file: rel, sdk: matchedSdk.label, pinned, expected });
    if (pinned !== expected) {
      drifts.push({ file: rel, sdk: matchedSdk.label, pinned, expected });
    }
  }

  if (wantJson) {
    process.stdout.write(
      JSON.stringify({ ok: drifts.length === 0, checked, drifts, skipped }),
    );
    process.exit(drifts.length === 0 ? 0 : 1);
  }

  console.log(`Dossier SDK-version check — ${checked.length} pinned apiVersion(s) checked\n`);
  for (const c of checked) {
    const status = c.pinned === c.expected ? "OK   " : "DRIFT";
    console.log(`${status} ${c.file}  [${c.sdk}] pinned=${c.pinned} expected=${c.expected}`);
  }
  for (const s of skipped) {
    console.log(`SKIP  ${s.file}  pinned=${s.pinned} (${s.reason})`);
  }
  if (drifts.length > 0) {
    console.error(
      `\n${drifts.length} dossier SDK apiVersion drift(s). Update the dossier literal to match the installed SDK:`,
    );
    for (const d of drifts) {
      console.error(`  - ${d.file}: ${d.sdk} apiVersion "${d.pinned}" -> "${d.expected}"`);
    }
    process.exit(1);
  }
  console.log("\nAll pinned dossier SDK apiVersions match the installed SDKs.");
}

main();
