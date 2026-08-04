import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import type { FixerResult } from "@/lib/gen/autofix/llm-fixer";
import { runLlmRepairGate, type LlmRepairConfig } from "@/lib/gen/autofix/llm-repair-gate";
import { countByFixer } from "@/lib/gen/autofix/types";
import { devLogAppend } from "@/lib/logging/devLog";
import { runDeterministicImportRepair } from "@/lib/gen/autofix/deterministic-import-repair";
import {
  AUTOFIX_MAX_OUTPUT_TOKENS,
  FINAL_GATE_MIN_FLOOR_MS,
  FINAL_GATE_RELEASE_MARGIN_MS,
} from "@/lib/gen/defaults";
import { buildAiSdkV5RepairHint } from "../ai-sdk-v5-repair-hint";
import {
  isRepairBudgetExhausted,
  resolveFinalGateVerifyBudget,
  resolveServerRepairEarlyStopReason,
} from "../server-repair-policy";
import { collectRepairBlockers, introducedRepairBlockers } from "../repair-blockers";
import {
  buildStructuredOriginDiagnostics,
  parseDiagnosticsFromFailure,
  parseFilesFromErrorLines,
  uniqueContextLines,
} from "./diagnostics-parser";
import { buildGroupedRepairErrorContext, buildRepairErrorManifest } from "./error-manifest";
import { buildTargetedRepairBundle, type TargetedRepairBundle } from "./targeting";
import {
  logRepairLoopOutcomeBestEffort,
  resolveNonPromotedEarlyStopReason,
} from "./outcome-logging";
import type {
  RepairEarlyStopReason,
  RunRepairLoopParams,
  RunRepairLoopResult,
} from "./types";

export async function runRepairLoop<TPayload = unknown>(
  params: RunRepairLoopParams<TPayload>,
): Promise<RunRepairLoopResult<TPayload>> {
  const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");

  // Initial mechanical pass: repair-loop is invoked from contexts that may not
  // have already autofixed (verifier rerun, eval). Idempotent if input is
  // already clean.
  //
  // Thread the version's `previewPolicy` so the F2 SDK guard
  // (`tier3-sdk-guard-fixer`) only strips tier-3 backend SDK imports in F2.
  // Without it, an F3/integrations version entering the loop with a gate
  // failure unrelated to those imports would have its valid backend SDK
  // imports (stripe / @clerk/nextjs/server / supabase) stripped here — the
  // same policy the deterministic pre-pass already honours (Codex P1).
  let content = (
    await runAutoFix(params.initialContent, {
      previewPolicy: params.previewPolicy,
    })
  ).fixedContent;

  // Deterministic, diagnostic-driven import repair (runs BEFORE the LLM fixer).
  // The quality gate that produced `failedOutputs` already ran tsc; its
  // diagnostics name the exact symbol + file for import-only failures
  // (TS2304/TS2552 missing import, TS1361/TS2693 import-type-used-as-value,
  // TS2440 import/local conflict, TS2300 duplicate identifier). Resolve those
  // mechanically and instantly so the deterministic promotion below can pass the
  // gate without a slow (~90s) LLM round-trip. Ambiguous / logic errors are left
  // for the LLM fixer. Shared implementation with the finalize warm-tsc
  // normalize pass: @/lib/gen/autofix/deterministic-import-repair.ts.
  const importRepair = runDeterministicImportRepair(
    content,
    params.failedOutputs.flatMap(parseDiagnosticsFromFailure),
    { previewPolicy: params.previewPolicy },
  );
  if (importRepair.fixed) {
    content = importRepair.content;
    devLogAppend("in-progress", {
      type: "validate.tsc.import-repair",
      chatId: params.chatId,
      handledCodes: importRepair.handledCodes,
      fixCount: importRepair.fixes.length,
      fixers: countByFixer(importRepair.fixes),
      // M#imp1 telemetry: which cannot-find codes were seen, which names
      // resolved, and why the residue stayed residual (tier3_gated /
      // ambiguous_shadcn_lucide / unknown_name / not_applied).
      cannotFindSummary: importRepair.cannotFindSummary,
    });
  } else if (importRepair.cannotFindSummary.residual.length > 0) {
    // Nothing was fixable — log the residual classification anyway so a prod
    // run where EVERY known-import candidate was gated (e.g. tier-3 SDKs in
    // an F2 lane, prod chat cc10e7de v8) is observable instead of silent.
    devLogAppend("in-progress", {
      type: "validate.tsc.import-repair",
      chatId: params.chatId,
      handledCodes: [],
      fixCount: 0,
      fixers: {},
      cannotFindSummary: importRepair.cannotFindSummary,
    });
  }

  let syntaxResult = await validateGeneratedCode(content);
  const initialSyntaxErrorCount = syntaxResult.errors.length;
  // Gate-class failure (Task 6): the ORIGINATING failure was a quality gate
  // (typecheck/build/lint), not esbuild syntax — the content is already
  // syntax-clean yet `failedOutputs` is non-empty. Every repair candidate then
  // ties at 0 syntax errors, which breaks the `bestContent`/pass-count logic in
  // two ways handled below: (1) the fewest-errors rule would keep the ORIGINAL
  // pre-fix content and discard the LLM's real fix at the final gate (prod
  // "could not resolve after 1 attempt"), and (2) the syntax-clean break would
  // stop after a single pass. Pure-syntax repairs keep their existing behavior.
  const gateClassFailure = initialSyntaxErrorCount === 0 && params.failedOutputs.length > 0;
  let errorManifest = buildRepairErrorManifest({
    failedOutputs: params.failedOutputs,
    syntaxErrors: syntaxResult.errors,
    projectContent: content,
  });

  if (syntaxResult.valid) {
    const deterministic = await params.onAttemptPromotion(content, "deterministic");
    if (deterministic.promoted) {
      if (importRepair.fixed) {
        // Proof signal for prod analysis: the gate passed after deterministic
        // import-repair, so the LLM fixer was skipped entirely for this version.
        devLogAppend("in-progress", {
          type: "validate.tsc.import-repair.resolved",
          chatId: params.chatId,
          handledCodes: importRepair.handledCodes,
          llmSkippedBecauseResolved: true,
        });
      }
      logRepairLoopOutcomeBestEffort({
        chatId: params.chatId,
        failedOutputs: params.failedOutputs,
        method: "deterministic",
        result: "fixed",
        llmPasses: 0,
        model: params.fixerModel,
      });
      return {
        promoted: true,
        method: "deterministic",
        payload: deterministic.payload,
        llmPasses: 0,
        earlyStopReason: null,
        remainingErrors: 0,
        improvedSyntax: false,
        noContext: false,
        errorManifest,
      };
    }
  }

  const groupedContext = buildGroupedRepairErrorContext(params.failedOutputs, {
    syntaxErrors: syntaxResult.errors,
    projectContent: content,
  });
  errorManifest = groupedContext.errorManifest;
  // Task 5b: deterministic AI-SDK v4→v5 rewrite hint. Derived from the failure
  // text so a repair that hit `CoreMessage`/`maxSteps`/`textDelta` gets the
  // exact fix up front (prepended so it survives the per-pass context cap),
  // making AI-SDK drift self-healing in one pass.
  const aiSdkV5Hint = buildAiSdkV5RepairHint(
    [
      ...params.failedOutputs.map((failure) => failure.output ?? ""),
      ...groupedContext.contextLines,
      ...syntaxResult.errors.map((error) => error.message),
    ].join("\n"),
  );
  const repairContextLines = uniqueContextLines(
    [...aiSdkV5Hint, ...groupedContext.contextLines, ...params.contextLines],
    120,
  );
  const hasErrorContext =
    params.hasActionableErrorContext ??
    (params.failedOutputs.length > 0 ||
      syntaxResult.errors.length > 0 ||
      repairContextLines.length > 0);
  if (!hasErrorContext) {
    await params.onNoContext?.();
    return {
      promoted: false,
      method: null,
      llmPasses: 0,
      earlyStopReason: null,
      remainingErrors: syntaxResult.errors.length,
      improvedSyntax: false,
      noContext: true,
      errorManifest,
    };
  }

  // Baseline after deterministic pre-pass (autofix + import-repair). LLM
  // abort/partial must not discard progress measured against THIS snapshot.
  const preLlmBaselineContent = content;
  const hasDeterministicProgress = importRepair.fixed || content !== params.initialContent;

  let bestContent = content;
  let bestErrorCount = syntaxResult.errors.length;
  let llmPasses = 0;
  let earlyStopReason: RepairEarlyStopReason = null;
  // Blocking preflight findings per pass. A pass that trades one blocker for a
  // new one is rolled back; a blocker that survives two passes stops the loop
  // instead of buying a third identical round.
  let introducedBlockers: string[] = [];
  let unresolvedBlockers: string[] = [];
  const blockerPassCount = new Map<string, number>();

  // Fas 3 (bättre mål för repair-LLM:en): the ORIGINATING gate diagnostics
  // (tsc/build/lint) as structured `file:line:col` primary lines with the
  // TSxxxx codes preserved. Without these, a tsc-origin repair fed the model
  // only esbuild syntax output + secondary context — the model optimized
  // against the wrong signal ("0 errors remain" → gate failed anyway).
  const originPrimaryDiagnostics = buildStructuredOriginDiagnostics(params.failedOutputs);
  // Fas 3: notes about previous failed passes so pass > 0 does not repeat the
  // exact patch that already failed. Bounded to the most recent 2 passes.
  const priorAttemptNotes: string[] = [];

  // Fixer routing config for the repair gate. When the caller resolved a
  // fixer model (both production callers do), pass it through unchanged;
  // otherwise the gate resolves the default-tier fixer phase model.
  const gateConfig: LlmRepairConfig | undefined = params.fixerModel
    ? {
        fixerModel: params.fixerModel,
        thinking: params.fixerThinking,
        reasoningEffort: params.fixerReasoningEffort,
        reasoningMode: params.fixerReasoningMode,
      }
    : undefined;

  const filesFromGateOutput = parseFilesFromErrorLines(repairContextLines);
  for (let pass = 0; pass < params.maxLlmPasses; pass++) {
    // Wall-clock graceful stop (#284 follow-up): never START a new LLM fixer
    // pass that can't finish (including its retry attempt) before the route's
    // static maxDuration. `pass > 0` so a repair always makes at least one
    // attempt; later passes stop gracefully so the route can fail + release its
    // lease instead of being hard-killed mid-pass — which would strand the
    // version in `repairing` and abort the finalize DB write.
    if (
      pass > 0 &&
      isRepairBudgetExhausted({
        deadlineEpochMs: params.repairDeadlineEpochMs,
        nowMs: Date.now(),
        nextStepMaxMs: params.llmTimeoutMs + (params.llmRetryTimeoutMs ?? 0),
      })
    ) {
      earlyStopReason = "time_budget_exceeded";
      break;
    }
    // Fas 3 (base-aware tidig abort): a superseded version (newer version, or
    // files_json advanced past the repair's base snapshot) makes the rest of
    // the loop dead work — the base-bound save would discard it anyway. Abort
    // before spending an LLM pass. Checked BEFORE onBeforePass so the lease is
    // not renewed for work that won't happen.
    if (await params.shouldAbortSuperseded?.()) {
      earlyStopReason = "superseded";
      break;
    }
    // Renew the distributed lease before the slow fixer call (Codex P2: a
    // multi-pass repair can exceed the lease TTL; renewing per pass keeps
    // ownership so the final lease-conditioned save isn't silently dropped).
    await params.onBeforePass?.(pass);
    if (syntaxResult.errors.length > bestErrorCount && bestErrorCount < Infinity) {
      content = bestContent;
      syntaxResult = await validateGeneratedCode(content);
    }
    const errorsBefore = syntaxResult.errors.length;
    const errorSummary = uniqueContextLines(
      [
        ...syntaxResult.errors.map(
          (error) => `${error.file}:${error.line}:${error.column} ${error.message}`,
        ),
        ...originPrimaryDiagnostics,
        ...priorAttemptNotes,
        ...repairContextLines,
      ],
      50,
    );
    const brokenFiles = [
      ...new Set([
        ...syntaxResult.errors.map((error) => error.file).filter(Boolean),
        ...filesFromGateOutput,
      ]),
    ];

    const targetedBundle =
      params.enableTargetedRepair !== false
        ? buildTargetedRepairBundle({
            fullContent: content,
            brokenFiles,
            maxFiles: params.targetedRepairMaxFiles ?? 16,
          })
        : null;

    const contentBeforePass = content;
    const originalMaxTokens = params.fixerMaxTokens ?? AUTOFIX_MAX_OUTPUT_TOKENS;
    const reducedMaxTokens = Math.max(1, Math.floor(originalMaxTokens * 0.5));
    let fixerAttemptCount = 0;
    /** The exact string handed to the last fixer attempt — the only honest baseline for "did the model change anything". */
    let lastFixerInput: string | null = null;
    // Fas 3 (RepairGate): the loop's LLM calls go through the SAME
    // `runLlmRepairGate` as every finalize repair lane — one port, one
    // ledger. A shared ledger (threaded from finalize via the caller)
    // dedupes content+diagnostics already LLM-repaired in another lane.
    const runFixerAttempt = async (
      attemptErrors: string[],
      maxTokens: number,
      timeoutMs: number,
      bundleOverride?: TargetedRepairBundle | null,
    ): Promise<FixerResult> => {
      const activeBundle = bundleOverride ?? targetedBundle;
      const activeFixerInput = activeBundle?.contentForFixer ?? content;
      lastFixerInput = activeFixerInput;
      const gate = await runLlmRepairGate({
        content: activeFixerInput,
        errors: attemptErrors,
        chatId: params.chatId ?? "",
        timeoutMs,
        maxTokens,
        requiredFiles: activeBundle?.requiredFiles ?? brokenFiles,
        config: gateConfig,
        recurringPatterns: params.recurringPatterns ?? [],
        phase: "repair-loop",
        scopeId: params.repairScopeId,
        ledger: params.repairLedger,
      });
      // A deduped attempt made no LLM call; keep llmPasses an honest count of
      // actual fixer invocations. A deduped result flows on as a no-op
      // (`success:false`, `partial:false`) → `fixer_noop` early stop.
      if (!gate.deduped) fixerAttemptCount++;
      return gate.result;
    };

    const mergePartialFixerOutput = async (
      result: FixerResult,
      bundle: TargetedRepairBundle | null,
    ): Promise<void> => {
      if (!result.partial || result.fixedFiles.length === 0) return;
      const fixerOutput = bundle ? bundle.mergeBack(result.fixedContent) : result.fixedContent;
      const reFixed = await runAutoFix(fixerOutput, {
        previewPolicy: params.previewPolicy,
      });
      content = reFixed.fixedContent;
      syntaxResult = await validateGeneratedCode(content);
      if (syntaxResult.errors.length < bestErrorCount) {
        bestErrorCount = syntaxResult.errors.length;
        bestContent = content;
      }
    };

    const buildRetryTargetedBundle = (result: FixerResult): TargetedRepairBundle | null => {
      if (params.enableTargetedRepair === false) return null;
      const retryBrokenFiles = [
        ...new Set([
          ...syntaxResult.errors.map((error) => error.file).filter(Boolean),
          ...result.incompleteFiles.map((entry) => entry.path),
          ...result.missingFiles,
          ...filesFromGateOutput,
        ]),
      ];
      if (retryBrokenFiles.length === 0) return null;
      return buildTargetedRepairBundle({
        fullContent: content,
        brokenFiles: retryBrokenFiles,
        maxFiles: Math.min(
          params.targetedRepairMaxFiles ?? 16,
          Math.max(1, retryBrokenFiles.length),
        ),
      });
    };

    let activeBundle: TargetedRepairBundle | null = targetedBundle;
    let fixerResult = await runFixerAttempt(
      errorSummary,
      originalMaxTokens,
      params.llmTimeoutMs,
      activeBundle,
    );

    const needsTargetedRetry =
      fixerResult.aborted ||
      (fixerResult.partial &&
        !fixerResult.success &&
        (fixerResult.incompleteFiles.length > 0 || fixerResult.missingFiles.length > 0));

    if (needsTargetedRetry) {
      if (fixerResult.aborted) {
        devLogAppend("in-progress", {
          type: "repair_loop.llm_abort",
          chatId: params.chatId,
          pass: pass + 1,
          attempt: "primary",
          aborted: true,
          hasDeterministicProgress,
          inputFileCount: (activeBundle?.requiredFiles ?? brokenFiles).length,
          inputCharLength: (activeBundle?.contentForFixer ?? content).length,
          timeoutMs: params.llmTimeoutMs,
        });
      }
      await mergePartialFixerOutput(fixerResult, activeBundle);
      const retryBundle = buildRetryTargetedBundle(fixerResult);
      if (retryBundle) {
        activeBundle = retryBundle;
      } else if (activeBundle) {
        // Stale-bundle-skydd (bugbot HIGH, PR #380): pass-startens bundle har
        // `mergeBack`/`contentForFixer` stängda över PRE-partial-merge-
        // innehållet. Att behålla den efter `mergePartialFixerOutput` skulle
        // låta retry-mergen skriva över de accepterade partiella fixarna.
        // Bygg om SAMMA filurval mot aktuellt `content`; blir bundlen null
        // (t.ex. alla filer valda) körs retryn på hela aktuella innehållet
        // utan mergeBack — större prompt, men aldrig stale.
        activeBundle = buildTargetedRepairBundle({
          fullContent: content,
          brokenFiles: activeBundle.requiredFiles,
          maxFiles: Math.min(
            params.targetedRepairMaxFiles ?? 16,
            Math.max(1, activeBundle.requiredFiles.length),
          ),
        });
      }
      fixerResult = await runFixerAttempt(
        errorSummary.slice(0, 3),
        reducedMaxTokens,
        params.llmRetryTimeoutMs ?? params.llmTimeoutMs,
        activeBundle,
      );
      if (fixerResult.aborted) {
        devLogAppend("in-progress", {
          type: "repair_loop.llm_abort",
          chatId: params.chatId,
          pass: pass + 1,
          attempt: "retry",
          aborted: true,
          hasDeterministicProgress,
          inputFileCount: (activeBundle?.requiredFiles ?? brokenFiles).length,
          inputCharLength: (activeBundle?.contentForFixer ?? content).length,
          timeoutMs: params.llmRetryTimeoutMs ?? params.llmTimeoutMs,
        });
      }
    }
    const timedOut = fixerResult.aborted === true;
    llmPasses += fixerAttemptCount;

    if (!fixerResult.success && !fixerResult.partial) {
      // LLM produced no mergeable output. Deterministic pre-pass progress
      // (import-repair, dep-completer, etc.) still lives in `content` —
      // do NOT classify that as `no_improvement`. Fall through to the final
      // gate on `bestContent` when syntax is clean.
      if (!hasDeterministicProgress && content === preLlmBaselineContent) {
        const stopReason = resolveServerRepairEarlyStopReason({
          fixerProducedOutput: false,
          errorsBefore,
          errorsAfter: errorsBefore,
          timedOut,
        });
        earlyStopReason = stopReason === "continue" ? null : stopReason;
        break;
      }
      earlyStopReason = timedOut ? "time_budget_exceeded" : null;
      // Preserve the fewest-error snapshot invariant (VADE, PR #380): a
      // partial merge earlier in this pass can have left `content` WORSE
      // than `bestContent` — an unconditional overwrite would regress to a
      // more-broken snapshot and desync `bestContent`/`bestErrorCount`.
      // (`syntaxResult` always corresponds to `content` here: the partial-
      // merge helper revalidates, and the no-merge path leaves both as the
      // deterministic baseline that already seeded `bestContent`.)
      if (syntaxResult.errors.length < bestErrorCount) {
        bestErrorCount = syntaxResult.errors.length;
        bestContent = content;
      }
      break;
    }

    const fixerOutput = activeBundle
      ? activeBundle.mergeBack(fixerResult.fixedContent)
      : fixerResult.fixedContent;
    // post-LLM mechanical pass: normalizes the fixer output before the next
    // validate iteration. Required after every LLM pass. Carries the same
    // `previewPolicy` as the initial pass so an F3 LLM-fix that re-emits a
    // valid backend SDK import is not stripped by the F2 guard.
    const reFixed = await runAutoFix(fixerOutput, {
      previewPolicy: params.previewPolicy,
    });
    content = reFixed.fixedContent;
    syntaxResult = await validateGeneratedCode(content);

    const blockersAfterPass = collectRepairBlockers(content);
    const introduced = introducedRepairBlockers(
      collectRepairBlockers(contentBeforePass),
      blockersAfterPass,
    );
    if (introduced.length > 0) {
      introducedBlockers = introduced;
      content = contentBeforePass;
      syntaxResult = await validateGeneratedCode(content);
      earlyStopReason = "blocker_regression";
      break;
    }
    const persisting = new Set<string>();
    for (const key of blockersAfterPass) {
      const seenInPasses = (blockerPassCount.get(key) ?? 0) + 1;
      blockerPassCount.set(key, seenInPasses);
      if (seenInPasses >= 2) persisting.add(key);
    }

    const groupedAfterFix = buildGroupedRepairErrorContext(params.failedOutputs, {
      syntaxErrors: syntaxResult.errors,
      projectContent: content,
    });
    errorManifest = groupedAfterFix.errorManifest;
    // The LLM "changed something" when either the raw output differs from
    // the exact input we handed it OR the post-autofix content differs from
    // what the loop had at the top of this iteration. Either signal means the
    // model did not regurgitate the same bytes verbatim.
    //
    // Compare against `lastFixerInput`, not the merged output: with targeted
    // repair (the default) `fixerOutput` is the merged FULL project while the
    // input was a PARTIAL bundle, so the old comparison was between two
    // different formats and therefore always unequal — the `no_improvement`
    // stop was dead code and an echoing model bought another paid pass.
    const fixerEchoedInput = lastFixerInput !== null && fixerResult.fixedContent === lastFixerInput;
    const contentChanged = !fixerEchoedInput || content !== contentBeforePass;
    const stopReason = resolveServerRepairEarlyStopReason({
      fixerProducedOutput: true,
      errorsBefore,
      errorsAfter: syntaxResult.errors.length,
      timedOut: false,
      contentChanged,
      gateFailureSignals: repairContextLines.length,
    });

    if (syntaxResult.errors.length < bestErrorCount) {
      bestErrorCount = syntaxResult.errors.length;
      bestContent = content;
    } else if (gateClassFailure && syntaxResult.valid && content !== bestContent) {
      // Gate-class root-cause fix: all candidates tie at 0 syntax errors, so the
      // fewest-errors rule above never fires and the LLM's fix (in `content`)
      // would be discarded — the final gate would re-verify the ORIGINAL
      // drifted code and fail. Carry the latest edited content forward so the
      // final gate verifies the actual fix (makes AI-SDK drift self-healing
      // together with the deterministic v4→v5 hint).
      bestContent = content;
    }
    if (stopReason !== "continue") {
      if (stopReason === "no_improvement" && hasDeterministicProgress) {
        earlyStopReason = null;
        break;
      }
      earlyStopReason = stopReason;
      break;
    }
    if (persisting.size > 0) {
      unresolvedBlockers = [...persisting].sort();
      earlyStopReason = "blocker_unresolved";
      break;
    }
    // Gate-class second pass (Task 6): a syntax-clean but gate-red result does
    // NOT stop after the first pass — one more LLM pass runs with the
    // accumulated prior-attempt notes + the v4→v5 hint before deferring to the
    // final gate. Bounded by `maxLlmPasses` (global budget unchanged). Pure
    // syntax repairs (gateClassFailure=false) still stop the moment syntax is
    // clean.
    if (syntaxResult.valid && !(gateClassFailure && pass + 1 < params.maxLlmPasses)) {
      break;
    }
    // Fas 3 (bättre mål): tell the next pass what the previous one changed and
    // that the originating failure has not passed yet, so the model tries a
    // DIFFERENT approach instead of re-emitting the same patch.
    priorAttemptNotes.push(
      `[prior-attempt] pass ${pass + 1} edited ${
        fixerResult.fixedFiles.length > 0
          ? fixerResult.fixedFiles.slice(0, 6).join(", ")
          : "no files"
      } but the original failure is still unresolved (${syntaxResult.errors.length} syntax error(s) remain). Do not repeat that patch — try a different fix.`,
    );
    if (priorAttemptNotes.length > 2) priorAttemptNotes.shift();
  }

  const finalSyntaxResult =
    bestContent === content ? syntaxResult : await validateGeneratedCode(bestContent);
  const finalErrorManifest = buildRepairErrorManifest({
    failedOutputs: params.failedOutputs,
    syntaxErrors: finalSyntaxResult.errors,
    projectContent: bestContent,
  });
  const syntaxClean = finalSyntaxResult.errors.length === 0;
  // Wall-clock graceful stop for the FINAL preview-host verify (#284 follow-up;
  // resolves Codex P1 + Bugbot HIGH on #286). The earlier fix reserved a FULL
  // static verify timeout before starting the gate, but that reserve ≈ the whole
  // loop budget, so the gate ALWAYS skipped and a manual LLM repair never promoted
  // (Bugbot HIGH). Compute the ACTUAL remaining budget instead:
  //   - too little left (<= floor) → skip gracefully so the caller fails +
  //     releases the lease (the syntax-clean but UNVERIFIED content is not
  //     promoted), set `time_budget_exceeded`;
  //   - otherwise → RUN the verify, passing an absolute deadline so the verify's
  //     AbortSignal (derived from `deadline - now` at the fetch site) fires before
  //     the route's maxDuration even after async prep, and
  //     `finally { releaseVersionLease }` always runs (Codex P1). The fetch-site
  //     clamp keeps the timeout under the static verify cap (route-budget invariant).
  // Fas 3 (base-aware tidig abort): re-check right before the final verify.
  // A pass may have taken minutes; if the version got superseded meanwhile,
  // skip the (expensive) final gate — the base-bound save would discard the
  // result anyway. `earlyStopReason` may already be "superseded" from the
  // per-pass check above.
  if (syntaxClean && earlyStopReason !== "superseded" && (await params.shouldAbortSuperseded?.())) {
    earlyStopReason = "superseded";
  }
  if (syntaxClean && earlyStopReason !== "superseded") {
    const finalGate = resolveFinalGateVerifyBudget({
      deadlineEpochMs: params.repairDeadlineEpochMs,
      nowMs: Date.now(),
      floorMs: FINAL_GATE_MIN_FLOOR_MS,
      releaseMarginMs: FINAL_GATE_RELEASE_MARGIN_MS,
    });
    if (finalGate.skip) {
      earlyStopReason = "time_budget_exceeded";
    } else {
      const promoted = await params.onAttemptPromotion(bestContent, "llm", {
        verifyDeadlineEpochMs: finalGate.verifyDeadlineEpochMs,
      });
      logRepairLoopOutcomeBestEffort({
        chatId: params.chatId,
        failedOutputs: params.failedOutputs,
        method: "llm",
        result: promoted.promoted ? "fixed" : "still-failing",
        llmPasses,
        model: params.fixerModel,
      });
      return {
        promoted: promoted.promoted,
        method: "llm",
        payload: promoted.payload,
        llmPasses,
        // M#sr0: gate-only failures (syntax clean but the quality gate still
        // fails) used to exit via the `if (syntaxResult.valid) break` above with
        // `earlyStopReason` left null, so prod saw 0/16 promoted server-repairs
        // all reporting `earlyStopReason=null` — silent. When the final gate
        // does NOT promote, surface an explicit `no_improvement` so the outcome
        // is observable and the caller can name a reason. A successful promotion
        // converged — report `null` (a gate-class second pass may have set a
        // transient `no_improvement` before the final gate promoted; that must
        // not leak out as the outcome of a SUCCESSFUL repair).
        earlyStopReason: promoted.promoted
          ? null
          : resolveNonPromotedEarlyStopReason({
              earlyStopReason,
              hasDeterministicProgress,
              improvedSyntax: 0 < initialSyntaxErrorCount,
            }),
        remainingErrors: 0,
        improvedSyntax: 0 < initialSyntaxErrorCount,
        noContext: false,
        errorManifest: finalErrorManifest,
        introducedBlockers,
        unresolvedBlockers,
      };
    }
  }

  // A "superseded" exit is an abort (a newer version/edit made the result
  // moot), not a real fault — logging it as `still-failing` would pollute RAG
  // with lessons about failures that never actually happened.
  if (earlyStopReason !== "superseded") {
    logRepairLoopOutcomeBestEffort({
      chatId: params.chatId,
      failedOutputs: params.failedOutputs,
      method: "llm",
      result: "still-failing",
      llmPasses,
      model: params.fixerModel,
    });
  }

  return {
    promoted: false,
    method: "llm",
    llmPasses,
    // M#sr0: a non-promoted loop must never report `earlyStopReason=null`. If
    // the loop ran its passes without an explicit early stop (or skipped the
    // final gate), default to `no_improvement` so the failure is observable.
    earlyStopReason: resolveNonPromotedEarlyStopReason({
      earlyStopReason,
      hasDeterministicProgress,
      improvedSyntax: finalSyntaxResult.errors.length < initialSyntaxErrorCount,
    }),
    remainingErrors: finalSyntaxResult.errors.length,
    improvedSyntax: finalSyntaxResult.errors.length < initialSyntaxErrorCount,
    noContext: false,
    errorManifest: finalErrorManifest,
    introducedBlockers,
    unresolvedBlockers,
  };
}
