export interface BuilderBudgetPolicy {
  maxModelTurns: number;
  maxToolCalls: number;
  maxWallTimeMs: number;
  maxPreviewLoops: number;
  maxChangedFiles: number;
  maxCandidateBytes: number;
  maxReadBytes: number;
}

export const OPENCLAW_BUILDER_BUDGETS = {
  classic: {
    maxModelTurns: 0,
    maxToolCalls: 0,
    maxWallTimeMs: 0,
    maxPreviewLoops: 0,
    maxChangedFiles: 0,
    maxCandidateBytes: 0,
    maxReadBytes: 0,
  },
  openclaw_shadow: {
    maxModelTurns: 3,
    maxToolCalls: 25,
    maxWallTimeMs: 120_000,
    maxPreviewLoops: 0,
    maxChangedFiles: 0,
    maxCandidateBytes: 0,
    maxReadBytes: 2_000_000,
  },
  openclaw_candidate: {
    maxModelTurns: 8,
    maxToolCalls: 80,
    maxWallTimeMs: 900_000,
    maxPreviewLoops: 2,
    maxChangedFiles: 80,
    maxCandidateBytes: 2_000_000,
    maxReadBytes: 5_000_000,
  },
} as const satisfies Record<string, BuilderBudgetPolicy>;
