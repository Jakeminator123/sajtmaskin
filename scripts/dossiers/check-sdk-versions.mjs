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
 * FAIL-CLOSED: if a recognized SDK is installed but its expected version cannot
 * be READ/PARSED, that is a hard failure (`unreadable`) — NOT a silent skip —
 * so a stale pin can never pass CI just because the SDK's type-file format
 * changed (Codex P1). Only a genuinely NOT-installed SDK is a skip (its dossier
 * ships to the generated project, not this repo).
 *
 * Extensible: add an entry to SDK_VERSION_SOURCES to cover another SDK whose
 * types pin a version literal.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(process.cwd());
const DOSSIERS_ROOT = join(ROOT, "data", "dossiers");

// Pinned apiVersion literal in a dossier file: `apiVersion: "…"`.
export const API_VERSION_RE = /apiVersion\s*:\s*["']([^"']+)["']/;

/**
 * Each entry maps an SDK to:
 *  - `importMatch`: how to detect a file uses this SDK (bare specifier).
 *  - `expected()`: resolve the version literal the INSTALLED SDK expects, read
 *    from its own generated types so it tracks `npm install`/upgrades. Returns
 *    `{ status: "ok", version }` | `{ status: "unreadable" }` (installed but the
 *    literal could not be parsed → FAIL) | `{ status: "not-installed" }` (skip).
 */
export const SDK_VERSION_SOURCES = {
  stripe: {
    label: "stripe",
    importMatch: /from\s+["']stripe["']/,
    expected() {
      // stripe SDK generates types/apiVersion.d.ts: `export const ApiVersion = '<v>';`
      const p = join(ROOT, "node_modules", "stripe", "types", "apiVersion.d.ts");
      if (!existsSync(p)) return { status: "not-installed" };
      const raw = readFileSync(p, "utf8");
      const m = raw.match(/ApiVersion\s*=\s*['"]([^'"]+)['"]/);
      return m ? { status: "ok", version: m[1] } : { status: "unreadable" };
    },
  },
};

/**
 * Pure evaluation: given parsed dossier files and the SDK source map, classify
 * every pinned `apiVersion` into checked / drift / unreadable / skipped. No IO,
 * so it is unit-testable. `sdkSources[sdk].expected()` is injected by the
 * caller (real fs in `main`, stubs in tests).
 *
 * @param {{ files: Array<{ path: string, content: string }>, sdkSources?: Record<string, { label: string, importMatch: RegExp, expected: () => { status: string, version?: string } }> }} params
 */
export function evaluatePins({ files, sdkSources = SDK_VERSION_SOURCES }) {
  const drifts = [];
  const checked = [];
  const skipped = [];
  const unreadable = [];

  for (const { path: rel, content } of files) {
    const apiMatch = content.match(API_VERSION_RE);
    if (!apiMatch) continue;
    const pinned = apiMatch[1];

    let matched = null;
    for (const sdk of Object.values(sdkSources)) {
      if (sdk.importMatch.test(content)) {
        matched = sdk;
        break;
      }
    }
    if (!matched) {
      skipped.push({ file: rel, pinned, reason: "unrecognized-sdk" });
      continue;
    }
    const resolved = matched.expected();
    if (resolved.status === "not-installed") {
      skipped.push({ file: rel, pinned, reason: `${matched.label}-not-installed` });
      continue;
    }
    if (resolved.status !== "ok" || !resolved.version) {
      // Installed but unparseable → fail closed (do NOT collapse into skip).
      unreadable.push({ file: rel, sdk: matched.label, pinned });
      continue;
    }
    checked.push({ file: rel, sdk: matched.label, pinned, expected: resolved.version });
    if (pinned !== resolved.version) {
      drifts.push({ file: rel, sdk: matched.label, pinned, expected: resolved.version });
    }
  }

  return { checked, drifts, skipped, unreadable };
}

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

function relPath(file) {
  return file.replace(ROOT + "\\", "").replace(ROOT + "/", "").replace(/\\/g, "/");
}

function main() {
  const wantJson = process.argv.includes("--json");

  if (!existsSync(DOSSIERS_ROOT)) {
    const msg = "data/dossiers not found.";
    if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exit(1);
  }

  const paths = [
    ...listFilesRecursive(join(DOSSIERS_ROOT, "hard")),
    ...listFilesRecursive(join(DOSSIERS_ROOT, "soft")),
  ];
  // A file we cannot READ must fail closed — swapping in "" would silently drop
  // any pinned apiVersion it contains and let the CI gate pass unverified
  // (Bugbot). Track read failures and fold them into `unreadable`.
  const files = [];
  const readErrors = [];
  for (const p of paths) {
    try {
      files.push({ path: relPath(p), content: readFileSync(p, "utf8") });
    } catch (err) {
      readErrors.push({
        file: relPath(p),
        sdk: "-",
        pinned: "-",
        reason: `read-error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const evaluated = evaluatePins({ files });
  const { checked, drifts, skipped } = evaluated;
  const unreadable = [...evaluated.unreadable, ...readErrors];
  const failed = drifts.length > 0 || unreadable.length > 0;

  if (wantJson) {
    process.stdout.write(JSON.stringify({ ok: !failed, checked, drifts, skipped, unreadable }));
    process.exit(failed ? 1 : 0);
  }

  console.log(`Dossier SDK-version check — ${checked.length} pinned apiVersion(s) checked\n`);
  for (const c of checked) {
    const status = c.pinned === c.expected ? "OK   " : "DRIFT";
    console.log(`${status} ${c.file}  [${c.sdk}] pinned=${c.pinned} expected=${c.expected}`);
  }
  for (const s of skipped) {
    console.log(`SKIP  ${s.file}  pinned=${s.pinned} (${s.reason})`);
  }
  for (const u of unreadable) {
    console.error(`FAIL  ${u.file}  [${u.sdk}] pinned=${u.pinned} — installed SDK version could not be read`);
  }
  if (failed) {
    if (drifts.length > 0) {
      console.error(
        `\n${drifts.length} dossier SDK apiVersion drift(s). Update the dossier literal to match the installed SDK:`,
      );
      for (const d of drifts) {
        console.error(`  - ${d.file}: ${d.sdk} apiVersion "${d.pinned}" -> "${d.expected}"`);
      }
    }
    if (unreadable.length > 0) {
      console.error(
        `\n${unreadable.length} pinned SDK(s) installed but expected version unreadable — cannot verify (failing closed).`,
      );
    }
    process.exit(1);
  }
  console.log("\nAll pinned dossier SDK apiVersions match the installed SDKs.");
}

// Only run when invoked directly (so the test can import evaluatePins without
// walking the fs or calling process.exit). Compare URL strings — robust across
// Windows backslash/drive-letter differences (mirrors run-migrations.ts).
function isInvokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main();
}
