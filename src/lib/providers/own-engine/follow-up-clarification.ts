import { generateText } from "ai";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { createDirectModel } from "@/lib/builder/gateway-policy";
import {
  FOLLOW_UP_INTENT_MODES,
  type FollowUpIntentMode,
} from "@/lib/gen/follow-up-intent-types";

export type { FollowUpIntentMode };

const FOLLOW_UP_REFINE_PATTERNS = [
  /\b(förfina|förbättra|justera|uppdatera|ändra|byt ut|lägg till|fixa|trimma)\b/i,
  /\b(refine|improve|update|adjust|tweak|fix|keep the current design)\b/i,
  /\b(förfina nuvarande design|behåll nuvarande design)\b/i,
];
const FOLLOW_UP_REDESIGN_PATTERNS = [
  /\b(redesign|rebrand|restyle|start over|from scratch)\b/i,
  /\b(gör om från grunden|helt ny riktning|helt annan stil|byt stil helt)\b/i,
  /\b(tydlig redesign|starta om från en ny grund)\b/i,
];
const FOLLOW_UP_NEW_SITE_PATTERNS = [
  /\b(hemsida|sajt|landningssida|startsida)\b/i,
  /\b(website|site|homepage|landing page|one-pager)\b/i,
];
const FOLLOW_UP_BUILD_PATTERNS = [/\b(bygg|skapa|gör|designa)\b/i, /\b(build|create|make|design)\b/i];
const FOLLOW_UP_SITE_BRIEF_INTENT_PATTERNS = [
  /\b(vill ha|behöver|önskar|ska vara|ska innehålla)\b/i,
  /\b(i want|we want|i need|we need|should include|needs to have)\b/i,
];
const FOLLOW_UP_SITE_BRIEF_REQUIREMENT_PATTERNS = [
  /\b(3d|animation|bilder|bild|foton|photo|photos|image|images|video)\b/i,
  /\b(hero|cta|galleri|gallery|booking|bokning|shop|e-handel|sortiment|meny)\b/i,
  /\b(kontaktformulär|contact form|blogg|blog|sektioner|sections|sidor|pages)\b/i,
  /\b(första sidan|startsidan|landing page|homepage|multi-page|flersidig|tre sidor|three pages)\b/i,
];
const FOLLOW_UP_VAGUE_EDIT_PATTERNS = [
  /\b(förbättra|förfina|justera|uppdatera|ändra|fixa|trimma)\b/i,
  /\b(improve|refine|adjust|update|fix|polish|tweak)\b/i,
  /\b(gör det bättre|kan du förbättra|kan du fixa|make it better|can you improve)\b/i,
];
const FOLLOW_UP_EXPLICIT_DIRECTION_PATTERNS = [
  /\b(nuvarande design|behåll nuvarande design|samma design)\b/i,
  /\b(current design|keep the current design|same design)\b/i,
];
const FOLLOW_UP_SPECIFIC_TARGET_PATTERNS = [
  /\b(hero|footer|header|nav|navigation|layout|spacing|copy|text|färg|color|bild|image|animation|knapp|button)\b/i,
  /\b(section|sektion|card|kort|font|typografi|logo|cta|pricing|pris|kontakt|about|seo)\b/i,
  /\b(page\.tsx|layout\.tsx|globals\.css|app\/|src\/)\b/i,
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
  /\bfull(?:\s+|-)?redesign\b/i,
  /\b(total|complete|komplett)\s+redesign\b/i,
  /\bgör\s+om\s+(?:hela\s+)?(?:sajten|webbplatsen|sidan)\b/i,
  /\b(website|sajt|site)\s+from\s+scratch\b/i,
];

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
  /\b(ny hemsida|helt ny|from scratch|starta om|bygg om hela|gör om hela|redesign|rebrand|restyle)\b/i,
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
// gpt-4.1 med 2s timeout som double-check. Cachas per chatId+messageHash så
// samma meddelande aldrig betalar två gånger inom samma process.
// ────────────────────────────────────────────────────────────────────────

const LLM_FALLBACK_MIN_WORDS = 80;
const LLM_FALLBACK_TIMEOUT_MS = 2_000;
const LLM_FALLBACK_MODEL = "openai/gpt-4.1";

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
      "Returnera EXAKT en av etiketterna: clear-refine, clear-redesign, ambiguous-redesign, ambiguous-followup, neutral. " +
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
