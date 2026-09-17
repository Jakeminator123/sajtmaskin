# SEO-landningssidor på sajtmaskin.se

> **Status: tio sidor `ready` på preview; Production/indexering kvar.**
> Registret på preview `13843edc` har alla tio poster `ready` (#1437
> foundation, #1443 + #1448–#1457). Stale Relaterat-copy rättad i #1467.
> Det är inte `master` `2566eec511` och inte Search Console. Beställ inte
> borttagning av Relaterat-länkar till mål som nu är färdiga. Hygien
> ändrar inte sidkoden.
> Planpaket från coach 2026-09-16. Runtime-ägare är
> [`src/lib/seo-landing-pages/registry.ts`](../../../../src/lib/seo-landing-pages/registry.ts),
> inte den här mappen.

## Syfte

Bygg ett litet kluster av förstaklassiga publika sidor på huvuddomänen som
fångar relevant sökintention och leder in i befintlig Sajtmaskin-produkt.
Detta är inte ett nytt subsystem, inte separata deployer och inte tunna
keyword-varianter.

Kodkontrakt: vanliga App Router-routes. Sitemap och index följer
`status: "ready"` i registret.

## Aktuellt läge

| Del | Läget |
|---|---|
| Foundation | #1437: register + fail-closed mot `ready` |
| Register + metadata + sitemap-grind | Finns |
| Alla tio slugs i matrisen | `status: "ready"` på preview `13843edc` (#1443, #1448–#1457) |
| Unikt innehåll / internlänkar | Sidinnehåll landat. Relaterat-länkarna pekar på färdiga mål; ta inte bort dem. |
| Copy-svans | #1467 rättade stale Relaterat-/syskon-copy på ready-sidorna. |
| Indexering | Preview-sitemap följer `ready`. Production och Search Console väntar promote. |

`ready` i preview-registret är inte Production. Synka mot live
`origin/preview` före nästa kodsteg. Bygg inte om de tio sidorna.

## Avvikelse från coachpaketet

Coachens QA sade att routes inte ska reserveras bara för framtiden, och att
referenssidan inte ska vara en tom SEO-placeholder.

Jakob bad uttryckligen om blå testsidor så nästa sida blir mekanisk att byta
in. Lösningen: routes finns, men de är `noindex, nofollow` och **inte** i
sitemap förrän `status: "ready"`. Det är en medveten avvikelse, dokumenterad
i PR:n.

## Planerade URL:er

Se [`02-page-matrix.md`](02-page-matrix.md). Brief per sida ligger i
[`pages/`](pages/).

1. `/skapa-hemsida`
2. `/skapa-hemsida-med-ai`
3. `/ai-hemsidebyggare`
4. `/hemsida-till-foretag`
5. `/hemsideprogram`
6. `/hemsida-utan-kod`
7. `/vad-kostar-en-hemsida`
8. `/wix-alternativ`
9. `/wordpress-alternativ`
10. `/lovable-alternativ`

## Faser

| Fas | Vad | Status |
|---|---|---|
| A Baseline | Läs befintliga publika routes, sitemap, CTA | Klar i #1437 |
| B Referens | `/skapa-hemsida-med-ai` som integrationsmönster | Klar på preview (#1443) |
| C Återanvändning | Extrahera CTA/demo/tabell bara vid faktisk duplication | Inte ett aktivt arbetspaket |
| D Batch 1 | Innehåll för skapa/AI/företag/program/utan-kod | Klar på preview (#1448–#1453) |
| E Batch 2 | Kostnad + konkurrentjämförelser, faktagranskade | Klar på preview (#1454–#1457) |
| F Indexering | Production + Search Console | Inte förrän promote; `ready` på preview räcker inte |

De tio sidornas innehåll är landat på preview. Beställ inte om B–E.
Copy-svansen är stängd (#1467). Kvar för release: Production/indexering.
Historisk handover för första sidan:
[`aktiviteter/05-forsta-riktiga-sidan.md`](aktiviteter/05-forsta-riktiga-sidan.md).

## Definition of Done per sida

En sida är inte SEO-klar förrän unik intention, färdigt innehåll, unik
title/description/H1, self-canonical, fungerande CTA, relevanta internlänkar,
mobil QA, HTTP 200, sitemap-rad och verifierade konkurrentfakta om sidan
nämner en konkurrent. Se checklistan.

## Styrdokument

| Fil | Roll |
|---|---|
| [`01-architecture.md`](01-architecture.md) | Hur sidorna passar i App Router |
| [`02-page-matrix.md`](02-page-matrix.md) | Intention och kannibalisering |
| [`03-seo-qa-checklist.md`](03-seo-qa-checklist.md) | Före merge/publicering |
| [`04-sources.md`](04-sources.md) | Google-riktlinjer och faktakällor |
| [`aktiviteter/`](aktiviteter/) | Foundation, första riktiga sida, batch, review |
| [`pages/`](pages/) | En brief per slug |

Kod vinner över den här mappen. Ändra registret först när en slug eller
indexregel ändras.
