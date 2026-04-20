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

type MetricsBundle = {
  register: prom.Registry;
  phaseDuration: prom.Histogram<string>;
  fixerCall: prom.Counter<string>;
  verifierBlocking: prom.Counter<string>;
  partialFileRepair: prom.Counter<string>;
  earlyStop: prom.Counter<string>;
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
    labelNames: ["phase"],
    buckets: PHASE_DURATION_BUCKETS_MS,
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

  const bundle: MetricsBundle = {
    register,
    phaseDuration,
    fixerCall,
    verifierBlocking,
    partialFileRepair,
    earlyStop,
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
  metrics.phaseDuration.observe({ phase }, durationMs);
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
  metrics.fixerCall.reset();
  metrics.verifierBlocking.reset();
  metrics.partialFileRepair.reset();
  metrics.earlyStop.reset();
}
