import type { PromptType } from "@/lib/builder/prompt-orchestration";

/**
 * Own deadline for init Auto Brief. Historical prod successes sit at
 * p95 ≈ 46 s / max ≈ 50 s; 8–15 s would abort almost every real brief.
 * Client Deep Brief (`PROMPT_ASSIST_TIMEOUT_MS` = 750 s) is left alone.
 */
export const SERVER_AUTO_BRIEF_TIMEOUT_MS = 70_000;

/** Combine the request abort with the Auto Brief budget. */
export function createServerAutoBriefSignal(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(SERVER_AUTO_BRIEF_TIMEOUT_MS);
  if (!parent) return timeout;
  return AbortSignal.any([parent, timeout]);
}

/**
 * Whether create-chat should run canonical server-side Deep Brief when the client
 * did not send `meta.brief`.
 */
export function shouldRunServerAutoBrief(params: {
  hasClientBrief: boolean;
  promptSourceTechnical: boolean;
  promptSourcePreservePayload: boolean;
  promptType: PromptType;
  orchestrationReason: string;
  prompt: string;
  buildIntent?: string | null;
}): boolean {
  if (process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF === "1") {
    return false;
  }
  if (params.hasClientBrief) return false;
  if (params.promptSourceTechnical || params.promptSourcePreservePayload) return false;
  if (params.promptType === "audit") return false;
  if (params.promptType === "followup_general" || params.promptType === "followup_technical") {
    return false;
  }
  if (
    params.orchestrationReason === "technical_content_preserved" ||
    params.orchestrationReason === "preserve_registry_payload"
  ) {
    return false;
  }
  return true;
}
