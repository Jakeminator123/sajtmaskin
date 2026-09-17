# Inspiration, källkvitto och komposition

> **Status: undersökning mot `preview`.** Ingen kod förrän A ger belägg.
> Ingen produktionspromote. Planen styr utredning; koden är ägare.

**Skapad:** 2026-09-17.
**Bas:** `origin/preview` @ `a90d9da43`.
**Utlöst av:** coachläsning av preview @ `dced4056` (addenda inkopplade,
sju poster avstängda, källkvittot blandar bild och kodutdrag).

## Syfte

Behåll addenda- och inspirationskedjan. Gör det mätbart vad som faktiskt
nådde byggmodellen, och minska de återkommande **dynamiska**
designrecepten — utan att kasta systemet, öppna avstängda mallar eller
bygga nya scaffolds.

Ordning: undersök → belägg → ev. smal fix. Inte omvänd ordning.

## Inte detta spår

| Utanför | Varför |
|---|---|
| `config/prompt-core/03-visual-design.md` | Isolerad PR #1444 |
| Återaktivera 7 `disabled` addenda | Medveten gallring i K1 #1094 |
| Nya scaffolds / nytt promptlager / ny agent | Coach: behåll grunden |
| B4 omstart, N3–N5, Production | Andra ägare |

Disabled betyder avstängda **kodutdrag**. Stillbilden kan fortfarande
väljas. Det är en egenskap att mäta i A, inte ett fel att «rätta» genom
att öppna posterna.

## Belagt nuläge (kod, 2026-09-17)

```
variant → inspirationsprojekt → addendum-utdrag
  → dynamisk kontext → promptbudget → systemprompt
```

Inkopplat vid init och `clear-redesign`. Inte vanliga follow-ups,
importerat repo eller Scaffold Av. `generated` och `reviewed` är båda
användbara när hash stämmer.

| Fynd | Bevis | Följd |
|---|---|---|
| `reachedPrompt` = textblock **eller** stillbild | `source-receipt.ts` L87–90; tester låser OR-beteendet | A |
| Inspirationsblocket är inte `required` | `budget.ts` prio 84, ingen `required` | A |
| Quality Bar föreskriver kort/glas/split/stats/logo/testimonials | `guidance-resolvers.ts` `QUALITY_BAR_GUIDANCE` | B |
| Landing-page-research kräver statsrad + flytande CTA | `landing-page/manifest.ts` `upgradeTargets` | B |
| `corporate-grid` låser 60/40 + tre kort + logorad | `config/scaffold-variants/landing-page/corporate-grid.json` | C |
| Direktkomponent = längsta frontendfil under `components/` | `template-inspiration.ts` L370–388, sen `page → component → css → layout` | D |

Sju avstängda poster (rör inte): MindSpace `8QhCJAwn16K`, Flowly
`8Y9E0cStKrW`, Pixar `E3xFlIXCZi4`, SaaSify `fnLkUW05eg3`, Docs
`ov3ApgfOdx5`, Shadcn Dashboard `Pf7lw1nypu5`, Marketing Website
`sV0OtrkXM6x`.

## Aktiviteter

| Id | Vad | Owner | Status |
|---|---|---|---|
| [A](aktiviteter/A-kallkvitto.md) | Dela källkvittot: bild / utdrag / budget-dropp | `source-receipt.ts`, `GenerationSource` | Inte startad |
| [B](aktiviteter/B-quality-bar-och-research.md) | Quality Bar + scaffold-research blir behovsstyrda | `guidance-resolvers.ts`, scaffold-`manifest.ts` | Väntar A |
| [C](aktiviteter/C-variant-komposition.md) | Kompositionsval inom variantens identitet | `config/scaffold-variants/**` | Väntar A+B |
| [D](aktiviteter/D-addenda-utdrag.md) | Utdrag som visar hero/nav/sektion, inte längsta knappen | `template-inspiration.ts` | Väntar A |

## Ordning och stopp

1. A först — annars gissar vi om likformighet kommer från recept eller
   från att utdragen aldrig nådde prompten.
2. B sedan — dynamiska recept, inte 03.
3. C — efter att B inte längre tvingar samma paket.
4. D — kurering/extractor, inte «kör om alla 69».

**Stoppa en fix** vid nya byggfel, tappade funktioner, eller att
follow-up «ändra telefonnumret» ritar om header/hero. En prompt- eller
kvittoåterställning påverkar bara kommande generationer.

**Jämförelse** (efter godkänd testbudget, inte i denna plan-PR): samma
fall före/efter — kafé, konsult, portfolio, dashboard, flersidig
företagssajt. Håll modell, brief, variant och inspiration lika. Grön
eval startar ingen preview-VM.

## Relaterade spår

- #1444 — statisk 03, separat.
- [Briefing + Källpaket](../2026-08-18-briefing-och-kallpaket/00-master-plan.md) B4 — första kurationspasset är levererat. Starta inte om det.
- [Scaffold-komposition (avklarat)](../../avklarat/2026-08-21-scaffold-komposition-och-stad/00-master-plan.md) — K1 satte disabled-domarna.
