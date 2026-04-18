/**
 * Enrich every Vercel-scraped template with GitHub repository metadata.
 *
 * For every JSON file under `data/dossiers/_raw/_enriched/<id>.json`:
 *   1. Read the existing template metadata (Use Cases, Stack, repoUrl, ...)
 *   2. Fetch GitHub API `GET /repos/<owner>/<repo>` for `archived`, `pushed_at`,
 *      `default_branch`, `topics`, `language`, `stargazers_count`
 *   3. Compute a `sourceVerdict` (ok / source-archived / source-stale / source-unreachable)
 *   4. Write side-by-side as `data/dossiers/_raw/_enriched/<id>.github.json`
 *
 * The next pipeline step (`import-from-enriched.ts`) reads BOTH files and skips
 * candidates whose `sourceVerdict !== "ok"` so we never create dossier drafts
 * from archived or unreachable sources.
 *
 * Resumable: skips IDs that already have a `.github.json` newer than `--max-age-days`
 * (default 7 days). Use `--force` to re-fetch all.
 *
 * Usage:
 *   npx tsx scripts/dossiers/enrich-with-github-api.ts                 # run all
 *   npx tsx scripts/dossiers/enrich-with-github-api.ts --force         # re-fetch all
 *   npx tsx scripts/dossiers/enrich-with-github-api.ts --only=<id>     # one
 *   npx tsx scripts/dossiers/enrich-with-github-api.ts --max-age-days=14
 *
 * Strongly recommended: set GITHUB_TOKEN in .env.local for 5000 req/h
 * (anonymous = 60 req/h, will throttle quickly on the full ~419 templates).
 */

import { config as loadDotenv } from "dotenv";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";

// Sajtmaskin convention: secrets live in .env.local (Next.js style), not .env.
loadDotenv({ path: resolve(process.cwd(), ".env.local") });
import {
  parseRepoRef,
  fetchGithubRepo,
  ageInDays,
  computeSourceVerdict,
  type GithubRepoData,
  type GithubFetchError,
  type SourceVerdict,
} from "./lib/github";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = process.cwd();
const ENRICHED_DIR = resolve(
  WORKSPACE_ROOT,
  "data",
  "dossiers",
  "_raw",
  "_enriched",
);
const SUMMARY_PATH = resolve(
  WORKSPACE_ROOT,
  "data",
  "dossiers",
  "_raw",
  "_enriched",
  "_github-summary.json",
);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  force: boolean;
  only: string | null;
  maxAgeDays: number;
  delayMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { force: false, only: null, maxAgeDays: 7, delayMs: 100 };
  for (const arg of argv) {
    if (arg === "--force") out.force = true;
    else if (arg.startsWith("--only=")) out.only = arg.slice("--only=".length);
    else if (arg.startsWith("--max-age-days=")) {
      const n = Number(arg.slice("--max-age-days=".length));
      if (Number.isFinite(n) && n > 0) out.maxAgeDays = n;
    } else if (arg.startsWith("--delay-ms=")) {
      const n = Number(arg.slice("--delay-ms=".length));
      if (Number.isFinite(n) && n >= 0) out.delayMs = n;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichedTemplate {
  templateUrl?: string;
  templateSlug?: string;
  title?: string;
  repoUrl?: string | null;
  _failed?: boolean;
}

interface GithubEnrichmentFile {
  templateSlug: string;
  repoUrl: string | null;
  fetchedAt: string;
  github: GithubRepoData | null;
  ageDays: number | null;
  sourceVerdict: SourceVerdict;
  reasons: string[];
  fetchError: { status: number; message: string } | null;
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

function listEnrichedFiles(): string[] {
  if (!existsSync(ENRICHED_DIR)) return [];
  return readdirSync(ENRICHED_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".github.json") && !f.startsWith("_"))
    .sort();
}

function shouldSkip(slug: string, force: boolean, maxAgeDays: number): boolean {
  if (force) return false;
  const sidecarPath = join(ENRICHED_DIR, `${slug}.github.json`);
  if (!existsSync(sidecarPath)) return false;
  const st = statSync(sidecarPath);
  const ageHours = (Date.now() - st.mtimeMs) / 3_600_000;
  return ageHours / 24 < maxAgeDays;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;

  if (!existsSync(ENRICHED_DIR)) {
    console.error(
      `[github-enrich] No _enriched/ directory at ${ENRICHED_DIR}. Run dossiers:scrape + dossiers:enrich first.`,
    );
    process.exit(1);
  }

  const allFiles = listEnrichedFiles();
  const slugs = (args.only
    ? allFiles.filter((f) => f.startsWith(`${args.only}.`) || f.startsWith(`${args.only!.replace(/-/g, "_")}.`))
    : allFiles
  ).map((f) => f.replace(/\.json$/, ""));

  if (slugs.length === 0) {
    console.error("[github-enrich] No matching template files found.");
    process.exit(1);
  }

  console.log(
    `[github-enrich] Processing ${slugs.length} template(s)${
      token ? " with GITHUB_TOKEN (5000/h)" : " anonymously (60/h — recommended to set GITHUB_TOKEN)"
    }${args.force ? " — FORCE re-fetch" : ` — skip if sidecar < ${args.maxAgeDays}d old`}`,
  );

  const totals: Record<SourceVerdict | "skipped", number> = {
    ok: 0,
    "source-archived": 0,
    "source-stale": 0,
    "source-unreachable": 0,
    "no-source": 0,
    skipped: 0,
  };

  let rateLimitHit = false;

  for (const slug of slugs) {
    if (shouldSkip(slug, args.force, args.maxAgeDays)) {
      totals.skipped += 1;
      continue;
    }

    const sourcePath = join(ENRICHED_DIR, `${slug}.json`);
    let template: EnrichedTemplate;
    try {
      template = JSON.parse(readFileSync(sourcePath, "utf-8"));
    } catch (e) {
      console.warn(`[github-enrich] Skip ${slug} — failed to read: ${(e as Error).message}`);
      continue;
    }
    if (template._failed) {
      totals["no-source"] += 1;
      continue;
    }

    const repoUrl = (template.repoUrl ?? "").trim();
    const parsed = repoUrl ? parseRepoRef(repoUrl) : null;
    let github: GithubRepoData | null = null;
    let fetchError: GithubFetchError | null = null;

    // Early-exit on hard rate-limit. Anonymous = 60/h, authenticated = 5000/h.
    // If we ever hit 403 with `secondary rate limit` or `API rate limit
    // exceeded`, abort the whole batch instead of writing 400 bogus
    // unreachable-sidecars in a row.
    if (rateLimitHit) {
      console.error(
        `[github-enrich] Rate limit hit earlier this run — aborting remaining ${slugs.length - slugs.indexOf(slug)} templates. Wait ~1h or set GITHUB_TOKEN.`,
      );
      break;
    }

    if (parsed) {
      const fr = await fetchGithubRepo(parsed, token);
      if (fr.ok) {
        github = fr.data;
      } else {
        fetchError = fr;
        // Detect rate-limit response — set flag so next iteration aborts.
        if (
          fr.status === 403 &&
          /rate limit|secondary rate limit/i.test(fr.message)
        ) {
          rateLimitHit = true;
        }
      }
      // Polite delay between calls (respect rate limits + secondary throttle)
      if (args.delayMs > 0) await sleep(args.delayMs);
    }

    const ageDays = github ? ageInDays(github.pushed_at) : null;
    const { verdict, reasons } = computeSourceVerdict({
      hasSourceUrl: Boolean(repoUrl),
      parsed,
      github,
      fetchError,
      ageDays,
    });

    const out: GithubEnrichmentFile = {
      templateSlug: slug,
      repoUrl: repoUrl || null,
      fetchedAt: new Date().toISOString(),
      github,
      ageDays,
      sourceVerdict: verdict,
      reasons,
      fetchError: fetchError
        ? { status: fetchError.status, message: fetchError.message }
        : null,
    };
    writeFileSync(
      join(ENRICHED_DIR, `${slug}.github.json`),
      JSON.stringify(out, null, 2) + "\n",
      "utf-8",
    );
    totals[verdict] += 1;

    const tag = verdict === "ok" ? "✓" : "✗";
    const meta = github
      ? ` (${github.stargazers_count}★, ${ageDays}d)`
      : fetchError
        ? ` (api ${fetchError.status})`
        : "";
    console.log(`${tag} ${slug} → ${verdict}${meta}`);
  }

  // Aggregate summary across all sidecars (not just this run)
  const allSidecars = readdirSync(ENRICHED_DIR).filter((f) => f.endsWith(".github.json"));
  const aggregate: Record<SourceVerdict, number> = {
    ok: 0,
    "source-archived": 0,
    "source-stale": 0,
    "source-unreachable": 0,
    "no-source": 0,
  };
  for (const f of allSidecars) {
    try {
      const data = JSON.parse(readFileSync(join(ENRICHED_DIR, f), "utf-8")) as GithubEnrichmentFile;
      aggregate[data.sourceVerdict] = (aggregate[data.sourceVerdict] ?? 0) + 1;
    } catch {
      /* skip corrupt sidecar */
    }
  }
  if (!existsSync(ENRICHED_DIR)) mkdirSync(ENRICHED_DIR, { recursive: true });
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalSidecars: allSidecars.length,
        verdicts: aggregate,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  console.log("");
  console.log(
    `[github-enrich] This run: ok=${totals.ok}, archived=${totals["source-archived"]}, stale=${totals["source-stale"]}, unreachable=${totals["source-unreachable"]}, no-source=${totals["no-source"]}, skipped=${totals.skipped}`,
  );
  console.log(`[github-enrich] All sidecars: ${allSidecars.length} (verdict tally in ${SUMMARY_PATH})`);
}

main().catch((e) => {
  console.error("[github-enrich] Failed:", e);
  process.exit(1);
});
