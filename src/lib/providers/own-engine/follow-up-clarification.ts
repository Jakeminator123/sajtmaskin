import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";

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

export type FollowUpIntentMode =
  | "clear-refine"
  | "clear-redesign"
  | "ambiguous-redesign"
  | "ambiguous-followup"
  | "neutral";

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
 * Requires previous files, no explicit scaffold pin for this message, and auto/manual mode.
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
  if (scaffoldId) return false;

  const wantsUnlock =
    followUpIntent === "clear-redesign" ||
    PERSISTED_SCAFFOLD_UNLOCK_SUPPLEMENT_PATTERNS.some((re) => re.test(message));

  if (!wantsUnlock) return false;

  return scaffoldMode === "auto" || scaffoldMode === "manual";
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

function looksLikeDetailedNewSiteBrief(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 80) return false;

  const mentionsNewSite = FOLLOW_UP_NEW_SITE_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!mentionsNewSite) return false;

  const hasBriefIntent = FOLLOW_UP_SITE_BRIEF_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!hasBriefIntent) return false;

  const requirementMatches = countPatternMatches(FOLLOW_UP_SITE_BRIEF_REQUIREMENT_PATTERNS, trimmed);
  return requirementMatches >= 2 || trimmed.length >= 160;
}

export function classifyFollowUpIntent(message: string): FollowUpIntentMode {
  const trimmed = message.trim();
  if (!trimmed) return "neutral";
  if (FOLLOW_UP_REDESIGN_PATTERNS.some((pattern) => pattern.test(trimmed))) {
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
