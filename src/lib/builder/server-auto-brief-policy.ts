import type { PromptType } from "@/lib/builder/promptOrchestration";

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
  /**
   * When true, a client brief is present but is allowed to be *enriched* by
   * the server auto-brief (client facts still win on merge). Used for wizard
   * briefs that lack creative fields like imagery / typography / colorPalette.
   */
  clientBriefAllowsEnrichment?: boolean;
}): boolean {
  if (process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF === "1") {
    return false;
  }
  if (params.hasClientBrief && !params.clientBriefAllowsEnrichment) return false;
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
