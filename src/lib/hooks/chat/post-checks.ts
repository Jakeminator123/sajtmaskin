import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { parseRetryAfterMs } from "@/lib/builder/preview-bootstrap-retry";
import type { UiMessagePart } from "@/lib/builder/types";
import { DESIGN_PREVIEW_QUALITY_GATE_CHECKS } from "@/lib/gen/verify/quality-gate-checks";
import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import { appendToolPartToMessage, integrationSignalToToolPart } from "./helpers";
import { beginPipelineWork } from "@/lib/builder/pipeline-interaction-lock";
import { markClientErrorVersionPromoted } from "@/lib/builder/preview-client-error-report";
import {
  buildPostCheckBaseline,
  type PostCheckBaseline,
} from "./post-checks-analysis";
import { resolvePreviousVersionId } from "./post-checks-diff";
import {
  fetchChatFiles,
  fetchChatVersions,
} from "./post-checks-fetch";
import {
  buildPostCheckArtifacts,
  type ImageValidationResult,
} from "./post-checks-results";
import {
  appendPostCheckSummaryToMessage,
  buildPostCheckSummary,
} from "./post-checks-summary";
import { toast } from "sonner";
import type {
  AutoFixPayload,
  QualityGateFailure,
  RepairContext,
  SetMessages,
  StreamQualitySignal,
  VersionErrorLogPayload,
} from "./types";
import type {
  ProductPostcheckAttestation,
  ProductPostcheckResult,
} from "@/lib/gen/verify/product-postcheck";
import { isInfrastructureSkipReason } from "@/lib/gen/verify/product-postcheck-skip";

/** Extra försök efter det första, bara vid en retryable 503. */
const ERROR_LOG_RETRY_ATTEMPTS = 2;
/** Väntetid när 503:an kommer utan `Retry-After`. */
const ERROR_LOG_RETRY_FALLBACK_MS = 1_000;
/**
 * Tak för hur länge vi lyder ett `Retry-After`. Resume-lanen **väntar** på det
 * här anropet, så en orimlig header får inte hålla F3-lyftet i minuter.
 */
const ERROR_LOG_RETRY_MAX_MS = 5_000;

const postCheckControllers = new Map<string, AbortController>();

/** Abort in-flight post-checks for this chat (new send / new epoch). */
export function abortPostChecksForChat(chatId: string): void {
  const existing = postCheckControllers.get(chatId);
  if (!existing) return;
  existing.abort();
  postCheckControllers.delete(chatId);
}

/**
 * True medan den normala post-stream-lanen (postcheck → quality gate) äger
 * verifieringen för chatten i DEN HÄR fliken. Resume-lanen läser vakten innan
 * den startar: sedan #1221 får normala lanen lagligt vänta in en bootande
 * preview i upp till 150 s, vilket passerade resume-lanens gamla 3-minuters
 * åldersgräns — resultatet var dubbla Chromium-launcher per dom (dubbelt
 * /tmp-tryck, SM-072) och en quality gate som stals via 409-leasen (prod
 * 2026-09-01, chattar c2371f9c och 3b9ca137). Cross-tab skyddas oförändrat av
 * routens per-versions-lease.
 */
export function hasActivePostCheck(chatId: string): boolean {
  return postCheckControllers.has(chatId);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const ABORTED_VERIFY_REASON =
  "Verifieringen avbröts — en ny generation startade.";

function appendAbortedQualityGateCard(
  setMessages: SetMessages,
  assistantMessageId: string,
  toolCallId: string,
): void {
  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Quality gate",
    toolCallId,
    state: "output-available",
    output: {
      skipped: true,
      aborted: true,
      reason: ABORTED_VERIFY_REASON,
    },
  } as UiMessagePart);
}

/**
 * Exported for the resume-verify lane (`useResumePendingVerification`), which
 * mirrors this lane's tail and must persist the SAME log rows — notably the
 * `product_postcheck.summary` row that `PreviewPanelF3Trigger` reads to block
 * F3 on product-blocked versions (Codex P1 on #353).
 *
 * Returns whether the write verifiably succeeded (2xx). The normal lane
 * stays fire-and-forget, but the resume lane must fail closed when a
 * product-BLOCKER row could not be persisted (Codex P1 round 4).
 *
 * **Retryar på 503 (spår B).** Routen degraderar medvetet till
 * `503 row_contention` + `Retry-After` när verify/lease håller `FOR UPDATE` på
 * raden (`error-log/route.ts`). Utan retry blev degraderingen ett tyst
 * fel med dubbel ironi: loggen *om* ett fel försvann. Värre för resume-lanen,
 * som tolkar `false` som "kunde inte spara blockeraren" och då failar closed på
 * en övergående låskonflikt. Bara 503 retryas — 4xx ändrar sig inte av att
 * frågas igen, och ett nätverksfel är best-effort.
 */
export async function persistVersionErrorLogs(params: {
  chatId: string;
  versionId: string;
  logs: VersionErrorLogPayload[];
  productPostcheckAttestation?: ProductPostcheckAttestation | null;
}): Promise<boolean> {
  const { chatId, versionId, logs, productPostcheckAttestation } = params;
  if (!logs.length) return true;
  const url = `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`;
  const productPostcheckLogs = logs.filter((log) =>
    log.category?.startsWith("product_postcheck."),
  );
  if (productPostcheckLogs.length > 0 && !productPostcheckAttestation) {
    // Fail closed client-side as well as in the route: a Product Postcheck row
    // without its exact preview/revision tuple is never valid. The REST of the
    // batch is not lifecycle-scoped though — preflight/sanity/image diagnostics
    // used to be dropped with it, which is how a run could end up with no trace
    // at all in `engine_version_error_logs`. Persist those unattested and still
    // report failure for the rows we refused.
    const plainLogs = logs.filter(
      (log) => !log.category?.startsWith("product_postcheck."),
    );
    if (plainLogs.length > 0) await postErrorLogBatch(url, plainLogs, null);
    return false;
  }
  return postErrorLogBatch(url, logs, productPostcheckAttestation ?? null);
}

async function postErrorLogBatch(
  url: string,
  logs: VersionErrorLogPayload[],
  productPostcheckAttestation: ProductPostcheckAttestation | null,
): Promise<boolean> {
  for (let attempt = 0; attempt <= ERROR_LOG_RETRY_ATTEMPTS; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logs,
          ...(productPostcheckAttestation
            ? { productPostcheckAttestation }
            : {}),
        }),
      });
    } catch {
      // Best-effort only
      return false;
    }
    if (res.ok) return true;
    if (res.status !== 503 || attempt === ERROR_LOG_RETRY_ATTEMPTS) return false;
    const waitMs = Math.min(
      parseRetryAfterMs(res.headers, ERROR_LOG_RETRY_FALLBACK_MS),
      ERROR_LOG_RETRY_MAX_MS,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return false;
}

async function validateImages(params: {
  chatId: string;
  versionId: string;
  signal: AbortSignal;
  urls?: string[];
}): Promise<ImageValidationResult | null> {
  const { chatId, versionId, signal, urls } = params;
  try {
    const response = await fetch(
      `${engineChatBaseUrl(chatId)}/validate-images`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId,
          autoFix: true,
          ...(urls && urls.length > 0 ? { urls } : {}),
        }),
        signal,
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as ImageValidationResult;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

/**
 * En (1) omkörning när kontrollens EGEN apparat dog (infrastruktur-skip enligt
 * `classifyProductPostcheckSkipReason`). Prod 2026-09-01 (chat 3b9ca137, v2):
 * första försöket dog med `playwright_unavailable` på en serverless-instans
 * vars /tmp var fylld av en Chromium-core-dump, medan en omkörning sekunder
 * senare landade på en frisk instans och fångade sex riktiga produktfynd
 * (productBlocked). Utan omkörningen hade domen blivit advisory-skip och
 * fynden aldrig upptäckts. Exakt ett omförsök — aldrig en launch-storm.
 */
const PRODUCT_POSTCHECK_INFRA_RETRY_DELAY_MS = 4_000;

function delayUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runProductPostcheckApi(params: {
  chatId: string;
  versionId: string;
  previewUrl: string | null;
  signal: AbortSignal;
}): Promise<ProductPostcheckResult | null> {
  const first = await postProductPostcheckOnce(params);
  // `feature_disabled` är infrastrukturklassad men deterministisk för hela
  // deployn (operatörsflagga) — en omkörning kan aldrig ge ett annat utfall.
  if (
    !first?.skipped ||
    first.skippedReason === "feature_disabled" ||
    !isInfrastructureSkipReason(first.skippedReason)
  ) {
    return first;
  }
  await delayUnlessAborted(PRODUCT_POSTCHECK_INFRA_RETRY_DELAY_MS, params.signal);
  const second = await postProductPostcheckOnce(params);
  // En transportmiss på omförsöket får inte radera det attesterade första
  // utfallet — infra-skipen är fortfarande en ärlig (advisory) dom.
  return second ?? first;
}

async function postProductPostcheckOnce(params: {
  chatId: string;
  versionId: string;
  previewUrl: string | null;
  signal: AbortSignal;
}): Promise<ProductPostcheckResult | null> {
  const { chatId, versionId, previewUrl, signal } = params;
  try {
    const response = await fetch(
      `${engineChatBaseUrl(chatId)}/product-postcheck`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, previewUrl }),
        signal,
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as ProductPostcheckResult;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

/** Readable live-review log line. Skip reasons must not claim screenshots were taken. */
export function formatLiveReviewLogMessage(result: ProductPostcheckResult): string | null {
  if (result.liveReview?.status === "completed") {
    return `Live review: ${result.liveReview.decision.verdict}.`;
  }
  if (result.liveReview?.status === "skipped") {
    return `Live review skipped: ${result.liveReview.reason}.`;
  }
  if (result.screenshots) {
    return "Live review screenshots captured.";
  }
  return null;
}

/** Exported for the resume-verify lane — see `persistVersionErrorLogs`. */
export function buildProductPostcheckLogItems(
  result: ProductPostcheckResult | null,
): VersionErrorLogPayload[] {
  // A transport failure has no server-owned tuple. Persist it under a separate
  // non-product category so it remains visible without being mistaken for a
  // Product Postcheck PASS/skip. The verify lane holds and retries below.
  if (!result) {
    return [
      {
        level: "warning",
        category: "post-check.product-postcheck-transport",
        message: "F2 Product Postcheck failed before an attested result was returned.",
        meta: { skippedReason: "transport_error" },
      },
    ];
  }
  // A superseded response deliberately carries no tuple and must leave no
  // durable evidence for the replaced preview. Other unscoped responses are
  // likewise unsafe, except the explicit deployment-level feature kill-switch.
  if (
    result.skippedReason === "preview_superseded" ||
    (!result.attestation && result.skippedReason !== "feature_disabled")
  ) {
    return [];
  }
  if (!result.attestation) return [];
  const attestationMeta = {
    attestedPreviewSessionId: result.attestation.previewSessionId,
    attestedLifecycleToken: result.attestation.lifecycleToken,
    attestedFilesRevision: result.attestation.filesRevision,
    // Binder alla rader i samma körning till routens run-id, så omkörningar
    // och tappade fynd går att skilja åt i efterhand (OpenClaw 2026-09-01).
    verificationRunId: result.verificationRunId ?? null,
  };
  if (result.skipped) {
    // Krasch-skäl (Playwright dog, navigering föll, timeout) är INTE policy-skips
    // och ska synas i defect-aggregatet — prod-körningen 2026-08-11 visade sex
    // "skipped"-rader i rad som i själva verket var en kraschad Chromium
    // (/tmp-svält). `warning` påverkar inga gates: verdikt-läsarna ankrar på
    // `preflight:quality-gate`/`quality-gate:*` och readiness-kortets
    // preview-filter på `preview|render-telemetry|deploy`. Policy-skips
    // (feature av, ingen URL, otillåten host) förblir `info`.
    const crashReasons = new Set([
      "playwright_unavailable",
      "navigation_failed",
      "timeout",
      "runtime_error",
    ]);
    const skippedReason = result.skippedReason ?? "unknown";
    return [
      {
        level: crashReasons.has(skippedReason) ? "warning" : "info",
        category: "product_postcheck.skipped",
        message: "F2 Product Postcheck skipped.",
        meta: {
          ...attestationMeta,
          skippedReason,
          durationMs: result.durationMs ?? null,
          checkedUrl: result.checkedUrl ?? null,
        },
      },
    ];
  }

  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const logs: VersionErrorLogPayload[] = warnings.map((warning) => ({
    level: "warning" as const,
    category: `product_postcheck.${warning.code || "warning"}`,
    message: warning.message || "F2 Product Postcheck warning.",
    meta: {
      ...attestationMeta,
      ...warning,
      durationMs: result.durationMs ?? null,
      checkedUrl: result.checkedUrl ?? null,
    },
  }));
  logs.unshift({
    level: warnings.length > 0 ? "warning" : "info",
    category: "product_postcheck.summary",
    message:
      warnings.length > 0
        ? `F2 Product Postcheck found ${warnings.length} warning(s).`
        : "F2 Product Postcheck passed.",
    meta: {
      ...attestationMeta,
      warningCount: warnings.length,
      // Routens rapporterade antal vs vad som faktiskt persisteras här. En
      // diff mellan talen pekar direkt på var fynd försvann (9-vs-7-klassen).
      reportedWarningCount:
        typeof result.warningCount === "number" ? result.warningCount : warnings.length,
      persistedWarningCount: warnings.length,
      productBlocked: result.productBlocked === true,
      durationMs: result.durationMs ?? null,
      checkedUrl: result.checkedUrl ?? null,
      // Hur många routes crawlen hann med innan deadline. Underlaget för
      // beslutet om kontrollen ska flyttas före preview-länken (masterplanens
      // steg 4) — utan det i DB:n går täckningen inte att mäta i efterhand.
      routesChecked: result.routesChecked ?? null,
    },
  });
  const liveReviewMessage = formatLiveReviewLogMessage(result);
  if (liveReviewMessage) {
    logs.push({
      level: "info",
      category: "product_postcheck.live_review",
      message: liveReviewMessage,
      meta: {
        ...attestationMeta,
        screenshots: result.screenshots ?? null,
        liveReview: result.liveReview ?? null,
      },
    });
  }
  return logs;
}

const ENV_LOOKUP_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g;
const ENV_ERROR_HINTS = [
  "environment variable",
  "environment variables",
  "env var",
  "env vars",
  "missing env",
  "missing required",
  "must be set",
  "process.env",
  "saknas fortfarande",
  "saknad",
];

function extractMissingEnvKeysFromQualityGate(checks: QualityGateCheckResult[]): string[] {
  const keys = new Set<string>();
  for (const check of checks) {
    const output = typeof check.output === "string" ? check.output : "";
    if (!output.trim()) continue;
    const lower = output.toLowerCase();
    if (!ENV_ERROR_HINTS.some((hint) => lower.includes(hint))) continue;
    for (const match of output.matchAll(ENV_LOOKUP_RE)) {
      const candidate = match[0];
      if (!candidate) continue;
      if (candidate.includes("_") || candidate.endsWith("URL")) {
        keys.add(candidate);
      }
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function buildAutoFixMeta(
  baseline: PostCheckBaseline,
  imageValidation: ImageValidationResult | null,
  finalDemoUrl: string | null,
  preflight?: PreviewPreflightState | null,
) {
  return {
    previousVersionId: baseline.previousVersionId,
    missingRoutes: baseline.missingRoutes,
    missingPlannedRoutes: baseline.missingPlannedRoutes,
    lucideLinkMisuse: baseline.lucideLinkMisuse,
    suspiciousUseCalls: baseline.suspiciousUseCalls,
    sanityIssues: baseline.sanityIssues,
    imageValidation,
    demoUrl: finalDemoUrl,
    scaffoldRetry: preflight?.scaffoldRetry ?? null,
  };
}

export async function runPostGenerationChecks(params: {
  chatId: string;
  versionId: string;
  demoUrl?: string | null;
  preflight?: PreviewPreflightState | null;
  assistantMessageId: string;
  setMessages: SetMessages;
  streamQuality?: StreamQualitySignal;
  mutateVersions?: () => void;
  onAutoFix?: (payload: AutoFixPayload) => void;
  /**
   * Område 6-3 punkt 1: fired exactly once when this post-check
   * invocation finishes (success OR catch path), from the `finally`
   * block. The builder wires this to a `refreshNonce` bump so
   * `useVersionStatus` does a guaranteed final read AFTER the
   * product-postcheck has emitted any late `version.degraded`.
   */
  onComplete?: () => void;
}) {
  const {
    chatId,
    versionId,
    demoUrl,
    preflight,
    assistantMessageId,
    setMessages,
    streamQuality,
    mutateVersions,
    onAutoFix,
    onComplete,
  } = params;
  const toolCallId = `post-check:${versionId}`;
  abortPostChecksForChat(chatId);
  const controller = new AbortController();
  postCheckControllers.set(chatId, controller);
  const releasePipelineWork = beginPipelineWork();
  let spawnedVerifyLane = false;
  let completionPersistence: Promise<boolean> | null = null;
  let productPostcheckResult: ProductPostcheckResult | null | undefined;
  let productPostcheckPersistenceScheduled = false;

  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:post-check",
    toolName: "Post-check",
    toolCallId,
    state: "input-streaming",
    input: { chatId, versionId },
    output: {
        steps: ["Efterkontrollerar filer och preview"],
    },
  });

  try {
    const [currentFiles, versions] = await Promise.all([
      fetchChatFiles(chatId, versionId, controller.signal, true),
      fetchChatVersions(chatId, controller.signal),
    ]);
    const previousVersionId = resolvePreviousVersionId(versionId, versions);
    const previousFiles = previousVersionId
      ? await fetchChatFiles(chatId, previousVersionId, controller.signal, true)
      : [];

    const baseline = buildPostCheckBaseline({
      currentFiles,
      previousFiles,
      previousVersionId,
      versions,
      versionId,
      demoUrl,
      preflight,
    });

    // Independent HTTP checks — run in parallel so the post-check tail (and
    // the verify-lane behind it) is not serialized on two network round-trips.
    const [imageValidation, resolvedProductPostcheck] = await Promise.all([
      validateImages({
        chatId,
        versionId,
        signal: controller.signal,
      }),
      runProductPostcheckApi({
        chatId,
        versionId,
        previewUrl: baseline.resolvedDemoUrl ?? null,
        signal: controller.signal,
      }),
    ]);
    productPostcheckResult = resolvedProductPostcheck;
    const productPostcheck = resolvedProductPostcheck;
    const productPostcheckNeedsRetry =
      !productPostcheck ||
      productPostcheck.skippedReason === "preview_superseded" ||
      (productPostcheck.skippedReason !== "feature_disabled" && !productPostcheck.attestation);
    const warnings = [...baseline.warnings];
    if (imageValidation?.warnings?.length) {
      warnings.push(...imageValidation.warnings);
    }
    if (!productPostcheck?.skipped && productPostcheck?.warnings?.length) {
      warnings.push(...productPostcheck.warnings.map((warning) => `Product: ${warning.message}`));
    }
    if (!productPostcheck) {
      warnings.push("Product: kontrollen saknar ett aktuellt attesterat svar och måste köras om.");
    }

    const artifacts = buildPostCheckArtifacts({
      currentFileCount: currentFiles.length,
      versionId,
      changes: baseline.changes,
      warnings,
      preflight,
      previousVersionId: baseline.previousVersionId,
      streamQuality,
      missingRoutes: baseline.missingRoutes,
      missingPlannedRoutes: baseline.missingPlannedRoutes,
      lucideLinkMisuse: baseline.lucideLinkMisuse,
      suspiciousUseCalls: baseline.suspiciousUseCalls,
      designTokens: baseline.designTokens,
      sanityIssues: baseline.sanityIssues,
      sanityErrors: baseline.sanityErrors,
      sanityWarnings: baseline.sanityWarnings,
      imageValidation,
      productPostcheck,
      resolvedDemoUrl: baseline.resolvedDemoUrl,
    });

    completionPersistence = persistVersionErrorLogs({
      chatId,
      versionId,
      logs: [...artifacts.logItems, ...buildProductPostcheckLogItems(productPostcheck)],
      productPostcheckAttestation: productPostcheck?.attestation ?? null,
    });
    productPostcheckPersistenceScheduled = true;

    if (artifacts.autoFixReasons.length > 0) {
      onAutoFix?.({
        chatId,
        versionId,
        reasons: artifacts.autoFixReasons,
        meta: buildAutoFixMeta(baseline, imageValidation, artifacts.finalDemoUrl, preflight),
      });
    }

    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:post-check",
      toolName: "Post-check",
      toolCallId,
      state: "output-available",
      input: { chatId, versionId, previousVersionId: baseline.previousVersionId },
      output: artifacts.output,
    });

    if (productPostcheck?.liveReview?.status === "completed") {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:live-review",
        toolName: "Live-granskning",
        toolCallId: `live-review:${versionId}`,
        state: "output-available",
        output: productPostcheck.liveReview,
      });
    }

    appendPostCheckSummaryToMessage(
      setMessages,
      assistantMessageId,
      buildPostCheckSummary({
        changes: baseline.changes,
        warnings,
        demoUrl: artifacts.finalDemoUrl,
        previewBlockingReason: artifacts.previewBlockingReason,
        provisional: artifacts.provisionalVersion,
        verifyPending: artifacts.verifyPending,
        autoFixQueued: artifacts.autoFixQueued,
        qualityTier: artifacts.qualityTier,
        warningReasons: artifacts.warningReasons,
        productBlocked: productPostcheck?.productBlocked === true,
      }),
    );

    // Single F3 gate owner (2026-07 preview-lifecycle simplification): for an
    // `integrations` (F3) version the SERVER post-finalize lane already runs
    // the authoritative ReleaseGate (`resolvePostFinalizeServerVerifyDecision`
    // → `triggerServerVerification`, reason `policy_match`). Firing a second
    // `/quality-gate` POST from here raced that lane for the same version
    // lease (409 `version_busy` noise, duplicated VM work). The client
    // observes the outcome via the existing status polling
    // (`useVersionStatus` / `useVersions`) instead.
    const currentVersionEntry = versions.find(
      (v) => v.versionId === versionId || v.id === versionId,
    );
    const serverOwnsVerifyLane = currentVersionEntry?.lifecycleStage === "integrations";

    // Verify-lane only runs when the version is actually verify-pending.
    // `autoFixReasons === []` alone is NOT enough: degenerate output (M#dgc)
    // clears the autofix queue while the version is terminally failed
    // server-side (`verifyPending === false`) — running the VM verify lane
    // there just burns work on a version the degeneracy guard already failed.
    if (serverOwnsVerifyLane) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId: `quality-gate:${versionId}`,
        state: "output-available",
        output: {
          skipped: true,
          reason:
            "ReleaseGate (typecheck + build) körs av servern för integrationsversioner — status uppdateras i versionspanelen.",
          serverOwned: true,
        },
      } as UiMessagePart);
    } else if (
      productPostcheckNeedsRetry &&
      artifacts.autoFixReasons.length === 0 &&
      artifacts.verifyPending
    ) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId: `quality-gate:${versionId}`,
        state: "output-available",
        output: {
          skipped: true,
          retryPending: true,
          reason:
            "Produktkontrollen saknar ett aktuellt attesterat resultat — versionen lämnas pending och återupptas mot rätt preview.",
        },
      } as UiMessagePart);
    } else if (artifacts.autoFixReasons.length === 0 && artifacts.verifyPending) {
      spawnedVerifyLane = true;
      void runTier2VerifyLane({
        chatId,
        versionId,
        assistantMessageId,
        setMessages,
        mutateVersions,
        onAutoFix,
        abortController: controller,
        productPostcheck: productPostcheckResult ?? null,
      });
    } else {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId: `quality-gate:${versionId}`,
        state: "output-available",
        output: {
          skipped: true,
          reason: artifacts.autoFixQueued
            ? "Autofix köad från post-check — verify-lane körs efter fix."
            : "Versionen är terminalt failad (degenererad output) — verify-lane hoppas över.",
          autoFixQueued: artifacts.autoFixQueued,
        },
      } as UiMessagePart);
    }
  } catch (error) {
    if (isAbortError(error)) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:post-check",
        toolName: "Post-check",
        toolCallId,
        state: "output-available",
        input: { chatId, versionId },
        output: {
          skipped: true,
          aborted: true,
          reason: ABORTED_VERIFY_REASON,
        },
      });
    } else {
      completionPersistence = persistVersionErrorLogs({
        chatId,
        versionId,
        logs: [
          {
            level: "error",
            category: "post-check",
            message: error instanceof Error ? error.message : "Post-check failed",
          },
          ...(productPostcheckPersistenceScheduled
            ? []
            : buildProductPostcheckLogItems(productPostcheckResult ?? null)),
        ],
        productPostcheckAttestation: productPostcheckResult?.attestation ?? null,
      });
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:post-check",
        toolName: "Post-check",
        toolCallId,
        state: "output-error",
        input: { chatId, versionId },
        errorText: error instanceof Error ? error.message : "Post-check failed",
      });
    }
  } finally {
    if (!spawnedVerifyLane) {
      if (postCheckControllers.get(chatId) === controller) {
        postCheckControllers.delete(chatId);
      }
      controller.abort();
    }
    releasePipelineWork();
    // Deterministic completion signal (runs on both the success and catch
    // paths, exactly once). Refetch BOTH status surfaces only after the
    // post-check's own error-log write has settled. In particular, the
    // product_postcheck.summary row is an input to the F3 trigger; refreshing
    // before that row exists can cache the previous summary for another SWR
    // interval. The write remains fire-and-forget for the generation tail —
    // its retry policy owns settlement and either outcome releases the
    // refresh callback.
    const refreshStatusSurfaces = () => {
      mutateVersions?.();
      onComplete?.();
    };
    if (completionPersistence) {
      void completionPersistence.then(refreshStatusSurfaces, refreshStatusSurfaces);
    } else {
      refreshStatusSurfaces();
    }
  }
}

type QualityGateCheckResult = {
  check: string;
  passed: boolean;
  advisory?: boolean;
  repairable?: boolean;
  failureKind?: "code" | "tooling" | null;
  errorCount?: number;
  warningCount?: number;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

type QualityGateVisualQaResult = {
  overallScore: number;
  passed: boolean;
  checks: Array<{ check: string; passed: boolean; score: number; detail: string }>;
};

function formatDurationMs(durationMs: number | null | undefined): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }
  // Samma format som Slutsteg-progress: 0.0s / 2.4s under 10 s, 14s från 10 s.
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
}

function formatCheckDisplayLabel(check: string): string {
  const trimmed = check.trim();
  if (!trimmed) return check;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function formatUtcClock(timestamp: string | null | undefined): string | null {
  if (typeof timestamp !== "string" || !timestamp.trim()) return null;
  const value = timestamp.trim();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().slice(11, 19)}Z`;
}

async function runTier2VerifyLane(params: {
  chatId: string;
  versionId: string;
  assistantMessageId: string;
  setMessages: SetMessages;
  mutateVersions?: () => void;
  onAutoFix?: (payload: AutoFixPayload) => void;
  previewPolicy?: "fidelity2" | "fidelity3";
  abortController?: AbortController;
  /**
   * Postcheckens attesterade resultat från samma körpass. Bär den in i
   * gate-utfallet så en promotad version med `productBlocked` (t.ex. döda
   * CTA-knappar, trasig mobilmeny) kan skicka fynden till en riktad
   * auto-fix-runda — samma väg som Visual QA, synlig i chatten.
   */
  productPostcheck?: ProductPostcheckResult | null;
}) {
  const {
    chatId,
    versionId,
    assistantMessageId,
    setMessages,
    mutateVersions,
    onAutoFix,
    previewPolicy = "fidelity2",
    abortController,
    productPostcheck = null,
  } = params;
  const toolCallId = `quality-gate:${versionId}`;
  const releasePipelineWork = beginPipelineWork();
  const checks = DESIGN_PREVIEW_QUALITY_GATE_CHECKS;
  // Bounded retry for retryable 503s from /quality-gate — see the loop below.
  const QUALITY_GATE_RETRYABLE_STATUS = 503;
  const QUALITY_GATE_503_MAX_RETRIES = 2;
  const QUALITY_GATE_503_RETRY_BASE_DELAY_MS = 2_000;

  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Quality gate",
    toolCallId,
    state: "input-streaming",
    input: { chatId, versionId, checks },
  } as UiMessagePart);

  try {
    if (previewPolicy === "fidelity2" && checks.includes("build")) {
      console.warn(
        "[F2 contract violation] build belongs to F3 (integrationsBuild). " +
          "This call site sends build to designPreview gate. Investigate.",
        { chatId, versionId, checks },
      );
      // Soft landing: warning-only during telemetry week.
    }

    const postQualityGate = () =>
      fetch(`${engineChatBaseUrl(chatId)}/quality-gate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, checks }),
        signal: abortController?.signal,
      });

    let res = await postQualityGate();
    // Retryable 503 (granska-svärm F5 på #504): /quality-gate svarar 503 med
    // `lease_unavailable`/`quality_gate_unavailable` när leasen/verify-lanen är
    // tillfälligt otillgänglig — F3-vägarna (f3-finalize-action,
    // useResumePendingVerification) retryar redan dessa; F2-lanen behandlade
    // dem som generiska fel. Bounded backoff, därefter faller vi igenom till
    // den vanliga felhanteringen nedan.
    for (
      let attempt = 1;
      res.status === QUALITY_GATE_RETRYABLE_STATUS && attempt <= QUALITY_GATE_503_MAX_RETRIES;
      attempt++
    ) {
      if (abortController?.signal.aborted) {
        appendAbortedQualityGateCard(setMessages, assistantMessageId, toolCallId);
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, QUALITY_GATE_503_RETRY_BASE_DELAY_MS * attempt),
      );
      if (abortController?.signal.aborted) {
        appendAbortedQualityGateCard(setMessages, assistantMessageId, toolCallId);
        return;
      }
      res = await postQualityGate();
    }

    if (res.status === 501) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-available",
        output: { skipped: true, reason: "Quality gate not configured" },
      } as UiMessagePart);
      return;
    }

    const data = (await res.json().catch(() => null)) as {
      passed?: boolean;
      checks?: QualityGateCheckResult[];
      verifyLaneDurationMs?: number;
      firstFailureCheck?: string | null;
      jobStartedAt?: string | null;
      jobFinishedAt?: string | null;
      error?: string;
      // Terminal-neutral supersede: the gate finished after a newer version
      // was created — the server marked this version `superseded` and skipped
      // all state mutation. Never render a red/rose failure card and never
      // start repair/autofix against the abandoned version.
      superseded?: boolean;
      // Env kill-switch (SAJTMASKIN_DISABLE_QUALITY_GATE): the server
      // short-circuited the F2 RenderGate and left the version untouched
      // (unverified/pending — a skipped gate is never promoted or marked
      // `passed`; Codex P1 on #573).
      skipped?: boolean;
      disabled?: boolean;
      reason?: string;
      visualQA?: QualityGateVisualQaResult;
      // Promotion guard markers (route returns `passed:false` alongside these):
      // `vmGatePassed` keeps the underlying VM-check status for diagnostics.
      vmGatePassed?: boolean;
      promotionBlocked?: boolean;
      promotionBlockedReason?: string | null;
      promoteError?: boolean;
      /** Server-confirmed transition; unlike `passed`, this proves promotion. */
      promoted?: boolean;
      // F2 render-first advisory: `passed:true` with `vmGatePassed:false` means a
      // typecheck-only failure was treated as non-blocking on a design preview
      // (the version was promoted). No auto-repair should run for this.
      designAdvisory?: boolean;
      qualityGateAdvisory?: boolean;
      advisoryChecks?: string[];
    } | null;

    if (!res.ok || !data) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-error",
        errorText: data?.error || `Quality gate request failed (HTTP ${res.status})`,
      } as UiMessagePart);
      return;
    }

    if (data.superseded) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-available",
        output: {
          skipped: true,
          superseded: true,
          reason:
            "En nyare version tog över innan verifieringen hann bli klar — den här versionen markerades som ersatt (inte fel). Den nya versionen verifieras separat.",
        },
      } as UiMessagePart);
      return;
    }

    // Env kill-switch: the F2 quality gate is turned off server-side — the
    // version was left untouched (unverified, never promoted/`passed`) →
    // informational (not error) card. `promotionBlocked` is kept for
    // defense-in-depth should a future skip path ever mutate state again.
    if (data.disabled || data.skipped) {
      const reasonText =
        typeof data.reason === "string" && data.reason.trim()
          ? data.reason
          : "Quality gate avstängd";
      appendToolPartToMessage(
        setMessages,
        assistantMessageId,
        (data.promotionBlocked
          ? {
              type: "tool:quality-gate",
              toolName: "Quality gate",
              toolCallId,
              state: "output-error",
              errorText: reasonText,
            }
          : {
              type: "tool:quality-gate",
              toolName: "Quality gate",
              toolCallId,
              state: "output-available",
              output: { skipped: true, reason: reasonText },
            }) as UiMessagePart,
      );
      return;
    }

    if (
      data.promoted === true &&
      data.promotionBlocked !== true &&
      data.promoteError !== true
    ) {
      // Close the promotion→SWR race immediately. The marker is monotonic,
      // so the stale `promotedAt=null` render remains in the promoted phase
      // until mutateVersions commits the server timestamp.
      markClientErrorVersionPromoted(versionId);
    }

    const steps: string[] = [];
    const failedChecks: string[] = [];
    for (const check of data.checks ?? []) {
      // Server stamps `advisory` on F2 typecheck; `designAdvisory` is the
      // envelope fallback if an older payload omitted the per-check flag.
      const isAdvisory =
        check.advisory === true ||
        (data.designAdvisory === true && check.check === "typecheck");
      const icon = isAdvisory ? "Varning" : check.passed ? "Godkänd" : "Underkänd";
      const durationLabel = formatDurationMs(check.durationMs);
      steps.push(
        `${formatCheckDisplayLabel(check.check)}: ${icon} (exit ${check.exitCode}${durationLabel ? `, ${durationLabel}` : ""})`,
      );
      // Bugbot medium på diffen: en advisory-stämplad check får aldrig räknas
      // som reparerbart fel — inte ens när envelopen saknar designAdvisory
      // (superseded-grenen sprider t.ex. inte advisory-fälten).
      if (!check.passed && !isAdvisory && check.repairable !== false) {
        failedChecks.push(check.check);
      }
    }
    const totalDurationLabel = formatDurationMs(data.verifyLaneDurationMs);
    if (totalDurationLabel) {
      steps.push(`Tid: ${totalDurationLabel}`);
    }
    const startedAtLabel = formatUtcClock(data.jobStartedAt);
    if (startedAtLabel) {
      steps.push(`Start: ${startedAtLabel}`);
    }
    const finishedAtLabel = formatUtcClock(data.jobFinishedAt);
    if (finishedAtLabel) {
      steps.push(`Slut: ${finishedAtLabel}`);
    }
    if (typeof data.firstFailureCheck === "string" && data.firstFailureCheck.trim()) {
      steps.push(`Första fel: ${data.firstFailureCheck.trim()}`);
    }
    // The VM checks can all pass while promotion is still blocked because the
    // finalize verifier flagged the version. Surface that explicitly so the
    // card reads as "not green" with a reason, instead of a confusing all-PASS.
    if (data.promotionBlocked) {
      steps.push(
        "Promotion blockerad: finalize-verifieraren flaggade blockerande fynd (bygg-checkar gröna)",
      );
    } else if (data.promoteError) {
      steps.push("Promotion misslyckades tillfälligt — försök verifiera igen");
    } else if (data.designAdvisory) {
      const advisoryLabel =
        Array.isArray(data.advisoryChecks) && data.advisoryChecks.length > 0
          ? data.advisoryChecks.join(", ")
          : "typecheck";
      steps.push(
        `Designläge: ${advisoryLabel}-varning (advisory) — previewen renderar, versionen är användbar — åtgärda i lugn och ro; ingen automatisk reparation kördes`,
      );
    } else if (data.qualityGateAdvisory) {
      const advisoryLabel =
        Array.isArray(data.advisoryChecks) && data.advisoryChecks.length > 0
          ? data.advisoryChecks.join(", ")
          : "lint";
      steps.push(
        `ReleaseGate: ${advisoryLabel}-varningar är advisory — versionen kan publiceras och ingen automatisk reparation kördes`,
      );
    }

    const visualQa =
      data.visualQA &&
      typeof data.visualQA.overallScore === "number" &&
      Array.isArray(data.visualQA.checks)
        ? data.visualQA
        : undefined;

    if (visualQa) {
      const vqaSteps = visualQa.checks.map(
        (c) => `Visuell: ${c.check}: ${c.passed ? "Godkänd" : "Underkänd"} (${c.score}/100) — ${c.detail}`,
      );
      steps.push(
        `Visuell QA: ${visualQa.overallScore}/100 ${visualQa.passed ? "Godkänd" : "Under tröskel"}`,
      );
      steps.push(...vqaSteps);
    }

    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:quality-gate",
      toolName: "Quality gate",
      toolCallId,
      state: "output-available",
      output: {
        passed: data.passed,
        steps,
        checks: data.checks,
        verifyLaneDurationMs: data.verifyLaneDurationMs,
        firstFailureCheck:
          typeof data.firstFailureCheck === "string" ? data.firstFailureCheck : null,
        jobStartedAt:
          typeof data.jobStartedAt === "string" ? data.jobStartedAt : null,
        jobFinishedAt:
          typeof data.jobFinishedAt === "string" ? data.jobFinishedAt : null,
        visualQA: visualQa,
        promotionBlocked: data.promotionBlocked === true ? true : undefined,
        promotionBlockedReason:
          data.promotionBlocked && typeof data.promotionBlockedReason === "string"
            ? data.promotionBlockedReason
            : undefined,
        designAdvisory: data.designAdvisory === true ? true : undefined,
        qualityGateAdvisory:
          data.qualityGateAdvisory === true ? true : undefined,
        advisoryChecks:
          (data.designAdvisory || data.qualityGateAdvisory) &&
          Array.isArray(data.advisoryChecks)
            ? data.advisoryChecks
            : undefined,
      },
    } as UiMessagePart);

    // F2 render-first: a typecheck-only advisory returns `passed:true`, so this
    // guard is already false — but keep `!data.designAdvisory` explicit so a
    // future response shape change can never route an advisory into auto-repair.
    if (!data.passed && !data.designAdvisory && failedChecks.length > 0) {
      const handled = handleEnvSignal(data.checks ?? [], versionId, setMessages, assistantMessageId);
      if (handled) return;

      await handleRepairOrAutofix({
        chatId,
        versionId,
        data,
        failedChecks,
        setMessages,
        assistantMessageId,
        onAutoFix,
      });
    } else if (data.passed) {
      // Trasiga bilder är just det som oftast sänker Visual QA, så en exklusiv
      // `else if` här stängde av den deterministiska URL-ersättningen i exakt
      // det läge den behövs mest. Bildfixen körs därför alltid efter gate-pass;
      // bara LLM-rundan är exklusiv, så turen aldrig får två auto-fix-anrop.
      const visualQaFailed = Boolean(visualQa && !visualQa.passed);
      if (productPostcheck && !productPostcheck.skipped) {
        await handlePassedGateProductFollowUp({
          chatId,
          versionId,
          productPostcheck,
          onAutoFix,
          signal: abortController?.signal,
          allowLlmAutofix: !visualQaFailed,
        });
      }
      if (visualQaFailed && visualQa && onAutoFix && !abortController?.signal.aborted) {
        handleVisualQaAutofix({ chatId, versionId, visualQa, onAutoFix });
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      appendAbortedQualityGateCard(setMessages, assistantMessageId, toolCallId);
      return;
    }
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:quality-gate",
      toolName: "Quality gate",
      toolCallId,
      state: "output-error",
      errorText: "Quality gate request failed (network error)",
    } as UiMessagePart);
  } finally {
    releasePipelineWork();
    if (abortController && postCheckControllers.get(chatId) === abortController) {
      postCheckControllers.delete(chatId);
    }
    // The quality-gate route owns the promotion transition. Revalidate only
    // after this terminal lane outcome so callers observe activeVersionPromotedAt
    // (and failures/supersedes) instead of retaining the pre-gate versions
    // snapshot for the normal SWR interval. One terminal refresh replaces the
    // old branch-specific calls and avoids polling churn.
    mutateVersions?.();
  }
}

function handleEnvSignal(
  checks: QualityGateCheckResult[],
  versionId: string,
  setMessages: SetMessages,
  assistantMessageId: string,
): boolean {
  const missingEnvKeys = extractMissingEnvKeysFromQualityGate(checks);
  if (missingEnvKeys.length === 0) return false;
  appendToolPartToMessage(
    setMessages,
    assistantMessageId,
    integrationSignalToToolPart(
      {
        key: `quality-gate-env:${versionId}`,
        name: "Miljövariabler",
        intent: "env_vars",
        envVars: missingEnvKeys,
        status:
          "Bygget kräver miljövariabler innan live-preview kan nå Fidelity 2. Lägg in nycklarna och starta om previewn i stället för att generera om sajten.",
        sourceEvent: "quality-gate",
      },
      versionId,
    ),
  );
  return true;
}

async function handleRepairOrAutofix(params: {
  chatId: string;
  versionId: string;
  data: {
    checks?: QualityGateCheckResult[];
    verifyLaneDurationMs?: number;
    firstFailureCheck?: string | null;
    jobStartedAt?: string | null;
    jobFinishedAt?: string | null;
  };
  failedChecks: string[];
  setMessages: SetMessages;
  assistantMessageId: string;
  onAutoFix?: (payload: AutoFixPayload) => void;
}) {
  const {
    chatId,
    versionId,
    data,
    failedChecks,
    setMessages,
    assistantMessageId,
    onAutoFix,
  } = params;

  // The client autofix needs every concrete repairable failure, including
  // install output. Membership in `failedChecks` preserves both per-check
  // advisory handling and the older `designAdvisory` envelope fallback.
  const failedCheckNames = new Set(failedChecks);
  const repair: RepairContext = {
    qualityGate: (data.checks ?? [])
      .filter(
        (c) =>
          !c.passed &&
          c.advisory !== true &&
          c.repairable !== false &&
          failedCheckNames.has(c.check),
      )
      .map((c) => ({
        check: c.check,
        exitCode: c.exitCode,
        output: c.output.slice(0, 4000),
        ...(typeof c.errorCount === "number" ? { errorCount: c.errorCount } : {}),
        durationMs: c.durationMs ?? null,
      })),
    qualityGateMeta: {
      verifyLaneDurationMs: data.verifyLaneDurationMs ?? null,
      firstFailureCheck:
        typeof data.firstFailureCheck === "string" ? data.firstFailureCheck : null,
      jobStartedAt: typeof data.jobStartedAt === "string" ? data.jobStartedAt : null,
      jobFinishedAt: typeof data.jobFinishedAt === "string" ? data.jobFinishedAt : null,
    },
  };

  // `/repair` has a deliberately narrower zod enum. Keep that boundary typed
  // and filter the broad client context before serializing a server request.
  const serverRepair: ServerRepairContext = {
    ...repair,
    qualityGate: repair.qualityGate?.filter(isServerQualityGateFailure),
  };
  const serverRepaired = await tryServerRepair(chatId, versionId, serverRepair);
  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Server repair",
    toolCallId: `server-repair:${versionId}`,
    state: "output-available",
    output: {
      repaired: serverRepaired.repaired,
      method:
        serverRepaired.status === "completed" || serverRepaired.status === "repair_available"
        ? serverRepaired.deterministic
          ? "deterministic"
          : "llm"
        : null,
      newVersionId: serverRepaired.newVersionId,
      remainingErrors: serverRepaired.remainingErrors ?? null,
      improvedSyntax: serverRepaired.improvedSyntax ?? null,
      earlyStopReason: serverRepaired.earlyStopReason ?? null,
      status: serverRepaired.status ?? "completed",
      reason: serverRepaired.reason ?? null,
    },
  } as UiMessagePart);

  if (serverRepaired.repaired && serverRepaired.status === "repair_available") {
    toast.message("Serverreparation tillgänglig", {
      description: "Acceptera reparationen i versionspanelen för att applicera fixen.",
    });
  }

  if (!serverRepaired.repaired) {
    onAutoFix?.({
      chatId,
      versionId,
      reasons: failedChecks.map((check) => `${check} failed`),
      repair,
    });
  }
}

const ACTIONABLE_POSTCHECK_CODES = new Set([
  "broken_image",
  "broken_anchor",
  "cta_no_handler",
  "mobile_menu_failed",
  "fake_form",
]);

function readFindingString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mapPostcheckWarningToFinding(
  item: ProductPostcheckResult["warnings"][number],
): NonNullable<RepairContext["productFindings"]>[number] {
  return {
    code: readFindingString(item.code) ?? "unknown",
    message: readFindingString(item.message) ?? "Okänt produktfynd.",
    selector: readFindingString(item.selector),
    text: readFindingString(item.text),
    href: readFindingString(item.href),
    src: readFindingString(item.src),
    route: readFindingString(item.route),
  };
}

/**
 * Taket för `urls` i `POST /validate-images`. Zod avvisar hela requesten över
 * taket, och klienten tolkar ett icke-ok svar som "ingen ersättning alls" — en
 * okapad lista hade alltså tappat även de bilder som ryms.
 */
const MAX_SCOPED_IMAGE_URLS = 16;

function collectBrokenImageUrls(
  warnings: ProductPostcheckResult["warnings"],
): string[] {
  const urls: string[] = [];
  for (const warning of warnings) {
    if (warning.code !== "broken_image") continue;
    const url = readFindingString(warning.src) ?? readFindingString(warning.href);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls.slice(0, MAX_SCOPED_IMAGE_URLS);
}

function collectLiveReviewAutofixFindings(
  productPostcheck: ProductPostcheckResult,
): NonNullable<RepairContext["productFindings"]> {
  const liveReview = productPostcheck.liveReview;
  if (liveReview?.status !== "completed") return [];
  const verdict = liveReview.decision.verdict;
  if (verdict !== "micro_fix" && verdict !== "targeted_repair") return [];
  const findings: NonNullable<RepairContext["productFindings"]> = [];
  for (const issue of liveReview.decision.issues) {
    const target = readFindingString(issue.target);
    const suggested = readFindingString(issue.suggestedOperation);
    if (!target || !suggested) continue;
    findings.push({
      code: `live_review_${verdict}`,
      message: suggested,
      selector: target,
      text: readFindingString(issue.evidence),
    });
  }
  return findings;
}

/**
 * Efter gate-pass: HEAD-verifierad bildersättning för exakta broken_image-URL:er
 * (ingen LLM), sedan EN batchad auto-fix för övriga strukturerade fynd och
 * live-review-issues. Fynden förblir icke-blockerande; befintliga throttlar
 * begränsar omkörningar.
 */
async function handlePassedGateProductFollowUp(params: {
  chatId: string;
  versionId: string;
  productPostcheck: ProductPostcheckResult;
  onAutoFix?: (payload: AutoFixPayload) => void;
  signal?: AbortSignal;
  /**
   * `false` när Visual QA redan äger turens LLM-runda. Den deterministiska
   * bildersättningen körs ändå — den kostar ingen modelltur.
   */
  allowLlmAutofix?: boolean;
}): Promise<void> {
  const {
    chatId,
    versionId,
    productPostcheck,
    onAutoFix,
    signal,
    allowLlmAutofix = true,
  } = params;
  const brokenImageUrls = collectBrokenImageUrls(productPostcheck.warnings);
  const scopedImageUrls = new Set(brokenImageUrls);
  if (brokenImageUrls.length > 0) {
    try {
      await validateImages({
        chatId,
        versionId,
        signal: signal ?? new AbortController().signal,
        urls: brokenImageUrls,
      });
    } catch (error) {
      // Ett avbrutet körpass får inte läcka ut som gate-nätverksfel i chatten
      // — lanen är redan terminal och bildfixen är best-effort.
      if (isAbortError(error)) return;
      throw error;
    }
  }

  const llmFindings = [
    ...productPostcheck.warnings
      .filter((warning) => {
        if (!ACTIONABLE_POSTCHECK_CODES.has(warning.code)) return false;
        if (warning.code === "broken_image") {
          const url = readFindingString(warning.src) ?? readFindingString(warning.href);
          // Bara de URL:er som faktiskt gick till den skopade fixen utesluts.
          // En bild utan URL — eller en som föll utanför routens tak — måste
          // fortfarande få en väg framåt i stället för att tappas tyst.
          return !url || !scopedImageUrls.has(url);
        }
        return true;
      })
      .map(mapPostcheckWarningToFinding),
    ...collectLiveReviewAutofixFindings(productPostcheck),
  ].slice(0, 8);

  if (!allowLlmAutofix || !onAutoFix || llmFindings.length === 0) return;

  const liveReview = productPostcheck.liveReview;
  const extraReasons =
    liveReview?.status === "completed" &&
    (liveReview.decision.verdict === "micro_fix" ||
      liveReview.decision.verdict === "targeted_repair")
      ? [`Live review: ${liveReview.decision.verdict}`]
      : [];

  handleProductPostcheckAutofix({
    chatId,
    versionId,
    productPostcheck,
    onAutoFix,
    findings: llmFindings,
    extraReasons,
  });
}

/**
 * Degraderad-till-fix (ägarbeslut 2026-09-01): postcheckens DOM-fynd är redan
 * strukturerade (kod, selector, knapptext, route) och matas till samma
 * riktade auto-fix-runda som Visual QA — en synlig chattur med eget
 * resonemang, ny version och ny efterkontroll. Max 8 fynd så prompten inte
 * drunknar; de befintliga auto-fix-throttlarna per chat/reason begränsar
 * automatiska loopar.
 */
function handleProductPostcheckAutofix(params: {
  chatId: string;
  versionId: string;
  productPostcheck: ProductPostcheckResult;
  onAutoFix: (payload: AutoFixPayload) => void;
  findings?: NonNullable<RepairContext["productFindings"]>;
  extraReasons?: string[];
}) {
  const { chatId, versionId, productPostcheck, onAutoFix } = params;
  const findings = (params.findings ?? productPostcheck.warnings.map(mapPostcheckWarningToFinding))
    .slice(0, 8);
  if (findings.length === 0) return;
  const repair: RepairContext = { productFindings: findings };
  const primaryReason = productPostcheck.productBlocked
    ? `Product Postcheck hittade ${productPostcheck.warningCount} blockerande produktfynd på den körande sajten`
    : `Product Postcheck hittade ${findings.length} advisory-fynd på den körande sajten`;
  onAutoFix({
    chatId,
    versionId,
    reasons: [primaryReason, ...(params.extraReasons ?? [])],
    repair,
  });
}

function handleVisualQaAutofix(params: {
  chatId: string;
  versionId: string;
  visualQa: QualityGateVisualQaResult;
  onAutoFix: (payload: AutoFixPayload) => void;
}) {
  const { chatId, versionId, visualQa, onAutoFix } = params;
  const repair: RepairContext = {
    visualQA: visualQa.checks
      .filter((c) => !c.passed)
      .map((c) => ({ check: c.check, score: c.score, detail: c.detail }))
      .slice(0, 4),
  };
  onAutoFix({
    chatId,
    versionId,
    reasons: [`Visual QA score ${visualQa.overallScore}/100 below threshold`],
    repair,
  });
}

function isServerRepairDisabled(): boolean {
  try {
    return typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>).__SAJTMASKIN_SKIP_SERVER_REPAIR__ === true;
  } catch {
    return false;
  }
}

type ServerRepairResult = {
  repaired: boolean;
  deterministic: boolean;
  newVersionId?: string | null;
  remainingErrors?: number;
  improvedSyntax?: boolean;
  earlyStopReason?:
    | "fixer_noop"
    | "no_improvement"
    | "time_budget_exceeded"
    | "superseded"
    | "blocker_regression"
    | "blocker_unresolved"
    | null;
  status?: "completed" | "repair_available" | "skipped" | "request_failed" | "superseded";
  reason?: string | null;
};

type ServerQualityGateCheck = "typecheck" | "build" | "lint";
type ServerQualityGateFailure = Omit<QualityGateFailure, "check"> & {
  check: ServerQualityGateCheck;
};
type ServerRepairContext = Omit<RepairContext, "qualityGate"> & {
  qualityGate?: ServerQualityGateFailure[];
};

function isServerQualityGateFailure(
  failure: QualityGateFailure,
): failure is ServerQualityGateFailure {
  return failure.check === "typecheck" || failure.check === "build" || failure.check === "lint";
}

async function tryServerRepair(
  chatId: string,
  versionId: string,
  repair: ServerRepairContext,
): Promise<ServerRepairResult> {
  if (isServerRepairDisabled()) {
    return {
      repaired: false,
      deterministic: false,
      status: "skipped",
      reason: "Server repair är avstängt i klienten.",
    };
  }
  try {
    const res = await fetch(
      `${engineChatBaseUrl(chatId)}/repair`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, repairContext: repair }),
      },
    );
    if (!res.ok) {
      return {
        repaired: false,
        deterministic: false,
        status: "request_failed",
        reason: `Repair request failed (HTTP ${res.status})`,
      };
    }
    const data = (await res.json().catch(() => null)) as ServerRepairResult | null;
    if (!data) {
      return {
        repaired: false,
        deterministic: false,
        status: "request_failed",
        reason: "Repair request returned invalid payload.",
      };
    }
    return {
      ...data,
      status: data.status ?? "completed",
      reason: data.reason ?? null,
    };
  } catch {
    return {
      repaired: false,
      deterministic: false,
      status: "request_failed",
      reason: "Repair request failed (network error)",
    };
  }
}
