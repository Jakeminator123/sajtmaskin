import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  REPO_CACHE_ROOT,
  RAW_DISCOVERY_CURRENT_ROOT,
  ensureDir,
  flattenRawSummary,
  normalizeLegacySummary,
  normalizeRepoUrl,
  readJson,
  resolveRepoCacheDir,
  resolveSummaryPath,
  writeJson,
  type RawSummary,
} from "./template-library-discovery";

type RepoTarget = {
  normalizedUrl: string;
  cloneDir: string;
  sourceTemplates: string[];
};

function parseArgs(): {
  sourceRoot: string;
  maxRepos: number | null;
} {
  const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
  const maxArg = process.argv.find((arg) => arg.startsWith("--max="));
  return {
    sourceRoot: sourceArg ? sourceArg.slice("--source=".length) : RAW_DISCOVERY_CURRENT_ROOT,
    maxRepos: maxArg ? Number.parseInt(maxArg.slice("--max=".length), 10) : null,
  };
}

function buildRepoTargets(summary: RawSummary): RepoTarget[] {
  const repos = new Map<string, RepoTarget>();

  for (const entry of flattenRawSummary(summary)) {
    if (!entry.framework_match) continue;

    const repo = normalizeRepoUrl(entry.repo_url);
    if (!repo.normalizedUrl) continue;

    const cloneDir = resolveRepoCacheDir(repo.normalizedUrl);
    if (!cloneDir) continue;

    if (!repos.has(repo.normalizedUrl)) {
      repos.set(repo.normalizedUrl, {
        normalizedUrl: repo.normalizedUrl,
        cloneDir,
        sourceTemplates: [],
      });
    }

    repos.get(repo.normalizedUrl)?.sourceTemplates.push(entry.title);
  }

  return Array.from(repos.values()).sort((a, b) => a.normalizedUrl.localeCompare(b.normalizedUrl));
}

function runGit(args: string[], cwd?: string): void {
  const result = spawnSync("git", args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function cloneMissingRepos(repos: RepoTarget[]): { cloned: number; skipped: number; failed: string[] } {
  let cloned = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const repo of repos) {
    const gitDir = path.join(repo.cloneDir, ".git");
    if (fs.existsSync(gitDir)) {
      skipped += 1;
      continue;
    }

    if (fs.existsSync(repo.cloneDir)) {
      console.warn(`[template-library:cache] Skipping ${repo.normalizedUrl} because ${repo.cloneDir} exists without .git`);
      skipped += 1;
      continue;
    }

    ensureDir(path.dirname(repo.cloneDir));
    console.info(`[template-library:cache] Cloning ${repo.normalizedUrl}`);
    try {
      runGit(["clone", "--depth", "1", repo.normalizedUrl, repo.cloneDir]);
      cloned += 1;
    } catch (error) {
      failed.push(repo.normalizedUrl);
      if (fs.existsSync(repo.cloneDir) && !fs.existsSync(gitDir)) {
        fs.rmSync(repo.cloneDir, { recursive: true, force: true });
      }
      console.warn(`[template-library:cache] Failed to clone ${repo.normalizedUrl}: ${String(error)}`);
    }
  }

  return { cloned, skipped, failed };
}

function main(): void {
  const { sourceRoot, maxRepos } = parseArgs();
  const summaryPath = path.resolve(resolveSummaryPath(sourceRoot));
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Canonical discovery summary not found at ${summaryPath}`);
  }

  const rawSummary = normalizeLegacySummary(readJson<unknown>(summaryPath));
  const repoTargets = buildRepoTargets(rawSummary);
  const selection = typeof maxRepos === "number" ? repoTargets.slice(0, maxRepos) : repoTargets;

  ensureDir(REPO_CACHE_ROOT);
  const { cloned, skipped, failed } = cloneMissingRepos(selection);

  writeJson(path.join(REPO_CACHE_ROOT, "index.json"), {
    generatedAt: new Date().toISOString(),
    sourceSummaryPath: summaryPath,
    totalRepos: repoTargets.length,
    selectedRepos: selection.length,
    failedRepos: failed,
    repos: selection.map((repo) => ({
      normalizedUrl: repo.normalizedUrl,
      cloneDir: repo.cloneDir,
      sourceTemplates: Array.from(new Set(repo.sourceTemplates)).sort(),
    })),
  });

  console.info(
    `[template-library:cache] Ready. selected=${selection.length} cloned=${cloned} skipped=${skipped} failed=${failed.length} cacheRoot=${REPO_CACHE_ROOT}`,
  );
}

main();
