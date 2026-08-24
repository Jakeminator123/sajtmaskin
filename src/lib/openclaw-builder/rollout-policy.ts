/**
 * Opt-in / kill-switch / cohort policy for OpenClaw Builder lanes.
 * Pure: no I/O, no env, no traffic. Classic is the permanent fallback.
 * Never enables candidate writes implicitly — this is policy only.
 */

export type RolloutCohort =
  | "internal_f2"
  | "owner_opt_in"
  | "external_f2"
  | "follow_up"
  | "imported"
  | "f3";

export type RolloutLane = "classic" | "openclaw_shadow" | "openclaw_candidate";

export type RolloutDecision = {
  lane: RolloutLane;
  fallbackClassic: true;
  reason: "kill_switch" | "cohort_closed" | "opt_in" | "default_classic";
};

export type DecideRolloutInput = {
  killSwitch: boolean;
  requestedLane: RolloutLane | string;
  cohort: RolloutCohort;
  openCohorts: RolloutCohort[];
  optIn: boolean;
};

const OPENCLAW_LANES = new Set<RolloutLane>(["openclaw_shadow", "openclaw_candidate"]);

function classic(reason: RolloutDecision["reason"]): RolloutDecision {
  return { lane: "classic", fallbackClassic: true, reason };
}

export function decideRollout(input: DecideRolloutInput): RolloutDecision {
  if (input.killSwitch !== false) {
    return classic("kill_switch");
  }

  if (!OPENCLAW_LANES.has(input.requestedLane as RolloutLane)) {
    return classic("default_classic");
  }

  const requestedLane = input.requestedLane as "openclaw_shadow" | "openclaw_candidate";

  if (!Array.isArray(input.openCohorts) || !input.openCohorts.includes(input.cohort)) {
    return classic("cohort_closed");
  }

  if (input.optIn !== true) {
    return classic("cohort_closed");
  }

  return {
    lane: requestedLane,
    fallbackClassic: true,
    reason: "opt_in",
  };
}
