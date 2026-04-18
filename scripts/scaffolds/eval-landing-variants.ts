/**
 * Variant-selection audit for the `landing-page` scaffold.
 *
 * Runs `pickScaffoldVariantAsync` against the curated prompts in
 * `data/scaffold-eval/landing-variant-prompts.json` and tallies which
 * landing-page variant wins each case. Used to answer the körplan
 * question "behövs både `nature-flow` och `warm-local`?" without
 * deleting anything: collect evidence first.
 *
 * The script is read-only on the runtime — no LLM-side effects beyond
 * the embedding API call inside the matcher (which itself falls back
 * to keyword scoring when `OPENAI_API_KEY` is missing or the
 * `config/scaffold-variants/_index/variant-embeddings.json` cache is
 * unavailable).
 *
 * Output: `data/scaffold-eval/reports/landing-variant-latest.json` and
 * a timestamped sibling for diffing across runs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  getVariantsForScaffold,
  pickScaffoldVariantAsync,
} from "@/lib/gen/scaffold-variants";

const SCAFFOLD_ID = "landing-page";

interface VariantPromptCase {
  id: string;
  prompt: string;
  /** Informative — which variant the prompt is *intended* to surface. Not enforced. */
  expectedVariant?: string;
  rationale?: string;
}

interface CaseResult {
  id: string;
  prompt: string;
  expectedVariant: string | null;
  pickedVariantId: string | null;
  matchedExpected: boolean | null;
}

interface VariantSummary {
  id: string;
  label: string;
  wins: number;
  /** Number of cases where at least one of the variant's own keywords appears in the prompt. */
  keywordCoverage: number;
  /** Number of cases where this variant was the *expected* one. */
  expectedCount: number;
  /** Wins among the cases where this variant was expected. */
  expectedWins: number;
}

interface Report {
  timestamp: string;
  scaffoldId: string;
  totalCases: number;
  embeddingApiKeyPresent: boolean;
  variantsBySummary: VariantSummary[];
  results: CaseResult[];
  candidatesForRemoval: string[];
}

function loadJson<T>(filePath: string): Promise<T> {
  return fs.readFile(filePath, "utf-8").then((raw) => JSON.parse(raw) as T);
}

function variantKeywordHits(variantKeywords: string[], prompt: string): boolean {
  const lower = prompt.toLowerCase();
  for (const keyword of variantKeywords) {
    const k = keyword.toLowerCase();
    const re = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    if (re.test(lower)) return true;
  }
  return false;
}

async function main() {
  const repoRoot = process.cwd();
  const promptsPath = path.join(
    repoRoot,
    "data",
    "scaffold-eval",
    "landing-variant-prompts.json",
  );
  const cases = await loadJson<VariantPromptCase[]>(promptsPath);
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error(`[landing-variant-eval] no cases at ${promptsPath}`);
  }

  const variants = getVariantsForScaffold(SCAFFOLD_ID);
  if (variants.length === 0) {
    throw new Error(`[landing-variant-eval] no variants registered for ${SCAFFOLD_ID}`);
  }

  const summaries = new Map<string, VariantSummary>(
    variants.map((variant) => [
      variant.id,
      {
        id: variant.id,
        label: variant.label,
        wins: 0,
        keywordCoverage: 0,
        expectedCount: 0,
        expectedWins: 0,
      },
    ]),
  );

  const results: CaseResult[] = [];

  for (const entry of cases) {
    const expected = entry.expectedVariant ?? null;
    const picked = await pickScaffoldVariantAsync({
      prompt: entry.prompt,
      scaffoldId: SCAFFOLD_ID,
      generationMode: "init",
    });

    const pickedId = picked?.id ?? null;
    const matched = expected ? pickedId === expected : null;

    if (pickedId) {
      const summary = summaries.get(pickedId);
      if (summary) summary.wins += 1;
    }

    if (expected) {
      const summary = summaries.get(expected);
      if (summary) {
        summary.expectedCount += 1;
        if (matched) summary.expectedWins += 1;
      }
    }

    for (const variant of variants) {
      if (variantKeywordHits(variant.keywords, entry.prompt)) {
        const summary = summaries.get(variant.id);
        if (summary) summary.keywordCoverage += 1;
      }
    }

    results.push({
      id: entry.id,
      prompt: entry.prompt,
      expectedVariant: expected,
      pickedVariantId: pickedId,
      matchedExpected: matched,
    });
  }

  const variantsBySummary = [...summaries.values()].sort((a, b) => b.wins - a.wins);
  const candidatesForRemoval = variantsBySummary
    .filter((summary) => summary.wins === 0)
    .map((summary) => summary.id);

  const report: Report = {
    timestamp: new Date().toISOString(),
    scaffoldId: SCAFFOLD_ID,
    totalCases: cases.length,
    embeddingApiKeyPresent: Boolean((process.env.OPENAI_API_KEY ?? "").trim()),
    variantsBySummary,
    results,
    candidatesForRemoval,
  };

  const reportDir = path.join(repoRoot, "data", "scaffold-eval", "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const latestPath = path.join(reportDir, "landing-variant-latest.json");
  const stampedPath = path.join(
    reportDir,
    `landing-variant-${report.timestamp.replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(latestPath, JSON.stringify(report, null, 2), "utf-8");
  await fs.writeFile(stampedPath, JSON.stringify(report, null, 2), "utf-8");

  console.info(
    `[landing-variant-eval] cases=${report.totalCases} embedding_api=${report.embeddingApiKeyPresent ? "on" : "off"}`,
  );
  for (const summary of variantsBySummary) {
    console.info(
      `[landing-variant-eval] ${summary.id.padEnd(16)} wins=${String(summary.wins).padStart(2)}/${report.totalCases} expected_wins=${summary.expectedWins}/${summary.expectedCount} keyword_coverage=${summary.keywordCoverage}`,
    );
  }
  if (candidatesForRemoval.length > 0) {
    console.info(
      `[landing-variant-eval] candidates_for_removal=${candidatesForRemoval.join(",")}`,
    );
  } else {
    console.info("[landing-variant-eval] candidates_for_removal=none");
  }
  console.info(`[landing-variant-eval] wrote ${latestPath}`);
}

main().catch((error) => {
  console.error("[landing-variant-eval] failed:", error);
  process.exitCode = 1;
});
