# K3 — redesign-follow-up får variantinspirationen

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: redo efter #1087-merge. Parallell med K2/K4.

## Problemet — rätta lucka efter korrigering

Först det som **inte** är trasigt: `build-dynamic-context.ts:157–161` stänger
redan av compact-läget när `followUpIntent === "clear-redesign"` eller
`buildSpec.changeScope === "redesign"`, så redesign-rundor får redan fulla
variantblocket inklusive `signaturePatterns.layouts`. Vanliga follow-ups får
compact (2 anti-patterns + delta-regeln) — det är avsiktligt och ska bestå.

Den verkliga luckan: **variantinspirationen (stillbild + SHA-bundna
addendum-utdrag) är init-only.** `finalize-prompts.ts:147–152` resolvar
`variantTemplateInspiration` bara när `resolvedMode === "init"`, så en
`clear-redesign` — som är en visuell omstart där Deep Brief körs om som
delta-brief och tidigare stil får ersättas — arbetar med *mindre* visuell
grundning än en init. Modellen får layouts-texten men varken stillbilden eller
kodutdragen som init fick.

## Uppgift

1. Låt `clear-redesign` resolva variantinspiration på samma villkor som init:
   utvidga init-gaten i `finalize-prompts.ts` till att även täcka
   redesign-follow-ups (fortsatt ej Importerat repo-läge, ej Scaffold: Av).
   Blockrenderingen är redan icke-compact vid redesign, så
   `## Variant Template Inspiration` följer med utan renderer-ändring —
   verifiera att `build-dynamic-context.ts:236–238`-gaten släpper igenom den.
2. Stillbildsbilagan (`variantTemplateReferenceAttachments`) ska följa med i
   redesign-payloaden på samma sätt som vid init; källkvittot
   (`sources`/`reachedPrompt`) ska fortsatt spegla sanningen.
3. Budget: blocket har prio 84 (prunable) — ingen prioändring; en trång
   redesign-prompt får tappa inspiration precis som en trång init.
4. Testlås, två delar:
   - `clear-redesign` ⇒ fulla variantblocket + inspiration resolvas;
     `clear-refine` ⇒ compact, ingen inspiration.
   - Snapshotens `variantTemplateId` uppdateras korrekt om Brief-rankningen
     (#1087) väljer en annan kandidat vid redesignen.
5. Uppdatera glossary-raden «Används bara vid init» för
   Variant-template inspiration samt `docs/schemas/scaffold-contract.md` i
   samma PR (docs speglar runtime).

## Vad som INTE ingår

- Ändringar i compact-logiken för vanliga follow-ups.
- Ny follow-up-intent, ändrad intent-klassning eller variant-frys-ändringar.
- Att skicka inspiration på `clear-refine`/`capability-*` — uttryckligen nej.

## Verifiering

- `npm run typecheck`
- Riktad vitest: `src/lib/gen/system-prompt/`, `src/lib/gen/scaffold-variants/`,
  närmaste orchestrate-/follow-up-test
- Prompt-dump-stickprov: en `clear-redesign` lokalt ska visa
  `## Variant Template Inspiration` i dynamic context; en `clear-refine` inte

## Klart när

Redesign-rundor har samma visuella grundning som init (layouts + stillbild +
utdrag), vanliga follow-ups är byte-identiska mot innan, och docs/glossary
säger «init och clear-redesign».
