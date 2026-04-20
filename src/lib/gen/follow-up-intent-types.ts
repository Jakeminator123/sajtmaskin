/**
 * Delad typdefinition för klassificering av follow-up-intent. Importeras av
 * både `src/lib/providers/own-engine/follow-up-clarification.ts` (regex-
 * och LLM-klassificeraren) och `src/lib/gen/scaffold-variants/matcher.ts`
 * (variant-locken). Tidigare fanns två lokala kopior — varje gång en ny
 * intent-mode lades till behövdes de hållas synkade manuellt.
 */
export type FollowUpIntentMode =
  | "clear-refine"
  | "clear-redesign"
  | "ambiguous-redesign"
  | "ambiguous-followup"
  | "neutral";

export const FOLLOW_UP_INTENT_MODES: ReadonlySet<FollowUpIntentMode> = new Set([
  "clear-refine",
  "clear-redesign",
  "ambiguous-redesign",
  "ambiguous-followup",
  "neutral",
]);
