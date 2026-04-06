import type { PromptType } from "@/lib/builder/promptOrchestration";

const STRUCTURED_WEBSITE_HINTS = [
  "hero",
  "sektion",
  "section",
  "kontakt",
  "om oss",
  "about",
  "cta",
  "faq",
  "pricing",
  "gallery",
  "produktkatalog",
  "product catalog",
  "catalog",
  "shop",
  "ehandel",
  "e-handel",
  "bakgrund",
  "palette",
  "color",
  "färg",
] as const;

const SIMPLE_WEBSITE_HINTS = [
  "hemsida",
  "webbplats",
  "website",
  "sajt",
  "landing",
  "landningssida",
  "homepage",
] as const;

function looksStructuredWebsitePrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const hintHits = STRUCTURED_WEBSITE_HINTS.filter((token) => normalized.includes(token)).length;
  return normalized.length >= 120 && hintHits >= 2;
}

function looksSimpleWebsitePrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase().trim();
  if (normalized.length === 0 || normalized.length > 220) return false;
  return SIMPLE_WEBSITE_HINTS.some((token) => normalized.includes(token));
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
  if (params.buildIntent === "website") {
    if (looksStructuredWebsitePrompt(params.prompt)) {
      return false;
    }
    if (params.promptType === "freeform" && looksSimpleWebsitePrompt(params.prompt)) {
      return false;
    }
  }
  return true;
}
