import { previewUrlField } from "@/lib/api/preview-url-contract";
import { FOCUS_POINT_MARKER as FOLLOW_UP_FOCUS_POINT_MARKER } from "@/lib/builder/focus-point-prompt";
import { formatSSEEvent } from "@/lib/streaming";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { hasNegatedRedesignIntent } from "@/lib/builder/prompt-negation";
import { type FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import type { Message } from "@/lib/db/chat-repository-pg";
import { uWordRegex } from "@/lib/utils/unicode-word-boundary";

export type { FollowUpIntentMode };

// Unicode-aware look-arounds överallt. Default JS `\b` räknar `ä/ö/å` som
// non-word, så `/\bändra\b/` matchade aldrig "ändra" och alla svenska
// refine/vague-prompter föll silent till "neutral".
// "byt" (utan "ut") saknades tidigare i refine och vague — enkla svenska
// edits som "byt hero-bilden" tappade refine-signal.
const FOLLOW_UP_REFINE_PATTERNS = [
  // 2026-04-22 follow-up audit: `flytta` saknades (t.ex. "Flytta CTA-knappen
  // under rubriken" → neutral). Lagt till som refine-signal — layout-edits
  // utan specifik target hör hemma här.
  /(?<![\p{L}\p{N}_])(?:förfina|förbättra|justera|uppdatera|ändra|byt(?:er|t)?(?:\s+ut)?|lägg\s+till|flytta(?:r|de|t)?|fixa|trimma)(?![\p{L}\p{N}_])/iu,
  // Engelska refine-ord saknade `change` — vanligaste edit-verbet i engelska
  // prompts. Lagt till både `change` och `move` (engelsk motsvarighet till
  // `flytta`) så de två språken nu täcker samma fält.
  /(?<![\p{L}\p{N}_])(?:refine|improve|change|move|update|adjust|tweak|fix|keep\s+the\s+current\s+design)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:förfina\s+nuvarande\s+design|behåll\s+nuvarande\s+design)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_REDESIGN_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:redesign|rebrand|restyle|start\s+over|from\s+scratch)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:gör\s+om\s+från\s+grunden|helt\s+ny\s+riktning|helt\s+annan\s+stil|byt\s+stil\s+helt)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:tydlig\s+redesign|starta\s+om\s+från\s+en\s+ny\s+grund)(?![\p{L}\p{N}_])/iu,
  // Codex P1 (#297): the site/design target is REQUIRED — a bare "modernisera"
  // must not match, or targeted edits ("modernisera rubriken", "modernize the
  // hero copy") would be misclassified as `clear-redesign` (unlocking scaffold
  // rematch + delta-brief) instead of staying in the refine path.
  /(?<![\p{L}\p{N}_])(?:modernisera\s+(?:hela\s+)?(?:sajten|webbplatsen|sidan|designen|utseendet|layouten)|modernize\s+(?:the\s+)?(?:whole\s+)?(?:site|website|design|look|layout))(?![\p{L}\p{N}_])/iu,
  // Bugbot (#297): require a whole-site qualifier for "layout" — bare "ny layout"
  // matched targeted edits ("ny layout för footern", "ny layout-sektion"). Mirror
  // the English precision ("change the whole layout") by requiring "helt ny layout".
  /(?<![\p{L}\p{N}_])(?:(?:helt\s+)?nytt\s+utseende|helt\s+ny\s+layout|ändra\s+hela\s+layouten|gör\s+om\s+(?:hela\s+)?layouten)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:(?:brand\s+)?new\s+look|new\s+visual\s+identity|change\s+the\s+(?:whole\s+|entire\s+)?layout|redo\s+the\s+(?:whole\s+|entire\s+)?layout)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_NEW_SITE_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:hemsida|sajt|landningssida|startsida)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:website|site|homepage|landing\s+page|one-pager)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_BUILD_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:bygg|skapa|gör|designa)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:build|create|make|design)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_SITE_BRIEF_INTENT_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:vill\s+ha|behöver|önskar|ska\s+vara|ska\s+innehålla)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:i\s+want|we\s+want|i\s+need|we\s+need|should\s+include|needs\s+to\s+have)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_SITE_BRIEF_REQUIREMENT_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:3d|animation|bilder|bild|foton|photo|photos|image|images|video)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:hero|cta|galleri|gallery|booking|bokning|shop|e-handel|sortiment|meny)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:kontaktformulär|contact\s+form|blogg|blog|sektioner|sections|sidor|pages)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:första\s+sidan|startsidan|landing\s+page|homepage|multi-page|flersidig|tre\s+sidor|three\s+pages)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_VAGUE_EDIT_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:förbättra|förfina|justera|uppdatera|ändra|fixa|trimma)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:improve|refine|adjust|update|fix|polish|tweak)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:gör\s+det\s+bättre|kan\s+du\s+förbättra|kan\s+du\s+fixa|make\s+it\s+better|can\s+you\s+improve)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_EXPLICIT_DIRECTION_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:nuvarande\s+design|behåll\s+nuvarande\s+design|samma\s+design)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:current\s+design|keep\s+the\s+current\s+design|same\s+design)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_SPECIFIC_TARGET_PATTERNS = [
  // Svenska bestämda/pluralformer måste räknas: `knapp` matchade inte
  // `knappen`/`knapparna` (negativ look-ahead stoppade på böjningen), så
  // "ändra knappen till Skicka" föll i ambiguous-followup trots tydligt mål.
  // `SM-053`: engelsk plural (`headers`, `footers`) och svensk pluralbestämd
  // form (`layouterna`, `logotyperna`) saknades, så "ändra layouterna" föll i
  // ambiguous-followup trots ett utpekat mål. Additiva mönster här kan bara
  // MINSKA antalet klargörande frågor — det är den säkra riktningen i den här
  // filen. Utöka aldrig i motsatt riktning.
  /(?<![\p{L}\p{N}_])(?:hero(?:n|ns)?|footer(?:n|ns|s)?|header(?:n|ns|s)?|nav(?:en|ens)?|navigation(?:en|ens)?|layout(?:en|ens|er|erna|ernas)?|spacing(?:en|ens)?|copy(?:n|ns)?|text(?:en|er|erna|ens)?|färg(?:en|er|erna|ens)?|colors?|bild(?:en|er|erna|ens)?|images?|animation(?:en|er|erna|ens)?|knapp(?:en|ar|arna|ens|arnas)?|buttons?)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:sections?|sektion(?:en|er|erna|ens)?|cards?|kort(?:et|en|ens)?|fonts?|typografi(?:n|ns)?|logo(?:t|n|ns)?|logotyp(?:en|ens|er|erna|ernas)?|cta(?:t|n)?|pricing|pris(?:et|ens)?|kontakt(?:en|uppgifter(?:na)?)?|about|seo)(?![\p{L}\p{N}_])/iu,
  // "rubrik"/"title"/"headline" var tidigare okända targets — "Ändra rubriken
  // till Hej" föll därför i ambiguous-followup fast det är en specifik edit.
  /(?<![\p{L}\p{N}_])(?:rubrik|rubriken|title|titeln|headline|underrubrik|tagline|slogan)(?![\p{L}\p{N}_])/iu,
  // Layout-/meny-targets som saknade engelsk stam ("spacing") eller bestämd form.
  // `marginal` bare = engelsk adjektiv ("fix marginal issues") — kräv svensk böjning.
  /(?<![\p{L}\p{N}_])(?:padding(?:en|ens)?|marginal(?:en|er|erna|ens)|margins?|meny(?:n|ns)?|menus?|stavfel(?:et|en|ens)?)(?![\p{L}\p{N}_])/iu,
  /\b(?:page\.tsx|layout\.tsx|globals\.css|app\/|src\/)\b/i,
];

/**
 * Design-intent-signaler i follow-ups. Användas för att pinna `app/globals.css`
 * + `app/layout.tsx` i light-context så att bygg-LLM:n får befintliga
 * gradient-/oklch-värden när prompten rör visuell identitet. Frikopplad från
 * {@link classifyFollowUpIntent} eftersom pinning även är värdefull för
 * mjukare prompts som "lägg till animation i bakgrunden" (där intent
 * fortfarande är clear-refine, men kontexten behöver inkludera stilfilen).
 */
// Använder Unicode-aware look-arounds istället för \b — JS-default \b matchar
// inte mellan ASCII och svenska tecken (ä/ö/å räknas som non-word), vilket
// innebär att /\bändra\b/ aldrig matchar "ändra" i början av ett ord.
const FOLLOW_UP_DESIGN_PIN_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(bakgrund(?:en|er|sbild)?|färg(?:er|en|schema|schemat)?|tema|teman|temat|animation(?:en|er)?|ljus(?:t|are)?|mörk(?:t|are)?|stil(?:en|ar)?|look(?:en)?)(?![\p{L}\p{N}_])/iu,
];

export function hasDesignFollowUpSignal(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return FOLLOW_UP_DESIGN_PIN_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Verb+noun-kombination som signalerar genuin redesign på milda men tydliga
 * design-prompts ("byt till mörkt tema", "ny stil på hero"). Skärpt mot
 * Fix B-spec så att lösa enskilda verb (t.ex. "ändra rubriken till X") INTE
 * triggar — verb måste paras med ett design-noun i samma prompt.
 */
// Unicode-aware look-arounds (se kommentar ovan vid FOLLOW_UP_DESIGN_PIN_PATTERNS).
const FOLLOW_UP_REDESIGN_VERB_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(byt(?:er|t)?|ändra(?:r|de|t)?|gör\s+om|ny|nytt|nya)(?![\p{L}\p{N}_])/iu,
];
const FOLLOW_UP_REDESIGN_NOUN_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(färg(?:er|en|schema|schemat)?|tema|teman|temat|bakgrund(?:en|er|sbild)?|stil(?:en|ar)?|look(?:en)?|design(?:en|ade)?)(?![\p{L}\p{N}_])/iu,
];

function hasRedesignVerbNounCombo(message: string): boolean {
  const hasVerb = FOLLOW_UP_REDESIGN_VERB_PATTERNS.some((re) => re.test(message));
  if (!hasVerb) return false;
  const hasNoun = FOLLOW_UP_REDESIGN_NOUN_PATTERNS.some((re) => re.test(message));
  return hasNoun;
}

/**
 * Interaktions-scopade prompts ("när jag hovrar …", "vid klick …") beskriver
 * micro-interaktioner på befintliga element — aldrig en helsajtsredesign.
 * `h[oå]o?vr` täcker hovra/hovrar och vanliga felstavningar ("hoovrar").
 */
// Unicode-aware look-arounds (se kommentar vid FOLLOW_UP_DESIGN_PIN_PATTERNS).
const FOLLOW_UP_INTERACTION_SCOPE_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:h[oå]o?vr\w*|hover(?:ing|s)?|mouse\s*over|muspekar\w*)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:klick\w*|click\w*|scroll\w*)(?![\p{L}\p{N}_])/iu,
];

/**
 * QW-hover (prod chat 0d52e5c9, 2026-07-31): "…vill jag att färgerna på text
 * och ikoner ska ändra färger" vid hover + fokuspunkter klassades som
 * `clear-redesign` via verb+noun-kombon ("ändra" + "färger") och skrev om
 * hela templaten aggressivt. Kombon är en SVAG signal och får inte ensam
 * eskalera en interaktions-scopad eller element-utpekad prompt till redesign.
 * Explicita redesign-fraser ({@link FOLLOW_UP_REDESIGN_PATTERNS}) påverkas
 * inte av den här dämpningen.
 */
function hasTargetedInteractionScope(message: string): boolean {
  if (message.includes(FOLLOW_UP_FOCUS_POINT_MARKER)) return true;
  return FOLLOW_UP_INTERACTION_SCOPE_PATTERNS.some((re) => re.test(message));
}

/**
 * High-precision phrases where we should re-run scaffold resolution even if
 * {@link classifyFollowUpIntent} returns neutral (e.g. user vocabulary differs).
 */
const PERSISTED_SCAFFOLD_UNLOCK_SUPPLEMENT_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])full(?:\s+|-)?redesign(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:total|complete|komplett)\s+redesign(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])gör\s+om\s+(?:hela\s+)?(?:sajten|webbplatsen|sidan)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:website|sajt|site)\s+from\s+scratch(?![\p{L}\p{N}_])/iu,
];

/**
 * Follow-ups: when true, {@link resolveOrchestrationBase} should not lock to the chat's
 * persisted scaffold — re-match so an EXPLICIT redesign can switch scaffold.
 *
 * Scaffold-freeze policy (2026-07-03): a follow-up keeps the frozen scaffold in the
 * vast majority of cases. Only an explicit `clear-redesign` intent or an explicit
 * redesign phrase ({@link PERSISTED_SCAFFOLD_UNLOCK_SUPPLEMENT_PATTERNS}) unlocks a
 * rematch. A capability follow-up like "build a playable minigame on /spel" now KEEPS
 * the current scaffold and adds the feature as a new route — it no longer rebases the
 * whole site onto another scaffold (prod chat 69aae3d5 rebased a landing-page site to
 * base-nextjs mid-chat, which the user experienced as "everything broke"). If a user
 * genuinely wants to pivot the whole site to a game, they say so ("gör om hela sajten",
 * clear-redesign). Games at INIT are unaffected — init has no persisted scaffold.
 *
 * Requires previous files, no explicit scaffold pin for this message, and auto mode.
 */
export function shouldIgnorePersistedScaffoldForMatch(params: {
  hasPreviousFiles: boolean;
  followUpIntent: FollowUpIntentMode;
  message: string;
  scaffoldMode: "auto" | "manual" | "off";
  scaffoldId?: string | null;
}): boolean {
  const { hasPreviousFiles, followUpIntent, message, scaffoldMode, scaffoldId } = params;
  if (!hasPreviousFiles) return false;
  // "off" (Scaffold: Av) must still allow clear-redesign unlock — otherwise Av
  // in the header freezes the contract forever. Unlock re-applies the Av
  // baseline via resolve-base (persisted cleared → off branch).
  if (scaffoldMode !== "auto" && scaffoldMode !== "off") return false;
  if (scaffoldId) return false;

  const wantsUnlock =
    followUpIntent === "clear-redesign" ||
    PERSISTED_SCAFFOLD_UNLOCK_SUPPLEMENT_PATTERNS.some((re) => re.test(message));

  if (!wantsUnlock) return false;

  return true;
}

export type FollowUpClarificationReason =
  | "followup_redesign_ambiguous"
  | "followup_edit_underspecified";

export type FollowUpClarification = {
  question: string;
  options: string[];
  reason: FollowUpClarificationReason;
  intro: string;
  toolCallPrefix: string;
};

function isUnderspecifiedFollowUp(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 300) return false;
  if (!FOLLOW_UP_VAGUE_EDIT_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  if (FOLLOW_UP_EXPLICIT_DIRECTION_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  if (FOLLOW_UP_SPECIFIC_TARGET_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  const words = trimmed.split(/\s+/);
  if (words.length <= 10) return true;
  const specificTargetCount = countPatternMatches(FOLLOW_UP_SPECIFIC_TARGET_PATTERNS, trimmed);
  return specificTargetCount === 0 && words.length <= 25;
}

function countPatternMatches(patterns: RegExp[], message: string): number {
  return patterns.reduce(
    (count, pattern) => count + (pattern.test(message) ? 1 : 0),
    0,
  );
}

/**
 * QW-3: en explicit "starta om / bygg om / redesign"-signal måste finnas i
 * meddelandet innan vi klassar det som full redesign. Annars klassades
 * legitima utbyggnads-prompts som "Lägg till en spa-sektion på hemsidan
 * med bilder och bokningsknapp" som clear-redesign och triggade en
 * scaffold-omval + delta-brief-regenerering — vilket bytte ut den befintliga
 * visuella identiteten på en sajt som användaren bara ville utöka.
 */
const NEW_BUILD_INTENT_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:ny\s+hemsida|helt\s+ny|from\s+scratch|starta\s+om|bygg\s+om\s+hela|gör\s+om\s+hela|redesign|rebrand|restyle)(?![\p{L}\p{N}_])/iu,
];

function looksLikeDetailedNewSiteBrief(message: string): boolean {
  const trimmed = message.trim();
  // QW-3: höjt min-längd 80 -> 200 så små "lägg till X"-prompts inte träffas.
  if (trimmed.length < 200) return false;

  const mentionsNewSite = FOLLOW_UP_NEW_SITE_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!mentionsNewSite) return false;

  const hasBriefIntent = FOLLOW_UP_SITE_BRIEF_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!hasBriefIntent) return false;

  // QW-3: kräver explicit nybygg-/redesign-signal — bara längd + ord-ur-domänen
  // räcker inte. Förhindrar rugpull-redesign på legitima utbyggnads-prompts.
  const hasNewBuildIntent = NEW_BUILD_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!hasNewBuildIntent) return false;

  // QW-3: skärpt requirement-tröskel 2 -> 3 så random ord-träffar inte räknas.
  // Behåller dock lång-text-undantaget (>= 320 tecken) så genuint utförliga
  // briefs inte missas — bara medel-långa "lägg till"-prompts.
  const requirementMatches = countPatternMatches(FOLLOW_UP_SITE_BRIEF_REQUIREMENT_PATTERNS, trimmed);
  return requirementMatches >= 3 || trimmed.length >= 320;
}

export function classifyFollowUpIntent(message: string): FollowUpIntentMode {
  const trimmed = message.trim();
  if (!trimmed) return "neutral";
  const suppressRedesign = hasNegatedRedesignIntent(trimmed);
  if (!suppressRedesign && FOLLOW_UP_REDESIGN_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "clear-redesign";
  }
  if (
    !suppressRedesign &&
    !hasTargetedInteractionScope(trimmed) &&
    hasRedesignVerbNounCombo(trimmed)
  ) {
    return "clear-redesign";
  }
  if (!suppressRedesign && looksLikeDetailedNewSiteBrief(trimmed)) {
    return "clear-redesign";
  }
  const mentionsNewSite = FOLLOW_UP_NEW_SITE_PATTERNS.some((pattern) => pattern.test(trimmed));
  const soundsLikeBuildRequest = FOLLOW_UP_BUILD_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (mentionsNewSite && soundsLikeBuildRequest) {
    return "ambiguous-redesign";
  }
  if (isUnderspecifiedFollowUp(trimmed)) {
    return "ambiguous-followup";
  }
  // Plan 06 (2026-04-24): capability-add beats clear-refine when the prompt
  // names a dossier-mappable capability. Without this branch a follow-up
  // like "lägg till en kontaktform" classified as `clear-refine` because
  // "lägg till" is a refine verb — and downstream variant-lock + dossier
  // selection both treat refine as "no capability change", so the dossier
  // never got injected. Plan 01 smoke run 2 ("Skapa en 3d-kaffekopp som
  // hoovrar och flyger ovanför") was the headline failure: the prompt
  // detects `visual-3d` here and now routes through capability-add instead
  // of falling all the way to neutral.
  const capabilityDetection = detectFollowUpCapabilities(trimmed);
  if (capabilityDetection.capabilityIds.length > 0) {
    // Plan 11 / open-question #12: "gör pricken till en kaffekopp …"
    // names a capability AND points at an existing on-page element. The
    // user wants the existing scene/feature mutated, not a brand new
    // dossier shell injected on top of it. Downstream the
    // `capability-modify` branch suppresses dossier-shell re-injection
    // and instead points the LLM at the existing scene file with a
    // "modify this" hint.
    if (capabilityDetection.referencesExistingCapability) {
      return "capability-modify";
    }
    return "capability-add";
  }
  if (FOLLOW_UP_REFINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "clear-refine";
  }
  return "neutral";
}

export function resolveFollowUpClarification(message: string): FollowUpClarification | null {
  switch (classifyFollowUpIntent(message)) {
    case "ambiguous-redesign":
      return {
        question: "Vill du att jag förfinar den nuvarande sajten eller behandlar detta som en riktig redesign?",
        options: [
          "Förfina nuvarande design",
          "Gör en tydlig redesign i samma projekt",
          "Starta om från en ny grund",
        ],
        reason: "followup_redesign_ambiguous",
        intro:
          "Jag kan fortsätta direkt, men först behöver jag veta om du vill förfina den nuvarande sajten eller göra en verklig redesign.",
        toolCallPrefix: "clarify-redesign",
      };
    case "ambiguous-followup":
      return {
        question: "Vad vill du att jag fokuserar på i nästa ändring?",
        options: [
          "Layout och design",
          "Text och innehåll",
          "Ny sektion eller sida",
          "Tydlig redesign",
        ],
        reason: "followup_edit_underspecified",
        intro:
          "Jag kan fortsätta direkt, men din follow-up är lite för öppen. Säg gärna vad du vill att jag prioriterar i nästa ändring.",
        toolCallPrefix: "clarify-followup",
      };
    default:
      return null;
  }
}

export async function persistFollowUpClarification(params: {
  chatId: string;
  message: string;
  clarification: FollowUpClarification;
  addMessage: (
    chatId: string,
    role: "user" | "assistant",
    content: string,
    parentMessageId?: string | undefined,
    uiParts?: Array<Record<string, unknown>> | undefined,
  ) => Promise<unknown>;
}): Promise<void> {
  const { chatId, message, clarification, addMessage } = params;

  try {
    await addMessage(chatId, "user", message);
  } catch {
    // Best effort persistence only.
  }

  try {
    await addMessage(chatId, "assistant", clarification.question, undefined, [{
      type: "tool:awaiting-input",
      toolName: "Klargörande fråga",
      state: "approval-requested",
      output: {
        question: clarification.question,
        options: clarification.options,
        kind: "scope",
        blocking: true,
        reason: clarification.reason,
        awaitingInput: true,
        // Machine-readable retry marker (prod chat e8bd3ba6): the next turn's
        // collectFollowUpClarificationAnswer() recovers the ORIGINAL follow-up
        // prompt when the user answers with a quick-reply option — otherwise
        // the short option text becomes the whole generation prompt.
        // Deliberately NOT `f3Continuation` — same marker discipline as
        // buildF3AwaitingInputUiPart.
        followUpClarification: true,
        sourceUserMessage: message,
      },
    }]);
  } catch {
    // Best effort persistence only.
  }
}

/**
 * Heading for the wrapped retry prompt once a follow-up scope clarification
 * has been answered. Lives next to the clarification contract it belongs to;
 * deliberately distinct from `PROMPT_WRAPPER_HEADINGS.contractClarificationAnswer`
 * so the two clarification flows stay tellable-apart in prompt dumps.
 */
export const FOLLOW_UP_CLARIFICATION_ANSWER_HEADING =
  "## Follow-up Scope Clarification Answer";

export type FollowUpClarificationAnswerContext = {
  /** The original detailed follow-up request that triggered the clarification. */
  sourceUserMessage: string;
  question: string;
  /** The quick-reply option the user chose. */
  answer: string;
  consumed: true;
};

function readFollowUpClarificationMarker(
  message: Pick<Message, "ui_parts">,
): { question: string; options: string[]; sourceUserMessage: string } | null {
  const parts = Array.isArray(message.ui_parts) ? message.ui_parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if ((part as { type?: unknown }).type !== "tool:awaiting-input") continue;
    const output = (part as { output?: unknown }).output;
    if (!output || typeof output !== "object") continue;
    const record = output as Record<string, unknown>;
    if (record.followUpClarification !== true) continue;
    const question =
      typeof record.question === "string" ? record.question.trim() : "";
    const sourceUserMessage =
      typeof record.sourceUserMessage === "string"
        ? record.sourceUserMessage.trim()
        : "";
    const options = Array.isArray(record.options)
      ? record.options
          .map((option) => (typeof option === "string" ? option.trim() : ""))
          .filter(Boolean)
      : [];
    if (!question || !sourceUserMessage || options.length === 0) continue;
    return { question, options, sourceUserMessage };
  }
  return null;
}

/**
 * Known quick-reply strings from {@link resolveFollowUpClarification}.
 * Unknown persisted options stay exact-match-only — do not invent stems.
 * Lower rank = more specific; used when two stems both fire
 * ("gör om från grunden" → start-over, not redesign).
 */
const FOLLOW_UP_CLARIFICATION_PARAPHRASES: ReadonlyArray<{
  option: string;
  rank: number;
  match: RegExp;
  allowTokens: readonly string[];
}> = [
  {
    option: "Starta om från en ny grund",
    rank: 0,
    match: uWordRegex(
      "starta\\s+om|from\\s+scratch|start\\s+over|från\\s+(?:en\\s+)?(?:ny\\s+)?grund(?:en)?",
      "iu",
    ),
    allowTokens: [
      "starta",
      "om",
      "från",
      "en",
      "ny",
      "grund",
      "grunden",
      "from",
      "scratch",
      "start",
      "over",
    ],
  },
  {
    option: "Gör en tydlig redesign i samma projekt",
    rank: 1,
    match: uWordRegex(
      "(?:tydlig\\s+)?redesign|gör\\s+om|restyle|rebrand|samma\\s+projekt",
      "iu",
    ),
    allowTokens: [
      "gör",
      "en",
      "tydlig",
      "redesign",
      "om",
      "restyle",
      "rebrand",
      "samma",
      "projekt",
      "i",
    ],
  },
  {
    option: "Tydlig redesign",
    rank: 1,
    match: uWordRegex("(?:tydlig\\s+)?redesign|gör\\s+om|restyle|rebrand", "iu"),
    allowTokens: ["tydlig", "redesign", "gör", "om", "restyle", "rebrand", "en"],
  },
  {
    option: "Förfina nuvarande design",
    rank: 2,
    match: uWordRegex(
      "förfina(?:r|de|t)?|refine|behåll(?:er|t)?|keep(?:\\s+the)?\\s+current|nuvarande\\s+design(?:en)?",
      "iu",
    ),
    allowTokens: [
      "förfina",
      "förfinar",
      "refine",
      "behåll",
      "behåller",
      "nuvarande",
      "design",
      "designen",
      "current",
      "keep",
      "the",
    ],
  },
  {
    option: "Ny sektion eller sida",
    rank: 3,
    match: uWordRegex("ny\\s+sektion|ny\\s+sida|new\\s+section|new\\s+page", "iu"),
    allowTokens: [
      "ny",
      "sektion",
      "sektionen",
      "sida",
      "sidan",
      "new",
      "section",
      "page",
      "eller",
    ],
  },
  {
    option: "Text och innehåll",
    rank: 4,
    match: uWordRegex("text(?:en|er|erna)?|innehåll(?:et)?|copy(?:n)?", "iu"),
    allowTokens: ["text", "texten", "innehåll", "innehållet", "copy", "och"],
  },
  {
    option: "Layout och design",
    rank: 5,
    match: uWordRegex("layout(?:en|ens)?|(?<!re)design(?:en)?", "iu"),
    allowTokens: ["layout", "layouten", "design", "designen", "och"],
  },
];

const CLARIFICATION_PARAPHRASE_MAX_CHARS = 80;
const CLARIFICATION_PARAPHRASE_MAX_WORDS = 12;

/** Page/element targets that mean "new edit", not "I am answering the scope question". */
const CLARIFICATION_OFF_TOPIC_TARGET = uWordRegex(
  [
    "hero(?:n|ns)?",
    "footer(?:n|ns|s)?",
    "header(?:n|ns|s)?",
    "nav(?:en|ens)?",
    "navigation(?:en|ens)?",
    "spacing(?:en|ens)?",
    "färg(?:en|er|erna|ens)?",
    "colors?",
    "bild(?:en|er|erna|ens)?",
    "images?",
    "photos?",
    "foton?",
    "bakgrund(?:en|sbild(?:en)?)?",
    "animation(?:en|er|erna|ens)?",
    "knapp(?:en|ar|arna|ens|arnas)?",
    "buttons?",
    "cards?",
    "kort(?:et|en|ens)?",
    "fonts?",
    "typografi(?:n|ns)?",
    "logo(?:t|n|ns)?",
    "logotyp(?:en|ens|er|erna)?",
    "cta(?:t|n)?",
    "pricing",
    "pris(?:et|ens)?",
    "kontakt(?:en|formulär(?:et)?)?",
    "about",
    "seo",
    "padding(?:en|ens)?",
    "marginal(?:en|er|erna|ens)?",
    "margins?",
    "meny(?:n|ns)?",
    "menus?",
    "stavfel(?:et|en|ens)?",
    "rubrik(?:en|er|erna)?",
    "title(?:n)?",
    "headline",
    "underrubrik",
    "tagline",
    "slogan",
    "formulär(?:et)?",
    "forms?",
  ].join("|"),
  "iu",
);

const CLARIFICATION_NEGATION = uWordRegex(
  "inte|ej|aldrig|not|don'?t|do\\s+not",
  "iu",
);

const CLARIFICATION_FILLER_TOKENS = new Set([
  "jag",
  "vill",
  "att",
  "du",
  "ni",
  "ska",
  "kan",
  "tack",
  "ja",
  "nej",
  "den",
  "det",
  "de",
  "en",
  "ett",
  "och",
  "eller",
  "på",
  "i",
  "för",
  "med",
  "som",
  "lite",
  "bara",
  "nog",
  "väl",
  "gärna",
  "alltså",
  "då",
  "så",
  "om",
  "till",
  "av",
  "är",
  "var",
  "ha",
  "har",
  "behöver",
  "önskar",
  "please",
  "thanks",
  "the",
  "a",
  "an",
  "to",
  "for",
  "on",
  "of",
  "just",
  "so",
  "my",
  "me",
  "we",
  "you",
  "this",
  "that",
  "focus",
  "fokusera",
  "prioritera",
  "välj",
  "kör",
  "gör",
  "behövs",
  "nu",
  "här",
  "där",
]);

function findPersistedOption(options: string[], canonical: string): string | undefined {
  const needle = canonical.toLowerCase();
  return options.find((option) => option.toLowerCase() === needle);
}

function hasResidualContent(
  reply: string,
  allowTokens: readonly string[],
): boolean {
  const allow = new Set([
    ...CLARIFICATION_FILLER_TOKENS,
    ...allowTokens.map((token) => token.toLowerCase()),
  ]);
  const tokens = reply
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return tokens.some((token) => !allow.has(token));
}

/**
 * Maps a free-typed reply to one persisted quick-reply option, or null.
 * Fail-safe: when in doubt, treat the reply as a new prompt.
 */
function matchFollowUpClarificationOption(
  reply: string,
  options: string[],
): string | null {
  const exact = options.find((option) => option.toLowerCase() === reply.toLowerCase());
  if (exact) return exact;

  if (reply.length > CLARIFICATION_PARAPHRASE_MAX_CHARS) return null;
  const words = reply.split(/\s+/).filter(Boolean);
  if (words.length > CLARIFICATION_PARAPHRASE_MAX_WORDS) return null;
  if (CLARIFICATION_NEGATION.test(reply)) return null;
  if (CLARIFICATION_OFF_TOPIC_TARGET.test(reply)) return null;

  const hits = FOLLOW_UP_CLARIFICATION_PARAPHRASES.filter(
    (row) => findPersistedOption(options, row.option) && row.match.test(reply),
  );
  if (hits.length === 0) return null;

  const bestRank = Math.min(...hits.map((row) => row.rank));
  const best = hits.filter((row) => row.rank === bestRank);
  if (best.length !== 1) return null;
  if (hasResidualContent(reply, best[0].allowTokens)) return null;

  return findPersistedOption(options, best[0].option) ?? null;
}

/**
 * Collects a follow-up SCOPE clarification answer from chat history
 * ({@link persistFollowUpClarification}). Finds the latest
 * assistant message carrying the `followUpClarification` marker with no user
 * message after it (same pending semantics as `getLatestPendingReply` /
 * `hasUserMessageAfter` in BuilderMessageTooling).
 *
 * `currentReply` is consumed when it is either:
 * 1. an exact persisted option (trim + case-insensitive — the client sends
 *    the option verbatim), or
 * 2. a conservative paraphrase of exactly one persisted option (SM-041).
 *
 * A free-typed reply that looks like a NEW instruction — specific page
 * target, negation, leftover content after the option stems, or a longer
 * brief — is a new prompt and must not be consumed. #734 locked that
 * direction so a new order is never glued onto the previous request;
 * gluing a new brief onto the old prompt is worse than dropping context.
 */
export function collectFollowUpClarificationAnswer(
  messages: Array<Pick<Message, "role" | "content" | "ui_parts">>,
  currentReply?: string | null,
): FollowUpClarificationAnswerContext | null {
  const reply = typeof currentReply === "string" ? currentReply.trim() : "";
  if (!reply) return null;
  if (!Array.isArray(messages)) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    // A DIFFERENT user message after the clarification means the question was
    // superseded — nothing pending. A user message IDENTICAL to the current
    // reply is a prior attempt of the same answer (the handler persists the
    // user row before codegen, so a failed/retried generation leaves the
    // option text in history — bugbot on this diff): skip it so the retry
    // still recovers the original prompt instead of re-orchestrating the bare
    // option. Trade-off, mirrored from how rare it is: re-sending the exact
    // option string after a SUCCESSFUL turn also re-consumes the marker and
    // re-attaches the original request — coherent (same instruction, same
    // scope) and far less harmful than the lost-instructions failure.
    if (message.role === "user") {
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (content.toLowerCase() === reply.toLowerCase()) continue;
      return null;
    }
    if (message.role !== "assistant") continue;
    const marker = readFollowUpClarificationMarker(message);
    if (!marker) continue;
    const matchedOption = matchFollowUpClarificationOption(reply, marker.options);
    if (!matchedOption) return null;
    return {
      sourceUserMessage: marker.sourceUserMessage,
      question: marker.question,
      answer: matchedOption,
      consumed: true,
    };
  }
  return null;
}

/**
 * Intent for the turn that CONSUMES a scope-clarification answer. The chosen
 * quick-reply option carries intent the original (ambiguous) prompt lacked —
 * "Gör en tydlig redesign i samma projekt" must classify `clear-redesign`
 * exactly as it did when the option text was the whole message, otherwise
 * delta-brief/scaffold-unlock never run despite the user's explicit choice.
 * Precedence: a clear signal in the answer wins; otherwise a clear signal in
 * the original prompt; never an `ambiguous-*` mode — the user just resolved
 * the ambiguity, and the consuming turn skips re-clarification.
 * Deterministic by design (the options are a fixed set), so this deliberately
 * bypasses the small-llm strategy router.
 */
export function classifyFollowUpClarificationAnswerIntent(
  answer: string,
  sourceUserMessage: string,
): FollowUpIntentMode {
  const isClear = (mode: FollowUpIntentMode) =>
    mode !== "neutral" && mode !== "ambiguous-redesign" && mode !== "ambiguous-followup";
  const fromAnswer = classifyFollowUpIntent(answer);
  if (isClear(fromAnswer)) return fromAnswer;
  const fromSource = classifyFollowUpIntent(sourceUserMessage);
  if (isClear(fromSource)) return fromSource;
  return "neutral";
}

export function buildAwaitingClarificationStream(params: {
  chatId: string;
  clarification: FollowUpClarification;
}) {
  const { chatId, clarification } = params;
  const enc = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
      controller.enqueue(
        enc.encode(
          formatSSEEvent("tool-call", {
            toolName: "askClarifyingQuestion",
            toolCallId: `${clarification.toolCallPrefix}:${chatId}:${Date.now()}`,
            args: {
              question: clarification.question,
              options: clarification.options,
              kind: "scope",
              blocking: true,
            },
          }),
        ),
      );
      controller.enqueue(enc.encode(formatSSEEvent("content", clarification.intro)));
      controller.enqueue(
        enc.encode(
          formatSSEEvent("done", {
            chatId,
            versionId: null,
            messageId: null,
            ...previewUrlField(null),
            awaitingInput: true,
            awaitingInputPrompt: clarification.question,
            reason: clarification.reason,
          }),
        ),
      );
      controller.close();
    },
  });
}
