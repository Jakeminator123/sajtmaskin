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
 * Tuned for GPT 5.2's 128K-token context window (~500K chars).
 * Higher defaults than v0 era — the model can handle longer prompts without
 * quality degradation, so we avoid aggressive summarisation.
 */
export const MAX_CHAT_MESSAGE_CHARS = readIntEnv("V0_MAX_PROMPT_LENGTH", 80_000, 5_000, 200_000);
export const WARN_CHAT_MESSAGE_CHARS = readIntEnv("V0_WARN_PROMPT_LENGTH", 50_000, 1_000, 200_000);
export const MAX_CHAT_SYSTEM_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_SYSTEM_LENGTH",
  60_000,
  2_000,
  200_000,
);
export const WARN_CHAT_SYSTEM_CHARS = readIntEnv(
  "SAJTMASKIN_WARN_SYSTEM_LENGTH",
  35_000,
  1_000,
  200_000,
);

export const MAX_PROMPT_HANDOFF_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_PROMPT_HANDOFF_CHARS",
  MAX_CHAT_MESSAGE_CHARS,
  5_000,
  200_000,
);

export const MAX_AI_BRIEF_PROMPT_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_BRIEF_PROMPT_CHARS",
  80_000,
  2_000,
  200_000,
);
export const MAX_AI_CHAT_MESSAGE_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_CHAT_MESSAGE_CHARS",
  60_000,
  2_000,
  200_000,
);
export const MAX_AI_SPEC_PROMPT_CHARS = readIntEnv(
  "SAJTMASKIN_MAX_AI_SPEC_PROMPT_CHARS",
  80_000,
  2_000,
  200_000,
);

/**
 * Soft orchestration targets by prompt type.
 * Tuned for GPT 5.2 — higher targets reduce unnecessary summarisation.
 * These are guidance budgets, not hard validation limits.
 */
export const ORCHESTRATION_SOFT_TARGET_FREEFORM_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_FREEFORM_CHARS",
  7_500,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_WIZARD_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_WIZARD_CHARS",
  8_500,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_AUDIT_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_AUDIT_CHARS",
  11_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TEMPLATE_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_TEMPLATE_CHARS",
  5_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_FOLLOWUP_CHARS",
  7_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TECHNICAL_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_TECHNICAL_CHARS",
  9_500,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_APP_CHARS = readIntEnv(
  "SAJTMASKIN_SOFT_TARGET_APP_CHARS",
  9_000,
  1_000,
  MAX_CHAT_MESSAGE_CHARS,
);

/**
 * Thresholds that push the orchestrator into phase mode.
 * Raised for GPT 5.2 — phasing only needed for genuinely massive prompts.
 */
export const ORCHESTRATION_PHASE_FORCE_CHARS = readIntEnv(
  "SAJTMASKIN_PHASE_FORCE_CHARS",
  18_000,
  2_000,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_PHASE_FORCE_AUDIT_CHARS = readIntEnv(
  "SAJTMASKIN_PHASE_FORCE_AUDIT_CHARS",
  14_000,
  2_000,
  MAX_CHAT_MESSAGE_CHARS,
);

