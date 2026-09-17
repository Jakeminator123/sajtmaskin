# Inspiration, källkvitto och komposition

> **Status: undersökning mot `preview`.** Ingen kod i A–D förrän A ger belägg.
> Ingen produktionspromote. Planen styr utredning; koden är ägare.
>
> **Observation vs hypotes:** tabellen «Belagt nuläge» är kodobservation.
> Hur ofta det syns i live-generationer är hypotes tills A mäts.

**Skapad:** 2026-09-17.
**Omskriven:** 2026-09-17 mot live `origin/preview` (fetch före skrivning).
**Rematch:** 2026-09-17 — merge av `origin/preview` `45f0f9842` (efter #1466,
#1464, #1461, #1467). Inte evig evidens — fetch/jämför igen om `preview`
har flyttat sig.
**Utlöst av:** stale Drafts #1444/#1447 mot äldre preview-generationer.
**Ersätter:** #1447 som arbetsunderlag. #1444:s *idé* är **landad** i #1464
(`bd3cc300f` på preview).

## Syfte

Behåll addenda- och inspirationskedjan. Förfina det kvitto som redan finns
så bild, kodutdrag och budget-pruning kan skiljas. Minska återkommande
**dynamiska** designrecept och onödigt hårda variant-layoutrecept — utan
att kasta systemet, öppna avstängda mallar eller bygga nya scaffolds.

Ordning: undersök → belägg → ev. smal fix. Inte omvänd ordning.

## Inte detta spår

| Utanför | Varför |
|---|---|
| `config/prompt-core/03-visual-design.md` | **Landad** i #1464 på preview. Rör inte 03 i A–D. |
| Återaktivera 7 `disabled` addenda | Medveten gallring i K1 #1094 |
| Nya scaffolds / nytt promptlager / ny agent | Behåll grunden |
| B4 omstart, N3–N5, Production, billing, Fly, SM-080 | Andra ägare |

Disabled betyder avstängda **kodutdrag**. Stillbilden kan fortfarande
väljas. Det är en egenskap att mäta i A, inte ett fel att «rätta» genom
att öppna posterna.

Statisk 03 är landad via #1464. Universella layered/split/rounded-cards-
och hero-/padding-recept är borta från `03-visual-design.md` på preview.
Kvarvarande likformighet sitter i dynamiska lager (B) och varianter (C).

## Belagt nuläge (kodobservation, 2026-09-17)

```
variant → inspirationsprojekt → addendum-utdrag
  → dynamisk kontext → promptbudget → systemprompt
```

Inkopplat vid init och `clear-redesign`. Inte vanliga follow-ups,
importerat repo eller Scaffold Av. `generated` och `reviewed` är båda
användbara när hash stämmer.

| Status | Fynd | Bevis | Följd |
|---|---|---|---|
| Delvis fixat | Kvitto finns: `variantTemplateImageSent`, `keptBlockKeys`, addendum-`state`, `structuralReferences` | `source-receipt.ts`, `finalize-prompts.ts`, `GenerationSource` | A = förfining |
| Fortfarande verkligt | `reachedPrompt` = textblock **eller** stillbild | `source-receipt.ts` L87–90; `source-receipt.test.ts` låser OR | A |
| Fortfarande verkligt | Inspirationsblocket är prio 84, inte `required` | `budget.ts` | A |
| Fortfarande verkligt | Quality Bar föreskriver kort/glas/split/stats/logo/testimonials | `guidance-resolvers.ts` `QUALITY_BAR_GUIDANCE` | B |
| Fortfarande verkligt | Landing-page-research föreslår statsrad + flytande CTA; checklista nämner testimonials | `landing-page/manifest.ts` | B |
| Fortfarande verkligt | `corporate-grid` låser 60/40 + tre kort + logorad | `config/scaffold-variants/landing-page/corporate-grid.json` | C |
| Delvis bra | Extractor filtrerar server/API, kräver frontend-JSX, hash/tak/max 3 | `template-inspiration.ts` | D = urval, inte omskrivning |
| Fortfarande verkligt | Direktkomponent = längsta kvalificerade frontendfil; ordning page → component → css → layout | `template-inspiration.ts` L370–461 | D |
| Stale | «Bygg observability från noll» | Kvitto + pruning finns redan | Ta bort |
| Landat | Statisk 03 släppte universella recept | #1464 mergad `bd3cc300f` | Inte A–D |
| Hypotes | OR-kvittot döljer ofta saknade utdrag i live-generationer | Kräver stickprov via A | Inte belagt |

Sju avstängda poster (rör inte): MindSpace `8QhCJAwn16K`, Flowly
`8Y9E0cStKrW`, Pixar `E3xFlIXCZi4`, SaaSify `fnLkUW05eg3`, Docs
`ov3ApgfOdx5`, Shadcn Dashboard `Pf7lw1nypu5`, Marketing Website
`sV0OtrkXM6x`.

## Aktiviteter

| Id | Vad | Owner | Status |
|---|---|---|---|
| [A](aktiviteter/A-kallkvitto.md) | Förfina källkvittot: bild / utdrag / budget-dropp | `source-receipt.ts`, `GenerationSource` | Inte startad |
| [B](aktiviteter/B-quality-bar-och-research.md) | Quality Bar + scaffold-research blir behovsstyrda | `guidance-resolvers.ts`, scaffold-`manifest.ts` | Väntar A |
| [C](aktiviteter/C-variant-komposition.md) | Kompositionsval inom variantens identitet | `config/scaffold-variants/**` | Väntar A+B |
| [D](aktiviteter/D-addenda-utdrag.md) | Prioritera hero/nav/sektion före längsta generiska komponent | `template-inspiration.ts` | Väntar A |

## Ordning och stopp

1. A först — annars gissar vi om likformighet kommer från recept eller
   från att utdragen aldrig nådde prompten.
2. B sedan — dynamiska recept, inte 03.
3. C — efter att B inte längre tvingar samma paket.
4. D — kurering/extractor-signal, inte «kör om alla 68».

**Stoppa en fix** vid nya byggfel, tappade funktioner, eller att
follow-up «ändra telefonnumret» ritar om header/hero. En prompt- eller
kvittoåterställning påverkar bara kommande generationer.

**Jämförelse** (efter godkänd testbudget, inte i denna plan-PR): samma
fall före/efter — kafé, konsult, portfolio, dashboard, flersidig
företagssajt. Håll modell, brief, variant och inspiration lika. Grön
eval startar ingen preview-VM.

## Relaterade spår

- #1464 — statisk 03, **mergad** till `preview` (`bd3cc300f`). Inte A–D.
- #1444 — stale Draft; ersatt av #1464.
- [Briefing + Källpaket](../2026-08-18-briefing-och-kallpaket/00-master-plan.md) B4 — första kurationspasset är levererat. Starta inte om det.
- [Scaffold-komposition (avklarat)](../../avklarat/2026-08-21-scaffold-komposition-och-stad/00-master-plan.md) — K1 satte disabled-domarna.
