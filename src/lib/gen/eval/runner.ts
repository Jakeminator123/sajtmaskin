import { generateCode } from "../engine";
import { ENGINE_MAX_OUTPUT_TOKENS } from "../defaults";
import { dumpOwnEngineCodegenFromFullSystem } from "../prompt-dump";
import { prepareGenerationContext } from "../orchestrate";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "../parser";
import { runAutoFix } from "../autofix/pipeline";
import { DEFAULT_MODEL } from "../models";
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "@/lib/db/env";
import { buildCompleteProject } from "../export/project-scaffold";
import { collectRequiredUiComponents } from "../export/project-scaffold-ui-reader";
import { runFinalizePreflight } from "../stream/finalize-preflight";
import { parseSSEBuffer } from "../stream/sse-parser";
import { classifyProviderError } from "@/lib/providers/own-engine/provider-error-messages";
import { runSeoPreflightChecks } from "../validation/seo-preflight";
import { partitionGeneratedFilesForProtectedPaths } from "../scaffolds/protected-paths";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { mergeDossierIdCapabilities } from "@/lib/builder/dossier-id-request";
import { getDossierById } from "@/lib/gen/dossiers";
import { EVAL_PROMPTS, type EvalPrompt } from "./prompts";
import {
  createEvalRunId,
  resolveEvalDumpMode,
  writeEvalArtifacts,
  writeEvalSuiteSummary,
  type EvalDumpMode,
  type EvalPromptArtifactRecord,
} from "./artifact-dump";
import {
  checkProjectSanity,
  checkNoBracketPlaceholders,
  checkSeoPublishReadiness,
  checkTier2Readiness,
  checkVisualQuality,
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

export type EvalGenerationStatus = "skipped" | "passed" | "failed";

/**
 * Why a prompt produced no quality verdict.
 *
 * `provider_error` and `empty_stream` exist because a failed provider call is
 * not a bad website. Until 2026-08-17 a stream that carried only an `error`
 * event — exhausted OpenAI credits, a revoked key, a 429 — was scored as if
 * the model had emitted zero files, so an unpaid invoice surfaced as an
 * 18-prompt "quality collapse" against baseline. These stages keep such runs
 * out of the quality numbers.
 */
export type EvalFailureStage =
  | "preflight_env"
  | "provider_error"
  | "empty_stream"
  | "suite_aborted"
  | "generation"
  | null;

export interface EvalResult {
  promptId: string;
  generationStatus: EvalGenerationStatus;
  failureStage: EvalFailureStage;
  generationTimeMs: number;
  fileCount: number;
  finalProjectFiles: number;
  generatedSurfaceFiles: number;
  scaffoldId: string | null;
  variantId: string | null;
  promptSize: {
    totalChars: number;
    totalEstimatedTokens: number;
    staticCoreChars: number;
    staticCoreEstimatedTokens: number;
    dynamicContextChars: number;
    dynamicContextEstimatedTokens: number;
    dynamicBudgetUsedTokens: number;
    dynamicBudgetBudgetTokens: number;
    droppedBlocks: number;
    largestBlocks: Array<{
      title: string;
      chars: number;
      estimatedTokens: number;
      kept: boolean;
      required: boolean;
    }>;
  };
  preflight: {
    errors: number;
    warnings: number;
    previewBlocked: boolean;
    previewBlockingReason: string | null;
  };
  droppedProtectedPaths: string[];
  checks: CheckResult[];
  totalScore: number;
  passed: boolean;
  blockingChecks: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  /** Prompts that actually reached the checks — the denominator for `avgScore`. */
  evaluated: number;
  /** Prompts that never reached the checks (env, provider or empty stream). */
  skipped: number;
  providerErrors: number;
  infraErrors: number;
  /**
   * Remaining prompts were never submitted because a permanent provider fault
   * (exhausted credits, revoked key) made every further call a paid no-op.
   */
  suiteAborted: boolean;
  /** Prompts never sent to the model after `suiteAborted`. */
  notRun: number;
  /** The prompt that triggered the abort, or null when the suite ran to the end. */
  abortedAfterPromptId: string | null;
  /** Averages over `evaluated` only, so a billing failure cannot dilute them. */
  avgScore: number;
  avgTimeMs: number;
  blockingFailures: number;
  blockingCheckCounts: Record<string, number>;
}

export interface EvalReport {
  timestamp: string;
  model: string;
  results: EvalResult[];
  summary: EvalSummary;
}

const CRITICAL_EVAL_CHECKS = new Set([
  "project-sanity",
  "tier2-readiness",
  "seo-publish-readiness",
  "no-bracket-placeholders",
  "required-files",
  "exports",
  "imports",
  "syntax",
  "preflight_env",
]);

const MISSING_DB_ENV_MESSAGE =
  "preflight=failed_env: missing database connection string. " +
  `Set one of ${DB_ENV_VARS.join(", ")} before running codegen evals.`;

export function resolveEvalEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; dbEnvName: string } | { ok: false; message: string } {
  const configuredDb = resolveConfiguredDbEnv(env);
  if (!configuredDb) {
    return { ok: false, message: MISSING_DB_ENV_MESSAGE };
  }

  return { ok: true, dbEnvName: configuredDb.name };
}

function emptyPromptSize(): EvalResult["promptSize"] {
  return {
    totalChars: 0,
    totalEstimatedTokens: 0,
    staticCoreChars: 0,
    staticCoreEstimatedTokens: 0,
    dynamicContextChars: 0,
    dynamicContextEstimatedTokens: 0,
    dynamicBudgetUsedTokens: 0,
    dynamicBudgetBudgetTokens: 0,
    droppedBlocks: 0,
    largestBlocks: [],
  };
}

/**
 * A prompt that never reached the checks.
 *
 * `blockingChecks` defaults to empty: a blocker means "the generated site is
 * broken", and here nothing was generated. Env failures keep their historical
 * `preflight_env` blocker so existing report/backoffice readers still see it.
 */
function makeSkippedResult(params: {
  evalPrompt: EvalPrompt;
  failureStage: Exclude<EvalFailureStage, null | "generation">;
  message: string;
  previewBlockingReason: string;
  generationTimeMs?: number;
  blockingChecks?: string[];
}): EvalResult {
  return {
    promptId: params.evalPrompt.id,
    generationStatus: "skipped",
    failureStage: params.failureStage,
    generationTimeMs: params.generationTimeMs ?? 0,
    fileCount: 0,
    finalProjectFiles: 0,
    generatedSurfaceFiles: 0,
    scaffoldId: null,
    variantId: null,
    promptSize: emptyPromptSize(),
    preflight: {
      errors: 1,
      warnings: 0,
      previewBlocked: true,
      previewBlockingReason: params.previewBlockingReason,
    },
    droppedProtectedPaths: [],
    checks: [
      {
        name: params.failureStage,
        passed: false,
        message: params.message,
        score: 0,
      },
    ],
    totalScore: 0,
    passed: false,
    blockingChecks: params.blockingChecks ?? [],
  };
}

function makePreflightEnvFailureResult(evalPrompt: EvalPrompt, message: string): EvalResult {
  return makeSkippedResult({
    evalPrompt,
    failureStage: "preflight_env",
    message,
    previewBlockingReason: "failed_env",
    blockingChecks: ["preflight_env"],
  });
}

/** Transport-level failures the provider never got to answer. Same bucket as a
 * provider fault for eval purposes: nothing was generated, so nothing scores. */
const TRANSPORT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

export interface EvalStreamCollection {
  content: string;
  errorPayloads: Array<Record<string, unknown>>;
}

export type EvalStreamFailureKind = "provider_error" | "empty_stream" | "generation";

export interface EvalStreamFailure {
  kind: EvalStreamFailureKind;
  message: string;
  code: string | null;
  permanent: boolean;
  providerFault: boolean;
}

function toStreamFailure(
  kind: EvalStreamFailureKind,
  payload: Record<string, unknown>,
): EvalStreamFailure {
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : "Stream error without message";
  return {
    kind,
    message,
    code: typeof payload.code === "string" ? payload.code : null,
    permanent: payload.permanent === true,
    providerFault: payload.providerFault === true,
  };
}

/**
 * Codes `stream-format.ts` emits on the model itself, not the transport.
 * Today that is only `output_truncated` (`finishReason=length`). Provider
 * abort and silent-empty carry no code and stay unattributable.
 */
const MODEL_QUALITY_ERROR_CODES = new Set(["output_truncated"]);

/**
 * Decide whether a finished codegen stream carries a scorable result.
 *
 * The `error` event is the signal the old reader threw away — `stream-format.ts`
 * already classifies provider failures (code, `permanent`, `providerFault`) — but
 * not every `error` event means the provider failed. `output_truncated` and a
 * mid-stream abort arrive as errors *after* real code was streamed, so the
 * verdict follows `providerFault` first and content second:
 *
 * 1. A provider fault (billing, revoked key, 429, 5xx, transport) is never
 *    scorable, even if some code arrived before it.
 * 2. Otherwise, any content at all gets scored. Excusing a truncated response as
 *    infra would let real truncation regressions walk straight past the gate.
 * 3. No content plus a model-attributable code (`output_truncated`) is still a
 *    quality miss: the model spent the budget and delivered nothing.
 * 4. No content and no attributable code leaves nothing to judge.
 */
export function classifyEvalStreamOutcome(
  collection: EvalStreamCollection,
): { ok: true; content: string } | { ok: false; failure: EvalStreamFailure } {
  const faultPayload = collection.errorPayloads.find((payload) => payload.providerFault === true);
  if (faultPayload) {
    return { ok: false, failure: toStreamFailure("provider_error", faultPayload) };
  }

  if (collection.content.trim()) {
    return { ok: true, content: collection.content };
  }

  const [payload] = collection.errorPayloads;
  if (payload) {
    const code = typeof payload.code === "string" ? payload.code : null;
    // The model burned the output budget and emitted no code. That is the
    // regression eval exists to catch after a prompt-size change — not an
    // outage. Calling it empty_stream would skip the quality gate. Zero is
    // the honest score; running the twelve checks would only restate "no
    // files" twelve times.
    if (code && MODEL_QUALITY_ERROR_CODES.has(code)) {
      return { ok: false, failure: toStreamFailure("generation", payload) };
    }
    return { ok: false, failure: toStreamFailure("empty_stream", payload) };
  }

  return {
    ok: false,
    failure: {
      kind: "empty_stream",
      message:
        "Stream ended without content and without an error event — no quality verdict is possible.",
      code: null,
      permanent: false,
      providerFault: false,
    },
  };
}

/**
 * Classify an exception thrown out of the generation call. Returns `null` when
 * the error is ours to fix (a real harness/generation bug), so the caller keeps
 * reporting it as a `generation` failure rather than hiding it as infra noise.
 */
export function classifyEvalThrownError(err: unknown): EvalStreamFailure | null {
  const classified = classifyProviderError(err, "Generation failed");
  const transport = classified.code !== null && TRANSPORT_ERROR_CODES.has(classified.code);
  if (!classified.providerFault && !transport) return null;

  return {
    kind: "provider_error",
    message: classified.userMessage,
    code: classified.code,
    permanent: classified.permanent,
    providerFault: classified.providerFault,
  };
}

function makeGenerationFailureResult(
  evalPrompt: EvalPrompt,
  message: string,
  generationTimeMs = 0,
): EvalResult {
  return {
    promptId: evalPrompt.id,
    generationStatus: "failed",
    failureStage: "generation",
    generationTimeMs,
    fileCount: 0,
    finalProjectFiles: 0,
    generatedSurfaceFiles: 0,
    scaffoldId: null,
    variantId: null,
    promptSize: emptyPromptSize(),
    preflight: {
      errors: 1,
      warnings: 0,
      previewBlocked: true,
      previewBlockingReason: "generation_failed",
    },
    droppedProtectedPaths: [],
    checks: [
      {
        name: "generation",
        passed: false,
        message,
        score: 0,
      },
    ],
    totalScore: 0,
    passed: false,
    blockingChecks: ["generation"],
  };
}

function makeStreamFailureResult(
  evalPrompt: EvalPrompt,
  failure: EvalStreamFailure,
  generationTimeMs: number,
): EvalResult {
  const message = failure.code ? `${failure.message} [${failure.code}]` : failure.message;
  if (failure.kind === "generation") {
    return makeGenerationFailureResult(evalPrompt, message, generationTimeMs);
  }
  return makeSkippedResult({
    evalPrompt,
    failureStage: failure.kind,
    message,
    previewBlockingReason: failure.kind,
    generationTimeMs,
  });
}

/**
 * A dead account, revoked key or similar will fail every remaining prompt the
 * same way — and each submission still burns input tokens. Transient faults
 * (429, 5xx, transport) can recover mid-suite, so they must not stop it.
 */
export function isPermanentProviderFault(failure: EvalStreamFailure): boolean {
  return failure.providerFault === true && failure.permanent === true;
}

function formatStreamFailureReason(failure: EvalStreamFailure): string {
  return failure.code ? `${failure.message} [${failure.code}]` : failure.message;
}

/**
 * After one prompt's stream/throw outcome: either continue, or skip the rest
 * as `suite_aborted` so they never become quality zeroes or extra paid calls.
 */
export function applyEvalSuiteAbort(params: {
  remainingPrompts: EvalPrompt[];
  triggerPromptId: string;
  failure: EvalStreamFailure | null;
}): { abort: boolean; skipped: EvalResult[] } {
  if (!params.failure || !isPermanentProviderFault(params.failure)) {
    return { abort: false, skipped: [] };
  }

  const reason = formatStreamFailureReason(params.failure);
  return {
    abort: true,
    skipped: params.remainingPrompts.map((evalPrompt) =>
      makeSkippedResult({
        evalPrompt,
        failureStage: "suite_aborted",
        message:
          `Suite aborted after ${params.triggerPromptId}: remaining prompts were not submitted. ` +
          `Permanent provider fault: ${reason}`,
        previewBlockingReason: "suite_aborted",
      }),
    ),
  };
}

/**
 * Walk prompts through `evaluate` and stop after a permanent provider fault.
 * Tests lock this instead of calling `runEval` (which would hit the LLM).
 */
export async function collectEvalSuiteResults(
  prompts: EvalPrompt[],
  evaluate: (
    prompt: EvalPrompt,
  ) => Promise<{ result: EvalResult; failure: EvalStreamFailure | null }>,
): Promise<{ results: EvalResult[]; aborted: boolean }> {
  const results: EvalResult[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const { result, failure } = await evaluate(prompt);
    results.push(result);

    const decision = applyEvalSuiteAbort({
      remainingPrompts: prompts.slice(i + 1),
      triggerPromptId: prompt.id,
      failure,
    });
    if (decision.abort) {
      results.push(...decision.skipped);
      return { results, aborted: true };
    }
  }

  return { results, aborted: false };
}

/**
 * Sources used by the per-prompt gate checks in `evaluatePrompt`.
 *
 * Pre-2026-04-27 the harness ran every check against the raw LLM
 * emission (`project.files` / `fixedContent`). That meant
 * `SCAFFOLD_PROTECTED_PATHS` (which drops broken JSX-in-`.ts`
 * `app/api/placeholder/route.ts` emissions before they ever persist)
 * could not improve the eval score: the broken file was filtered out
 * of the canonical persist payload but the syntax check still saw it
 * in the raw output. Eval reported a runtime-correct fix as a failure.
 *
 * `deriveEvalCheckSources` returns four views so each check can pick
 * the right one:
 *
 * - `rawFiles` — the LLM's post-mechanical-autofix emission. Use for
 *   *content quality* checks where the LLM's output itself is the
 *   signal: `no-bracket-placeholders`, `responsive`, `accessibility`,
 *   `semantic-tokens`.
 *
 * - `generatedSurfaceFiles` — the filtered subset of `rawFiles` that counts
 *   as generated app surface for `file-count`. Excludes config, API routes,
 *   metadata/image routes and other scaffold/runtime support paths so the
 *   eval reports "surface/final" instead of conflating app files with the
 *   complete runnable Next project.
 *
 * - `canonicalRuntimeFiles` — full post-preflight payload. Use for
 *   runtime-readiness checks where deterministic additions from
 *   preflight (`package.json`, materialized helper files, etc.) are
 *   part of the truth: `project-sanity`, `imports`, `required-files`,
 *   `exports`, and (via `canonicalContent`) `syntax`.
 *
 * - `canonicalFiles` — the user-emitted subset of the post-preflight
 *   payload. Kept for diagnostics and for future checks that need to
 *   distinguish model-authored files from deterministic scaffold /
 *   preflight additions.
 *
 * - `canonicalContent` — `serializeCodeProject(canonicalRuntimeFiles)`,
 *   the syntax-check input matching the runtime payload.
 *
 * - `droppedProtectedPaths` — paths the protected-paths guard removed
 *   between raw and canonical. Surfaced for telemetry only; not a
 *   blocker by itself (the canonical payload still has them, with the
 *   scaffold default content).
 */
export interface EvalCheckSources {
  rawFiles: CodeFile[];
  canonicalRuntimeFiles: CodeFile[];
  canonicalFiles: CodeFile[];
  generatedSurfaceFiles: CodeFile[];
  canonicalContent: string;
  droppedProtectedPaths: string[];
}

function isGeneratedSurfacePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized) return false;
  if (normalized === "package.json") return false;
  if (/^(next|postcss|tailwind|tsconfig|eslint)\.config\./.test(normalized)) return false;
  if (/^\.[^/]+/.test(normalized)) return false;
  if (/^app\/api\//.test(normalized)) return false;
  if (/^app\/(?:icon|apple-icon|opengraph-image|twitter-image)\./.test(normalized)) return false;
  if (/^app\/(?:manifest|robots|sitemap)\./.test(normalized)) return false;
  if (/(^|\/)(loading|error|not-found|template)\.(tsx|jsx|ts|js)$/.test(normalized)) return false;
  if (/^hooks\/use-reduced-motion\.ts$/.test(normalized)) return false;
  if (/^lib\/utils\.(ts|tsx)$/.test(normalized)) return false;
  return true;
}

export function deriveEvalCheckSources(params: {
  rawFiles: CodeFile[];
  preflightFilesJson: string;
}): EvalCheckSources {
  const { rawFiles, preflightFilesJson } = params;

  const partition = partitionGeneratedFilesForProtectedPaths(rawFiles);
  const droppedProtectedPaths = partition.dropped.map((f) => f.path);

  let canonicalAll: CodeFile[] = [];
  try {
    const parsed = JSON.parse(preflightFilesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>;
    canonicalAll = parsed.map((file) => ({
      ...file,
      language: file.language || "tsx",
    }));
  } catch {
    canonicalAll = [];
  }

  const userEmittedPaths = new Set(rawFiles.map((f) => f.path));
  const canonicalRuntimeFiles = canonicalAll;
  const canonicalFiles = canonicalRuntimeFiles.filter((f) => userEmittedPaths.has(f.path));
  const generatedSurfaceFiles = rawFiles.filter((f) => isGeneratedSurfacePath(f.path));
  const canonicalContent = serializeCodeProject(canonicalRuntimeFiles);

  return {
    rawFiles,
    canonicalRuntimeFiles,
    canonicalFiles,
    generatedSurfaceFiles,
    canonicalContent,
    droppedProtectedPaths,
  };
}

export function resolveEvalPassOutcome(params: {
  checks: CheckResult[];
  shouldCompile: boolean;
  totalScore: number;
}): { passed: boolean; blockingChecks: string[] } {
  const { checks, shouldCompile, totalScore } = params;
  const syntaxCheck = checks.find((check) => check.name === "syntax");
  const compileOk = !shouldCompile || syntaxCheck?.passed !== false;
  const blockingChecks = checks
    .filter((check) => CRITICAL_EVAL_CHECKS.has(check.name) && !check.passed)
    .map((check) => check.name);

  return {
    passed: compileOk && blockingChecks.length === 0 && totalScore >= 0.6,
    blockingChecks,
  };
}

function isCompleteSseDataPayload(remaining: string): boolean {
  if (!remaining.startsWith("data:")) return false;
  let raw = remaining.slice(5);
  if (raw.startsWith(" ")) raw = raw.slice(1);
  if (raw.endsWith("\r")) raw = raw.slice(0, -1);
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the codegen stream through the canonical SSE parser instead of matching
 * `event:`/`data:` line pairs inside one decoded chunk. The old pairing dropped
 * events split across a chunk boundary, and it could not see `error` events at
 * all — which is how a billing failure reached the checks as "zero files".
 */
export async function collectEvalStream(
  stream: ReadableStream<Uint8Array>,
): Promise<EvalStreamCollection> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const collection: EvalStreamCollection = { content: "", errorPayloads: [] };
  let buffer = "";
  let pendingEvent = "";

  const drain = (): void => {
    const input = pendingEvent ? `event: ${pendingEvent}\n${buffer}` : buffer;
    const { events, remaining, pendingEvent: nextPending } = parseSSEBuffer(input);
    buffer = remaining;
    pendingEvent = nextPending;
    for (const event of events) {
      if (event.event === "content") {
        const text = (event.data as { text?: unknown }).text;
        if (typeof text === "string") collection.content += text;
      } else if (event.event === "error") {
        collection.errorPayloads.push(event.data as Record<string, unknown>);
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
    // The parser does not need an SSE blank record (`\n\n`). It needs the
    // last `data:` line to end with `\n`, and it needs the matching `event:`
    // name in the same call — incremental drain otherwise leaves `event:`
    // consumed and `data:` in `remaining`, so a lone flush newline would
    // parse a data line with no event. Only complete JSON is flushed; a
    // mid-payload tail stays unparsed instead of becoming a half event.
    if (buffer.trim() && isCompleteSseDataPayload(buffer)) {
      buffer += "\n";
      drain();
    }
  } finally {
    reader.releaseLock();
  }

  return collection;
}

async function recordPromptArtifacts(params: {
  runId: string;
  dumpMode: EvalDumpMode;
  prompt: EvalPrompt;
  result: EvalResult;
  stages?: Parameters<typeof writeEvalArtifacts>[0]["stages"];
}): Promise<EvalPromptArtifactRecord | null> {
  try {
    return await writeEvalArtifacts(params);
  } catch (err) {
    console.warn(
      `[eval] Failed to write artifacts for ${params.prompt.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

async function evaluatePrompt(
  evalPrompt: EvalPrompt,
  model: string,
  artifactContext: { runId: string; dumpMode: EvalDumpMode },
): Promise<{
  result: EvalResult;
  artifact: EvalPromptArtifactRecord | null;
  streamFailure: EvalStreamFailure | null;
}> {
  const start = performance.now();

  // Run the full orchestration pipeline so eval tests the SAME system prompt
  // that production generates (scaffold, route plan, contracts, variant,
  // capability hints, references, ...). Previously this used a thin
  // `buildSystemPrompt({ intent })` shortcut that silently produced a much
  // weaker prompt than prod — eval results were therefore not representative.
  // Disable embedding scaffold matching to keep eval deterministic and offline.
  const capabilityDetection = mergeDossierIdCapabilities(
    detectFollowUpCapabilities(evalPrompt.prompt, { mode: "init" }),
    evalPrompt.prompt,
    (id) => getDossierById(id)?.capability ?? null,
  );
  const generationInput = await prepareGenerationContext({
    prompt: evalPrompt.prompt,
    buildIntent: evalPrompt.intent,
    scaffoldMode: "auto",
    embeddingScaffoldMatch: false,
    sessionSeed: `eval_${evalPrompt.id}`,
    requestedDossierCapabilities: capabilityDetection.capabilityIds,
    requestedCapabilityTiers: capabilityDetection.tierByCapability,
  });
  const systemPrompt = generationInput.engineSystemPrompt;
  dumpOwnEngineCodegenFromFullSystem(systemPrompt, { source: "eval/runner" });

  const stream = generateCode({
    prompt: evalPrompt.prompt,
    systemPrompt,
    model,
    thinking: false,
    maxTokens: ENGINE_MAX_OUTPUT_TOKENS,
    referenceAttachments:
      generationInput.variantTemplateReferenceAttachments,
  });

  const collection = await collectEvalStream(stream);
  const generationTimeMs = Math.round(performance.now() - start);

  const outcome = classifyEvalStreamOutcome(collection);
  if (!outcome.ok) {
    // Stop before autofix/merge/preflight. There is nothing to repair, and the
    // repair path downstream would spend another provider call on a run that
    // already failed at the provider.
    const result = makeStreamFailureResult(evalPrompt, outcome.failure, generationTimeMs);
    const artifact = await recordPromptArtifacts({
      ...artifactContext,
      prompt: evalPrompt,
      result,
    });
    return { result, artifact, streamFailure: outcome.failure };
  }
  const content = outcome.content;

  if (collection.errorPayloads.length > 0) {
    // Scored anyway (see `classifyEvalStreamOutcome`), but the operator still
    // needs to know the stream reported a problem — a truncated run explains a
    // low score that would otherwise look like a prompt regression.
    const codes = collection.errorPayloads
      .map((payload) => (typeof payload.code === "string" ? payload.code : "unspecified"))
      .join(", ");
    console.warn(`[eval] ${evalPrompt.id}: scored despite stream error event(s): ${codes}`);
  }

  // Eval path: standalone mechanical pass on raw stream content. Mirrors the
  // outer autofix in finalize-version.ts but without the surrounding pipeline.
  const { fixedContent } = await runAutoFix(content);
  const rawProject = parseCodeProject(content);
  const project = parseCodeProject(fixedContent);
  // Dynamic import keeps runner.test.ts able to import pure helpers
  // without pulling the finalize stack (and its database side imports)
  // into the test process.
  const { mergeGeneratedProjectFiles } = await import("../stream/finalize-merge");
  const mergeResult = mergeGeneratedProjectFiles({
    chatId: `eval_${evalPrompt.id}`,
    originalFilesJson: JSON.stringify(project.files),
    generatedFiles: project.files,
    resolvedScaffold: generationInput.resolvedScaffold,
    // B05: scope refuseDossierStubs to the eval's selected dossiers so eval
    // green/red parity matches the production streaming finalize path.
    selectedDossiers:
      generationInput.dossierSelection?.selected.map((s) => s.entry) ?? [],
    routePlan: generationInput.routePlan,
  });
  const selectedDossiers =
    generationInput.dossierSelection?.selected.map((selected) => selected.entry) ?? [];
  const projectEnvLocalOptions = {
    selectedDossierEnvKeys: Array.from(
      new Set(
        selectedDossiers.flatMap((dossier) =>
          (dossier.envVars ?? []).map((envVar) => envVar.key),
        ),
      ),
    ),
    lifecycleStage:
      generationInput.buildSpec.previewPolicy === "fidelity3"
        ? ("integrations" as const)
        : ("design" as const),
  };
  const mergedFiles = (
    JSON.parse(mergeResult.filesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>
  ).map((file) => ({ ...file, language: file.language || "tsx" }));
  const completeProjectFiles = buildCompleteProject(
    mergedFiles,
    collectRequiredUiComponents(mergedFiles),
    projectEnvLocalOptions,
  );
  const seoIssues = runSeoPreflightChecks(completeProjectFiles);
  const preflight = await runFinalizePreflight({
    chatId: `eval_${evalPrompt.id}`,
    model,
    filesJson: mergeResult.filesJson,
    buildSpec: generationInput.buildSpec,
    routePlan: generationInput.routePlan,
    orchestrationContract: generationInput.orchestrationContract,
    originalPrompt: evalPrompt.prompt,
    projectEnvLocalOptions,
  });

  const sources = deriveEvalCheckSources({
    rawFiles: project.files,
    preflightFilesJson: preflight.filesJson,
  });

  if (sources.droppedProtectedPaths.length > 0) {
    // Telemetry-only. The protected-paths guard removed these LLM
    // emissions from the canonical persist payload upstream; eval gate
    // checks therefore measure the scaffold-version content, not the
    // raw LLM-broken version. Logged so eval-report readers can
    // distinguish "model emitted a broken protected path but the
    // pipeline corrected it" (acceptable) from "model emitted an
    // unrelated bug" (real regression).
    console.info(
      `[eval] ${evalPrompt.id}: dropped scaffold-protected paths from canonical eval input: ${sources.droppedProtectedPaths.join(", ")}`,
    );
  }

  const checks: CheckResult[] = [
    checkProjectSanity(sources.canonicalRuntimeFiles),
    checkNoBracketPlaceholders(sources.rawFiles),
    checkSeoPublishReadiness(seoIssues),
    checkTier2Readiness(preflight),
    checkVisualQuality(completeProjectFiles),
    checkFileCount(
      sources.generatedSurfaceFiles,
      evalPrompt.expected.minFiles,
      evalPrompt.expected.maxFiles,
    ),
    checkRequiredFiles(sources.canonicalRuntimeFiles, evalPrompt.expected.requiredFiles),
    checkExports(sources.canonicalRuntimeFiles),
    checkImports(sources.canonicalRuntimeFiles, evalPrompt.expected.requiredImports),
    checkResponsive(sources.rawFiles),
    checkAccessibility(sources.rawFiles),
    checkSemanticTokens(sources.rawFiles),
  ];

  if (evalPrompt.expected.shouldCompile) {
    checks.push(await checkSyntax(sources.canonicalContent));
  }

  const totalScore =
    checks.length > 0
      ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
      : 0;

  const passOutcome = resolveEvalPassOutcome({
    checks,
    shouldCompile: evalPrompt.expected.shouldCompile,
    totalScore,
  });

  const result: EvalResult = {
    promptId: evalPrompt.id,
    generationStatus: "passed",
    failureStage: null,
    generationTimeMs,
    fileCount: sources.generatedSurfaceFiles.length,
    finalProjectFiles: sources.canonicalRuntimeFiles.length,
    generatedSurfaceFiles: sources.generatedSurfaceFiles.length,
    scaffoldId: generationInput.resolvedScaffold?.id ?? null,
    variantId: generationInput.variantId ?? null,
    promptSize: {
      totalChars: generationInput.promptSize.total.chars,
      totalEstimatedTokens: generationInput.promptSize.total.estimatedTokens,
      staticCoreChars: generationInput.promptSize.staticCore.chars,
      staticCoreEstimatedTokens: generationInput.promptSize.staticCore.estimatedTokens,
      dynamicContextChars: generationInput.promptSize.dynamicContext.chars,
      dynamicContextEstimatedTokens:
        generationInput.promptSize.dynamicContext.estimatedTokens,
      dynamicBudgetUsedTokens: generationInput.promptSize.dynamicBudget.usedTokens,
      dynamicBudgetBudgetTokens: generationInput.promptSize.dynamicBudget.budgetTokens,
      droppedBlocks: generationInput.promptSize.dynamicBudget.droppedBlocks,
      largestBlocks: generationInput.promptSize.blocks.largest
        .slice(0, 10)
        .map((block) => ({
          title: block.title,
          chars: block.chars,
          estimatedTokens: block.estimatedTokens,
          kept: block.kept,
          required: block.required,
        })),
    },
    preflight: {
      errors: preflight.preflightIssues.filter((issue) => issue.severity === "error").length,
      warnings: preflight.preflightIssues.filter((issue) => issue.severity === "warning").length,
      previewBlocked: !preflight.previewStart.canStartPreview,
      previewBlockingReason: preflight.previewBlockingReason,
    },
    droppedProtectedPaths: sources.droppedProtectedPaths,
    checks,
    totalScore,
    passed: passOutcome.passed,
    blockingChecks: passOutcome.blockingChecks,
  };

  const artifact = await recordPromptArtifacts({
    ...artifactContext,
    prompt: evalPrompt,
    result,
    stages: {
      rawContent: content,
      fixedContent,
      rawFiles: rawProject.files,
      fixedFiles: project.files,
      mergedFiles,
      completeProjectFiles,
      sources,
      preflight,
    },
  });

  return { result, artifact, streamFailure: null };
}

const INFRA_FAILURE_STAGES = new Set<EvalFailureStage>(["preflight_env", "empty_stream"]);

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function summarizeEvalResults(results: EvalResult[]): EvalSummary {
  const evaluated = results.filter((result) => result.generationStatus !== "skipped");
  const notRun = results.filter((result) => result.failureStage === "suite_aborted").length;
  const abortedIndex = results.findIndex((result) => result.failureStage === "suite_aborted");
  const blockingCheckCounts: Record<string, number> = {};
  for (const result of results) {
    for (const check of result.blockingChecks) {
      blockingCheckCounts[check] = (blockingCheckCounts[check] ?? 0) + 1;
    }
  }

  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    evaluated: evaluated.length,
    skipped: results.length - evaluated.length,
    providerErrors: results.filter((result) => result.failureStage === "provider_error").length,
    infraErrors: results.filter((result) => INFRA_FAILURE_STAGES.has(result.failureStage)).length,
    suiteAborted: notRun > 0,
    notRun,
    abortedAfterPromptId: abortedIndex > 0 ? (results[abortedIndex - 1]?.promptId ?? null) : null,
    avgScore: mean(evaluated.map((result) => result.totalScore)),
    avgTimeMs: Math.round(mean(evaluated.map((result) => result.generationTimeMs))),
    blockingFailures: results.filter((result) => result.blockingChecks.length > 0).length,
    blockingCheckCounts,
  };
}

export type EvalRunOutcome = "pass" | "quality_fail" | "provider_error" | "infra_error";

/**
 * Provider and infra failures outrank the quality verdict. A run that never
 * reached the model says nothing about generation quality, and scoring it as a
 * regression is what made every red weekly run unreadable.
 *
 * Quality is derived from the measurement: any evaluated prompt that did not
 * pass is a quality_fail. `gateFailed` is an extra OR while `--gate` still
 * exists; it is not the only path to a quality miss.
 */
export function resolveEvalRunOutcome(params: {
  summary: EvalSummary;
  gateFailed?: boolean;
}): EvalRunOutcome {
  if (params.summary.providerErrors > 0 || params.summary.suiteAborted) return "provider_error";
  if (params.summary.infraErrors > 0) return "infra_error";
  const measuredQualityFail =
    params.summary.evaluated > 0 && params.summary.passed < params.summary.evaluated;
  if (params.gateFailed === true || measuredQualityFail) return "quality_fail";
  return "pass";
}

export function evalExitCode(outcome: EvalRunOutcome): 0 | 1 | 2 {
  if (outcome === "provider_error" || outcome === "infra_error") return 2;
  return outcome === "quality_fail" ? 1 : 0;
}

export async function runEval(
  options?: {
    model?: string;
    prompts?: EvalPrompt[];
    dumpMode?: EvalDumpMode;
    runId?: string;
  },
): Promise<EvalReport> {
  const model = options?.model ?? DEFAULT_MODEL;
  const prompts = options?.prompts ?? EVAL_PROMPTS;
  const runId = options?.runId ?? createEvalRunId();
  const dumpMode = options?.dumpMode ?? resolveEvalDumpMode();
  const environment = resolveEvalEnvironment();
  const promptArtifacts: EvalPromptArtifactRecord[] = [];

  if (!environment.ok) {
    console.error(`[eval] ${environment.message}`);
    const results = prompts.map((prompt) =>
      makePreflightEnvFailureResult(prompt, environment.message),
    );
    const report = {
      timestamp: new Date().toISOString(),
      model,
      results,
      summary: summarizeEvalResults(results),
    };
    await writeEvalSuiteSummary({ runId, report, promptArtifacts });
    return report;
  }

  const { results, aborted } = await collectEvalSuiteResults(prompts, async (evalPrompt) => {
    try {
      console.info(`[eval] Running: ${evalPrompt.id}...`);
      const { result, artifact, streamFailure } = await evaluatePrompt(evalPrompt, model, {
        runId,
        dumpMode,
      });
      if (artifact) promptArtifacts.push(artifact);
      console.info(
        `[eval] ${evalPrompt.id}: score=${(result.totalScore * 100).toFixed(0)}% ` +
          `files=${result.fileCount} time=${result.generationTimeMs}ms ` +
          `${result.passed ? "PASS" : "FAIL"}`,
      );
      return { result, failure: streamFailure };
    } catch (err) {
      // A provider fault thrown out of `generateCode` (billing, revoked key,
      // 429, socket reset) is not a generation defect — classify before
      // recording, or the run reports a quality failure it never measured.
      const providerFailure = classifyEvalThrownError(err);
      console.error(
        `[eval] ${evalPrompt.id} ${providerFailure ? "aborted by provider" : "failed"}:`,
        err instanceof Error ? err.message : err,
      );
      const result: EvalResult = providerFailure
        ? makeStreamFailureResult(evalPrompt, providerFailure, 0)
        : makeGenerationFailureResult(
            evalPrompt,
            err instanceof Error ? err.message : "Unknown error",
          );
      const artifact = await recordPromptArtifacts({
        runId,
        dumpMode,
        prompt: evalPrompt,
        result,
      });
      if (artifact) promptArtifacts.push(artifact);
      return { result, failure: providerFailure };
    }
  });

  if (aborted) {
    const notRun = results.filter((result) => result.failureStage === "suite_aborted").length;
    console.error(
      `[eval] Suite aborted after permanent provider fault — ${notRun} prompt(s) not submitted.`,
    );
  }

  const report = {
    timestamp: new Date().toISOString(),
    model,
    results,
    summary: summarizeEvalResults(results),
  };
  await writeEvalSuiteSummary({ runId, report, promptArtifacts });
  return report;
}
