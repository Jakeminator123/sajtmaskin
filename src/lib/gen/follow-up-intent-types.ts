/**
 * Delad typdefinition för klassificering av follow-up-intent. Importeras av
 * både `src/lib/providers/own-engine/follow-up-clarification.ts` (regex-
 * och LLM-klassificeraren) och `src/lib/gen/scaffold-variants/matcher.ts`
 * (variant-locken). Tidigare fanns två lokala kopior — varje gång en ny
 * intent-mode lades till behövdes de hållas synkade manuellt.
 *
 * Modes:
 *  - `clear-refine`: explicit edit (byt/ändra/move) — keep scaffold + variant.
 *  - `clear-redesign`: "redesign", "from scratch" — release scaffold + variant.
 *  - `ambiguous-redesign`: "ny hemsida …" without explicit redesign verb —
 *    triggers a clarification question.
 *  - `ambiguous-followup`: vague "make it better" — clarification question.
 *  - `capability-add` (Plan 06, 2026-04-24): user asked to add a feature
 *    that maps onto a dossier capability (3D, contact-form, payments, …).
 *    Keeps scaffold/variant locked (delta) but signals downstream that
 *    `selectDossiersForRequest` should receive the detected capability ids.
 *  - `neutral`: no signal classifiable by the regex pipeline.
 */
export type FollowUpIntentMode =
  | "clear-refine"
  | "clear-redesign"
  | "ambiguous-redesign"
  | "ambiguous-followup"
  | "capability-add"
  | "neutral";

export const FOLLOW_UP_INTENT_MODES: ReadonlySet<FollowUpIntentMode> = new Set([
  "clear-refine",
  "clear-redesign",
  "ambiguous-redesign",
  "ambiguous-followup",
  "capability-add",
  "neutral",
]);
