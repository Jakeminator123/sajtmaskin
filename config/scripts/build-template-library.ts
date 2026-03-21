/**
 * build-template-library.ts — Zone 2 → template-library artifacts
 *
 * Reads research/normalized-catalog.json and writes
 * src/lib/gen/template-library/template-library.generated.json.
 *
 * Only entries with promotionDecision != "ignore" are included.
 * The output conforms to TemplateLibraryCatalogFile so the existing
 * runtime (catalog.ts, search.ts, system-prompt.ts) works unchanged.
 *
 * Usage:
 *   npx tsx config/scripts/build-template-library.ts
 *   npm run template-library:build
 */

import fs from "fs";
import path from "path";
import type {
  NormalizedCatalogEntry,
  NormalizedCatalogFile,
  TemplateLibraryCatalogFile,
  TemplateLibraryEntry,
  TemplateLibraryRepoInfo,
  TemplateLibraryVerdict,
} from "../../src/lib/gen/template-library/types";

const CATALOG_INPUT = path.resolve(__dirname, "../../research/normalized-catalog.json");
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../../src/lib/gen/template-library/template-library.generated.json",
);

function toVerdict(entry: NormalizedCatalogEntry): TemplateLibraryVerdict {
  if (!entry.repoUrl) return "missing_repo";
  if (!entry.frameworkMatch) return "non_next_template";
  if (entry.repoHealth.isMonorepo) return "huge_monorepo";
  if (entry.promotionDecision === "ignore") return "research_only";
  return "valid";
}

function toRepoInfo(entry: NormalizedCatalogEntry): TemplateLibraryRepoInfo {
  return {
    url: entry.repoUrl,
    normalizedUrl: entry.repoUrl?.replace(/\.git$/, "").replace(/\/$/, "") ?? null,
    subpath: null,
    clonePath: null,
    packageManager: entry.repoHealth.packageManager,
    hasNext: entry.frameworkMatch,
    hasReact: entry.frameworkMatch,
    isMonorepo: entry.repoHealth.isMonorepo,
    hasAppDir: entry.repoHealth.hasAppDir,
    hasSrcAppDir: entry.repoHealth.hasSrcAppDir,
  };
}

function toTemplateLibraryEntry(entry: NormalizedCatalogEntry): TemplateLibraryEntry {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    categorySlug: entry.categorySlug,
    categoryName: entry.categoryName,
    templateUrl: entry.sourceUrl,
    demoUrl: entry.demoUrl,
    description: entry.description,
    frameworkReason: entry.frameworkReason,
    frameworkMatch: entry.frameworkMatch,
    verdict: toVerdict(entry),
    qualityScore: entry.qualityScore,
    repo: toRepoInfo(entry),
    stackTags: entry.stackTags,
    usefulLines: [],
    noiseLines: [],
    strengths: entry.recommendedScaffoldFamilies.length > 0
      ? [`Fits scaffold families: ${entry.recommendedScaffoldFamilies.join(", ")}`]
      : [],
    weaknesses: entry.repoHealth.placeholderCopyRatio > 0.3
      ? ["High placeholder-copy ratio"]
      : [],
    recommendedScaffoldFamilies: entry.recommendedScaffoldFamilies,
    signals: entry.signals,
    summary: entry.description,
    selectedFiles: [],
  };
}

function main() {
  if (!fs.existsSync(CATALOG_INPUT)) {
    console.error(`normalized-catalog.json not found at ${CATALOG_INPUT}`);
    console.error("Run 'npm run research:normalize -- --input <dir>' first.");
    process.exit(1);
  }

  const normalized: NormalizedCatalogFile = JSON.parse(
    fs.readFileSync(CATALOG_INPUT, "utf-8"),
  );

  const included = normalized.entries.filter((e) => e.promotionDecision !== "ignore");
  const entries = included.map(toTemplateLibraryEntry);

  const output: TemplateLibraryCatalogFile = {
    generatedAt: new Date().toISOString(),
    sourceRoot: "research/normalized-catalog.json",
    totalTemplates: normalized.entryCount,
    curatedTemplates: entries.length,
    entries,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.info(
    `Wrote ${entries.length} / ${normalized.entryCount} entries to template-library.generated.json`,
  );
  console.info(
    `Excluded: ${normalized.entryCount - entries.length} entries with promotionDecision=ignore`,
  );
}

main();
