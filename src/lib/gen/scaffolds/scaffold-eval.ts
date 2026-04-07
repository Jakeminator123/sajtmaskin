import fs from "node:fs/promises";
import path from "node:path";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { matchScaffold, matchScaffoldAuto } from "./matcher";

export interface ScaffoldEvalCase {
  id: string;
  prompt: string;
  buildIntent?: BuildIntent;
  expectedScaffold: string;
  acceptableScaffolds?: string[];
  mustHaveFeatures?: string[];
  mustNotBe?: string[];
  previewOutcome?: "ok" | "white";
}

export interface ScaffoldEvalCaseResult {
  id: string;
  expected: string;
  keywordTop1: string | null;
  semanticTop1: string | null;
  semanticTop3: string[];
  keywordTop1Correct: boolean;
  semanticTop1Correct: boolean;
  semanticTop3Correct: boolean;
  semanticMethod: string;
  semanticConfidence: string;
  semanticUnavailableReason: string | null;
}

export interface ScaffoldEvalSummary {
  total: number;
  keywordTop1Accuracy: number;
  semanticTop1Accuracy: number;
  semanticTop3Accuracy: number;
  genericFallbackRate: number;
  semanticUnavailableRate: number;
  appAuthMisclassificationRate: number;
  previewWhiteRate: number | null;
}

export interface ScaffoldEvalReport {
  timestamp: string;
  results: ScaffoldEvalCaseResult[];
  summary: ScaffoldEvalSummary;
}

function isGenericFallback(scaffoldId: string | null): boolean {
  return scaffoldId === "landing-page" || scaffoldId === "base-nextjs";
}

function isAppFamily(scaffoldId: string | null): boolean {
  return (
    scaffoldId === "dashboard" ||
    scaffoldId === "app-shell" ||
    scaffoldId === "auth-pages"
  );
}

function matchesExpectation(
  scaffoldId: string | null,
  expectedScaffold: string,
  acceptableScaffolds: string[] = [],
): boolean {
  if (!scaffoldId) return false;
  return scaffoldId === expectedScaffold || acceptableScaffolds.includes(scaffoldId);
}

function asPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function runScaffoldSelectionEval(
  cases: ScaffoldEvalCase[],
): Promise<ScaffoldEvalReport> {
  const results: ScaffoldEvalCaseResult[] = [];
  let keywordTop1Hits = 0;
  let semanticTop1Hits = 0;
  let semanticTop3Hits = 0;
  let genericFallbackCount = 0;
  let semanticUnavailableCount = 0;
  let appAuthExpectedCount = 0;
  let appAuthMisclassificationCount = 0;
  let previewOutcomeCount = 0;
  let previewWhiteCount = 0;

  for (const entry of cases) {
    const buildIntent = entry.buildIntent ?? "website";
    const keyword = matchScaffold(entry.prompt, buildIntent);
    const semantic = await matchScaffoldAuto(entry.prompt, buildIntent, {
      useEmbeddings: true,
    });
    const semanticTop3 = semantic.meta.topCandidates.map((candidate) => candidate.id);
    const keywordTop1 = keyword?.id ?? null;
    const semanticTop1 = semantic.scaffold?.id ?? null;
    const acceptable = entry.acceptableScaffolds ?? [];

    const keywordTop1Correct = matchesExpectation(keywordTop1, entry.expectedScaffold, acceptable);
    const semanticTop1Correct = matchesExpectation(semanticTop1, entry.expectedScaffold, acceptable);
    const semanticTop3Correct =
      semanticTop3.includes(entry.expectedScaffold) ||
      acceptable.some((candidate) => semanticTop3.includes(candidate));

    if (keywordTop1Correct) keywordTop1Hits += 1;
    if (semanticTop1Correct) semanticTop1Hits += 1;
    if (semanticTop3Correct) semanticTop3Hits += 1;
    if (semantic.meta.selectionMethod === "default" && isGenericFallback(semanticTop1)) {
      genericFallbackCount += 1;
    }
    if (semantic.meta.semanticUnavailableReason) {
      semanticUnavailableCount += 1;
    }

    const expectsAppFamily = isAppFamily(entry.expectedScaffold);
    if (expectsAppFamily) {
      appAuthExpectedCount += 1;
      if (!isAppFamily(semanticTop1)) {
        appAuthMisclassificationCount += 1;
      }
    }

    if (entry.previewOutcome) {
      previewOutcomeCount += 1;
      if (entry.previewOutcome === "white") previewWhiteCount += 1;
    }

    results.push({
      id: entry.id,
      expected: entry.expectedScaffold,
      keywordTop1,
      semanticTop1,
      semanticTop3,
      keywordTop1Correct,
      semanticTop1Correct,
      semanticTop3Correct,
      semanticMethod: semantic.meta.selectionMethod,
      semanticConfidence: semantic.meta.selectionConfidence,
      semanticUnavailableReason: semantic.meta.semanticUnavailableReason,
    });
  }

  return {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      total: cases.length,
      keywordTop1Accuracy: asPercentage(keywordTop1Hits, cases.length),
      semanticTop1Accuracy: asPercentage(semanticTop1Hits, cases.length),
      semanticTop3Accuracy: asPercentage(semanticTop3Hits, cases.length),
      genericFallbackRate: asPercentage(genericFallbackCount, cases.length),
      semanticUnavailableRate: asPercentage(semanticUnavailableCount, cases.length),
      appAuthMisclassificationRate: asPercentage(
        appAuthMisclassificationCount,
        appAuthExpectedCount,
      ),
      previewWhiteRate:
        previewOutcomeCount > 0 ? asPercentage(previewWhiteCount, previewOutcomeCount) : null,
    },
  };
}

export async function loadScaffoldEvalCasesFromFile(
  filePath: string,
): Promise<ScaffoldEvalCase[]> {
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Scaffold eval data must be an array");
  }
  return parsed as ScaffoldEvalCase[];
}

export function resolveDefaultScaffoldEvalPath(repoRoot: string): string {
  return path.join(repoRoot, "data", "scaffold-eval", "prompts.json");
}
