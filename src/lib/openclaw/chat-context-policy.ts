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

/**
 * Edit-mode (OC_EDIT): small, concrete change intents — not review/debug.
 * Matchningen är substring-baserad (se {@link hasAnyTerm}), så termerna måste
 * tåla att ligga inuti andra ord: bara "text" skulle träffa "kontext" och ge
 * kodkontext på en ren fråga.
 */
const EDIT_CODE_CONTEXT_TERMS = [
  "byt",
  "ändra",
  // ASCII-formen "andra" är struken: den träffar det vanliga ordet *andra*
  // ("den andra sidan") och gav kodkontext på en ren fråga — samma skäl som
  // att "text" ströks, det träffade "kontext". En diakritlös ändringsbegäran
  // fångas i praktiken av substantiven nedan ("andra fargen pa knappen").
  "uppdatera",
  "justera",
  "ta bort",
  "lägg till",
  "flytta",
  "rubrik",
  "färg",
  "farg",
  // "knapp" träffar "knappt" ("det funkar knappt"), som inte är en ändring.
  "knappen",
  "knappar",
  "change",
  "replace",
  "update",
  "remove",
] as const;

/**
 * "review" ligger inuti "preview" — produktens allra vanligaste ord. Utan den
 * här vakten blev "hur lång tid tar previewen?" review-intent, vilket både
 * höjde `reasoning_effort` på gateway-anropet och drog in fynd-/tidslinje-
 * block. Bara vänsterkanten är bunden, så "reviewa koden" träffar fortfarande.
 */
const REVIEW_WORD = /(?<![\p{L}\p{N}_])review/u;

const REVIEW_INTENT_TERMS = [
  "granska",
  REVIEW_WORD,
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

/**
 * En term är antingen en ren delsträng (billigast, räcker för fraser) eller en
 * regex för de ord som inte får träffa inuti ett större ord.
 */
type ContextTerm = string | RegExp;

function hasAnyTerm(text: string, terms: readonly ContextTerm[]): boolean {
  return terms.some((term) => (typeof term === "string" ? text.includes(term) : term.test(text)));
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
  /** Edit-mode (OC_EDIT): unlock bounded (manifest/light) code context when the
   * latest user message expresses a concrete edit intent. Does not bypass to
   * full — that remains debug-only. */
  edit?: boolean;
}): OpenClawCodeContextMode {
  const { messages, page, chatId, currentCode, debug, edit } = params;
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

  // Efter FULL/MANIFEST, aldrig före: edit-läget ger bara avgränsad kontext, så
  // en prompt som både ber om granskning och en ändring ("granska koden och byt
  // rubriken") måste behålla sin fulla kontext i stället för att nedgraderas.
  if (edit && hasAnyTerm(latestUserText, EDIT_CODE_CONTEXT_TERMS)) {
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
