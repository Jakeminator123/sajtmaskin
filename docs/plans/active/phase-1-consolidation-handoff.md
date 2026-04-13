# Phase 1 Consolidation Handoff

Detta dokument är handoff för nästa agent efter fas-1-konsolideringen.

## Bekräftat gjort

- `918462148`: Deep Brief är kanonisk init-signal.
  - `formatPrompt()` körs bara som fallback när brief saknas.
  - Init-path skippar addendum-beräkning (`skipAddendum`).
  - `mustHave`/`avoid` tillagda i brief-schema.
  - `uiNotes` emitteras i dynamic context (`## UX & UI Notes`).
- `1477661b0` + `851eca596`: lagerstädning av promptregler.
  - `EXTENDED_CUSTOM_INSTRUCTIONS` borttagen ur normalflödet.
  - Visual/motion/image-regler ägs nu av static core + dynamic context.
- `851eca596` + `660765ead`: semantisk konsolidering.
  - `src/lib/builder/domain-inference.ts` är canonical runtime-kod.
  - `config/domain-rules.json` är den editerbara regeldatan (SV+EN).
  - `src/lib/builder/prompt-heuristics.ts` är delad ordlistekälla för structured-prompt-heuristiker.
- `usePromptAssist`-hooken uppdelad i tre fokuserade hooks:
  - `src/lib/hooks/usePromptRewrite.ts` — manuella "Förbättra"/"Skriv om" (`maybeEnhanceInitialPrompt`, anropar `/api/ai/chat`).
  - `src/lib/hooks/useInitBrief.ts` — init-brief + fallback-addendum (`generateDynamicInstructions`, anropar `/api/ai/brief`).
  - `src/lib/hooks/usePromptAssist.ts` behållen som deprecated re-export-facade.
  - Delade typer i `prompt-assist-types.ts`, delade utilities i `prompt-assist-utils.ts`.
  - `useBuilderPageController.ts` importerar de nya hooks direkt.
  - `useBuilderPromptActions.ts` Args-typ uppdaterad till `PromptRewriteOptions` / `InitBriefOptions`.

## Lever kvar medvetet

- `MOTION_GUIDANCE` / `VISUAL_IDENTITY_GUIDANCE` / `QUALITY_BAR_GUIDANCE` i `promptAssist.ts`.
  - Används i fallback/addendum-paths (non-init), inte i primär init-path.
- `SECTION_KEYWORDS` / `STYLE_KEYWORDS` i `promptAssist.ts`.
  - Syfte: keyword-extraktion för fallback-formattering/addendum, inte policy-hitcount.
- `BUILD_INTENT_GUIDANCE` finns i två lager:
  - `system-prompt.ts` = canonical för codegen.
  - `promptAssist.ts` = assist-copy för rewrite/polish/fallback.

## Gör inte nu (utan eget pass)

- Ta inte bort fallback-guidance i `promptAssist.ts` förrän non-init-paths verifierats.
- Slå inte ihop `BUILD_INTENT_GUIDANCE` till en delad import utan att först undvika cirkulära beroenden.
- Flytta inte fler designregler till nya lager; håll principen:
  - static core = globala regler
  - dynamic context = brief-driven runtime-regler
  - assist/fallback = degraderad reservväg

## Snabb verifiering inför nästa steg

- Ägarmatris: `docs/architecture/phase-1-ownership.md` — varje signal har en canonical source.
- Typecheck ska vara grön.
- `server-auto-brief-policy.test.ts` ska passera.
- Kontrollera att `config/domain-rules.json` och `domain-inference.ts` är synkade vid ändring av domäner.
