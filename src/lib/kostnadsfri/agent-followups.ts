/**
 * Deterministiskt urval av följdfrågor ur kampanjunderlaget.
 *
 * Sajtagenten ska inte ställa generiska frågor. Den här modulen tittar på
 * luckorna i `KostnadsfriAgentBrief` och ger högst tre direktiv. Modellen
 * formulerar frågorna — klienten skickar inte färdig chatcopy.
 */
import type { KostnadsfriAgentBrief } from "./agent-brief";

export const KOSTNADSFRI_FOLLOWUP_LIMIT = 3;

export type KostnadsfriFollowupId =
  | "usp"
  | "targetAudience"
  | "industry"
  | "holding"
  | "booking"
  | "sell";

export interface KostnadsfriFollowup {
  id: KostnadsfriFollowupId;
  /** Direktiv till modellen, inte en färdig replik i chatten. */
  directive: string;
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

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

function purposeLabelsOf(brief: Pick<KostnadsfriAgentBrief, "purposeLabels">): string[] {
  return brief.purposeLabels ?? [];
}

/** Registerprosa som döljer vad bolaget egentligen säljer. */
export function isHoldingCompanyProse(description: string | undefined): boolean {
  if (!description) return false;
  const normalized = description.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return HOLDING_PHRASES.some((phrase) => normalized.includes(phrase));
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
    selected.push({ id, directive: FOLLOWUP_DIRECTIVE[id] });
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

export function kostnadsfriFollowupDirectiveLines(
  brief: KostnadsfriAgentBrief | null,
  options?: { skipped?: boolean },
): string[] {
  if (!brief || brief.stage !== "handoff") return [];

  if (options?.skipped) {
    return [
      "Uppföljningsfrågor: kunden hoppade över dem. Fortsätt utan att vänta på svar. Uteblivna svar blockerar inget.",
    ];
  }

  const followups = selectKostnadsfriFollowups(brief);
  if (followups.length === 0) return [];

  return [
    `Uppföljningsdirektiv (formulera själv, högst ${KOSTNADSFRI_FOLLOWUP_LIMIT}, svar är frivilliga och blockerar inget):`,
    ...followups.map((item, index) => `${index + 1}. ${item.directive}`),
  ];
}
