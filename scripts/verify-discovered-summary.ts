/**
 * Validate a grouped discovery summary.json (e.g. scraped-vercel-scorefolds/summary.json).
 * Ensures build-template-library.ts can read it; does not require strict JSON Schema
 * (scrapes may add extra fields — normalizeLegacySummary strips to the core contract).
 *
 * Usage (repo root):
 *   npx tsx scripts/verify-discovered-summary.ts
 *   npx tsx scripts/verify-discovered-summary.ts --path=scraped-vercel-scorefolds
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeLegacySummary, resolveSummaryPath } from "./template-library-discovery";

const WORKSPACE_ROOT = process.cwd();

function readArg(name: string, argv: string[]): string | null {
  const prefix = `${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function main(): void {
  const argv = process.argv.slice(2);
  const rawPath = readArg("--path", argv) ?? path.join(WORKSPACE_ROOT, "scraped-vercel-scorefolds");
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
    `  Tip: run build with explicit source:\n    npx tsx scripts/build-template-library.ts --source="${path.dirname(summaryPath)}"`,
  );
}

main();
