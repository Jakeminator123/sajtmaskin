# SEO-landningssidor på sajtmaskin.se

> **Status: genomförande pågår mot `preview`.** Ingen produktionspromote.
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
| Foundation | #1437: register + noindex-placeholders + fail-closed mot `ready` |
| Register + metadata + sitemap-grind | Finns |
| Referensroute `/skapa-hemsida-med-ai` | Finns som noindex-placeholder |
| Övriga slugs i matrisen | Routes finns, fortfarande placeholders |
| Unikt innehåll / demo / internlänkar | Inte skrivet |
| Indexering | Ingen sida är `ready` |

Synka alltid mot live `origin/preview` före nästa kodsteg. #1437 mergas
av en annan agent; fyll inte den PR:n med riktigt sidinnehåll.

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
| B Referens | `/skapa-hemsida-med-ai` som integrationsmönster | Route + kontrakt klart; innehåll saknas |
| C Återanvändning | Extrahera CTA/demo/tabell bara vid faktisk duplication | Inte aktuellt än |
| D Batch 1 | Innehåll för skapa/AI/företag/program/utan-kod | Väntar färdig design/content |
| E Batch 2 | Kostnad + konkurrentjämförelser, faktagranskade | Väntar färdig design/content |
| F Indexering | `ready` + sitemap + Search Console | Inte förrän DoD per sida |

Nästa PR efter att #1437 är mergad till `preview`: bara
`/skapa-hemsida-med-ai` som första riktiga sida. Handover:
[`aktiviteter/05-forsta-riktiga-sidan.md`](aktiviteter/05-forsta-riktiga-sidan.md).
Batcha inte övriga sidor förrän den modellen är granskad.

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
