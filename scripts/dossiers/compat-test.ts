/**
 * Compatibility test for dossier source repos.
 *
 * For every dossier in `data/dossiers/<id>/` with a `sourceRepoUrl`:
 *   1. Parse owner/repo (and optional subpath like `#examples/blog-starter`)
 *   2. Fetch GitHub API `GET /repos/<owner>/<repo>` for `archived`, `pushed_at`,
 *      `default_branch`, `topics`, `language`, `stargazers_count`
 *   3. Apply rules:
 *      - GitHub `archived: true` → verdict `source-archived`
 *      - `pushed_at < (now − 18 mån)` → verdict `source-stale`
 *      - 404 / network → verdict `source-unreachable`
 *      - else → verdict `ok`
 *   4. Write a report to `data/dossiers/_index/compat-report.json`
 *   5. With `--apply`: update each affected manifest's `_status` (writes
 *      `source-archived`, `source-stale`, or `source-unreachable` instead of
 *      `active`/`draft`). Without `--apply`: dry-run, only report.
 *
 * Reads optional `GITHUB_TOKEN` from .env.local for higher rate limits
 * (5000/h auth vs 60/h anonymous). The 30 active dossiers fit anonymous,
 * so token is optional today.
 *
 * Usage:
 *   npx tsx scripts/dossiers/compat-test.ts                 # dry-run report
 *   npx tsx scripts/dossiers/compat-test.ts --apply         # update manifests
 *   npx tsx scripts/dossiers/compat-test.ts --only=payments-stripe-checkout
 *   npx tsx scripts/dossiers/compat-test.ts --json          # machine-readable stdout
 */

import { config as loadDotenv } from "dotenv";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";

// Sajtmaskin convention: secrets live in .env.local (Next.js style), not .env.
// dotenv default loads .env so we have to point it at .env.local explicitly.
loadDotenv({ path: resolve(process.cwd(), ".env.local") });
import {
  parseRepoRef,
  fetchGithubRepo,
  ageInDays,
  computeSourceVerdict,
  STALE_AGE_DAYS,
  type ParsedRepoRef,
  type GithubRepoData,
  type GithubFetchError,
  type SourceVerdict,
} from "./lib/github";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = process.cwd();
const DOSSIER_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers");
const INDEX_ROOT = join(DOSSIER_ROOT, "_index");
const REPORT_PATH = join(INDEX_ROOT, "compat-report.json");

const RESERVED_DIRS = new Set(["_raw", "_index", "_legacy", "_repo-cache"]);
const HEALTHY_STATUSES = new Set(["draft", "active"]);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  apply: boolean;
  json: boolean;
  only: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { apply: false, json: false, only: null };
  for (const arg of argv) {
    if (arg === "--apply") out.apply = true;
    else if (arg === "--json") out.json = true;
    else if (arg.startsWith("--only=")) out.only = arg.slice("--only=".length);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DossierManifest {
  id: string;
  sourceRepoUrl?: string;
  sourceTemplateUrl?: string;
  _status?: string;
  [k: string]: unknown;
}

type Verdict = SourceVerdict | "skipped";

interface DossierCompatResult {
  id: string;
  status: string;
  sourceRepoUrl: string | null;
  parsed: ParsedRepoRef | null;
  github: GithubRepoData | null;
  ageDays: number | null;
  verdict: Verdict;
  reasons: string[];
}

interface CompatReport {
  $schema?: string;
  generatedAt: string;
  ruleConfig: { staleAgeDays: number };
  totals: Record<Verdict | "applied", number>;
  results: DossierCompatResult[];
}

const SCHEMA_REF = "../../../docs/schemas/strict/compat-report.schema.json";

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

function listDossierIds(): string[] {
  if (!existsSync(DOSSIER_ROOT)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(DOSSIER_ROOT)) {
    if (RESERVED_DIRS.has(entry)) continue;
    const dir = join(DOSSIER_ROOT, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (existsSync(join(dir, "manifest.json"))) out.push(entry);
  }
  return out.sort();
}

function readManifest(id: string): DossierManifest {
  const path = join(DOSSIER_ROOT, id, "manifest.json");
  return JSON.parse(readFileSync(path, "utf-8")) as DossierManifest;
}

/**
 * Atomic write: write to a temp file then rename. Survives Windows file locks
 * when the IDE or another process has the file open for read. Async with
 * `setTimeout`-based backoff to avoid blocking the event loop.
 */
async function writeManifest(id: string, manifest: DossierManifest): Promise<boolean> {
  const path = join(DOSSIER_ROOT, id, "manifest.json");
  const body = JSON.stringify(manifest, null, 2) + "\n";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}-${attempt}`;
    try {
      writeFileSync(tmpPath, body, "utf-8");
      const { renameSync } = await import("node:fs");
      renameSync(tmpPath, path);
      return true;
    } catch (e) {
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      if (attempt === 2) {
        console.warn(
          `[compat-test] WARN: could not write manifest ${id} (${(e as Error).message}). Skipping apply for this dossier.`,
        );
        return false;
      }
      // backoff: 200ms, 400ms
      await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;

  const ids = args.only ? [args.only] : listDossierIds();
  if (ids.length === 0) {
    console.error("[compat-test] No dossiers found.");
    process.exit(1);
  }

  if (!args.json) {
    console.log(
      `[compat-test] Checking ${ids.length} dossier(s)${
        token ? " with GITHUB_TOKEN" : " anonymously (60 req/h)"
      }${args.apply ? " — APPLY mode" : " — dry-run"}`,
    );
  }

  const results: DossierCompatResult[] = [];
  let applied = 0;

  for (const id of ids) {
    let manifest: DossierManifest;
    try {
      manifest = readManifest(id);
    } catch (e) {
      results.push({
        id,
        status: "unknown",
        sourceRepoUrl: null,
        parsed: null,
        github: null,
        ageDays: null,
        verdict: "source-unreachable",
        reasons: [`failed to read manifest: ${(e as Error).message}`],
      });
      continue;
    }

    const status = String(manifest._status ?? "active");
    if (!HEALTHY_STATUSES.has(status) && status !== "active") {
      // Already flagged with a non-healthy status from a prior run — re-check anyway,
      // but pass through if no source.
    }

    const sourceUrl = String(manifest.sourceRepoUrl ?? "").trim();
    const parsed = sourceUrl ? parseRepoRef(sourceUrl) : null;

    let github: GithubRepoData | null = null;
    let fetchError: GithubFetchError | null = null;
    if (parsed) {
      const fr = await fetchGithubRepo(parsed, token);
      if (fr.ok) github = fr.data;
      else fetchError = fr;
    }
    const ageDays = github ? ageInDays(github.pushed_at) : null;
    const { verdict, reasons } = computeSourceVerdict({
      hasSourceUrl: Boolean(sourceUrl),
      parsed,
      github,
      fetchError,
      ageDays,
    });

    const result: DossierCompatResult = {
      id,
      status,
      sourceRepoUrl: sourceUrl || null,
      parsed,
      github,
      ageDays,
      verdict,
      reasons,
    };
    results.push(result);

    if (!args.json) {
      const tag = verdict === "ok" ? "✓" : "✗";
      const meta = github
        ? ` (${github.stargazers_count}★, ${ageDays}d, ${
            github.archived ? "archived" : "active"
          })`
        : "";
      console.log(`${tag} ${id} → ${verdict}${meta}`);
      for (const r of reasons) console.log(`    · ${r}`);
    }

    if (args.apply) {
      const SOURCE_STATUSES = new Set(["source-archived", "source-stale", "source-unreachable"]);
      if (verdict !== "ok" && verdict !== "no-source") {
        // Apply bad verdict
        manifest._status = verdict;
        const wrote = await writeManifest(id, manifest);
        if (wrote) applied += 1;
      } else if (verdict === "ok" && SOURCE_STATUSES.has(status)) {
        // Recovery: source is healthy now but a previous run had marked it bad.
        // Reset to active so runtime selection picks it up again.
        manifest._status = "active";
        const wrote = await writeManifest(id, manifest);
        if (wrote) {
          applied += 1;
          if (!args.json) console.log(`    · recovered: ${status} → active`);
        }
      }
    }
  }

  // Aggregate
  const totals: Record<string, number> = {
    ok: 0,
    "source-archived": 0,
    "source-stale": 0,
    "source-unreachable": 0,
    "no-source": 0,
    skipped: 0,
    applied,
  };
  for (const r of results) {
    totals[r.verdict] = (totals[r.verdict] ?? 0) + 1;
  }

  const report: CompatReport = {
    $schema: SCHEMA_REF,
    generatedAt: new Date().toISOString(),
    ruleConfig: { staleAgeDays: STALE_AGE_DAYS },
    totals: totals as CompatReport["totals"],
    results,
  };

  if (!existsSync(INDEX_ROOT)) mkdirSync(INDEX_ROOT, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(`[compat-test] Wrote report → ${REPORT_PATH}`);
    console.log(
      `[compat-test] Totals: ok=${totals.ok}, source-archived=${totals["source-archived"]}, source-stale=${totals["source-stale"]}, source-unreachable=${totals["source-unreachable"]}, no-source=${totals["no-source"]}${
        args.apply ? `, applied=${applied}` : ""
      }`,
    );
  }
}

main().catch((e) => {
  console.error("[compat-test] Failed:", e);
  process.exit(1);
});
