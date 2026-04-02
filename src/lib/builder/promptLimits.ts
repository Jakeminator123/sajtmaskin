import { getPromptOrchestrationFromManifest } from "@/lib/ai-models/load-manifest";

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

const promptOrchestration = getPromptOrchestrationFromManifest();
const caps = promptOrchestration.hardCaps;
const soft = promptOrchestration.softTargets;
const thresholds = promptOrchestration.phaseThresholds;

/**
 * Hard caps for prompt-related payloads.
 * Defaults come from `config/ai_models/manifest.json` → `promptOrchestration.hardCaps`
 * with env overrides layered on top.
 */
export const MAX_CHAT_MESSAGE_CHARS = readIntEnv(
  caps.maxChatMessageChars.envKey,
  caps.maxChatMessageChars.default,
  caps.maxChatMessageChars.min,
  caps.maxChatMessageChars.max,
);
export const WARN_CHAT_MESSAGE_CHARS = readIntEnv(
  caps.warnChatMessageChars.envKey,
  caps.warnChatMessageChars.default,
  caps.warnChatMessageChars.min,
  caps.warnChatMessageChars.max,
);
export const MAX_CHAT_SYSTEM_CHARS = readIntEnv(
  caps.maxChatSystemChars.envKey,
  caps.maxChatSystemChars.default,
  caps.maxChatSystemChars.min,
  caps.maxChatSystemChars.max,
);
export const WARN_CHAT_SYSTEM_CHARS = readIntEnv(
  caps.warnChatSystemChars.envKey,
  caps.warnChatSystemChars.default,
  caps.warnChatSystemChars.min,
  caps.warnChatSystemChars.max,
);

export const MAX_PROMPT_HANDOFF_CHARS = readIntEnv(
  caps.maxPromptHandoffChars.envKey,
  caps.maxPromptHandoffChars.default,
  caps.maxPromptHandoffChars.min,
  caps.maxPromptHandoffChars.max,
);

export const MAX_AI_BRIEF_PROMPT_CHARS = readIntEnv(
  caps.maxAiBriefPromptChars.envKey,
  caps.maxAiBriefPromptChars.default,
  caps.maxAiBriefPromptChars.min,
  caps.maxAiBriefPromptChars.max,
);
export const MAX_AI_CHAT_MESSAGE_CHARS = readIntEnv(
  caps.maxAiChatMessageChars.envKey,
  caps.maxAiChatMessageChars.default,
  caps.maxAiChatMessageChars.min,
  caps.maxAiChatMessageChars.max,
);
export const MAX_AI_SPEC_PROMPT_CHARS = readIntEnv(
  caps.maxAiSpecPromptChars.envKey,
  caps.maxAiSpecPromptChars.default,
  caps.maxAiSpecPromptChars.min,
  caps.maxAiSpecPromptChars.max,
);

/**
 * Soft orchestration targets by prompt type.
 * Defaults come from `config/ai_models/manifest.json` → `promptOrchestration.softTargets`.
 * These are guidance budgets, not hard validation limits.
 */
export const ORCHESTRATION_SOFT_TARGET_FREEFORM_CHARS = readIntEnv(
  soft.freeformChars.envKey,
  soft.freeformChars.default,
  soft.freeformChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_WIZARD_CHARS = readIntEnv(
  soft.wizardChars.envKey,
  soft.wizardChars.default,
  soft.wizardChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_AUDIT_CHARS = readIntEnv(
  soft.auditChars.envKey,
  soft.auditChars.default,
  soft.auditChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TEMPLATE_CHARS = readIntEnv(
  soft.templateChars.envKey,
  soft.templateChars.default,
  soft.templateChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS = readIntEnv(
  soft.followupChars.envKey,
  soft.followupChars.default,
  soft.followupChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_TECHNICAL_CHARS = readIntEnv(
  soft.technicalChars.envKey,
  soft.technicalChars.default,
  soft.technicalChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_SOFT_TARGET_APP_CHARS = readIntEnv(
  soft.appChars.envKey,
  soft.appChars.default,
  soft.appChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);

/**
 * Thresholds that push the orchestrator into phase mode.
 * Defaults come from `config/ai_models/manifest.json` → `promptOrchestration.phaseThresholds`.
 */
export const ORCHESTRATION_PHASE_FORCE_CHARS = readIntEnv(
  thresholds.defaultChars.envKey,
  thresholds.defaultChars.default,
  thresholds.defaultChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);
export const ORCHESTRATION_PHASE_FORCE_AUDIT_CHARS = readIntEnv(
  thresholds.auditChars.envKey,
  thresholds.auditChars.default,
  thresholds.auditChars.min,
  MAX_CHAT_MESSAGE_CHARS,
);

