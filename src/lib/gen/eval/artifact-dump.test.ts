import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodeFile } from "../parser";
import type { RunFinalizePreflightResult } from "../stream/finalize-preflight";
import type { EvalCheckSources, EvalReport, EvalResult } from "./runner";
import type { EvalPrompt } from "./prompts";
import {
  createEvalRunId,
  resolveEvalDumpMode,
  sanitizeEvalPathSegment,
  writeEvalArtifacts,
  writeEvalSuiteSummary,
} from "./artifact-dump";

const FILES: CodeFile[] = [
  {
    path: "app/page.tsx",
    language: "tsx",
    content: "export default function Page(){return <main>OK</main>;}",
  },
];

const PROMPT: EvalPrompt = {
  id: "arcade/with:klarna",
  prompt: "Build an arcade site",
  intent: "website",
  expected: {
    minFiles: 1,
    maxFiles: 3,
    requiredFiles: ["app/page.tsx"],
    requiredImports: [],
    shouldCompile: true,
  },
};

function makeResult(passed: boolean): EvalResult {
  return {
    promptId: PROMPT.id,
    generationStatus: "passed",
    failureStage: null,
    generationTimeMs: 1234,
    fileCount: 1,
    finalProjectFiles: 1,
    generatedSurfaceFiles: 1,
    scaffoldId: "base-nextjs",
    variantId: "clean",
    promptSize: {
      totalChars: 1000,
      totalEstimatedTokens: 250,
      staticCoreChars: 500,
      staticCoreEstimatedTokens: 125,
      dynamicContextChars: 500,
      dynamicContextEstimatedTokens: 125,
      dynamicBudgetUsedTokens: 100,
      dynamicBudgetBudgetTokens: 1000,
      droppedBlocks: 0,
      largestBlocks: [],
    },
    preflight: {
      errors: passed ? 0 : 1,
      warnings: 0,
      previewBlocked: !passed,
      previewBlockingReason: passed ? null : "syntax",
    },
    droppedProtectedPaths: [],
    checks: [
      {
        name: "syntax",
        passed,
        message: passed ? "ok" : "syntax failed",
        score: passed ? 1 : 0,
      },
    ],
    totalScore: passed ? 1 : 0.4,
    passed,
    blockingChecks: passed ? [] : ["syntax"],
  };
}

function makeSources(): EvalCheckSources {
  return {
    rawFiles: FILES,
    canonicalRuntimeFiles: FILES,
    canonicalFiles: FILES,
    generatedSurfaceFiles: FILES,
    canonicalContent: "CODEPROJECT",
    droppedProtectedPaths: [],
  };
}

function makePreflight(): RunFinalizePreflightResult {
  return {
    filesJson: JSON.stringify(FILES),
    finalizedFilesForPreview: FILES,
    preflightFileCount: FILES.length,
    preflightIssues: [],
    previewBlockingReason: null,
    previewStart: {
      canStartPreview: true,
      primaryPreviewTarget: "preview",
      shimBlocked: false,
      requiresEnvConfig: false,
      hasCriticalInstallRisk: false,
      hasCriticalCodeFailure: false,
      compatibilityPreviewAllowed: false,
      issueCounts: {
        code_structure_failure: 0,
        dependency_install_failure: 0,
        env_config_missing: 0,
        shim_preview_failure: 0,
        non_blocking_quality_warning: 0,
      },
      blockingCategories: [],
    },
    unresolvedImportFallbackUsed: false,
  } as RunFinalizePreflightResult;
}

async function withTempRepo<T>(fn: (repoRoot: string) => Promise<T>): Promise<T> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "eval-artifacts-"));
  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(repoRoot);
  try {
    return await fn(repoRoot);
  } finally {
    cwdSpy.mockRestore();
    await rm(repoRoot, { recursive: true, force: true });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveEvalDumpMode", () => {
  it("parses off, failed and all modes", () => {
    expect(resolveEvalDumpMode({} as NodeJS.ProcessEnv)).toBe("off");
    expect(resolveEvalDumpMode({ SAJTMASKIN_EVAL_DUMP_FILES: "0" } as unknown as NodeJS.ProcessEnv)).toBe("off");
    expect(resolveEvalDumpMode({ SAJTMASKIN_EVAL_DUMP_FILES: "true" } as unknown as NodeJS.ProcessEnv)).toBe("failed");
    expect(resolveEvalDumpMode({ SAJTMASKIN_EVAL_DUMP_FILES: "all" } as unknown as NodeJS.ProcessEnv)).toBe("all");
  });
});

describe("createEvalRunId", () => {
  it("uses second-level granularity to avoid same-minute overwrites", () => {
    expect(createEvalRunId(new Date("2026-05-01T18:39:42.123Z"))).toBe("2026-05-01-183942");
  });
});

describe("writeEvalArtifacts", () => {
  it("sanitizes prompt ids before creating artifact directories", () => {
    expect(sanitizeEvalPathSegment("../arcade/with:klarna")).toBe("..-arcade-with-klarna");
  });

  it("writes prompt metadata and skips file dumps for passing prompts in failed-only mode", async () => {
    await withTempRepo(async (repoRoot) => {
      const artifact = await writeEvalArtifacts({
        runId: "20260501-120000",
        prompt: PROMPT,
        result: makeResult(true),
        dumpMode: "failed",
        stages: {
          rawContent: "raw",
          fixedContent: "fixed",
          rawFiles: FILES,
          fixedFiles: FILES,
          mergedFiles: FILES,
          completeProjectFiles: FILES,
          sources: makeSources(),
          preflight: makePreflight(),
        },
      });

      expect(artifact.filesDumped).toBe(false);
      expect(existsSync(path.join(repoRoot, artifact.runDirRelative, "summary.json"))).toBe(true);
      expect(existsSync(path.join(repoRoot, artifact.runDirRelative, "raw-files"))).toBe(false);
    });
  });

  it("writes failed prompt file dumps and sanitized preflight metadata", async () => {
    await withTempRepo(async (repoRoot) => {
      const artifact = await writeEvalArtifacts({
        runId: "20260501-120000",
        prompt: PROMPT,
        result: makeResult(false),
        dumpMode: "failed",
        stages: {
          rawContent: "raw",
          fixedContent: "fixed",
          rawFiles: FILES,
          fixedFiles: FILES,
          mergedFiles: FILES,
          completeProjectFiles: FILES,
          sources: makeSources(),
          preflight: makePreflight(),
        },
      });

      const artifactDir = path.join(repoRoot, artifact.runDirRelative);
      expect(existsSync(path.join(artifactDir, "raw-files", "app", "page.tsx"))).toBe(true);
      expect(existsSync(path.join(artifactDir, "canonical-runtime-files", "app", "page.tsx"))).toBe(true);
      const preflight = JSON.parse(await readFile(path.join(artifactDir, "preflight.json"), "utf8"));
      expect(preflight.filesJson).toBeUndefined();
      expect(preflight.preflightFileCount).toBe(1);
    });
  });

  it("writes latest suite summary with prompt artifact links", async () => {
    await withTempRepo(async (repoRoot) => {
      const result = makeResult(false);
      const report: EvalReport = {
        timestamp: "2026-05-01T12:00:00.000Z",
        model: "test-model",
        results: [result],
        summary: {
          total: 1,
          passed: 0,
          avgScore: result.totalScore,
          avgTimeMs: result.generationTimeMs,
          blockingFailures: 1,
          blockingCheckCounts: { syntax: 1 },
        },
      };
      await writeEvalSuiteSummary({
        runId: "20260501-120000",
        report,
        promptArtifacts: [
          {
            promptId: PROMPT.id,
            runDir: path.join(repoRoot, "data", "eval-runs", "runs", "x"),
            runDirRelative: "data/eval-runs/runs/x",
            filesDumped: true,
          },
        ],
      });

      const summary = JSON.parse(
        await readFile(path.join(repoRoot, "data", "eval-runs", "latest", "summary.json"), "utf8"),
      );
      expect(summary.prompts[0].artifactDir).toBe("data/eval-runs/runs/x");
      expect(existsSync(path.join(repoRoot, "data", "eval-runs", "latest", "summary.md"))).toBe(true);
    });
  });
});
