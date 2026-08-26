import { isAffirmativeEnvValue } from "@/lib/env-affirmative";

import { OPENCLAW_BUILDER_BUDGETS } from "./budget-policy";

export const OPENCLAW_BUILDER_LANES = [
  "classic",
  "openclaw_shadow",
  "openclaw_candidate",
] as const;
export type OpenClawBuilderLane = (typeof OPENCLAW_BUILDER_LANES)[number];

export const OPENCLAW_BUILDER_P0_AVAILABILITY = {
  openclaw_shadow: false,
  openclaw_candidate: false,
} as const;

export interface BuilderLaneResolution {
  lane: OpenClawBuilderLane;
  requestedLane: OpenClawBuilderLane;
  enabled: boolean;
  reason: "default_classic" | "lane_unavailable" | "enabled";
  budgets: (typeof OPENCLAW_BUILDER_BUDGETS)[OpenClawBuilderLane];
}

export function resolveOpenClawBuilderLane(
  env: Record<string, string | undefined>,
  availability: {
    openclaw_shadow: boolean;
    openclaw_candidate: boolean;
  } = OPENCLAW_BUILDER_P0_AVAILABILITY,
): BuilderLaneResolution {
  const candidateRequested = isAffirmativeEnvValue(env.SAJTMASKIN_OPENCLAW_BUILDER_CANDIDATE);
  const shadowRequested = isAffirmativeEnvValue(env.SAJTMASKIN_OPENCLAW_BUILDER_SHADOW);
  const requestedLane: OpenClawBuilderLane = candidateRequested
    ? "openclaw_candidate"
    : shadowRequested
      ? "openclaw_shadow"
      : "classic";

  if (requestedLane === "classic") {
    return {
      lane: "classic",
      requestedLane,
      enabled: true,
      reason: "default_classic",
      budgets: OPENCLAW_BUILDER_BUDGETS.classic,
    };
  }
  if (!availability[requestedLane]) {
    return {
      lane: "classic",
      requestedLane,
      enabled: false,
      reason: "lane_unavailable",
      budgets: OPENCLAW_BUILDER_BUDGETS.classic,
    };
  }
  return {
    lane: requestedLane,
    requestedLane,
    enabled: true,
    reason: "enabled",
    budgets: OPENCLAW_BUILDER_BUDGETS[requestedLane],
  };
}
