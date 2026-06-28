export interface OpenClawChatMessageLike {
  role?: string | null;
  content?: string | null;
}

export type OpenClawCodeContextMode = "none" | "light" | "manifest" | "full";
export type OpenClawRoutingIntent = "general" | "review";

export const OPENCLAW_ROUTING_STRATEGY = "internal_review_escalation";

const FULL_CODE_CONTEXT_TERMS = [
  "läs koden",
  "lasa koden",
  "gå igenom koden",
  "ga igenom koden",
  "gå igenom allt",
  "ga igenom allt",
  "granska allt",
  "granska hela projektet",
  "granska hela kodbasen",
  "hela repot",
  "hela koden",
  "alla filer",
  "hela projektet",
  "hela kodbasen",
  "granska koden",
  "analysera koden",
  "review the code",
  "read the code",
  "read all files",
  "source code",
] as const;

const MANIFEST_CODE_CONTEXT_TERMS = [
  "vilken fil",
  "vilka filer",
  "var ligger",
  "var finns",
  "where is",
  "which file",
  "which files",
  "file handles",
  "komponent",
  "component",
  "funktion",
  "function",
  "klass",
  "class",
  "kodstruktur",
  "projektstruktur",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".css",
  ".json",
] as const;

const LIGHT_CODE_CONTEXT_TERMS = [
  "kod",
  "koden",
  "code",
  "kodsnutt",
  "snutt",
  "förklara",
  "forklara",
  "what does",
  "debug",
  "bugg",
  "bug",
  "error",
  "fel",
  "stacktrace",
  "stack trace",
  "varför funkar",
  "varfor funkar",
  "senaste prompt",
  "latest prompt",
  "senaste svar",
  "senaste output",
  "current output",
] as const;

const REVIEW_INTENT_TERMS = [
  "granska",
  "review",
  "debug",
  "bugg",
  "bug",
  "fel",
  "vad kan förbättras",
  "vad kan forbattras",
  "vad borde jag ändra",
  "vad borde jag andra",
  "vad ska jag ändra",
  "vad ska jag andra",
  "forbattringsforslag",
  "förbättringsförslag",
  "recommend improvements",
  "suggest improvements",
  "what can be improved",
  "what should i change",
  "senaste prompt",
  "latest prompt",
  "senaste svar",
  "senaste output",
  "current output",
] as const;

function normalizeIntentText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function getLatestOpenClawUserText(
  messages: OpenClawChatMessageLike[],
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if (typeof message.content !== "string") continue;
    const normalized = normalizeIntentText(message.content);
    if (normalized) return normalized;
  }
  return "";
}

export function decideOpenClawRoutingIntent(params: {
  messages: OpenClawChatMessageLike[];
}): OpenClawRoutingIntent {
  const latestUserText = getLatestOpenClawUserText(params.messages);
  if (!latestUserText) return "general";
  return hasAnyTerm(latestUserText, REVIEW_INTENT_TERMS) ? "review" : "general";
}

export function decideOpenClawCodeContextMode(params: {
  messages: OpenClawChatMessageLike[];
  page?: unknown;
  chatId?: unknown;
  currentCode?: unknown;
  /** Debug-mode (OC_DEBUG): unlock full code context whenever a chat is open,
   * bypassing the keyword/intent gating so OpenClaw always sees the project. */
  debug?: boolean;
}): OpenClawCodeContextMode {
  const { messages, page, chatId, currentCode, debug } = params;
  const latestUserText = getLatestOpenClawUserText(messages);
  if (!latestUserText) return "none";

  const onBuilderPage = page === "builder";
  const hasChatId = typeof chatId === "string" && chatId.trim().length > 0;
  const hasCurrentCode =
    typeof currentCode === "string" && currentCode.trim().length > 0;

  if (!onBuilderPage || (!hasChatId && !hasCurrentCode)) {
    return "none";
  }

  if (debug) {
    if (hasChatId) return "full";
    if (hasCurrentCode) return "light";
  }

  if (hasAnyTerm(latestUserText, FULL_CODE_CONTEXT_TERMS)) {
    if (hasChatId) return "full";
    if (hasCurrentCode) return "light";
    return "none";
  }

  if (hasAnyTerm(latestUserText, MANIFEST_CODE_CONTEXT_TERMS)) {
    if (hasChatId) return "manifest";
    if (hasCurrentCode) return "light";
    return "none";
  }

  if (decideOpenClawRoutingIntent({ messages }) === "review") {
    if (hasChatId) return "manifest";
    if (hasCurrentCode) return "light";
    return "none";
  }

  if (hasAnyTerm(latestUserText, LIGHT_CODE_CONTEXT_TERMS)) {
    if (hasCurrentCode) return "light";
    if (hasChatId) return "manifest";
  }

  return "none";
}
