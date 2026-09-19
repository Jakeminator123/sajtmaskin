/**
 * Deterministiskt urval och bekräftade svar för kampanjens följdfrågor.
 *
 * Sajtagenten ska inte ställa generiska frågor. Urvalet tittar på luckorna i
 * `KostnadsfriAgentBrief` och ger högst tre direktiv. Svaren är typade
 * `KostnadsfriFollowupAnswers` — allowlist per fråge-ID, aldrig chattranskript
 * eller rå registerdata. Prompten till buildern är wizarddata + dessa
 * kundbekräftade fält (ägarbeslut 2026-09-15).
 */
import { resolveWizardIndustryHint } from "@/lib/builder/wizard-taxonomy";
import type { KostnadsfriAgentBrief } from "./agent-brief";
import { assertNoHospitalityGamingConflict } from "./industry-conflict";

export const KOSTNADSFRI_FOLLOWUP_LIMIT = 3;
export const KOSTNADSFRI_FOLLOWUP_ANSWER_MAX = 280;
export const KOSTNADSFRI_FOLLOWUP_ADDENDUM_MAX = 480;
export const KOSTNADSFRI_FOLLOWUP_PROMPT_HEADING = "Customer-confirmed follow-up";
export const KOSTNADSFRI_FOLLOWUPS_READY_EVENT = "sajtmaskin:kampanj-followups-ready";

export type KostnadsfriFollowupId =
  | "usp"
  | "targetAudience"
  | "industry"
  | "holding"
  | "booking"
  | "sell";

export type KostnadsfriFollowupReadyReason = "answered" | "skipped" | "continued";

export interface KostnadsfriFollowup {
  id: KostnadsfriFollowupId;
  /** Direktiv till modellen, inte en färdig replik i chatten. */
  directive: string;
  /** Kundvänd fråga i väntesteget. */
  question: string;
}

/**
 * Allowlistade, kundbekräftade fält per fråge-ID.
 *
 * - usp / targetAudience / holding → wizardfält
 * - industry → wizard-id bara vid säker allowlist-träff; annars `industryLabel`
 * - booking / sell → egna fält (finns inte i MiniWizardData) + addendum
 */
export interface KostnadsfriFollowupAnswers {
  usp?: string;
  targetAudience?: string;
  description?: string;
  industryId?: string;
  industryLabel?: string;
  bookingHours?: string;
  price?: string;
}

export interface KostnadsfriFollowupSession {
  questionIds: KostnadsfriFollowupId[];
  currentIndex: number;
  skippedIds: KostnadsfriFollowupId[];
  answers: KostnadsfriFollowupAnswers;
  completed: boolean;
  completeReason?: KostnadsfriFollowupReadyReason;
}

const PURPOSE_BOOKING = "Bokningar";
const PURPOSE_SELL = "Sälja";

const HOLDING_PHRASES = [
  "äga och förvalta aktier",
  "kapitalförvaltning",
  "holdingbolag",
] as const;

const FOLLOWUP_DIRECTIVE: Record<KostnadsfriFollowupId, string> = {
  usp: "Fråga vad som skiljer dem från konkurrenterna.",
  targetAudience: "Fråga vem sajten ska tala till.",
  industry: "Fråga vad verksamheten närmast liknar.",
  holding:
    "Verksamhetstexten låter som holding- eller förvaltningsprosa. Fråga vad bolaget faktiskt ska sälja eller erbjuda.",
  booking: "Fråga om öppettider eller hur kunder tar kontakt.",
  sell: "Fråga om prisbild.",
};

export const FOLLOWUP_QUESTION: Record<KostnadsfriFollowupId, string> = {
  usp: "Vad skiljer er från konkurrenterna?",
  targetAudience: "Vem ska sajten tala till?",
  industry: "Vad liknar verksamheten mest?",
  holding: "Vad ska bolaget faktiskt sälja eller erbjuda?",
  booking: "Hur tar kunder kontakt, och vilka öppettider har ni?",
  sell: "Vad är prisbilden?",
};

const FOLLOWUP_IDS: readonly KostnadsfriFollowupId[] = [
  "usp",
  "targetAudience",
  "industry",
  "holding",
  "booking",
  "sell",
];

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

function purposeLabelsOf(brief: Pick<KostnadsfriAgentBrief, "purposeLabels">): string[] {
  return brief.purposeLabels ?? [];
}

function clipAnswer(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, KOSTNADSFRI_FOLLOWUP_ANSWER_MAX);
}

function isFollowupId(value: unknown): value is KostnadsfriFollowupId {
  return typeof value === "string" && (FOLLOWUP_IDS as readonly string[]).includes(value);
}

/** Registerprosa som döljer vad bolaget egentligen säljer. */
export function isHoldingCompanyProse(description: string | undefined): boolean {
  if (!description) return false;
  const normalized = description.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return HOLDING_PHRASES.some((phrase) => normalized.includes(phrase));
}

function followupOf(id: KostnadsfriFollowupId): KostnadsfriFollowup {
  return { id, directive: FOLLOWUP_DIRECTIVE[id], question: FOLLOWUP_QUESTION[id] };
}

/**
 * Prioritetsordning, max tre. Luckor först, därefter holding, sist
 * syfte-härledda frågor om Bokningar eller Sälja.
 */
export function selectKostnadsfriFollowups(
  brief: Pick<
    KostnadsfriAgentBrief,
    "usp" | "targetAudience" | "industryLabel" | "businessDescription" | "purposeLabels"
  >,
): KostnadsfriFollowup[] {
  const selected: KostnadsfriFollowup[] = [];

  const push = (id: KostnadsfriFollowupId) => {
    if (selected.length >= KOSTNADSFRI_FOLLOWUP_LIMIT) return;
    if (selected.some((item) => item.id === id)) return;
    selected.push(followupOf(id));
  };

  if (!hasText(brief.usp)) push("usp");
  if (!hasText(brief.targetAudience)) push("targetAudience");
  if (!hasText(brief.industryLabel)) push("industry");
  if (isHoldingCompanyProse(brief.businessDescription)) push("holding");

  const purposes = purposeLabelsOf(brief);
  if (purposes.includes(PURPOSE_BOOKING)) push("booking");
  if (purposes.includes(PURPOSE_SELL)) push("sell");

  return selected;
}

export function emptyFollowupAnswers(): KostnadsfriFollowupAnswers {
  return {};
}

export function createFollowupSession(
  questionIds: readonly KostnadsfriFollowupId[],
): KostnadsfriFollowupSession {
  const ids = questionIds.filter(isFollowupId).slice(0, KOSTNADSFRI_FOLLOWUP_LIMIT);
  return {
    questionIds: ids,
    currentIndex: 0,
    skippedIds: [],
    answers: emptyFollowupAnswers(),
    completed: false,
  };
}

export function currentFollowupId(session: KostnadsfriFollowupSession): KostnadsfriFollowupId | null {
  if (session.completed) return null;
  return session.questionIds[session.currentIndex] ?? null;
}

export function applyFollowupAnswer(
  answers: KostnadsfriFollowupAnswers,
  id: KostnadsfriFollowupId,
  raw: string,
): KostnadsfriFollowupAnswers {
  const text = clipAnswer(raw);
  if (!text) return answers;

  switch (id) {
    case "usp":
      return { ...answers, usp: text };
    case "targetAudience":
      return { ...answers, targetAudience: text };
    case "holding":
      return { ...answers, description: text };
    case "industry": {
      const industryId = resolveWizardIndustryHint(text);
      if (industryId) {
        return { ...answers, industryId, industryLabel: undefined };
      }
      return { ...answers, industryId: undefined, industryLabel: text };
    }
    case "booking":
      return { ...answers, bookingHours: text };
    case "sell":
      return { ...answers, price: text };
  }
}

function finishSession(
  session: KostnadsfriFollowupSession,
  reason: KostnadsfriFollowupReadyReason,
): KostnadsfriFollowupSession {
  return {
    ...session,
    currentIndex: session.questionIds.length,
    completed: true,
    completeReason: reason,
  };
}

function advanceAfterResolution(
  session: KostnadsfriFollowupSession,
): KostnadsfriFollowupSession {
  const nextIndex = session.currentIndex + 1;
  if (nextIndex >= session.questionIds.length) {
    const reason: KostnadsfriFollowupReadyReason =
      session.skippedIds.length === session.questionIds.length && session.questionIds.length > 0
        ? "skipped"
        : "answered";
    return finishSession({ ...session, currentIndex: nextIndex }, reason);
  }
  return { ...session, currentIndex: nextIndex };
}

/** Tomt svar räknas inte. Tyst timeout ska anropa `applySilentFollowupTimeout`. */
export function recordFollowupAnswer(
  session: KostnadsfriFollowupSession,
  raw: string,
): KostnadsfriFollowupSession {
  if (session.completed) return session;
  const id = currentFollowupId(session);
  if (!id) return finishSession(session, "answered");
  const text = clipAnswer(raw);
  if (!text) return session;
  return advanceAfterResolution({
    ...session,
    answers: applyFollowupAnswer(session.answers, id, text),
  });
}

export function skipCurrentFollowup(session: KostnadsfriFollowupSession): KostnadsfriFollowupSession {
  if (session.completed) return session;
  const id = currentFollowupId(session);
  if (!id) return finishSession(session, "skipped");
  const skippedIds = session.skippedIds.includes(id) ? session.skippedIds : [...session.skippedIds, id];
  return advanceAfterResolution({ ...session, skippedIds });
}

export function skipAllFollowups(session: KostnadsfriFollowupSession): KostnadsfriFollowupSession {
  if (session.completed) return session;
  const remaining = session.questionIds.slice(session.currentIndex);
  const skippedIds = [...session.skippedIds];
  for (const id of remaining) {
    if (!skippedIds.includes(id)) skippedIds.push(id);
  }
  return finishSession({ ...session, skippedIds }, "skipped");
}

export function continueFollowups(session: KostnadsfriFollowupSession): KostnadsfriFollowupSession {
  if (session.completed) return session;
  return finishSession(session, "continued");
}

/** Tyst 3s-timer får inte stänga fasen eller starta bygget. */
export function applySilentFollowupTimeout(
  session: KostnadsfriFollowupSession,
): KostnadsfriFollowupSession {
  return session;
}

export type WizardFollowupEnrichment = {
  usp: string;
  targetAudience: string;
  description: string;
  industry: string;
};

export function applyFollowupAnswersToWizard<T extends WizardFollowupEnrichment>(
  wizard: T,
  answers: KostnadsfriFollowupAnswers,
): T {
  const next = {
    ...wizard,
    usp: answers.usp ?? wizard.usp,
    targetAudience: answers.targetAudience ?? wizard.targetAudience,
    description: answers.description ?? wizard.description,
    industry: answers.industryId ?? wizard.industry,
  };
  assertNoHospitalityGamingConflict(
    resolveWizardIndustryHint(next.industry),
    next.description,
    next.usp,
  );
  return next;
}

export function buildFollowupAddendum(answers: KostnadsfriFollowupAnswers): string {
  const lines: string[] = [];
  if (answers.bookingHours) {
    lines.push(`How customers get in touch / hours: ${answers.bookingHours}`);
  }
  if (answers.price) {
    lines.push(`Price picture: ${answers.price}`);
  }
  if (answers.industryLabel && !answers.industryId) {
    lines.push(`Industry in the customer's words: ${answers.industryLabel}`);
  }
  if (lines.length === 0) return "";
  const body = lines.map((line) => `- ${line}`).join("\n");
  const block = `\n${KOSTNADSFRI_FOLLOWUP_PROMPT_HEADING}:\n${body}`;
  return block.slice(0, KOSTNADSFRI_FOLLOWUP_ADDENDUM_MAX);
}

export function normalizeKostnadsfriFollowupAnswers(value: unknown): KostnadsfriFollowupAnswers {
  if (!value || typeof value !== "object") return emptyFollowupAnswers();
  const raw = value as Record<string, unknown>;
  const answers = emptyFollowupAnswers();
  const take = (key: keyof KostnadsfriFollowupAnswers) => {
    if (typeof raw[key] !== "string") return;
    const text = clipAnswer(raw[key]);
    if (text) answers[key] = text;
  };
  take("usp");
  take("targetAudience");
  take("description");
  take("industryLabel");
  take("bookingHours");
  take("price");
  if (typeof raw.industryId === "string") {
    const industryId = resolveWizardIndustryHint(raw.industryId);
    if (industryId) answers.industryId = industryId;
  }
  return answers;
}

export function normalizeKostnadsfriFollowupSession(value: unknown): KostnadsfriFollowupSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const questionIds = Array.isArray(raw.questionIds)
    ? raw.questionIds.filter(isFollowupId).slice(0, KOSTNADSFRI_FOLLOWUP_LIMIT)
    : [];
  const skippedIds = Array.isArray(raw.skippedIds) ? raw.skippedIds.filter(isFollowupId) : [];
  const currentIndex =
    typeof raw.currentIndex === "number" && Number.isFinite(raw.currentIndex)
      ? Math.max(0, Math.min(questionIds.length, Math.floor(raw.currentIndex)))
      : 0;
  const completed = raw.completed === true;
  const completeReason =
    raw.completeReason === "answered" ||
    raw.completeReason === "skipped" ||
    raw.completeReason === "continued"
      ? raw.completeReason
      : undefined;
  return {
    questionIds,
    currentIndex,
    skippedIds,
    answers: normalizeKostnadsfriFollowupAnswers(raw.answers),
    completed,
    completeReason,
  };
}

export function kostnadsfriFollowupDirectiveLines(
  brief: KostnadsfriAgentBrief | null,
  options?: { skipped?: boolean; completed?: boolean },
): string[] {
  if (!brief || brief.stage !== "handoff") return [];

  if (options?.skipped) {
    return [
      "Uppföljningsfrågor: kunden hoppade över dem. Fortsätt utan att vänta på svar. Starta inte ett nytt bygge.",
    ];
  }

  if (options?.completed) {
    return [
      "Uppföljningsfrågorna är klara. Bygget startar en gång. Fortsätt som rådgivare, inte med nya byggen.",
    ];
  }

  const followups = selectKostnadsfriFollowups(brief);
  if (followups.length === 0) {
    return [
      "Inga extra följdfrågor. Vänta tills kunden klickar Fortsätt eller hoppar över. Starta inte bygget själv.",
    ];
  }

  return [
    `Uppföljningsdirektiv (formulera själv, högst ${KOSTNADSFRI_FOLLOWUP_LIMIT}). ` +
      "Vänta på svar eller hoppa-över för varje fråga. Starta inte bygget själv.",
    ...followups.map((item, index) => `${index + 1}. ${item.directive}`),
  ];
}

export function notifyCampaignFollowupsReady(detail: {
  slug: string;
  reason: KostnadsfriFollowupReadyReason;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(KOSTNADSFRI_FOLLOWUPS_READY_EVENT, { detail }));
}
