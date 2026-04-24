import * as prom from "prom-client";

/**
 * Canonical pipeline phase names observed via {@link recordPhaseDuration}.
 * Note: `pre_vm_typecheck` was merged into `validate_syntax` in 2026-04-20 W3
 * and intentionally omitted from this list.
 */
export const OBSERVED_PHASES = [
  "url_expand",
  "autofix",
  "validate_syntax",
  "materialize_images",
  "verifier",
  "parse_merge_preflight",
  "partial_file_repair",
  "persist",
  "preview_session",
  "server_verify",
  "repair_loop",
  "quality_gate",
] as const;

export type ObservedPhase = (typeof OBSERVED_PHASES)[number];

const PHASE_DURATION_BUCKETS_MS = [
  10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000,
];

/**
 * End-to-end "prompt → done" buckets span seconds to minutes because the
 * codegen pipeline (brief + orchestrate + generate + verify + repair + persist)
 * routinely lands in the 10s–3min range, with long-tail outliers beyond.
 */
const PROMPT_TO_DONE_BUCKETS_MS = [
  1000, 5000, 15000, 30000, 60000, 90000, 120000, 180000, 300000, 600000,
];

export type PromptToDoneOutcome = "done" | "failed" | "aborted";
export type PromptToDoneKind = "init" | "followup";
export type LatencyBudgetKind = PromptToDoneKind | "unknown";
export const LATENCY_BUDGET_PHASES = [
  "brief",
  "codegen",
  "autofix",
  "syntax-validate",
  "preflight",
  "persist",
  "preview-start",
  "quality-gate",
] as const;
export type LatencyBudgetPhase = (typeof LATENCY_BUDGET_PHASES)[number];

/**
 * P19 ingress telemetry — old-content ingress paths we want to attribute
 * before adding any further hardening:
 * - `preview_reused_url`: preview-session short-circuit returning an existing
 *   `preview_url` instead of bootstrapping a fresh sandbox.
 * - `followup_base_resolved`: single-line dashboard view for which branch
 *   `resolveFollowUpPreviousFiles()` selected (label `reason`).
 * - `followup_base_explicit|preferred|latest`: per-branch counters for detail
 *   views; intentionally redundant with `followup_base_resolved` so both
 *   levels of granularity are queryable without joins.
 */
export type IngressEventType =
  | "preview_reused_url"
  | "followup_base_resolved"
  | "followup_base_explicit"
  | "followup_base_preferred"
  | "followup_base_latest";

type MetricsBundle = {
  register: prom.Registry;
  phaseDuration: prom.Histogram<string>;
  promptToDone: prom.Histogram<string>;
  fixerCall: prom.Counter<string>;
  verifierBlocking: prom.Counter<string>;
  partialFileRepair: prom.Counter<string>;
  earlyStop: prom.Counter<string>;
  ingressEvent: prom.Counter<string>;
  briefCache: prom.Counter<string>;
};

declare global {
  var __sajtmaskinMetricsRegistry: MetricsBundle | undefined;
}

/**
 * Build the bundle once per process. We cache the entire bundle (not just the
 * registry) on `globalThis` so that Next.js dev-mode module reloads reuse the
 * same Counter / Histogram instances. Without this, the second module
 * evaluation would hit prom-client's "metric already registered" guard.
 */
function initMetrics(): MetricsBundle {
  const cached = globalThis.__sajtmaskinMetricsRegistry;
  if (cached) return cached;

  const register = new prom.Registry();

  // Process-level metrics (CPU, memory, event loop lag, GC, ...).
  prom.collectDefaultMetrics({ register });

  const phaseDuration = new prom.Histogram({
    name: "sajtmaskin_phase_duration_ms",
    help: "Duration of a Sajtmaskin pipeline phase, in milliseconds.",
    labelNames: ["phase", "kind"],
    buckets: PHASE_DURATION_BUCKETS_MS,
    registers: [register],
  });

  const promptToDone = new prom.Histogram({
    name: "sajtmaskin_prompt_to_done_ms",
    help:
      "End-to-end duration from POST /api/engine/chats[...]/stream entry " +
      "until the SSE `done` event is emitted (or the stream errors/aborts).",
    labelNames: ["outcome", "kind"],
    buckets: PROMPT_TO_DONE_BUCKETS_MS,
    registers: [register],
  });

  const fixerCall = new prom.Counter({
    name: "sajtmaskin_fixer_call_total",
    help: "Total number of autofix invocations, partitioned by fixer + outcome.",
    labelNames: ["fixer", "outcome"],
    registers: [register],
  });

  const verifierBlocking = new prom.Counter({
    name: "sajtmaskin_verifier_blocking_total",
    help: "Total number of blocking verifier findings, partitioned by finding id.",
    labelNames: ["finding_id"],
    registers: [register],
  });

  const partialFileRepair = new prom.Counter({
    name: "sajtmaskin_partial_file_repair_total",
    help: "Total number of partial-file-repair attempts, partitioned by outcome.",
    labelNames: ["outcome"],
    registers: [register],
  });

  const earlyStop = new prom.Counter({
    name: "sajtmaskin_early_stop_total",
    help: "Total number of early-stop signals raised by a phase, partitioned by reason and phase.",
    labelNames: ["reason", "phase"],
    registers: [register],
  });

  const ingressEvent = new prom.Counter({
    name: "sajtmaskin_ingress_event_total",
    help:
      "P19 old-content ingress telemetry: preview-session short-circuits and " +
      "follow-up base-version selection, partitioned by event type and reason.",
    labelNames: ["type", "reason"],
    registers: [register],
  });

  const briefCache = new prom.Counter({
    name: "sajtmaskin_brief_cache_total",
    help:
      "Outcomes of the /api/ai/brief Redis cache lookup. " +
      "`hit` = cached brief replayed, `miss` = LLM call required, " +
      "`skip` = cache bypassed because Redis is disabled or unavailable.",
    labelNames: ["outcome"],
    registers: [register],
  });

  const bundle: MetricsBundle = {
    register,
    phaseDuration,
    promptToDone,
    fixerCall,
    verifierBlocking,
    partialFileRepair,
    earlyStop,
    ingressEvent,
    briefCache,
  };

  globalThis.__sajtmaskinMetricsRegistry = bundle;
  return bundle;
}

const metrics = initMetrics();

export const register: prom.Registry = metrics.register;

/**
 * Observe a phase duration in milliseconds. Optional `attrs` are accepted for
 * forward compatibility but are NOT propagated as Prometheus labels — adding
 * arbitrary labels at runtime would break Prometheus' fixed-cardinality
 * contract. Callers should encode any additional dimensions into a
 * caller-controlled metric (or accept that they will only be visible in the
 * underlying span / log emitter).
 */
export function recordPhaseDuration(
  phase: string,
  durationMs: number,
  _attrs?: Record<string, string>,
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const kind =
    _attrs?.kind === "init" || _attrs?.kind === "followup"
      ? _attrs.kind
      : "unknown";
  metrics.phaseDuration.observe({ phase, kind }, durationMs);
}

export async function observePhase<T>(
  params: {
    phase: LatencyBudgetPhase;
    kind: PromptToDoneKind;
    attrs?: Record<string, string>;
  },
  run: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    recordPhaseDuration(
      params.phase,
      Math.max(0, Date.now() - startedAt),
      { ...(params.attrs ?? {}), kind: params.kind },
    );
  }
}

export function incFixerCall(
  fixerName: string,
  outcome: "applied" | "noop" | "error" = "applied",
): void {
  metrics.fixerCall.inc({ fixer: fixerName, outcome });
}

export function incVerifierBlocking(findingId: string): void {
  metrics.verifierBlocking.inc({ finding_id: findingId });
}

export function incPartialFileRepair(
  outcome: "success" | "fail" | "skip",
): void {
  metrics.partialFileRepair.inc({ outcome });
}

export function incEarlyStop(reason: string, phase: string): void {
  metrics.earlyStop.inc({ reason, phase });
}

/**
 * P19 ingress telemetry counter. The `reason` label is always present
 * (Prometheus label sets are fixed-cardinality) but defaults to "" when the
 * event type does not need a sub-classification — this keeps the metric
 * shape stable while letting `followup_base_resolved` carry the "explicit |
 * preferred | latest" branch on a single line in dashboards.
 */
export function incBriefCache(outcome: "hit" | "miss" | "skip"): void {
  metrics.briefCache.inc({ outcome });
}

export function incIngressEvent(
  type: IngressEventType,
  attrs?: { reason?: string },
): void {
  const reason =
    typeof attrs?.reason === "string" && attrs.reason.length > 0
      ? attrs.reason
      : "";
  metrics.ingressEvent.inc({ type, reason });
}

/**
 * Observe the end-to-end "prompt → done" duration in milliseconds. `kind`
 * distinguishes the initial chat-creation stream from follow-up streams;
 * `outcome` separates successful `done` emissions from client aborts and
 * pipeline failures. Designed to be called from a `finally`-style wrapper
 * so telemetry never breaks codegen — callers should wrap in try/catch
 * regardless (prom-client label validation can throw on bad inputs).
 */
export function recordPromptToDone(
  durationMs: number,
  outcome: PromptToDoneOutcome,
  kind: PromptToDoneKind,
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  metrics.promptToDone.observe({ outcome, kind }, durationMs);
}

/**
 * Used by the `/api/metrics` route. prom-client v15 returns a Promise<string>.
 */
export function getPrometheusMetrics(): Promise<string> {
  return metrics.register.metrics();
}

/**
 * Reset only the Sajtmaskin-owned counter / histogram state. Intended for use
 * in test isolation — the registry singleton (and the default Node process
 * metrics it carries) are intentionally left intact.
 */
export function resetMetricsForTest(): void {
  metrics.phaseDuration.reset();
  metrics.promptToDone.reset();
  metrics.fixerCall.reset();
  metrics.verifierBlocking.reset();
  metrics.partialFileRepair.reset();
  metrics.earlyStop.reset();
  metrics.ingressEvent.reset();
  metrics.briefCache.reset();
}
