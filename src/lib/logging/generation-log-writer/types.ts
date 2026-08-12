export type GenerationLogTarget = "in-progress" | "latest";

export type StoredGenerationEntry = {
  ts: string;
  target: GenerationLogTarget;
  slug: string | null;
  summary: string | null;
  data: Record<string, unknown>;
};

export type RunFixPattern = {
  pattern: string;
  occurrences: number;
  sources: Record<string, number>;
  files: Array<{ file: string; count: number }>;
  latestTs: string | null;
  example: string | null;
};

export type RunObservabilitySnapshot = {
  runId: string;
  chatId: string;
  versionId: string | null;
  status: string;
  // P0 stream-abort recovery (2026-04-26): why a run is in its current
  // status. For status=aborted this carries the abort reason from the
  // emit-side or "staleness_inferred" if the writer coerced a stale
  // in_progress. For status=done|in_progress it mirrors the terminal
  // event reason (or null when there is no terminal event yet).
  // See docs/schemas/strict/site-aborted.schema.json for the strict enum.
  statusReason: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  generationKind: string | null;
  modelId: string | null;
  buildIntent: string | null;
  buildMethod: string | null;
  promptStrategy: string | null;
  promptType: string | null;
  // Plan 03 (short): "user" vs "auto_repair" — surfaced so the
  // observatory can filter auto-repair passes out of follow-up
  // statistics. Mirrors PromptStrategyMeta.promptSource.
  promptSource: string | null;
  preflight: Record<string, unknown> | null;
  verifier: Record<string, unknown> | null;
  serverVerify: Record<string, unknown> | null;
  highlights: string[];
  faultFixSummary: {
    total: number;
    unresolved: number;
    bySeverity: Record<string, number>;
  };
  appliedFixers: Array<{ fixer: string; count: number }>;
  recurringPatterns: RunFixPattern[];
};

export type FaultFixRow = {
  ts: string;
  phase: string;
  step: string;
  severity: string;
  createdBy: string;
  fixedBy: string;
  modelTier: string;
  problem: string;
  action: string;
  model: string;
  provider: string;
  pass: string;
  outcome: string;
  chatId: string;
  versionId: string;
  lineageHash: string;
  scaffoldId: string;
  serializeMode: string;
  styleDirection: string;
  file: string;
  fixer: string;
  resolved: string;
};
