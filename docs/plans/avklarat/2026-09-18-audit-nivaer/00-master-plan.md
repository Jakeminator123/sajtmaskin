# Audit-nivåer (2026-09-18) — levererat

> **Status: DONE.** D1–D6 är fattade och implementerade. Expert är PARK.
> Inget utvecklingsarbete kvar i det här spåret. Kvar är produktmätning
> av verklig kostnad per nivå, inte mer kod.

Gäller den inloggade Audit-ytan på startsidan
([`site-audit-section.tsx`](../../../../src/components/layout/site-audit-section.tsx)),
inte publika `/analys`. Publik lead magnet ägs av
[`../active/2026-09-18-analys-audit-leadmagnet/00-master-plan.md`](../../active/2026-09-18-analys-audit-leadmagnet/00-master-plan.md).

Kanonisk runtime-ägare: [`src/lib/audit/audit-tier.ts`](../../../../src/lib/audit/audit-tier.ts)
(`resolveAuditRun`). `AuditMode` är fortfarande `"basic" | "advanced"`.

## Fattade beslut

| ID | Beslut | Status |
|---|---|---|
| D1 | Två betalda nivåer: Vanlig och Avancerad. Ingen Expert. `/analys` är separat. | DONE |
| D2 | Vanlig genererar inte Advanced-only-fält. Inget «generera allt, göm sen». | DONE |
| D3 | Vanlig = Luna, 2 sidor, kärnschema, 6–8 förbättringar, ingen research. Avancerad = Sol, 4 sidor, fullt schema, minst 12 förbättringar, web research per nivå. | DONE |
| D4 | Expert PARK. Ingen tredje `CreditAction`, UI, schema eller research-agent. | PARK |
| D5 | Ärlig UI-copy utan modellnamn som kundvärde. | DONE |
| D6 | Pris oförändrat 15/25. Befintlig cost-summary utökad med tier, sidor, modell och web-search. | DONE |

## Levererad split

| Del | Vanlig (`basic`) | Avancerad (`advanced`) | Publik `/analys` |
|---|---|---|---|
| Modell | Luna | Sol | Luna (oförändrat) |
| Sidor | 2 | 4 | 4 (oförändrat) |
| Schema | `AUDIT_AI_SCHEMA_BASIC` | `AUDIT_AI_SCHEMA` | fullt schema (oförändrat) |
| Web research | av | på, via `resolveAuditRun.allowWebSearch` | av |
| Pris | 15 credits | 25 credits | gratis, 1/IP/24h |

Advanced-only fält som Vanlig varken schemalägger eller behåller efter parse:
`business_profile`, `market_context`, `customer_segments`,
`competitive_landscape`, `competitor_insights`.

Globala `AUDIT_WEB_SEARCH` / `FEATURES.useAuditWebSearch` styr inte längre
produktnivåerna. Research är en explicit parameter på Avancerad.

## Expert — PARK

Inte ett öppet beslut. Bygg inte `audit.expert`, tredje kort, extra schema
eller flerstegsresearch förrän Vanlig/Avancerad har mätta körningar och ett
nytt ägarbeslut öppnar ett eget spår.

## Kvar (inte kod)

Mät verklig `Audit cost summary` per nivå (tokens, `sek`, `web_search_calls`)
på riktiga körningar innan priset rörs. Tokenraden underskattar fortfarande
verktygskostnad; `web_search_calls` är den minsta extra signalen.
