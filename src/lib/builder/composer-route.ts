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

import { uWord, uWordRegex } from "@/lib/utils/unicode-word-boundary";
import { isExplicitOpenClawWebSearch, requestedSourcePageUrl } from "@/lib/openclaw/source-page";
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

/**
 * En artig begäran som börjar med ett ändringsverb: «Kan du lägga in den här
 * loggan i sidhuvudet?», «Skulle du kunna byta bilden?», «Can you use this as
 * the hero?». Smalare än `BUILD_TERMS` med flit: «Ska jag ändra loggan?» och
 * «Hur byter jag bilden?» är rådfrågor och matchar inte. «Skulle du byta …?»
 * utan «kunna» är oftast en åsiktsfråga och matchar inte heller.
 */
const POLITE_BUILD_REQUEST = new RegExp(
  String.raw`^[\s"'«»“”(]*(?:(?:hej|hejsan|hallå|halla|hi|hello)[\s!,.]+)?(?:(?:snälla|snalla|please)[\s,]+)?(?:(?:kan|vill)\s+(?:du|ni)\s+|skulle\s+(?:du|ni)\s+kunna\s+|(?:could|can|would|will)\s+you\s+)(?:(?:kunna|please|snälla|snalla|också|ocksa|även|aven)\s+)*` +
    uWord(
      [
        "lägga till", "lagga till", "lägga in", "lagga in", "lägga upp", "lagga upp", "lägga", "lagga",
        "sätta in", "satta in", "sätta", "satta", "byta ut", "byta", "ersätta", "ersatta",
        "ta bort", "flytta", "ändra", "uppdatera", "använda", "anvanda", "infoga",
        "göra om", "gora om", "göra", "gora", "fixa", "justera", "rätta", "ratta",
        "färga", "farga", "styla", "designa", "implementera", "skapa", "bygga",
        "centrera", "förstora", "forstora", "förminska", "forminska", "minska", "öka", "oka",
        "skriva om", "skriva", "korta", "förkorta", "forkorta", "radera", "dölja", "dolja",
        "gömma", "gomma", "anpassa", "matcha", "kopiera", "ladda upp",
        "add", "insert", "put", "use", "replace", "swap", "change", "update", "remove",
        "move", "make", "create", "build", "set", "fix", "adjust", "style", "design",
        "resize", "rewrite", "write", "hide", "delete", "match", "copy", "apply", "implement",
      ]
        .sort((a, b) => b.length - a.length)
        .map((verb) => verb.replace(/ /g, String.raw`\s+`))
        .join("|"),
    ),
  "iu",
);

/** «Kan du göra en bedömning av bilden?» är en fråga, inte en beställning. */
const POLITE_REVIEW_OBJECT = uWordRegex(
  "bedömning|bedomning|analys|granskning|genomgång|genomgang|utvärdering|utvardering|jämförelse|jamforelse|review|assessment|analysis",
  "iu",
);

/**
 * Bilagan följer bara byggmotorn. En frågeformad text med bilaga är därför en
 * beställning när den börjar med ett ändringsverb eller är en artig begäran
 * med ett ändringsverb; en ren fråga («Vad tycker du om bilden?») är det inte.
 * Ägarbeslut via orkestratorn 2026-11-11.
 */
export function isAttachmentBuildRequest(rawText: string): boolean {
  const text = normalize(rawText);
  if (!text) return false;
  if (matchesAtStart(BUILD_OPENERS, text.toLowerCase())) return true;
  return (
    POLITE_BUILD_REQUEST.test(text) &&
    !REVIEW_TERMS.test(text) &&
    !POLITE_REVIEW_OBJECT.test(text)
  );
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
  if (isExplicitOpenClawWebSearch(rawText) || requestedSourcePageUrl(rawText)) return true;
  const normalized = normalize(rawText);
  const text = hasScopedComposerChangeRestriction(normalized)
    ? withoutScopedRestriction(normalized) : normalized;
  if (ABSOLUTE_READ_ONLY.test(text)) return true;
  if (!NEGATED_BUILD.test(text)) return false;

  // A scoped prohibition can accompany a complete positive instruction:
  // «Ändra inte färgerna men byt rubriken till Välkommen».
  const hasReview = REVIEW_TERMS.test(text);
  const clauses = text.split(/[,;]|\s+(?:men|utan|but|instead)\s+/iu)
    .flatMap(clause => hasReview ? clause.split(REVIEW_DETAIL_SEPARATORS) : [clause]);
  return !clauses.some(
    (clause) => !NEGATED_BUILD.test(clause) && (
      // En blandad granskning kan också beställa textändringar som inte
      // ingår i byggmotorns öppningar. Absoluta förbud hanteras ovan.
      hasReview ? reviewClauseChange(clause) === "positive" : matchesAtStart(BUILD_OPENERS, clause.trim())
    ),
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

/** Texten öppnar med ett frågeord eller en samtalsöppning («Vad tycker du …»). */
export function opensWithQuestionWord(rawText: string): boolean {
  const lower = normalize(rawText).toLowerCase();
  return QUESTION_OPENERS.test(lower) && matchesAtStart(QUESTION_OPENERS, lower);
}

const REVIEW_SITE = String.raw`(?:(?:min|vår|den)\s+)?(?:sajt(?:en)?|sida(?:n)?|webbplats(?:en)?|förhandsvisning(?:en)?)`;
const SITE_REVIEW_OPENER = new RegExp(
  String.raw`^(?:(?:kan du|vänligen)\s+)?(?:hur ser\s+${REVIEW_SITE}\s+ut|` +
    String.raw`(?:granska|bedöm|titta på)\s+(?:utseendet|designen|layouten)\s+(?:på|för)\s+${REVIEW_SITE})` +
    String.raw`(?:\s+(?:just nu|nu|idag))?(?=[^\S\r\n]*(?:[?!.:\r\n]|$))`,
  "iu",
);
// Bilagebyggens öppningar är avsiktligt smala. En blandad granskning måste
// även känna igen skrivinstruktioner som «skriv om» och «korta ner».
const SITE_REVIEW_CHANGE = uWordRegex(
  "byt(?:a)?(?: ut)?|ändra|uppdatera|justera|flytta|ersätt(?:a)?|ersatt(?:a)?|" +
    "lägg(?:a)? (?:till|in)|lagg(?:a)? (?:till|in)|ta bort|bygg(?:a)?|skapa|gör(?:a)?(?: om)?|gor(?:a)?(?: om)?|" +
    "fixa|rätta|ratta|infoga|implementera|centrera|förstora|forstora|förminska|forminska|" +
    "skriv(?:a)? om|korta(?: ner)?|förkorta|forkorta|minska|öka|oka|radera|dölj(?:a)?|dolj(?:a)?|göm(?:ma)?|gom(?:ma)?|" +
    "add|insert|remove|delete|change|update|replace|move|make|create|build|fix|adjust|style|design|resize|rewrite|shorten|hide|redesign|rename",
  "iu",
);
const REVIEW_ACTION_NEGATION = uWordRegex("inte|ej|aldrig|not|never", "iu");
const REVIEW_REPORT_OBJECT = uWordRegex(
  String.raw`(?:(?:en|ett|din|ditt|dina|min|mitt|mina|the|a|an|your|my)\s+(?:[\p{L}-]+\s+){0,3})?(?:${POLITE_REVIEW_OBJECT.source}|sammanfattning|beskrivning|redogörelse|rapport|svar|observation|summary|description|report|answer)`,
  "iu",
);
const REVIEW_REWRITE_VERB = uWordRegex("(?:skriv(?:a)? om|rewrite)$", "iu");
const REVIEW_REWRITE_TARGET = uWordRegex(
  "(?:(?:hela|den|det|min|mitt|vår|vårt|the|my|our) )?(?:rubrik(?:en)?|text(?:en)?|ingress(?:en)?|stycke(?:t)?|knapptext(?:en)?|den|det|detta|it|this|that|title|headline|copy|paragraph)",
  "iu",
);
const REVIEW_REPORT_REFERENCE = uWordRegex("(?:det|den|what) (?:du|ni|you) (?:ser|läser|see|read)", "iu");
// Meningsgränserna behövs även när en ändringsorder följer ett nekande.
const REVIEW_DETAIL_SEPARATORS = /(?<=[?!.])\s+|[\r\n]+/u;
const REVIEW_CLAUSE_SEPARATORS = /[:,;]|\s+(?:och|samt|men|utan|istället|istallet|sedan|sen|därefter|and|then|also|but|instead)\s+/iu;

function reviewClauseChange(clause: string): "positive" | "read" | undefined {
  const request = normalize(clause).replace(/^(?:(?:snälla|vänligen|please)\s*,?\s*|(?:också|även|ocksa|aven)\s+)*/iu, "");
  if (/^(?:(?:do not|don't|don’t|never|inte|ej|aldrig)\s+|(?:(?:kan|vill)\s+(?:du|ni)|skulle\s+(?:du|ni)\s+kunna|(?:can|could|would|will)\s+you)\s+(?:inte|ej|aldrig|not|never)\s+)/iu.test(request)) {
    return "read";
  }
  const action = SITE_REVIEW_CHANGE.exec(request);
  const polite = POLITE_BUILD_REQUEST.exec(request);
  const politeAction = polite ? SITE_REVIEW_CHANGE.exec(polite[0]) : null;
  const hasPoliteChange = polite && politeAction && politeAction.index + politeAction[0].length === polite[0].length;
  const opener = action && matchesAtStart(SITE_REVIEW_CHANGE, request)
    ? action : hasPoliteChange ? polite : null;
  if (!opener) return undefined;
  const object = request.slice(opener.index + opener[0].length).trim();
  // «Skriv om dina observationer» kan be om en rapport. En omskrivning
  // behöver ett uttryckligt textobjekt eller en referens till det granskade.
  if (REVIEW_REWRITE_VERB.test(opener[0]) && !matchesAtStart(REVIEW_REWRITE_TARGET, object)) return "read";
  // «Gör en bedömning» skriver ett svar; «gör rubriken större efter din
  // bedömning» beställer däremot en sajtändring.
  // Nekandet behöver inte följa direkt på verbet («korta absolut inte»).
  // En oklar negerad sats i en granskning får inte ge ändringsmedgivande.
  return !object || REVIEW_ACTION_NEGATION.test(object) ||
    matchesAtStart(REVIEW_REPORT_OBJECT, object) || opensWithQuestionWord(object) ||
    matchesAtStart(REVIEW_REPORT_REFERENCE, object)
    ? "read" : "positive";
}

export function isExplicitOpenClawSiteReview(rawText: string): boolean {
  const text = rawText.trim();
  const opener = SITE_REVIEW_OPENER.exec(text);
  if (!opener) return false;

  // Bildfrågan kan precisera vad som ska granskas. Ett blandat uppdrag
  // behåller sin ordinarie väg eftersom läsvägen inte kan utföra ändringar.
  const details = text.slice(opener[0].length).trim().replace(/^[:?!.]+\s*/u, "");
  return details.split(REVIEW_DETAIL_SEPARATORS).every((part) => {
    const detail = part.trim();
    if (!detail) return true;
    const changes = detail.split(REVIEW_CLAUSE_SEPARATORS).map((part) => {
      const clause = part.trim();
      if (isReadOnlyComposerRequest(clause)) return "read";
      if (parseArmingDirective(clause)) return "positive";
      return reviewClauseChange(clause);
    });
    // En uttrycklig granskning förblir läsande tills en positiv ändringsorder
    // faktiskt känns igen. Okänd rapporttext får inte skapa medgivande.
    return !changes.includes("positive");
  });
}

/**
 * Bär komposerturen medgivande för Sajtagenten att agera direkt
 * (`agent-action-consent.ts`)? Ägarbeslut 2026-11-20: agenten är orkestrator
 * och avgör själv om en text är en ändring — «Kan du lägga till en karta?» ska
 * inte kräva ett klick till. Den deterministiska spärren är därför smal och
 * gäller bara där ett bygge säkert vore fel:
 *
 * - läget Fråga («Fråga – ändrar inget»),
 * - en uttrycklig «ändra inget»-formulering,
 * - en uttrycklig bildgranskning av den aktuella sajten,
 * - ett stopp,
 * - text som öppnar med ett frågeord («Vad tycker du om startsidan?»): en
 *   fråga blir aldrig tyst ett bygge.
 *
 * Tidigare krävdes en komplett order som började med ett ändringsverb. Den
 * regeln skickade i praktiken varje agentbygge till ett godkännandekort.
 */
export function composerAllowsAgentBuild(input: { mode: ComposerMode; text: string }): boolean {
  if (input.mode === "agent" || !normalize(input.text)) return false;
  if (isReadOnlyComposerRequest(input.text) || isExplicitOpenClawSiteReview(input.text) || parseStopDirective(input.text)) {
    return false;
  }
  return !opensWithQuestionWord(input.text);
}

export interface ResolveComposerRouteInput {
  mode: ComposerMode;
  text: string;
  /** `false` före första bygget — agentärenden kan inte skickas ännu. */
  hasChat: boolean;
  /** Filer, Figma-länk eller inspect-punkter vid detta utskick. */
  hasAttachments: boolean;
  /** Valda bilder och dokument som agentens läsväg stöder. */
  hasAgentReadableAttachments?: boolean;
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
  const agentReachable = input.agentAvailable && input.hasChat &&
    (!input.hasAttachments || input.hasAgentReadableAttachments === true);
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
  if (intent === "build") {
    // Auto lets the armed orchestrator choose a quick edit or a full build.
    // Attachments stay on the builder path until every edit input can be
    // carried through the agent's action handoff.
    return agentReachable && input.agentCanBuild === true && !input.hasAttachments
      ? { route: "agent" }
      : { route: "build" };
  }
  if (intent === "agent") {
    if (input.hasAttachments && isAttachmentBuildRequest(input.text)) return { route: "build" };
    return toAgent();
  }
  if (!agentReachable || input.hasAttachments) return { route: "build" };
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
    hint: "Sajtagenten kan inte ta emot bilaga. Ta bort bilagan för att fråga, eller välj Bygg för att använda den i en ändring.",
  },
};

/** Det som hindrar en fråga: en uppladdad fil, en Figma-länk eller markerade punkter. */
export type ComposerAttachmentKind = "file" | "figma" | "inspect";

const ATTACHMENT_WORDS: Record<ComposerAttachmentKind | "mixed", { noun: string; definite: string; pronoun: string }> = {
  file: { noun: "bilaga", definite: "bilagan", pronoun: "den" },
  figma: { noun: "Figma-länk", definite: "Figma-länken", pronoun: "den" },
  inspect: { noun: "markerade punkter", definite: "punkterna", pronoun: "dem" },
  mixed: { noun: "bilagor", definite: "bilagorna", pronoun: "dem" },
};

function describeAttachmentBlock(kinds: ReadonlyArray<ComposerAttachmentKind> | undefined) {
  const unique = Array.from(new Set(kinds ?? []));
  const words = ATTACHMENT_WORDS[unique.length > 1 ? "mixed" : (unique[0] ?? "file")];
  return {
    label: `Fråga – kan inte skickas med ${words.noun}`,
    hint: `Sajtagenten kan inte ta emot ${words.noun}. Ta bort ${words.definite} för att fråga, eller välj Bygg för att använda ${words.pronoun} i en ändring.`,
  };
}

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
    /** Vad som ligger med, så att blockeringen kan säga det (V-riggen 2026-11-11). */
    attachmentKinds?: ReadonlyArray<ComposerAttachmentKind>;
    /**
     * Turen bär Sajtagentens handlingsmedgivande och chatten har en
     * redigeringsbefogenhet: agenten kan då starta ett bygge eller göra en
     * snabbändring direkt (`agent-action-consent.ts`). Etiketten får i så fall
     * inte lova «ändrar inget». Utelämnad → behandlas som falskt.
     */
    agentCanAct?: boolean;
  },
): ComposerRouteDescription {
  if (decision.route === "blocked") {
    const reason = decision.blockReason ?? "agent-unavailable";
    const blocked =
      reason === "attachments"
        ? describeAttachmentBlock(context.attachmentKinds)
        : BLOCKED_DESCRIPTIONS[reason];
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
      hint: "Frågor besvaras av Sajtagenten. Ber du om en ändring skapas en ny version.",
    };
  }
  if (decision.route === "agent" && context.agentCanAct && context.mode !== "agent") {
    // Samma beslut som kortet läser: texten når agenten, som får agera direkt.
    return {
      tone: "agent",
      label: "Till Sajtagenten – kan ändra sajten",
      hint: "Sajtagenten svarar. Ber du om en ändring gör den ändringen direkt, och den kan skapa en ny version.",
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
