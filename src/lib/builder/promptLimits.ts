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
 * Keep these high enough for advanced prompts while still preventing unbounded payload growth.
 */
export const MAX_CHAT_MESSAGE_CHARS = readIntEnv("V0_MAX_PROMPT_LENGTH", 50_000, 5_000, 120_000);
export const WARN_CHAT_MESSAGE_CHARS = readIntEnv("V0_WARN_PROMPT_LENGTH", 30_000, 1_000, 120_000);
export const MAX_CHAT_SYSTEM_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_SYSTEM_LENGTH",
  35_000,
  2_000,
  120_000,
);
export const WARN_CHAT_SYSTEM_CHARS = readIntEnv(
  "SAJTMASKIN_WARN_SYSTEM_LENGTH",
  20_000,
  1_000,
  120_000,
);

export const MAX_PROMPT_HANDOFF_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_PROMPT_HANDOFF_CHARS",
  MAX_CHAT_MESSAGE_CHARS,
  5_000,
  120_000,
);

export const MAX_AI_BRIEF_PROMPT_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_BRIEF_PROMPT_CHARS",
  60_000,
  2_000,
  120_000,
);
export const MAX_AI_CHAT_MESSAGE_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_CHAT_MESSAGE_CHARS",
  40_000,
  2_000,
  120_000,
);
export const MAX_AI_SPEC_PROMPT_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_SPEC_PROMPT_CHARS",
  50_000,
  2_000,
  120_000,
);

/**
 * Soft orchestration targets by prompt type.
 * These are guidance budgets, not hard validation limits.
 */
export const ORCHESTRATION_SOFT_TARGET_FREEFORM_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_FREEFORM_CHARS",
  4_500,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_WIZARD_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_WIZARD_CHARS",
  5_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_AUDIT_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_AUDIT_CHARS",
  6_500,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TEMPLATE_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_TEMPLATE_CHARS",
  3_200,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_FOLLOWUP_CHARS",
  4_200,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TECHNICAL_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_TECHNICAL_CHARS",
  5_600,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_APP_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_APP_CHARS",
  5_400,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);

/**
 * Thresholds that push the orchestrator into phase mode.
 */
export const ORCHESTRATION_PHASE_FORCE_CHARS = readIntEnv(
  "SAJTMASKIN_PHASE_FORCE_CHARS",
  10_000,
  2_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_PHASE_FORCE_AUDIT_CHARS = readIntEnv(
  "SAJTMASKIN_PHASE_FORCE_AUDIT_CHARS",
  8_000,
  2_000,
  MAX_CHAT_MESSAGE_CHARS,
);
