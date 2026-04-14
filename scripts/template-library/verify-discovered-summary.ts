/**
 * Validate a grouped discovery summary.json (e.g. data/external-template-pipeline/scrape-cache/current/summary.json).
 * Ensures build-template-library.ts can read it; does not require strict JSON Schema
 * (scrapes may add extra fields — normalizeLegacySummary strips to the core contract).
 *
 * Usage (repo root):
 *   npx tsx scripts/template-library/verify-discovered-summary.ts
 *   npx tsx scripts/template-library/verify-discovered-summary.ts --path=data/external-template-pipeline/scrape-cache/current
 */
import fs from "node:fs";
import path from "node:path";
import {
  RAW_DISCOVERY_CURRENT_ROOT,
  SCRAPE_CACHE_CURRENT_ROOT,
  normalizeLegacySummary,
  resolveSummaryPath,
} from "./template-library-discovery";

function readArg(name: string, argv: string[]): string | null {
  const prefix = `${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function main(): void {
  const argv = process.argv.slice(2);
  const rawPath = readArg("--path", argv) ?? SCRAPE_CACHE_CURRENT_ROOT;
  const summaryPath = resolveSummaryPath(rawPath);

  if (!fs.existsSync(summaryPath)) {
    console.error(`[verify-discovered-summary] Missing file: ${summaryPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as unknown;
  const normalized = normalizeLegacySummary(raw);
  const categories = Object.keys(normalized).sort();
  let total = 0;
  for (const k of categories) {
    total += normalized[k]?.length ?? 0;
  }

  console.info(`[verify-discovered-summary] OK: ${summaryPath}`);
  console.info(`  Categories: ${categories.length} (${categories.slice(0, 5).join(", ")}${categories.length > 5 ? ", …" : ""})`);
  console.info(`  Template records after normalize: ${total}`);
  console.info(
    `  Tip: import to canonical raw discovery, then build from there:\n` +
    `    npx tsx scripts/template-library/import-template-discovery.ts --from="${path.dirname(summaryPath)}"\n` +
    `    npx tsx scripts/template-library/build-template-library.ts --source="${RAW_DISCOVERY_CURRENT_ROOT}"`,
  );
}

main();
