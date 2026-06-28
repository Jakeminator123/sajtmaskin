import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect import: ensures the devLog-mirror subscriber is active
// before `server-verify.policy` is emitted through the bus.
import "@/lib/logging/event-bus-subscribers";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import { getPreviewHostBaseUrl, isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import {
  resolvePostFinalizePreviewBlockedState,
  resolvePostFinalizeServerVerifyDecision,
  shouldTriggerPostFinalizePreview,
} from "@/lib/gen/stream/post-finalize-policies";
import { getUnsignaledDetectedIntegrations } from "@/lib/gen/stream/shared-own-engine-helpers";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import {
  triggerBuildErrorRepair,
  triggerServerVerification,
} from "@/lib/gen/verify/server-verify";
import type { BuilderIntegrationEnvelope } from "@/lib/gen/stream/builder-stream-contract";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { debugLog, warnLog } from "@/lib/utils/debug";

export type PostFinalizeSse = {
  enc: TextEncoder;
  safeEnqueue: (data: Uint8Array) => void;
};

const THREE_D_STUB_NAME_RE = /3d|three|webgl|canvas-?scene/i;

function normalizeRequestedCapabilities(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  return Array.from(
    new Set(
      input
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function matchesThreeDStubPattern(stub: {
  sourceFile: string;
  missingImport: string;
  stubFile: string;
  rewireTarget?: string;
  rewireImportSpec?: string;
}): boolean {
  if (stub.rewireTarget) return false;
  return (
    THREE_D_STUB_NAME_RE.test(stub.stubFile) ||
    THREE_D_STUB_NAME_RE.test(stub.sourceFile) ||
    THREE_D_STUB_NAME_RE.test(stub.missingImport)
  );
}

function resolvePreviewUrlHint(chatId: string, previewWillRun: boolean): string | null {
  if (!previewWillRun) return null;
  const baseUrl = getPreviewHostBaseUrl();
  if (!baseUrl) return null;

  try {
    const parsed = new URL(baseUrl);
    const normalizedPath = parsed.pathname.replace(/\/$/, "");
    parsed.pathname = `${normalizedPath}/${encodeURIComponent(chatId)}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(chatId)}`;
  }
}

/**
 * After `finalizeAndSaveVersion`: integration hints, `done` SSE, credits, preview boot,
 * background server verification. Keeps `generation-stream.ts` readable.
 */
export async function runOwnEngineStreamPostFinalize(params: {
  sse: PostFinalizeSse;
  chatId: string;
  finalized: FinalizeResult;
  accumulatedContent: string;
  toolSignaledProviders: Set<string>;
  engineStartedAt: number;
  commitCredits: () => Promise<void>;
  buildSpec: BuildSpec;
  /** Stream ended without a normal `done` event; prefer parsing raw accumulated SSE text for preview files. */
  recoveredAfterStreamAbort?: boolean;
  /** 0 = first generation, 1+ = quality-gate-triggered repair pass. */
  repairPassIndex?: number;
}): Promise<void> {
  const {
    sse: { enc, safeEnqueue },
    chatId,
    finalized,
    accumulatedContent,
    toolSignaledProviders,
    engineStartedAt,
    commitCredits,
    buildSpec,
    recoveredAfterStreamAbort = false,
    repairPassIndex = 0,
  } = params;
  const requestedCapabilities = normalizeRequestedCapabilities(
    (finalized as FinalizeResult & { requestedCapabilities?: unknown }).requestedCapabilities,
  );
  const hasVisual3dCapability = requestedCapabilities.includes("visual-3d");

  // Lager 4 av F2-mute (se .cursor/rules/env-flow-f2-mute.mdc):
  // post-finalize kod-scan av Stripe/Upstash/etc. emitterade tidigare
  // `integration`-SSE direkt till chatten utan lifecycle-gate. I F2
  // (design) hör de hemma i `env.example`-filen tyst, inte i chatten.
  // I F3 (integrations) får de fram som vanligt.
  const isIntegrationsStage = buildSpec.previewPolicy === "fidelity3";
  const newDetected = getUnsignaledDetectedIntegrations(
    accumulatedContent,
    toolSignaledProviders,
  );
  if (newDetected.length > 0) {
    if (isIntegrationsStage) {
      const integrationPayload: BuilderIntegrationEnvelope = { items: newDetected };
      safeEnqueue(enc.encode(formatSSEEvent("integration", integrationPayload)));
      devLogAppend("in-progress", {
        type: "engine.integration_signals",
        chatId,
        integrations: newDetected.map((d) => d.key),
        envVars: newDetected.flatMap((d) => d.envVars),
      });
    } else {
      warnLog(
        "engine",
        "F2 post-finalize: dropped detected-integrations from chat (F2-mute layer 4)",
        {
          chatId,
          integrations: newDetected.map((d) => d.key),
          envVarCount: newDetected.flatMap((d) => d.envVars).length,
        },
      );
    }
  }

  let parsedForPreview: CodeFile[] = [];
  let parsedFromFinalizeFilesJson = false;
  if (finalized.filesJson?.trim()) {
    try {
      const fromSaved = parseCodeFilesFromFilesJson(finalized.filesJson);
      if (fromSaved && fromSaved.length > 0) {
        parsedForPreview = fromSaved;
        parsedFromFinalizeFilesJson = true;
      }
    } catch {
      /* fallback below */
    }
  }
  if (parsedForPreview.length === 0 && finalized.contentForVersion?.trim()) {
    try {
      parsedForPreview = parseCodeProject(finalized.contentForVersion).files;
    } catch {
      /* no preview files */
    }
  }
  if (
    recoveredAfterStreamAbort &&
    parsedForPreview.length === 0 &&
    accumulatedContent.trim()
  ) {
    try {
      parsedForPreview = parseCodeProject(accumulatedContent).files;
    } catch {
      /* still no preview files */
    }
  }

  // SAJ-61 P0/c4: when the verifier flagged build-breaking findings the
  // generated artifact cannot render. `resolvePostFinalizePreviewBlockedState`
  // ORs that signal on top of the existing preflight `previewBlocked` so
  // the SSE `done` envelope, devLog, and downstream UI status all see one
  // coherent decision (and the same `previewBlockingReason` string).
  const previewBlockedState = resolvePostFinalizePreviewBlockedState({ finalized });
  const previewBlocked = previewBlockedState.previewBlocked;
  const previewWillRun = shouldTriggerPostFinalizePreview({
    finalized,
    parsedFileCount: parsedForPreview.length,
  });
  const previewUrlHint = resolvePreviewUrlHint(chatId, previewWillRun);

  // `done` confirms that version persistence/finalize finished. Live preview is a separate
  // post-done phase and only becomes canonical on `preview-ready` (or explicit GET status/routes).
  safeEnqueue(
    enc.encode(
      formatSSEEvent("done", {
        chatId,
        versionId: finalized.version.id,
        messageId: finalized.messageId,
        ...previewUrlField(null),
        previewPending: previewWillRun,
        shimPreviewUrl: null,
        preflight: finalized.preflight,
        previewBlocked,
        verificationBlocked: finalized.preflight.verificationBlocked,
        previewBlockingReason: previewBlockedState.previewBlockingReason,
        releaseState: finalized.version.release_state,
        verificationState: finalized.version.verification_state,
        verificationSummary: finalized.version.verification_summary,
        promotedAt: finalized.version.promoted_at,
        ...(previewUrlHint ? { previewUrlHint } : {}),
        ...(finalized.rejectedShrinks.length > 0
          ? { rejectedShrinks: finalized.rejectedShrinks }
          : {}),
        ...(finalized.rejectedStructural.length > 0
          ? { rejectedStructural: finalized.rejectedStructural }
          : {}),
        ...(finalized.crossFileStubs.length > 0
          ? { crossFileStubs: finalized.crossFileStubs }
          : {}),
        warmTscSkipped: finalized.warmTscSkipped === true,
      }),
    ),
  );

  // Cross-file import repair diagnostics: stubs are shippable-but-hollow and
  // rewires are shippable-but-worth-surfacing. Keep both as warning rows, not
  // event-bus build errors, so diagnostics stay informative without flipping
  // version status red.
  if (finalized.crossFileStubs.length > 0 && dbConfigured) {
    const warningPayloads = finalized.crossFileStubs.map((stub) => {
      const isRewire = typeof stub.rewireTarget === "string" && stub.rewireTarget.trim().length > 0;
      const rewireImportSpec = stub.rewireImportSpec ?? stub.stubFile;
      return {
        chatId,
        versionId: finalized.version.id,
        level: "warning" as const,
        category: isRewire ? "merge:cross-file-rewire" : "merge:cross-file-stub",
        message: isRewire
          ? `Importen "${stub.missingImport}" från ${stub.sourceFile} saknade exakt målfil — pekades om till befintliga ${rewireImportSpec}.`
          : `Importen "${stub.missingImport}" från ${stub.sourceFile} saknade målfil — auto-stubbade ${stub.stubFile}. Komponenten renderar en synlig platshållare tills LLM emitterar en riktig implementation.`,
        meta: {
          sourceFile: stub.sourceFile,
          missingImport: stub.missingImport,
          stubFile: stub.stubFile,
          rewireTarget: stub.rewireTarget ?? null,
          rewireImportSpec: stub.rewireImportSpec ?? null,
          repairPassIndex,
          dossierId: stub.dossierId ?? null,
          capability: stub.capability ?? null,
        },
      };
    });
    const missingCapabilityWarnings =
      hasVisual3dCapability
        ? []
        : finalized.crossFileStubs
            .filter(matchesThreeDStubPattern)
            .map((stub) => ({
              chatId,
              versionId: finalized.version.id,
              level: "warning" as const,
              category: "merge:cross-file-stub-3d-capability",
              message:
                "3D-fil stubbed utan visual-3d capability — overväg att be med 'capability-add' explicit.",
              meta: {
                sourceFile: stub.sourceFile,
                missingImport: stub.missingImport,
                stubFile: stub.stubFile,
                requestedCapabilities,
                repairPassIndex,
              },
            }));
    const allWarningPayloads = [...warningPayloads, ...missingCapabilityWarnings];
    await createEngineVersionErrorLogs(allWarningPayloads).catch((err) => {
      warnLog("engine", "Failed to persist cross-file-stub warnings", {
        chatId,
        versionId: finalized.version.id,
        stubCount: allWarningPayloads.length,
        message: err instanceof Error ? err.message : "unknown",
      });
    });
  }

  devLogAppend("in-progress", {
    type: "site.done",
    chatId,
    versionId: finalized.version.id,
    previewUrl: null,
    previewDeferred: previewWillRun,
    previewBlocked,
    durationMs: Date.now() - engineStartedAt,
    // PLANERADE FÄLT (idag null) — F2/F3 telemetry split:
    //
    // Denna site.done-rad emitteras FÖRE preview-ready och FÖRE quality-gate
    // completion, så vi har inte exakta split-timings tillgängliga vid den
    // här callsite-en. Fälten är medvetet inkluderade som null så att
    // backoffice (llm_flode_telemetry.py) och strict-schemat
    // (site-done-telemetry.schema.json som tillåter `["number","null"]`) kan
    // börja titta efter dem utan format-byte när mätpunkterna wireas in.
    //
    // För att fylla dem behövs nya mätpunkter:
    //   - f2TimeMs: tid från site.start till första `preview_ready`-event
    //     (kräver sample-callback i preview-host-client eller event-bus-listener)
    //   - f3TimeMs: tid från preview_ready till sista quality-gate-resultat
    //     (kräver instrumentering kring runTier2VerifyLane i post-checks.ts)
    //
    // Se framtida wave i körplanen:
    //   - docs/plans/avklarat/2026-04-24-llm-flode-korplan/06-latens-och-scaffold-delta.md § E1
    //   - docs/plans/avklarat/2026-04-24-llm-flode-korplan/07-f2-ux-slo-matbarhet.md
    f2TimeMs: null,
    f3TimeMs: null,
    warmTscSkipped: finalized.warmTscSkipped === true,
  });
  devLogFinalizeSite();
  await commitCredits();

  if (isTier2PreviewConfigured() && previewWillRun) {
    safeEnqueue(enc.encode(formatSSEEvent("progress", { step: "preview", phase: "starting" })));

    try {
      const chatRow = await chatRepo.getChat(chatId);
      const appProjectId =
        typeof chatRow?.project_id === "string" && chatRow.project_id.trim()
          ? chatRow.project_id.trim()
          : null;
      const previewSessionStartedAt = Date.now();
      let previewSessionResult: Awaited<ReturnType<typeof startPreviewSession>>;
      try {
        previewSessionResult = await startPreviewSession(parsedForPreview, {
          appProjectId,
          chatId,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          versionIdForSession: finalized.version.id,
          // F3 previews must strip tier3-stub placeholders so missing real
          // env vars surface as a runtime failure instead of being silently
          // backfilled with `sk_test_...`-style stubs.
          lifecycleStage:
            buildSpec.previewPolicy === "fidelity3" ? "integrations" : "design",
          skipRepair: parsedFromFinalizeFilesJson,
          // filesJson from finalize is already scaffold-merged/repaired
          // so preview bootstrap can skip project scaffold rebuild.
          skipProjectScaffold: parsedFromFinalizeFilesJson,
        });
      } catch (previewStartError) {
        debugLog("preview", "Preview session started", {
          durationMs: Math.max(0, Date.now() - previewSessionStartedAt),
          chatId,
          versionId: finalized.version.id,
          appProjectId,
          ok: false,
          stage: "preview-start",
          message:
            previewStartError instanceof Error ? previewStartError.message : "Preview start failed",
        });
        throw previewStartError;
      }
      debugLog("preview", "Preview session started", {
        durationMs: Math.max(0, Date.now() - previewSessionStartedAt),
        chatId,
        versionId: finalized.version.id,
        appProjectId,
        ok: previewSessionResult.ok,
        ...(previewSessionResult.ok
          ? {
              startOutcome: previewSessionResult.result.startOutcome,
              previewTier: previewSessionResult.result.fidelityTier,
            }
          : {
              stage: previewSessionResult.error.stage,
              failureCode: previewSessionResult.error.failureCode,
            }),
      });
      if (previewSessionResult.ok) {
        const sr = previewSessionResult.result;
        logPreviewLifecycleTelemetry({
          kind: "preview_start_outcome",
          chatId,
          versionId: finalized.version.id,
          outcome: sr.startOutcome,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          tier2Provider: sr.tier2Meta?.tier2Provider,
        });
        logPreviewLifecycleTelemetry({
          kind: "preview_ready",
          chatId,
          versionId: finalized.version.id,
          previewSessionId: sr.previewSessionId,
          previewMode: sr.previewMode,
          fidelityTier: sr.fidelityTier,
          prodBuildVerified: sr.prodBuildVerified,
          startOutcome: sr.startOutcome,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          msSinceEngineStart: Math.max(0, Date.now() - engineStartedAt),
        });
        safeEnqueue(
          enc.encode(
            formatSSEEvent("preview-ready", {
              previewUrl: sr.previewUrl,
              previewSessionId: sr.previewSessionId,
              previewMode: sr.previewMode,
              previewTier: sr.fidelityTier,
              ...(sr.prodBuildVerified !== undefined ? { prodBuildVerified: sr.prodBuildVerified } : {}),
              ...(sr.prodBuildLogSnippet ? { prodBuildLogSnippet: sr.prodBuildLogSnippet } : {}),
            }),
          ),
        );
        if (sr.previewUrl.trim()) {
          chatRepo.updateVersionPreviewUrl(finalized.version.id, sr.previewUrl).catch((error) => {
            warnLog("engine", "Failed to persist previewUrl after preview-ready", {
              chatId,
              versionId: finalized.version.id,
              previewUrl: sr.previewUrl,
              message: error instanceof Error ? error.message : "Unknown error",
            });
          });
        }
      } else {
        logPreviewLifecycleTelemetry({
          kind: "preview_failed",
          chatId,
          versionId: finalized.version.id,
          stage: previewSessionResult.error.stage,
          failureCode: previewSessionResult.error.failureCode,
          detail: previewSessionResult.error.message,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          msSinceEngineStart: Math.max(0, Date.now() - engineStartedAt),
        });
        warnLog("engine", "preview_failed", {
          chatId,
          versionId: finalized.version.id,
          stage: previewSessionResult.error.stage,
          message: previewSessionResult.error.message,
        });
        safeEnqueue(enc.encode(formatSSEEvent("build-error", { ...previewSessionResult.error })));
        // Opt-in (env-gated) auto-repair so VM build failures loop back
        // through `runRepairLoop` automatically instead of waiting for
        // a manual click on "Repair". See `triggerBuildErrorRepair`.
        triggerBuildErrorRepair({
          chatId,
          versionId: finalized.version.id,
          buildError: {
            stage: previewSessionResult.error.stage,
            message: previewSessionResult.error.message,
            failureCode: previewSessionResult.error.failureCode ?? null,
          },
          onRepairAvailable: (payload) => {
            safeEnqueue(
              enc.encode(
                formatSSEEvent("version-repair-available", {
                  versionId: payload.versionId,
                  summary: payload.summary,
                  repairAvailableAt: payload.repairAvailableAt,
                }),
              ),
            );
          },
        }).catch((repairErr) => {
          warnLog("engine", "build_error_repair_trigger_failed", {
            chatId,
            versionId: finalized.version.id,
            message: repairErr instanceof Error ? repairErr.message : "unknown",
          });
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview start failed";
      logPreviewLifecycleTelemetry({
        kind: "preview_failed",
        chatId,
        versionId: finalized.version.id,
        stage: "preview-start",
        detail: message,
        previewPolicy: buildSpec.previewPolicy,
        verificationPolicy: buildSpec.verificationPolicy,
        msSinceEngineStart: Math.max(0, Date.now() - engineStartedAt),
      });
      warnLog("engine", "preview_failed", {
        chatId,
        versionId: finalized.version.id,
        stage: "preview-start",
        message,
      });
      safeEnqueue(
        enc.encode(
          formatSSEEvent("build-error", {
            stage: "preview-start" as const,
            message,
          }),
        ),
      );
      triggerBuildErrorRepair({
        chatId,
        versionId: finalized.version.id,
        buildError: {
          stage: "preview-start",
          message,
        },
        onRepairAvailable: (payload) => {
          safeEnqueue(
            enc.encode(
              formatSSEEvent("version-repair-available", {
                versionId: payload.versionId,
                summary: payload.summary,
                repairAvailableAt: payload.repairAvailableAt,
              }),
            ),
          );
        },
      }).catch((repairErr) => {
        warnLog("engine", "build_error_repair_trigger_failed", {
          chatId,
          versionId: finalized.version.id,
          message: repairErr instanceof Error ? repairErr.message : "unknown",
        });
      });
    }
  }

  const serverVerifyDecision = resolvePostFinalizeServerVerifyDecision({
    buildSpec,
    finalized,
    repairPassIndex,
  });
  const resolvedVerificationPolicy =
    !serverVerifyDecision.run && serverVerifyDecision.reason === "design_preview_skip_verify"
      ? "design_preview_skip_verify"
      : buildSpec.verificationPolicy;
  // OMTAG-06: the server-verify **policy decision** (run-or-skip) is
  // retained as a devLog entry — it's not a verifier result, and the
  // projection only cares about actual verifier outcomes. The policy
  // line also seeds a bus event with `outcome: "skipped"` when we
  // elected NOT to run, so the projection knows the verifier won't
  // produce a follow-up `version.verifier.done`.
  if (!serverVerifyDecision.run) {
    emitBusEvent({
      t: "version.verifier.done",
      versionId: finalized.version.id,
      chatId,
      outcome: "skipped",
      blocked: false,
      reason: serverVerifyDecision.reason,
    });
    // OMTAG-06 follow-up: also emit a degraded note so the UI knows
    // server-verify never ran. Without this the version-status
    // projection only sees `verifierOutcome: "skipped"`, which the
    // existing UI maps to "no verifier needed" rather than "ran
    // pipeline without verifier coverage". For design-preview skips
    // this is intentional and harmless, but operators still want it
    // surfaced so a wrongly-skipped F3 verify is visible in
    // backoffice/llm_flode_telemetry.py.
    emitBusEvent({
      t: "version.degraded",
      versionId: finalized.version.id,
      chatId,
      kind: "verifier_skipped_by_policy",
      message: `Server-verify skipped (${serverVerifyDecision.reason}).`,
      meta: {
        reason: serverVerifyDecision.reason,
        verificationPolicy: resolvedVerificationPolicy,
      },
    });
  }
  devLogAppend("in-progress", {
    type: "server-verify.policy",
    chatId,
    versionId: finalized.version.id,
    run: serverVerifyDecision.run,
    reason: serverVerifyDecision.reason,
    diagnosticOnly: serverVerifyDecision.diagnosticOnly === true,
    verificationPolicy: resolvedVerificationPolicy,
    qualityTarget: buildSpec.qualityTarget,
    buildIntent: buildSpec.buildIntent,
    changeScope: buildSpec.changeScope,
  });

  if (serverVerifyDecision.run) {
    triggerServerVerification({
      chatId,
      versionId: finalized.version.id,
      diagnosticOnly: serverVerifyDecision.diagnosticOnly === true,
      onRepairAvailable: (payload) => {
        safeEnqueue(
          enc.encode(
            formatSSEEvent("version-repair-available", {
              versionId: payload.versionId,
              summary: payload.summary,
              repairAvailableAt: payload.repairAvailableAt,
            }),
          ),
        );
      },
    }).catch((err) => {
      console.warn("[engine] Background server verification failed:", err);
    });
  }
}
