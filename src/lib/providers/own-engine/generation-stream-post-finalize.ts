import { after } from "next/server";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/dev-log";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect import: ensures the devLog-mirror subscriber is active
// before `server-verify.policy` is emitted through the bus.
import "@/lib/logging/event-bus-subscribers";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import {
  resolvePostFinalizePreviewBlockedState,
  shouldTriggerPostFinalizePreview,
} from "@/lib/gen/stream/post-finalize-policies";
import { getUnsignaledDetectedIntegrations } from "@/lib/gen/stream/shared-own-engine-helpers";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { runVersionPostchecks } from "@/lib/gen/verify/server-verify";
import type { BuilderIntegrationEnvelope } from "@/lib/gen/stream/builder-stream-contract";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { warnLog } from "@/lib/utils/debug";

export type PostFinalizeSse = {
  enc: TextEncoder;
  safeEnqueue: (data: Uint8Array) => void;
};

const THREE_D_STUB_NAME_RE = /3d|three|webgl|canvas-?scene/i;

/**
 * Hand a fire-and-forget verify/repair job to the platform so the serverless
 * invocation stays alive until the job settles. Both jobs take a per-version
 * lease and release it in a `finally`; if the invocation freezes when the SSE
 * stream closes, that `finally` never runs and the lease is stranded `running`
 * until it expires. Same failure mode as the lost `preview_url` writes — see
 * `keepWriteAlive` in `observability/llm-usage.ts`.
 *
 * Outside a request scope (scripts, tests) `after()` throws; there is no
 * invocation that can freeze there, so plain fire-and-forget is correct.
 */
function keepJobAlive(pending: Promise<unknown>): void {
  try {
    after(pending);
  } catch {
    void pending;
  }
}

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
 * After `finalizeAndSaveVersion`: durable billing marker, integration hints, `done` SSE, preview boot,
 * background server verification. Keeps `generation-stream.ts` readable.
 */
export async function runOwnEngineStreamPostFinalize(params: {
  sse: PostFinalizeSse;
  chatId: string;
  finalized: FinalizeResult;
  accumulatedContent: string;
  toolSignaledProviders: Set<string>;
  engineStartedAt: number;
  /** Original request deadline; servercore consumes it, never a fresh finalize budget. */
  requestDeadlineEpochMs: number;
  commitCredits: (target?: { chatId: string; versionId: string }) => Promise<void>;
  buildSpec: BuildSpec;
  /** Called immediately after the persisted-version `done` SSE is enqueued. */
  onDoneEmitted?: () => void;
  /** Stream ended without a normal `done` event; prefer parsing raw accumulated SSE text for preview files. */
  recoveredAfterStreamAbort?: boolean;
  /** 0 = first generation, 1+ = quality-gate-triggered repair pass. */
  repairPassIndex?: number;
}): Promise<void> {
  const {
    sse: { enc, safeEnqueue: deliverSse },
    chatId,
    finalized,
    accumulatedContent,
    toolSignaledProviders,
    engineStartedAt,
    commitCredits,
    buildSpec,
    onDoneEmitted,
    recoveredAfterStreamAbort = false,
    repairPassIndex = 0,
  } = params;
  const safeEnqueue = (data: Uint8Array) => { try { deliverSse(data); } catch { /* closed SSE never owns server progress */ } };

  // A persisted version is not reported as completed until its durable
  // billing work marker exists. Attribution/settlement failures remain
  // recoverable from that marker, while marker failure itself propagates and
  // prevents a misleading `done` event.
  await commitCredits({ chatId, versionId: finalized.version.id });

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
  const newDetected = getUnsignaledDetectedIntegrations(accumulatedContent, toolSignaledProviders);
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
  if (finalized.filesJson?.trim()) {
    try {
      const fromSaved = parseCodeFilesFromFilesJson(finalized.filesJson);
      if (fromSaved && fromSaved.length > 0) {
        parsedForPreview = fromSaved;
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
  if (recoveredAfterStreamAbort && parsedForPreview.length === 0 && accumulatedContent.trim()) {
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

  // M#pv1 (honest preview_success): track the CONFIRMED preview runtime outcome
  // and stamp it onto the version's telemetry row after the attempt resolves.
  //   - false : preview blocked (won't render) OR the session start failed.
  //   - true  : a real runtime-ready receipt (resume-verified `running:true`).
  //   - null  : pending — a fresh boot was queued but not confirmed. The
  //             finalize writer already left `null`, so no stamp is needed.
  // This replaces the old finalize-time `!hasPreviewBlockingPreflightErrors`
  // false-green, which claimed success before the runtime was ever attempted.

  // Plain-language turn summary (turn-summary.ts). Its own event — not a
  // `content` delta — so the client appends it verbatim as a trailing
  // paragraph instead of running it through the stream-merge heuristics.
  // Sent before `done` so it belongs to this assistant turn; the persisted
  // message already carries the same text, so reload and live view agree.
  if (finalized.turnSummary) {
    safeEnqueue(enc.encode(formatSSEEvent("turn-summary", { text: finalized.turnSummary })));
  }

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
  onDoneEmitted?.();

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
    const missingCapabilityWarnings = hasVisual3dCapability
      ? []
      : finalized.crossFileStubs.filter(matchesThreeDStubPattern).map((stub) => ({
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
    // P0 warm-pass observability: structured {enabled, ran, skipped,
    // scaffoldId, durationMs} per pass, so backoffice can tell "ran" from
    // "silently skipped (cache_cold / feature_flag_disabled)". Source:
    // buildWarmPassTelemetry in finalize-version/runner.ts.
    warmTsc: finalized.warmTsc ?? null,
    warmEslint: finalized.warmEslint ?? null,
  });
  devLogFinalizeSite();

  // One server-owned promise. SSE delivery is an observer, never a continuation trigger.
  if (previewWillRun) safeEnqueue(enc.encode(formatSSEEvent("progress", { step: "preview", phase: "starting" })));
  const pending = runVersionPostchecks({
    chatId, versionId: finalized.version.id, entry: "initial", deadlineEpochMs: params.requestDeadlineEpochMs,
    notifications: {
      policy: policy => {
        const verificationPolicy = !policy.serverVerify.run && policy.serverVerify.reason === "design_preview_skip_verify"
          ? "design_preview_skip_verify" : policy.verificationPolicy;
        devLogAppend("in-progress", { type: "server-verify.policy", chatId, versionId: finalized.version.id,
          run: policy.serverVerify.run, reason: policy.serverVerify.reason,
          diagnosticOnly: policy.serverVerify.diagnosticOnly === true, verificationPolicy,
          qualityTarget: buildSpec.qualityTarget, buildIntent: buildSpec.buildIntent, repairPassIndex });
        if (!policy.serverVerify.run) emitBusEvent({ t: "version.verifier.done", chatId,
          versionId: finalized.version.id, outcome: "skipped", blocked: false, reason: policy.serverVerify.reason });
      },
      previewReady: (receipt) => {
        // A URL-only reuse is not a new host start/resume operation.
        if (receipt.startOutcome !== "reused_url") {
        logPreviewLifecycleTelemetry({
          kind: receipt.runtimeReady ? "preview_ready" : "preview_url_handoff",
          chatId, versionId: finalized.version.id, previewSessionId: receipt.previewSessionId,
          previewMode: receipt.previewMode, fidelityTier: receipt.fidelityTier,
          prodBuildVerified: receipt.prodBuildVerified,
          startOutcome: receipt.startOutcome,
          previewPolicy: buildSpec.previewPolicy, verificationPolicy: buildSpec.verificationPolicy,
          msSinceEngineStart: Math.max(0, Date.now() - engineStartedAt),
        });
        }
        safeEnqueue(enc.encode(formatSSEEvent("preview-ready", {
          previewUrl: receipt.previewUrl, previewSessionId: receipt.previewSessionId,
          lifecycleToken: receipt.lifecycleToken, previewMode: receipt.previewMode,
          previewTier: receipt.fidelityTier, runtimeConfirmed: receipt.runtimeReady,
          ...(receipt.prodBuildVerified !== undefined ? { prodBuildVerified: receipt.prodBuildVerified } : {}),
          ...(receipt.prodBuildLogSnippet ? { prodBuildLogSnippet: receipt.prodBuildLogSnippet } : {}),
        })));
      },
      buildError: error => safeEnqueue(enc.encode(formatSSEEvent("build-error", { ...error }))),
      repairAvailable: payload => safeEnqueue(enc.encode(formatSSEEvent("version-repair-available", {
        versionId: payload.versionId, summary: payload.summary, repairAvailableAt: payload.repairAvailableAt,
      }))),
    },
  }).catch(error => warnLog("engine", "Server postchecks stopped", {
    chatId, versionId: finalized.version.id, message: error instanceof Error ? error.message : "unknown",
  }));
  keepJobAlive(pending);
}
