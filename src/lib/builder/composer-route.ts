/**
 * En input, två mottagare: builderns komposer skickar antingen till
 * byggmotorn (generering → ny version) eller till Sajtagenten (OpenClaw).
 *
 * Beslutet är deterministiskt och billigt — ingen LLM. Reglerna följer
 * planen `docs/plans/avklarat/2026-10-22-en-chatt-sajtagenten/`:
 *
 * - En fråga förblir en fråga: frågetecken, frågeord och granskningsverb går
 *   till agenten.
 * - En uttrycklig ändringsinstruktion («byt knapptexten till Boka tid») går
 *   direkt till byggmotorn.
 * - Första bygget (ingen chatt ännu) går alltid till byggmotorn: det finns
 *   ingen sajt att fråga om, och beställningen är skälet till besöket.
 * - En fråga blir aldrig tyst ett bygge. Saknas agentvägen (okonfigurerad,
 *   otillgänglig eller bilaga) blockeras utskicket med ett skäl som komposern
 *   visar, och utkastet ligger kvar (UX-05/06, 2026-11-11).
 * - Oklart → agenten. Den kan starta bygget själv (`start_build`) när den har
 *   befogenhet, och en felroutad fråga till byggmotorn kostar en generation.
 *
 * Ordmatchning använder Unicode-gränser (`uWordRegex`) så svenska ord med
 * å/ä/ö matchar (unicode-regex.mdc).
 */

import { uWordRegex } from "@/lib/utils/unicode-word-boundary";
import { parseArmingDirective, parseStopDirective } from "@/lib/openclaw/debug/armed-mandate";

export type ComposerMode = "auto" | "agent" | "build";
export type ComposerRoute = "agent" | "build" | "blocked";
export type ComposerIntent = "agent" | "build" | "unsure";

export const COMPOSER_MODES: readonly ComposerMode[] = ["auto", "agent", "build"];

export const COMPOSER_MODE_META: Record<ComposerMode, { label: string; title: string }> = {
  auto: { label: "Auto", title: "Frågor besvaras av Sajtagenten, ändringar skapar en ny version" },
  agent: { label: "Fråga", title: "Sajtagenten svarar, granskar och föreslår. Sajten ändras inte." },
  build: { label: "Bygg", title: "Byggmotorn ändrar sajten och sparar en ny version" },
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

/** Longest first: object extraction must consume "byt ut", not only "byt". */
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
  ].sort((a, b) => b.length - a.length).join("|"),
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
  if (parseArmingDirective(text) || parseStopDirective(text, "leading")) return "agent";

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

/** Varför ett agentärende inte kan skickas. Styr texten användaren ser. */
export type ComposerBlockReason =
  | "no-chat"
  | "agent-not-configured"
  | "agent-unavailable"
  | "attachments";

export interface ComposerDecision {
  route: ComposerRoute;
  /** Satt när `route === "blocked"`. */
  blockReason?: ComposerBlockReason;
  /** Bygget svarar på byggmotorns egen motfråga eller plan. */
  answersBuilder?: boolean;
}

function agentBlockReason(input: ResolveComposerRouteInput): ComposerBlockReason {
  if (!input.hasChat) return "no-chat";
  if (!input.agentAvailable) return input.agentConfigured ? "agent-unavailable" : "agent-not-configured";
  return "attachments";
}

/**
 * Slutgiltigt beslut för ett utskick, med skäl. Komposerns etikett vid Skicka
 * och blockeringstexten läser samma beslut som själva utskicket.
 */
export function resolveComposerDecision(input: ResolveComposerRouteInput): ComposerDecision {
  const agentReachable = input.agentAvailable && input.hasChat && !input.hasAttachments;
  const toAgent = (): ComposerDecision =>
    agentReachable ? { route: "agent" } : { route: "blocked", blockReason: agentBlockReason(input) };
  if (
    input.mode === "agent" ||
    (input.mode === "auto" && Boolean(parseArmingDirective(input.text) || parseStopDirective(input.text, "leading"))) ||
    isReadOnlyComposerRequest(input.text) ||
    isAgentProposalReference(input.text)
  ) {
    return toAgent();
  }
  if (input.mode === "build") return { route: "build" };
  if (input.builderAwaitingReply) return { route: "build", answersBuilder: true };
  // Första bygget: allt är en beställning, även en artig fråga
  // («Kan du göra en sida för mitt kafé?»).
  if (!input.hasChat) return { route: "build" };
  const intent = classifyComposerIntent(input.text);
  if (intent === "build") return { route: "build" };
  if (intent === "agent") return toAgent();
  if (!agentReachable) return { route: "build" };
  return input.agentCanBuild === false ? { route: "build" } : { route: "agent" };
}

/** Slutgiltigt val för ett utskick från komposern. */
export function resolveComposerRoute(input: ResolveComposerRouteInput): ComposerRoute {
  return resolveComposerDecision(input).route;
}

export type ComposerRouteTone = "neutral" | "agent" | "build" | "blocked";

export interface ComposerRouteDescription {
  tone: ComposerRouteTone;
  /** Kort etikett intill Skicka. */
  label: string;
  /** En mening om vad som händer, eller vad användaren kan göra. */
  hint: string;
}

const BLOCKED_DESCRIPTIONS: Record<ComposerBlockReason, { label: string; hint: string }> = {
  "no-chat": {
    label: "Fråga – går först när sajten finns",
    hint: "Sajtagenten kan svara efter första bygget. Beskriv först vad du vill bygga.",
  },
  "agent-not-configured": {
    label: "Fråga – Sajtagenten finns inte här",
    hint: "Frågor kan inte besvaras i den här miljön. Välj Bygg om texten är en ändring.",
  },
  "agent-unavailable": {
    label: "Fråga – Sajtagenten svarar inte just nu",
    hint: "Försök igen om en stund, eller välj Bygg om texten är en ändring.",
  },
  attachments: {
    label: "Fråga – kan inte skickas med bilaga",
    hint: "Sajtagenten läser inte bilagor. Ta bort bilagan för att fråga, eller välj Bygg för att använda den i en ändring.",
  },
};

/**
 * Text för komposern: vad nästa klick på Skicka gör. Läser samma beslut som
 * utskicket, så etiketten kan inte säga något annat än det som händer.
 */
export function describeComposerDecision(
  decision: ComposerDecision,
  context: {
    mode: ComposerMode;
    hasChat: boolean;
    /** Ett bygge pågår; byggvägen väntar tills det är klart. */
    builderLocked?: boolean;
    /** Ingen text och inga bilagor ännu. */
    emptyDraft?: boolean;
  },
): ComposerRouteDescription {
  if (decision.route === "blocked") {
    const blocked = BLOCKED_DESCRIPTIONS[decision.blockReason ?? "agent-unavailable"];
    if (context.mode === "build") {
      return {
        tone: "blocked",
        label: blocked.label,
        hint: "Texten ber om svar utan ändring och kan bara gå till Sajtagenten.",
      };
    }
    return { tone: "blocked", label: blocked.label, hint: blocked.hint };
  }
  if (context.emptyDraft && context.mode === "auto" && context.hasChat) {
    return {
      tone: "neutral",
      label: "Auto – frågor besvaras, ändringar byggs",
      hint: "Frågor går till Sajtagenten och ändrar inget. Ändringar skapar en ny version.",
    };
  }
  if (decision.route === "agent") {
    return {
      tone: "agent",
      label: "Fråga – ändrar inget",
      hint: "Sajtagenten svarar. Sajten ändras inte.",
    };
  }
  if (!context.hasChat) {
    return {
      tone: "build",
      label: "Första bygget – skapar din sajt",
      hint: "Byggmotorn bygger den första versionen av sajten.",
    };
  }
  if (context.builderLocked) {
    return {
      tone: "build",
      label: "Ändring – väntar på pågående bygge",
      hint: "Ett bygge pågår. Ändringen kan skickas när det är klart.",
    };
  }
  if (decision.answersBuilder) {
    return {
      tone: "build",
      label: "Svar till bygget – fortsätter det",
      hint: "Svaret går till byggmotorn, som fortsätter och kan spara en ny version.",
    };
  }
  return {
    tone: "build",
    label: "Ändring – skapar en ny version",
    hint: "Byggmotorn ändrar sajten och sparar en ny version.",
  };
}
