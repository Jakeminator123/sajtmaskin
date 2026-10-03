/**
 * Konflikt mellan branschfältet (första mening + INDUSTRY_PAGES) och
 * verksamhetsbeskrivning / USP. Sitter i promptkedjan, inte i brief-modellen.
 *
 * Hospitality-sidor (Meny / Boka bord / Boka tid) får inte tyst hybridiseras
 * med lotteri-/spel-/plattformstext.
 */

export const KOSTNADSFRI_INDUSTRY_CONFLICT_CODE = "kostnadsfri_industry_conflict";

const HOSPITALITY_INDUSTRY_IDS = new Set(["restaurant", "cafe", "health"]);

const GAMING_OR_LOTTERY_RE =
  /lotteri|lottery|casino|betting|vadslagning|igaming|spellicens|spelbolag|spelplattform|gaming\s*platform|lottery\s*platform|lotteriplattform|sportsbook|online\s*casino|live\s*casino/i;

export class KostnadsfriIndustryConflictError extends Error {
  readonly code = KOSTNADSFRI_INDUSTRY_CONFLICT_CODE;
  readonly industryId: string;

  constructor(industryId: string) {
    super(
      "Branschen stämmer inte med verksamhetsbeskrivningen. Välj en annan bransch eller ändra beskrivningen.",
    );
    this.name = "KostnadsfriIndustryConflictError";
    this.industryId = industryId;
  }
}

export function isKostnadsfriIndustryConflictError(
  error: unknown,
): error is KostnadsfriIndustryConflictError {
  return error instanceof KostnadsfriIndustryConflictError;
}

export function kostnadsfriIndustryConflictFromResponse(
  body: unknown,
  industryId = "unknown",
): KostnadsfriIndustryConflictError | null {
  if (!body || typeof body !== "object") return null;
  const code = (body as { code?: unknown }).code;
  if (code !== KOSTNADSFRI_INDUSTRY_CONFLICT_CODE) return null;
  return new KostnadsfriIndustryConflictError(industryId);
}

export function textLooksLikeGamingOrLottery(
  ...parts: Array<string | null | undefined>
): boolean {
  return parts.some((part) => Boolean(part && GAMING_OR_LOTTERY_RE.test(part)));
}

export function hospitalityIndustryConflictsWithGamingText(
  industryId: string,
  description?: string | null,
  usp?: string | null,
): boolean {
  if (!HOSPITALITY_INDUSTRY_IDS.has(industryId)) return false;
  return textLooksLikeGamingOrLottery(description, usp);
}

export function assertNoHospitalityGamingConflict(
  industryId: string,
  description?: string | null,
  usp?: string | null,
): void {
  if (hospitalityIndustryConflictsWithGamingText(industryId, description, usp)) {
    throw new KostnadsfriIndustryConflictError(industryId);
  }
}

const HOSPITALITY_COMPILED_PROMPT_RE =
  /Restaurang\/Bar|Café\/Konditori|Hälsa\/Wellness|\bBoka bord\b/;

/** Server-side grind: den sammanställda prompten, inte bara klientens throw. */
export function compiledPromptHasHospitalityGamingConflict(prompt: string): boolean {
  if (!HOSPITALITY_COMPILED_PROMPT_RE.test(prompt)) return false;
  return GAMING_OR_LOTTERY_RE.test(prompt);
}
