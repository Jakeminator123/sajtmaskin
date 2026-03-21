function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/**
 * Hard caps for prompt-related payloads.
 * Tuned for GPT 5.4's 1M+ token context window.
 * 10x headroom over earlier defaults — modern models handle very long prompts
 * without quality degradation, so we avoid aggressive summarisation.
 */
export const MAX_CHAT_MESSAGE_CHARS = readIntEnv("V0_MAX_PROMPT_LENGTH", 800_000, 5_000, 2_000_000);
export const WARN_CHAT_MESSAGE_CHARS = readIntEnv("V0_WARN_PROMPT_LENGTH", 500_000, 1_000, 2_000_000);
export const MAX_CHAT_SYSTEM_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_SYSTEM_LENGTH",
  600_000,
  2_000,
  2_000_000,
);
export const WARN_CHAT_SYSTEM_CHARS = readIntEnv(
  "SAJTMASKIN_WARN_SYSTEM_LENGTH",
  350_000,
  1_000,
  2_000_000,
);

export const MAX_PROMPT_HANDOFF_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_PROMPT_HANDOFF_CHARS",
  MAX_CHAT_MESSAGE_CHARS,
  5_000,
  2_000_000,
);

export const MAX_AI_BRIEF_PROMPT_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_BRIEF_PROMPT_CHARS",
  800_000,
  2_000,
  2_000_000,
);
export const MAX_AI_CHAT_MESSAGE_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_CHAT_MESSAGE_CHARS",
  600_000,
  2_000,
  2_000_000,
);
export const MAX_AI_SPEC_PROMPT_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_SPEC_PROMPT_CHARS",
  800_000,
  2_000,
  2_000_000,
);

/**
 * Soft orchestration targets by prompt type.
 * Tuned for GPT 5.4 — 10x headroom reduces unnecessary summarisation.
 * These are guidance budgets, not hard validation limits.
 */
export const ORCHESTRATION_SOFT_TARGET_FREEFORM_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_FREEFORM_CHARS",
  75_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_WIZARD_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_WIZARD_CHARS",
  85_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_AUDIT_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_AUDIT_CHARS",
  110_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TEMPLATE_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_TEMPLATE_CHARS",
  50_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_FOLLOWUP_CHARS",
  70_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TECHNICAL_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_TECHNICAL_CHARS",
  95_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_APP_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_APP_CHARS",
  90_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);

/**
 * Thresholds that push the orchestrator into phase mode.
 * Raised for GPT 5.4 — phasing only needed for genuinely massive prompts.
 */
export const ORCHESTRATION_PHASE_FORCE_CHARS = readIntEnv(
  "SAJTMASKIN_PHASE_FORCE_CHARS",
  180_000,
  2_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_PHASE_FORCE_AUDIT_CHARS = readIntEnv(
  "SAJTMASKIN_PHASE_FORCE_AUDIT_CHARS",
  140_000,
  2_000,
  MAX_CHAT_MESSAGE_CHARS,
);

/**
 * When the user message is at most this many characters (after orchestration),
 * we may run the brief-backed prompt expander to merge wizard/structured brief
 * context into a richer build instruction (initial build only).
 */
export const BRIEF_EXPAND_MAX_USER_CHARS = readIntEnv(
  "SAJTMASKIN_BRIEF_EXPAND_MAX_USER_CHARS",
  360,
  40,
  4_000,
);

/**
 * Minimum "signal" extracted from `meta.brief` (recursive string length sum)
 * before expansion is allowed — avoids paying for an LLM call on empty stubs.
 */
export const BRIEF_EXPAND_MIN_BRIEF_SIGNAL_CHARS = readIntEnv(
  "SAJTMASKIN_BRIEF_EXPAND_MIN_BRIEF_SIGNAL_CHARS",
  48,
  8,
  20_000,
);

