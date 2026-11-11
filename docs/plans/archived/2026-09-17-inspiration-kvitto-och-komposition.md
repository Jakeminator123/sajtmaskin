---
status: archived
owner: unassigned
topic: Källkvitto, Quality Bar och addenda. A0 (#1472) och statisk 03 (#1464) är levererade; A-mätning och B–D är parkerade.
created: 2026-09-17
source: docs/plans/active/2026-09-17-inspiration-kvitto-och-komposition/ (konsoliderad 2026-11-05, arkiverad 2026-11-11; git är arkiv).
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [BUG-SWARM-BACKLOG § Väntar på ägarbeslut](../../../BUG-SWARM-BACKLOG.md)

# Inspiration, källkvitto och komposition — parkerat koncentrat

Arkiverad 2026-11-11 på ägarens begäran. Ingen del av A–D är beställd.
Starta om spåret bara med ett nytt ägarbeslut; Briefing N3–N5 i backloggen
väntar på A-mätningen nedan.

## Levererat och ordning

A0 är **mergad** i #1472 (`3f2c3299b`); emittera inte signalerna en gång till.
Statisk 03-reform är levererad i #1464 och öppnas inte av detta spår.
[Source-receipt](../../../src/lib/gen/orchestrate/source-receipt.ts) bär
`stillImageSent`, `inspirationBlockKept` och `addendumTextSent`.
`reachedPrompt` behåller bakåtkompatibel OR; bild och text är oberoende kanaler.

Parkerad ordning: **A mät nya kvitton → B dynamiska råd → C variantval**;
D utdragsurval kräver A. B–D ändras först med belägg. Äldre kvitton saknar
separata signaler och kan inte ge ett retroaktivt mått på bild utan text.

| Steg | Parkerad leverans och bevis | Owner |
|---|---|---|
| A | Stickprov på nya init/clear-redesign: bild, utdrag, båda/inget; skillnad mellan budgetpruning och disabled/missing/stale/invalid/utdragslös post. Redovisa urval och osäkerhet utan att gissa historik. | Befintlig generationstelemetri/dump-meta och Selection Rationale; source-receipt.ts. Inga nya tabeller, kvittosystem, råprompter eller kodutdrag i telemetri. |
| B | Gör fasta kort/glas/skuggor/bento/split/stats/logo/testimonialrecept valbara. Research föreslår bara proof/citat/stats/flytande CTA när brief/användartext/verkligt innehåll stöder det. Läsbarhet, kontrast, responsivitet och konsekvens kvarstår; före/efter med A. | [guidance-resolvers.ts](../../../src/lib/gen/guidance-resolvers.ts) och berörda scaffoldmanifest/checklists/upgradeTargets. Inte 03 eller legacy defaults. |
| C | Börja med en belagd högtrafikerad variant, exempelvis corporate-grid: 2–3 likvärdiga kompositionsval inom samma identitet, valda av brief/innehåll. Full-bleed-kontroll och compact follow-up/anti-patterns består. | [corporate-grid.json](../../../config/scaffold-variants/landing-page/corporate-grid.json) och faktisk rendering i scaffold-stack. JSON-copy, inte nya scaffolds/varianter eller matcherlogik. |
| D | Prioritera hero/nav/sektionsrytm före längsta generiska UI-/tokenkomponent. Stickprov skiljer kompositionsbärande utdrag från globals/button/card. Visa via A att valda utdrag faktiskt nått prompten. | [template-inspiration.ts](../../../src/lib/gen/scaffold-variants/template-inspiration.ts) och Template Curator. Behåll page→component→CSS→layout, frontend-/serverfilter, SHA och storlekstak. |

## Gränser

Ändra inte variantens färg/font/tokens/colorMode eller explicit vald
full-bleed/app-shell/dashboard-identitet. Inga nya promptlager/agenter,
ingen ZIP-hämtning i användarflödet och ingen ny Backoffice-yta.

Extractorn är redan säker och ska inte skrivas om. Behåll frontend-JSX,
server/API-filter, max tre utdrag/9 000 tecken och hash-binding.
Skriv bara om uttryckligt utvalda generated-poster; reviewed kräver mänsklig
genomgång. Disabled addenda återaktiveras inte och hela registret extraheras
inte om som genväg. `templates:addenda:check` ska fortsätta skydda kontraktet.

## Inte ersatt av denna plan

[Briefing/Källpaket](2026-08-18-briefing-och-kallpaket.md)
har parkerade B5 shadcnblocks-mätning och B6 Ändringsbrief utanför A–D.
B7:s variantauktoritet angränsar C men är inte automatiskt levererad.
N3–N5 och andra produktbeslut ligger kvar hos backlog/beslutslogg.

Grön schema-/enhetstest eller en lyckad init är inte ett uppmätt kvalitets-
eller marknadsutfall.
