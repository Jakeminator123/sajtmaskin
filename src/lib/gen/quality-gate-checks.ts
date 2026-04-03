export const QUALITY_GATE_CHECK_VALUES = ["typecheck", "build", "lint"] as const;

export type QualityGateCheck = (typeof QUALITY_GATE_CHECK_VALUES)[number];

export const INTERACTIVE_QUALITY_GATE_CHECKS = [
  ...QUALITY_GATE_CHECK_VALUES,
] satisfies readonly QualityGateCheck[];

// Server-owned promotion/repair gates stay on hard blockers.
export const PROMOTION_QUALITY_GATE_CHECKS = [
  "typecheck",
  "build",
] satisfies readonly QualityGateCheck[];
