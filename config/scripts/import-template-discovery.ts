import fs from "node:fs";
import path from "node:path";
import {
  RAW_DISCOVERY_CURRENT_ROOT,
  normalizeLegacySummary,
  normalizePlaywrightCatalog,
  readJson,
  resolveExistingLegacySummaryPath,
  resolveSummaryPath,
  writeCanonicalDiscoveryDataset,
  type CanonicalDiscoveryMetadata,
  type PlaywrightCatalogFile,
  type RawSummary,
} from "./template-library-discovery";

type InputFormat = "auto" | "legacy-summary" | "playwright-catalog";

function parseArgs(): {
  from: string;
  format: InputFormat;
  outputRoot: string;
  sourceLabel: string;
} {
  const args = process.argv.slice(2);
  const formatArg = args.find((arg) => arg.startsWith("--format="));
  const fromArg = args.find((arg) => arg.startsWith("--from="));
  const outputArg = args.find((arg) => arg.startsWith("--output="));
  const labelArg = args.find((arg) => arg.startsWith("--label="));

  const defaultSource = resolveExistingLegacySummaryPath();
  if (!fromArg && !defaultSource) {
    throw new Error(
      "No discovery source provided. Use --from=<summary.json|catalog.json|folder> or make the legacy _sidor summary available.",
    );
  }

  return {
    from: fromArg ? fromArg.slice("--from=".length) : defaultSource!,
    format: (formatArg?.slice("--format=".length) as InputFormat | undefined) ?? "auto",
    outputRoot: outputArg ? outputArg.slice("--output=".length) : RAW_DISCOVERY_CURRENT_ROOT,
    sourceLabel: labelArg?.slice("--label=".length) ?? "legacy-external-dataset",
  };
}

function detectFormat(payload: unknown): Exclude<InputFormat, "auto"> {
  if (typeof payload === "object" && payload !== null && Array.isArray((payload as { templates?: unknown }).templates)) {
    return "playwright-catalog";
  }
  return "legacy-summary";
}

function loadInput(inputTarget: string): { filePath: string; payload: unknown } {
  const resolvedPath = path.resolve(resolveSummaryPath(inputTarget));
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Discovery input not found: ${resolvedPath}`);
  }
  return {
    filePath: resolvedPath,
    payload: readJson<unknown>(resolvedPath),
  };
}

function buildLegacyMetadata(summaryPath: string, sourceLabel: string, summary: RawSummary): CanonicalDiscoveryMetadata {
  return {
    generatedAt: new Date().toISOString(),
    sourceKind: "legacy-summary",
    sourceLabel,
    sourcePath: summaryPath,
    sourceUrl: null,
    filterPreset: null,
    totalTemplates: Object.values(summary).flat().length,
    categorySlugs: Object.keys(summary).sort(),
  };
}

async function main() {
  const { from, format, outputRoot, sourceLabel } = parseArgs();
  const { filePath, payload } = loadInput(from);
  const detectedFormat = format === "auto" ? detectFormat(payload) : format;

  if (detectedFormat === "playwright-catalog") {
    const catalog = payload as PlaywrightCatalogFile;
    const { summary, flatEntries } = normalizePlaywrightCatalog(catalog);
    writeCanonicalDiscoveryDataset({
      outputRoot,
      summary,
      flatEntries,
      metadata: {
        generatedAt: new Date().toISOString(),
        sourceKind: "playwright-catalog",
        sourceLabel,
        sourcePath: filePath,
        sourceUrl: catalog.sourceUrl ?? null,
        filterPreset: catalog.filterPreset ?? null,
        totalTemplates: flatEntries.length,
        categorySlugs: Object.keys(summary).sort(),
      },
    });

    console.info(
      `[template-discovery] Imported Playwright catalog -> ${path.resolve(outputRoot)} (${flatEntries.length} entries)`,
    );
    return;
  }

  const summary = normalizeLegacySummary(payload);
  writeCanonicalDiscoveryDataset({
    outputRoot,
    summary,
    metadata: buildLegacyMetadata(filePath, sourceLabel, summary),
  });

  console.info(
    `[template-discovery] Imported legacy summary -> ${path.resolve(outputRoot)} (${Object.values(summary).flat().length} entries)`,
  );
}

main().catch((error) => {
  console.error("[template-discovery] Import failed:", error);
  process.exit(1);
});
