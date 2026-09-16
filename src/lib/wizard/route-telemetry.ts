/**
 * Content-free terminal telemetry for wizard competitor/enrich (SM-033).
 * Logs only route, outcome, dominant stage, duration and request-id —
 * never prompt, company, URL or model text.
 */

export const WIZARD_ROUTE_TERMINAL_EVENT = "wizard.route.terminal" as const;

export const WIZARD_ROUTE_NAMES = ["competitors", "enrich"] as const;
export type WizardRouteName = (typeof WIZARD_ROUTE_NAMES)[number];

export const WIZARD_ROUTE_STAGES = [
  "idle",
  "validate",
  "authorize",
  "search",
  "scrape",
  "llm",
  "respond",
] as const;
export type WizardRouteStage = (typeof WIZARD_ROUTE_STAGES)[number];

export const WIZARD_ROUTE_OUTCOMES = [
  "ok",
  "client_error",
  "auth_denied",
  "unavailable",
  "deadline",
  "error",
] as const;
export type WizardRouteOutcome = (typeof WIZARD_ROUTE_OUTCOMES)[number];

export type WizardRouteTerminalEvent = {
  event: typeof WIZARD_ROUTE_TERMINAL_EVENT;
  route: WizardRouteName;
  outcome: WizardRouteOutcome;
  dominantStage: WizardRouteStage;
  durationMs: number;
  requestId: string;
  aborted: boolean;
};

export type WizardStageClock = {
  mark: (stage: WizardRouteStage) => void;
  dominant: () => WizardRouteStage;
  durationsMs: () => Partial<Record<WizardRouteStage, number>>;
};

const ROUTE_SET = new Set<string>(WIZARD_ROUTE_NAMES);
const STAGE_SET = new Set<string>(WIZARD_ROUTE_STAGES);
const OUTCOME_SET = new Set<string>(WIZARD_ROUTE_OUTCOMES);

function asRoute(value: unknown): WizardRouteName {
  return typeof value === "string" && ROUTE_SET.has(value) ? (value as WizardRouteName) : "competitors";
}

function asStage(value: unknown): WizardRouteStage {
  return typeof value === "string" && STAGE_SET.has(value) ? (value as WizardRouteStage) : "idle";
}

function asOutcome(value: unknown): WizardRouteOutcome {
  return typeof value === "string" && OUTCOME_SET.has(value) ? (value as WizardRouteOutcome) : "error";
}

function asRequestId(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return trimmed.slice(0, 128);
}

function asDurationMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

export function wizardRequestId(req: Request): string {
  return asRequestId(req.headers.get("x-vercel-id") || req.headers.get("x-request-id"));
}

export function createWizardStageClock(now: () => number = Date.now): WizardStageClock {
  let current: WizardRouteStage = "idle";
  let currentStarted = now();
  const durations: Partial<Record<WizardRouteStage, number>> = {};

  const flush = (at: number) => {
    const elapsed = Math.max(0, at - currentStarted);
    durations[current] = (durations[current] ?? 0) + elapsed;
    currentStarted = at;
  };

  return {
    mark(stage) {
      const at = now();
      flush(at);
      current = stage;
    },
    dominant() {
      flush(now());
      let best: WizardRouteStage = current === "idle" ? "validate" : current;
      let bestMs = -1;
      for (const stage of WIZARD_ROUTE_STAGES) {
        if (stage === "idle") continue;
        const ms = durations[stage] ?? 0;
        if (ms > bestMs) {
          best = stage;
          bestMs = ms;
        }
      }
      return best;
    },
    durationsMs() {
      return { ...durations };
    },
  };
}

export function emitWizardRouteTerminal(
  input: Omit<WizardRouteTerminalEvent, "event">,
): WizardRouteTerminalEvent {
  const payload: WizardRouteTerminalEvent = {
    event: WIZARD_ROUTE_TERMINAL_EVENT,
    route: asRoute(input.route),
    outcome: asOutcome(input.outcome),
    dominantStage: asStage(input.dominantStage),
    durationMs: asDurationMs(input.durationMs),
    requestId: asRequestId(input.requestId),
    aborted: input.aborted === true,
  };

  try {
    console.info(JSON.stringify(payload));
  } catch {
    // Telemetry must never break the response.
  }

  return payload;
}
