export interface OpenClawChatMessageLike {
  role?: string | null;
  content?: string | null;
}

export type OpenClawCodeContextMode = "none" | "snippet" | "manifest" | "full";

const FULL_CODE_CONTEXT_TERMS = [
  "läs koden",
  "lasa koden",
  "gå igenom koden",
  "ga igenom koden",
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

const SNIPPET_CODE_CONTEXT_TERMS = [
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

export function decideOpenClawCodeContextMode(params: {
  messages: OpenClawChatMessageLike[];
  page?: unknown;
  chatId?: unknown;
  currentCode?: unknown;
}): OpenClawCodeContextMode {
  const { messages, page, chatId, currentCode } = params;
  const latestUserText = getLatestOpenClawUserText(messages);
  if (!latestUserText) return "none";

  const onBuilderPage = page === "builder";
  const hasChatId = typeof chatId === "string" && chatId.trim().length > 0;
  const hasCurrentCode =
    typeof currentCode === "string" && currentCode.trim().length > 0;

  if (!onBuilderPage || (!hasChatId && !hasCurrentCode)) {
    return "none";
  }

  if (hasAnyTerm(latestUserText, FULL_CODE_CONTEXT_TERMS)) {
    if (hasChatId) return "full";
    if (hasCurrentCode) return "snippet";
    return "none";
  }

  if (hasAnyTerm(latestUserText, MANIFEST_CODE_CONTEXT_TERMS)) {
    if (hasChatId) return "manifest";
    if (hasCurrentCode) return "snippet";
    return "none";
  }

  if (hasAnyTerm(latestUserText, SNIPPET_CODE_CONTEXT_TERMS)) {
    if (hasCurrentCode) return "snippet";
    if (hasChatId) return "manifest";
  }

  return "none";
}
