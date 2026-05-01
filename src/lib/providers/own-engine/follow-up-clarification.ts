import { generateText } from "ai";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { createDirectModel } from "@/lib/builder/direct-model";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import {
  FOLLOW_UP_INTENT_MODES,
  type FollowUpIntentMode,
} from "@/lib/gen/follow-up-intent-types";

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
  /(?<![\p{L}\p{N}_])(?:hero|footer|header|nav|navigation|layout|spacing|copy|text|färg|color|bild|image|animation|knapp|button)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:section|sektion|card|kort|font|typografi|logo|cta|pricing|pris|kontakt|about|seo)(?![\p{L}\p{N}_])/iu,
  // "rubrik"/"title"/"headline" var tidigare okända targets — "Ändra rubriken
  // till Hej" föll därför i ambiguous-followup fast det är en specifik edit.
  /(?<![\p{L}\p{N}_])(?:rubrik|rubriken|title|titeln|headline|underrubrik|tagline|slogan)(?![\p{L}\p{N}_])/iu,
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
 * Major-change signals where a follow-up is no longer a small delta on the
 * current website: playable game/app logic, canvas interaction, physics,
 * scoring or collisions. These unlock scaffold rematching without widening
 * every visual-3d overlay into a full redesign.
 *
 * **Strictly narrower than `BEYOND_DOSSIER_MARKERS["visual-3d"]` in
 * `src/lib/builder/follow-up-capability-detection.ts` and `needsGame` /
 * `needsPhysics` in `src/lib/gen/capability-inference.ts`.** A bare
 * "lägg till en 3d-kaffekopp" detects `visual-3d` capability and may set
 * `needs3D` on the inferred capabilities, but must NOT unlock scaffold
 * rematch — see regression matrix in `follow-up-clarification.test.ts`.
 * Do not consolidate these three sources into a single regex bank without
 * preserving the per-consumer threshold (capability injection vs scaffold
 * unlock vs build-spec context policy).
 */
const FOLLOW_UP_MAJOR_CHANGE_UNLOCK_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:bygg|skapa|gör|designa|implementera|build|create|make|design|implement)[\s\S]{0,80}(?:spel|game|playable|arkad|arcade|pac-?man|pong|tetris)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:spel|game|playable|arkad|arcade|pac-?man|pong|tetris)[\s\S]{0,120}(?:poäng|score|level|nivå|bana|maze|labyrint|collision|kollision|physics|fysik|canvas|webgl)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:canvas-?spel|game\s+canvas|playable\s+canvas|interaktiv\s+canvas\s+där\s+man)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:physics(?:[-\s]?simulation)?|fysik(?:simulering)?|rapier|matter\.js|cannon)[\s\S]{0,120}(?:studs|bounce|collision|kollision|score|poäng|game|spel)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:spel|game|playable|canvas|webgl)[\s\S]{0,120}(?:score|poängsystem|poängtavla|leaderboard|collision|kollisioner?|hitbox|hitboxes)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:score|poängsystem|poängtavla|leaderboard|collision|kollisioner?|hitbox|hitboxes)[\s\S]{0,120}(?:spel|game|playable|canvas|webgl)(?![\p{L}\p{N}_])/iu,
];

function hasMajorChangeUnlockSignal(message: string): boolean {
  return FOLLOW_UP_MAJOR_CHANGE_UNLOCK_PATTERNS.some((re) => re.test(message));
}

/**
 * Follow-ups: when true, {@link resolveOrchestrationBase} should not lock to the chat's
 * persisted scaffold — re-match so redesign / new-IA requests can switch scaffold.
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
  if (scaffoldMode === "off") return false;
  if (scaffoldMode !== "auto") return false;
  if (scaffoldId) return false;

  const wantsUnlock =
    followUpIntent === "clear-redesign" ||
    PERSISTED_SCAFFOLD_UNLOCK_SUPPLEMENT_PATTERNS.some((re) => re.test(message)) ||
    hasMajorChangeUnlockSignal(message);

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
  if (FOLLOW_UP_REDESIGN_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "clear-redesign";
  }
  if (hasRedesignVerbNounCombo(trimmed)) {
    return "clear-redesign";
  }
  if (looksLikeDetailedNewSiteBrief(trimmed)) {
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
      },
    }]);
  } catch {
    // Best effort persistence only.
  }
}

// ────────────────────────────────────────────────────────────────────────
// P22: LLM safety net — när regex-pipen säger "neutral" men prompten är lång
// (>= 80 ord) finns risk för verklig redesign-intent som ordet missar. Ringer
// gpt-5.4-mini med 2s timeout som double-check. Cachas per chatId+messageHash
// så samma meddelande aldrig betalar två gånger inom samma process.
// (Bytt från gpt-4.1 → gpt-5.4-mini 2026-04-21 — bättre reasoning, samma
// prisklass; OpenAI:s migration guide rekommenderar denna ersättning.)
// ────────────────────────────────────────────────────────────────────────

const LLM_FALLBACK_MIN_WORDS = 80;
const LLM_FALLBACK_TIMEOUT_MS = 2_000;
const LLM_FALLBACK_MODEL = "openai/gpt-5.4-mini";

const _llmFallbackCache = new Map<string, FollowUpIntentMode>();

function hashMessage(message: string): string {
  // FNV-1a 32-bit — billig, stabil, ingen krypto-trygghet behövs.
  let hash = 0x811c9dc5;
  for (let i = 0; i < message.length; i += 1) {
    hash ^= message.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16);
}

function buildLlmFallbackCacheKey(chatId: string | null | undefined, message: string): string {
  return `${chatId ?? "_"}::${hashMessage(message.trim())}`;
}

function parseLlmIntentLabel(raw: string): FollowUpIntentMode | null {
  const cleaned = raw.trim().toLowerCase().replace(/^["'`]|["'`]$/g, "").trim();
  if (FOLLOW_UP_INTENT_MODES.has(cleaned as FollowUpIntentMode)) {
    return cleaned as FollowUpIntentMode;
  }
  return null;
}

export type ClassifyFollowUpIntentLlmCaller = (
  message: string,
  signal: AbortSignal,
) => Promise<string>;

export interface ClassifyFollowUpIntentWithLlmFallbackOptions {
  chatId?: string | null;
  /** Test seam: override the underlying LLM call. */
  llmCaller?: ClassifyFollowUpIntentLlmCaller;
  /** Test seam: skip the cache lookup/insert (default false). */
  bypassCache?: boolean;
  /** Override the timeout in ms (default 2_000). */
  timeoutMs?: number;
  /** Override the words-threshold (default 80). */
  minWords?: number;
}

async function defaultLlmCaller(message: string, signal: AbortSignal): Promise<string> {
  const model = createDirectModel(LLM_FALLBACK_MODEL);
  const result = await generateText({
    model,
    abortSignal: signal,
    temperature: 0,
    system:
      "Du klassar svenska och engelska follow-up-prompts på en webbsajt-byggare. " +
      "Returnera EXAKT en av etiketterna: clear-refine, clear-redesign, ambiguous-redesign, ambiguous-followup, capability-add, neutral. " +
      "Använd `capability-add` när användaren ber om att LÄGGA TILL en helt ny kapabilitet/feature (3D-scen, kontaktformulär, betalning, FAQ, pristabell etc.) ovanpå den existerande sajten. " +
      "Inget annat ord, ingen punkt.",
    prompt: message,
  });
  return result.text;
}

/**
 * Returnerar samma mode som {@link classifyFollowUpIntent}, men kör en
 * extra LLM-double-check när regex-svaret är `neutral` på en lång prompt.
 */
export async function classifyFollowUpIntentWithLlmFallback(
  message: string,
  options: ClassifyFollowUpIntentWithLlmFallbackOptions = {},
): Promise<FollowUpIntentMode> {
  const regexResult = classifyFollowUpIntent(message);
  if (regexResult !== "neutral") return regexResult;

  const trimmed = message.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const minWords = options.minWords ?? LLM_FALLBACK_MIN_WORDS;
  if (wordCount < minWords) return regexResult;

  const cacheKey = buildLlmFallbackCacheKey(options.chatId, message);
  if (!options.bypassCache) {
    const cached = _llmFallbackCache.get(cacheKey);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? LLM_FALLBACK_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const caller = options.llmCaller ?? defaultLlmCaller;
    const raw = await caller(trimmed, controller.signal);
    const parsed = parseLlmIntentLabel(raw);
    const result = parsed ?? regexResult;
    if (!options.bypassCache) {
      _llmFallbackCache.set(cacheKey, result);
    }
    return result;
  } catch {
    return regexResult;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Test-only: rensa LLM-fallback-cachen (används i unit-tester). */
export function _resetLlmFallbackCacheForTests(): void {
  _llmFallbackCache.clear();
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
