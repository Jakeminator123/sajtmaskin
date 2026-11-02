/**
 * En input, två mottagare: builderns komposer skickar antingen till
 * byggmotorn (generering → ny version) eller till Sajtagenten (OpenClaw).
 *
 * Beslutet är deterministiskt och billigt — ingen LLM. Reglerna följer
 * planen `docs/plans/active/2026-10-22-en-chatt-sajtagenten/`:
 *
 * - En fråga förblir en fråga: frågetecken, frågeord och granskningsverb går
 *   till agenten.
 * - En uttrycklig ändringsinstruktion («byt knapptexten till Boka tid») går
 *   direkt till byggmotorn.
 * - Bilagor och init går till byggmotorn när texten tillåter det. Ett uttryckligt
 *   agentärende blockeras om agentvägen saknas, utan att starta en generation.
 * - Oklart → agenten. Den kan starta bygget själv (`start_build`) när den har
 *   befogenhet, och en felroutad fråga till byggmotorn kostar en generation.
 *
 * Ordmatchning använder Unicode-gränser (`uWordRegex`) så svenska ord med
 * å/ä/ö matchar (unicode-regex.mdc).
 */

import { uWordRegex } from "@/lib/utils/unicode-word-boundary";

export type ComposerMode = "auto" | "agent" | "build";
export type ComposerRoute = "agent" | "build" | "blocked";
export type ComposerIntent = "agent" | "build" | "unsure";

export const COMPOSER_MODES: readonly ComposerMode[] = ["auto", "agent", "build"];

export const COMPOSER_MODE_META: Record<ComposerMode, { label: string; title: string }> = {
  auto: { label: "Auto", title: "Frågor går till Sajtagenten, ändringar till byggmotorn" },
  agent: { label: "Fråga", title: "Skicka till Sajtagenten (svarar, granskar, föreslår)" },
  build: { label: "Bygg", title: "Skicka till byggmotorn (skapar en ny version)" },
};

export function isComposerMode(value: unknown): value is ComposerMode {
  return typeof value === "string" && (COMPOSER_MODES as readonly string[]).includes(value);
}

/** Frågeord och samtalsöppningar — texten börjar med något av dessa. */
const QUESTION_OPENERS = uWordRegex(
  [
    "vad",
    "hur",
    "varför",
    "varfor",
    "när",
    "nar",
    "vilken",
    "vilka",
    "vilket",
    "vem",
    "vart",
    "kan du förklara",
    "kan du forklara",
    "kan du berätta",
    "kan du beratta",
    "förklara",
    "forklara",
    "berätta",
    "beratta",
    "finns det",
    "är det",
    "ar det",
    "borde",
    "ska jag",
    "bör jag",
    "bor jag",
    "tycker du",
    "vad tycker",
    "what",
    "how",
    "why",
    "which",
    "when",
    "who",
    "where",
    "explain",
    "should i",
    "can you explain",
    "is it",
    "are there",
    "does",
    "do you",
  ].join("|"),
  "iu",
);

/** Granskning, bedömning och diskussion — var som helst i texten. */
const REVIEW_TERMS = uWordRegex(
  [
    "granska",
    "buggranska",
    "kontrollera",
    "kolla igenom",
    "kolla om",
    "kolla på",
    "kolla pa",
    "titta på",
    "titta pa",
    "analysera",
    "bedöm",
    "bedom",
    "utvärdera",
    "utvardera",
    "feedback",
    "åsikt",
    "asikt",
    "tycker du",
    "förbättras",
    "forbattras",
    "innan publicering",
    "innan jag publicerar",
    "före publicering",
    "fore publicering",
    "redo att publicera",
    "review",
    "audit",
    "evaluate",
    "assess",
    "what can be improved",
    "any issues",
  ].join("|"),
  "iu",
);

/** Ändringsverb — texten börjar med något av dessa. */
const BUILD_OPENERS = uWordRegex(
  [
    "bygg",
    "skapa",
    "lägg till",
    "lagg till",
    "lägg in",
    "lagg in",
    "ta bort",
    "byt",
    "byt ut",
    "ändra",
    // ASCII-formen "andra" är struken med flit: den träffar det vanliga ordet
    // *andra* («Andra sidan ser konstig ut») och skulle starta ett bygge på
    // ett klagomål. En diakritlös ändringsbegäran fångas av substantiven.
    "uppdatera",
    "justera",
    "flytta",
    "ersätt",
    "ersatt",
    "centrera",
    "förstora",
    "forstora",
    "förminska",
    "forminska",
    "gör om",
    "gor om",
    "gör",
    "gor",
    "fixa",
    "rätta",
    "ratta",
    "infoga",
    "implementera",
    "designa",
    "styla",
    "färga",
    "farga",
    "döp om",
    "dop om",
    "sätt",
    "satt",
    "make",
    "add",
    "remove",
    "delete",
    "change",
    "update",
    "replace",
    "build",
    "create",
    "redesign",
    "move",
    "rename",
    "set",
    "fix",
    "insert",
    "implement",
  ].join("|"),
  "iu",
);

/** Ändringsverb var som helst i texten (svagare signal än en öppning). */
const BUILD_TERMS = uWordRegex(
  [
    "lägg till",
    "lagg till",
    "ta bort",
    "byt ut",
    "byt",
    "ändra",
    "uppdatera",
    "ersätt",
    "ersatt",
    "flytta",
    "gör om",
    "gor om",
    "add",
    "remove",
    "change",
    "replace",
    "redesign",
  ].join("|"),
  "iu",
);

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const ABSOLUTE_READ_ONLY = uWordRegex(
  "(?:ändra|andra) (?:inget|ingenting)|(?:gör|gor) (?:inget|ingenting|inga (?:ändringar|andringar))|only review|review only|do nothing|(?:do not|don't|don’t) (?:do anything|make any changes|change anything)",
  "iu",
);

const NEGATED_BUILD = uWordRegex(
  "(?:ändra|bygg|skapa|gör|gor) inte|(?:do not|don't|don’t) (?:change|build|modify|edit)",
  "iu",
);

const SCOPED_CHANGE_RESTRICTION = uWordRegex("(?:ändra|andra) (?:inget|ingenting) annat", "iu");

function withoutScopedRestriction(text: string): string {
  return text.replace(new RegExp(SCOPED_CHANGE_RESTRICTION.source, "giu"), "");
}

/** A new bounded order may run, but it must stop an older autonomous chain. */
export function hasScopedComposerChangeRestriction(rawText: string): boolean {
  const text = normalize(rawText);
  if (!SCOPED_CHANGE_RESTRICTION.test(text)) return false;
  return withoutScopedRestriction(text).split(/[,;.]|\s+(?:men|utan|but|instead|och)\s+/iu).some((part) => {
    const clause = part.trim();
    return matchesAtStart(BUILD_OPENERS, clause) && !/[?？]/u.test(clause) &&
      !NEGATED_BUILD.test(clause) && !ABSOLUTE_READ_ONLY.test(clause);
  });
}

/** Explicit no-change requests must be recognized before their build verbs. */
export function isReadOnlyComposerRequest(rawText: string): boolean {
  const normalized = normalize(rawText);
  const text = hasScopedComposerChangeRestriction(normalized)
    ? withoutScopedRestriction(normalized) : normalized;
  if (ABSOLUTE_READ_ONLY.test(text)) return true;
  if (!NEGATED_BUILD.test(text)) return false;

  // A scoped prohibition can accompany a complete positive instruction:
  // «Ändra inte färgerna men byt rubriken till Välkommen».
  const clauses = text.split(/[,;]|\s+(?:men|utan|but|instead)\s+/iu);
  return !clauses.some(
    (clause) => matchesAtStart(BUILD_OPENERS, clause.trim()) && !NEGATED_BUILD.test(clause),
  );
}

const PROPOSAL_REFERENCE = uWordRegex(
  "(?:(?:gör|gor|genomför|genomfor|implementera|utför|utfor|ta) (?:punkt(?:en)?|förslag(?:et)?|forslag(?:et)?|alternativ(?:et)?) (?:nummer )?(?:[0-9]+|ett|en|två|tva|tre|fyra|fem|sex|sju|åtta|atta|nio|tio)(?: (?:i|från|fran) (?:ditt|det) (?:förslag|forslag))?|(?:gör|gor|bygg|implementera) enligt (?:ditt|det|dina) (?:förslag|forslag)|(?:apply|implement|do) (?:your (?:suggestion|proposal)|(?:suggestion|proposal|item|point) [0-9]+))",
  "iu",
);

const DEPENDENT_BUILD_OBJECT = uWordRegex(
  "det|den|detta|denna|dessa|dem|så|samma|ditt|dina|förslag(?:et)?|forslag(?:et)?|råd(?:et)?|radet|ovanstående|ovan|tidigare|något|någonting|allt|allting|på|som|likadant|it|this|that|these|those|them|so|same|your|suggestion|proposal|something|anything|everything|as|like|according|till|to",
  "iu",
);
const CONTEXTUAL_BUILD_REFERENCE = uWordRegex(
  "enligt|utifrån|utifran|som (?:du|vi)|(?:du|vi) (?:föreslog|foreslog|sa)|according to|as (?:discussed|suggested|above)|based on (?:your|the) (?:suggestion|proposal)",
  "iu",
);

function matchProposalReference(rawText: string): { text: string; match: RegExpExecArray } | null {
  const text = normalize(rawText).replace(/^(?:snälla|please)\s+/iu, "");
  const match = PROPOSAL_REFERENCE.exec(text);
  return match && matchesAtStart(PROPOSAL_REFERENCE, text) ? { text, match } : null;
}

/** Only this narrow grammar may resolve exactly one recommendation. */
export function isSingleAgentProposalReference(rawText: string): boolean {
  const result = matchProposalReference(rawText);
  if (!result) return false;
  const { text, match } = result;
  return /^[\s,.!?。！？]*(?:tack|please)?[\s.!?。！？]*$/iu.test(
    text.slice(match.index + match[0].length),
  );
}

/** Recognize reference intent before build verbs, including ambiguous/multiple points. */
export function isAgentProposalReference(rawText: string): boolean {
  const result = matchProposalReference(rawText);
  if (!result) return false;
  const { text, match } = result;
  const suffix = text.slice(match.index + match[0].length).trim();
  // A colon can supply a complete independent instruction. Additional clauses
  // after an unresolved reference still need its source, even if a later clause
  // happens to contain another build verb.
  const independent = suffix.startsWith(":") ? suffix.slice(1).trim() : "";
  const opener = BUILD_OPENERS.exec(independent);
  const object = opener ? independent.slice(opener.index + opener[0].length).trim() : "";
  if (object && matchesAtStart(BUILD_OPENERS, independent) &&
    !matchesAtStart(DEPENDENT_BUILD_OBJECT, object) && !CONTEXTUAL_BUILD_REFERENCE.test(independent) &&
    !matchProposalReference(independent) && !isReadOnlyComposerRequest(independent) &&
    !/[?？]/u.test(independent)) return false;
  return true;
}

/**
 * Klassa texten i sig — utan hänsyn till läge, bilagor eller om chatten finns.
 * Exporterad för tester och för komposerns live-hint.
 */
export function classifyComposerIntent(rawText: string): ComposerIntent {
  const text = normalize(rawText);
  if (!text) return "unsure";
  if (isReadOnlyComposerRequest(text) || isAgentProposalReference(text)) return "agent";

  const lower = text.toLowerCase();
  const endsWithQuestion = /[?？]\s*$/u.test(text);
  const opensWithQuestion = QUESTION_OPENERS.test(lower) && matchesAtStart(QUESTION_OPENERS, lower);
  const opensWithBuild = matchesAtStart(BUILD_OPENERS, lower);
  const hasReview = REVIEW_TERMS.test(lower);
  const hasBuildTerm = BUILD_TERMS.test(lower);

  // En uttrycklig instruktion som BÖRJAR med ett ändringsverb vinner — «Byt
  // rubriken, vad tycker du?» är fortfarande ett uppdrag. Undantag: en
  // granskning som börjar med «Kolla …» fångas av REVIEW_TERMS nedan eftersom
  // «kolla» inte är ett byggverb.
  if (opensWithBuild && !endsWithQuestion) return "build";
  if (endsWithQuestion || opensWithQuestion || hasReview) return "agent";
  if (opensWithBuild || hasBuildTerm) return "build";
  return "unsure";
}

function matchesAtStart(regex: RegExp, lower: string): boolean {
  const match = regex.exec(lower);
  if (!match) return false;
  // Tillåt inledande skiljetecken/citat men inget ord före träffen.
  const prefix = lower.slice(0, match.index);
  return !/[\p{L}\p{N}]/u.test(prefix);
}

/** Build tools need a complete positive command even when the UI uses Auto. */
export function composerAllowsAgentBuild(input: { mode: ComposerMode; text: string }): boolean {
  return (
    input.mode !== "agent" &&
    !isReadOnlyComposerRequest(input.text) &&
    !isAgentProposalReference(input.text) &&
    classifyComposerIntent(input.text) === "build"
  );
}

export interface ResolveComposerRouteInput {
  mode: ComposerMode;
  text: string;
  /** `false` före första bygget — agentärenden kan inte skickas ännu. */
  hasChat: boolean;
  /** Bilagor, Figma-länk eller inspect-punkter följer bara byggmotorn. */
  hasAttachments: boolean;
  /** Sajtagentens yta är aktiverad och nåbar från den här buildern. */
  agentAvailable: boolean;
  /** En konfigurerad men ännu otillgänglig agent får inte ersättas med bygge. */
  agentConfigured?: boolean;
  /**
   * Agenten får starta byggen själv (`start_build` kräver armerad autonomi).
   * Utan det går oklar text till byggmotorn: en ändringsbegäran som hamnar
   * hos en agent som inte kan bygga blir bara ett extra klick för användaren.
   * Utelämnad → behandlas som sant.
   */
  agentCanBuild?: boolean;
  /** A reply belongs to the builder's pending question/plan until the user
   * explicitly selects Fråga. Short answers are not new agent requests. */
  builderAwaitingReply?: boolean;
}

/** Slutgiltigt val för ett utskick från komposern. */
export function resolveComposerRoute(input: ResolveComposerRouteInput): ComposerRoute {
  const agentReachable = input.agentAvailable && input.hasChat && !input.hasAttachments;
  if (
    input.mode === "agent" ||
    isReadOnlyComposerRequest(input.text) ||
    isAgentProposalReference(input.text)
  ) {
    return agentReachable ? "agent" : "blocked";
  }
  if (input.mode === "build") return "build";
  if (input.builderAwaitingReply) return "build";
  const intent = classifyComposerIntent(input.text);
  if (intent === "build") return "build";
  if (intent === "agent" && input.agentConfigured && !input.agentAvailable) return "blocked";
  if (!agentReachable) return "build";
  if (intent === "agent") return "agent";
  return input.agentCanBuild === false ? "build" : "agent";
}
