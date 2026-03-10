import { generateCode } from "../engine";
import { ENGINE_MAX_OUTPUT_TOKENS } from "../defaults";
import { buildSystemPrompt } from "../system-prompt";
import { parseCodeProject } from "../parser";
import { runAutoFix } from "../autofix/pipeline";
import { DEFAULT_MODEL } from "../models";
import { EVAL_PROMPTS, type EvalPrompt } from "./prompts";
import {
  checkFileCount,
  checkRequiredFiles,
  checkExports,
  checkImports,
  checkSyntax,
  checkResponsive,
  checkAccessibility,
  checkSemanticTokens,
  type CheckResult,
} from "./checks";

export interface EvalResult {
  promptId: string;
  generationTimeMs: number;
  fileCount: number;
  checks: CheckResult[];
  totalScore: number;
  passed: boolean;
}

export interface EvalSummary {
  total: number;
  passed: number;
  avgScore: number;
  avgTimeMs: number;
}

export interface EvalReport {
  timestamp: string;
  model: string;
  results: EvalResult[];
  summary: EvalSummary;
}

async function collectSSEContent(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("data: ")) continue;

        const prevLine = i > 0 ? lines[i - 1] : "";
        if (prevLine !== "event: content") continue;

        try {
          const payload = JSON.parse(line.slice(6)) as { text?: string };
          if (payload.text) {
            accumulated += payload.text;
          }
        } catch {
          // malformed JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

async function evaluatePrompt(
  evalPrompt: EvalPrompt,
  model: string,
): Promise<EvalResult> {
  const start = performance.now();

  const systemPrompt = await buildSystemPrompt({
    intent: evalPrompt.intent,
    imageGenerations: false,
  });

  const stream = generateCode({
    prompt: evalPrompt.prompt,
    systemPrompt,
    model,
    thinking: false,
    maxTokens: ENGINE_MAX_OUTPUT_TOKENS,
  });

  const content = await collectSSEContent(stream);
  const generationTimeMs = Math.round(performance.now() - start);

  const { fixedContent } = await runAutoFix(content);
  const project = parseCodeProject(fixedContent);

  const checks: CheckResult[] = [
    checkFileCount(project.files, evalPrompt.expected.minFiles, evalPrompt.expected.maxFiles),
    checkRequiredFiles(project.files, evalPrompt.expected.requiredFiles),
    checkExports(project.files),
    checkImports(project.files, evalPrompt.expected.requiredImports),
    checkResponsive(project.files),
    checkAccessibility(project.files),
    checkSemanticTokens(project.files),
  ];

  if (evalPrompt.expected.shouldCompile) {
    checks.push(await checkSyntax(fixedContent));
  }

  const totalScore =
    checks.length > 0
      ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
      : 0;

  const syntaxCheck = checks.find((c) => c.name === "syntax");
  const compileOk = !evalPrompt.expected.shouldCompile || syntaxCheck?.passed !== false;

  return {
    promptId: evalPrompt.id,
    generationTimeMs,
    fileCount: project.files.length,
    checks,
    totalScore,
    passed: compileOk && totalScore >= 0.6,
  };
}

export async function runEval(
  options?: { model?: string; prompts?: EvalPrompt[] },
): Promise<EvalReport> {
  const model = options?.model ?? DEFAULT_MODEL;
  const prompts = options?.prompts ?? EVAL_PROMPTS;

  const results: EvalResult[] = [];

  for (const evalPrompt of prompts) {
    try {
      console.info(`[eval] Running: ${evalPrompt.id}...`);
      const result = await evaluatePrompt(evalPrompt, model);
      results.push(result);
      console.info(
        `[eval] ${evalPrompt.id}: score=${(result.totalScore * 100).toFixed(0)}% ` +
          `files=${result.fileCount} time=${result.generationTimeMs}ms ` +
          `${result.passed ? "PASS" : "FAIL"}`,
      );
    } catch (err) {
      console.error(
        `[eval] ${evalPrompt.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      results.push({
        promptId: evalPrompt.id,
        generationTimeMs: 0,
        fileCount: 0,
        checks: [
          {
            name: "generation",
            passed: false,
            message: err instanceof Error ? err.message : "Unknown error",
            score: 0,
          },
        ],
        totalScore: 0,
        passed: false,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const avgScore =
    results.length > 0
      ? results.reduce((s, r) => s + r.totalScore, 0) / results.length
      : 0;
  const avgTimeMs =
    results.length > 0
      ? results.reduce((s, r) => s + r.generationTimeMs, 0) / results.length
      : 0;

  return {
    timestamp: new Date().toISOString(),
    model,
    results,
    summary: {
      total: results.length,
      passed,
      avgScore,
      avgTimeMs: Math.round(avgTimeMs),
    },
  };
}
