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

// Tier-2 (dev-preview) gates: typecheck only — build belongs to tier-3/deploy.
export const TIER2_QUALITY_GATE_CHECKS = [
  "typecheck",
] satisfies readonly QualityGateCheck[];

// Background server verification may include lint now that generated projects
// ship their own minimal ESLint setup, but this must not affect live tier-2 preview.
export const SERVER_VERIFY_QUALITY_GATE_CHECKS = [
  "typecheck",
  "lint",
] satisfies readonly QualityGateCheck[];
