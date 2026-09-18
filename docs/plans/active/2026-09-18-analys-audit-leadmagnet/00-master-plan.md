# Publik `/analys` via befintlig audit (2026-09-18)

> **Status: första implementation pågår.** Publik `/analys` är en egen
> yta (inte Audit-modalen). Motor: `runWebsiteAudit` + `POST /api/analys`.
> Jakob har sagt ja till att börja spåret. Routern i
> [`../README.md`](../README.md) pekar redan hit.

Runtime-ägare är audit-motorn, inte den här mappen:
[`src/app/api/audit/modules/handler.ts`](../../../../src/app/api/audit/modules/handler.ts).
`src/lib/seo/audit.ts` är **en annan sak** (källkods-SEO på genererade
projekt) och hör inte hit.

## Syfte

Återanvänd befintlig website-audit (scrape → LLM → scores → PDF) som
publik lead magnet på `sajtmaskin.se/analys`.

Inbound: vem som helst matar in en URL och får en rapport, med tydlig
CTA till konto och builder. Outbound (samma motor före outreach) är
idé, inte det här spåret. Brainstormen om widget/kundanskaffning är
underlag; filen `docs/growth/kundanskaffning-fordjupning-fem-spar.md`
finns inte i den här checkouten, så den länkas inte.

## Hypotes

Auditen är redan tillräckligt “wow” (PDF, scores, förbättringar) för att
fungera som granskning — om vi exponerar den publikt med ärlig copy och
en kostnadsspärr, utan ny analysmotor.

## Aktuellt läge (bevis 2026-09-18)

```text
klient (auth + diamonds)
  → POST /api/audit { url, auditMode }
  → rate limit audit:create  4 / 10 min, IP
  → validateAndNormalizeUrl
  → prepareCredits          401 ej inloggad, 402 saldo
  → inFlightAudits          process-lokal Map, userId + canonical URL
  → scrapeWebsite           max 4 sidor, SSRF-guard
  → buildAuditPrompt
  → OpenAI Responses / AI-SDK
  → validateAuditResult
  → creditCheck.commit
  → AuditModal + AuditPdfReport
  → valfritt POST /api/audits          saveUserAudit
  → valfritt extractAuditHandoffPayload → builder
```

| Faktum | Var |
|---|---|
| `POST` re-exportas, `maxDuration = 300` | [`src/app/api/audit/route.ts`](../../../../src/app/api/audit/route.ts) |
| Ordningen ovan | [`handler.ts`](../../../../src/app/api/audit/modules/handler.ts) |
| `AUDIT_COSTS` basic 15, advanced 25 | [`src/lib/credits/pricing.ts`](../../../../src/lib/credits/pricing.ts) |
| Ingen free-generation: `allowFreeGeneration` skickas inte; den flaggan gäller bara `prompt.create` / `prompt.refine` | [`src/lib/credits/server.ts`](../../../../src/lib/credits/server.ts) |
| 401-text: «Du måste vara inloggad för att använda audit-funktionen.» | samma fil, `AUTH_REQUIRED_MESSAGES` |
| Klient kräver inloggning + saldo före POST | [`site-audit-section.tsx`](../../../../src/components/layout/site-audit-section.tsx) |
| `audit:create` 4 req / 10 min; `withRateLimit` anropas **utan** `userId` → IP | [`rate-limit.ts`](../../../../src/lib/rate-limit.ts), handler |
| `inFlightAudits` är en process-lokal `Map` | [`in-flight.ts`](../../../../src/app/api/audit/modules/in-flight.ts) |
| Max 4 sidor; `validateSsrfTarget` | [`webscraper.ts`](../../../../src/lib/webscraper.ts) `MAX_PAGES = 4` |
| Ingen URL-resultatcache. `getCanonicalUrlKey` är bara in-flight-nyckel. Redis `cacheAudit` är sparad användarlista, inte scrape-svar. | handler, [`audits/route.ts`](../../../../src/app/api/audits/route.ts) |
| Copy ljuger: «kostnadsfri AI-analys … helt gratis» | [`entry-modal.tsx`](../../../../src/components/modals/entry-modal.tsx) |
| `/analys` finns inte. Sitemap/robots nämner den inte. | [`sitemap.ts`](../../../../src/app/sitemap.ts), [`robots.ts`](../../../../src/app/robots.ts) |
| `analyserad` är wizard, inte audit | [`use-entry-params.ts`](../../../../src/lib/entry/use-entry-params.ts), [`route-target.ts`](../../../../src/components/landing-v2/route-target.ts) |
| Landing-nav/footer har ingen audit-länk. App-nav «Audits» → `/audits` (inloggad). | [`landing-v2/navbar.tsx`](../../../../src/components/landing-v2/navbar.tsx), [`navbar.tsx`](../../../../src/components/layout/navbar.tsx) |

## Scope

Minsta yta som gör hypotesen testbar:

- Ny route `/analys` som bäddar in befintlig widget med flaggor.
- Ärlig copy. Metadata, ev. sitemap/robots, internlänk.
- En gästpolicy så API:t kan köras utan att ruinera ekonomin.
- Tydligare abuse-tak för den publika vägen.
- CTA: konto och/eller builder efter rapport. Befintlig handoff återanvänds.

## Icke-mål

- Ny LLM-, scrape- eller promptpipeline.
- Ändra `AUDIT_AI_SCHEMA`, `src/types/audit.ts`, `buildAuditPrompt`,
  `scrapeWebsite`, SSRF-guard eller `validateAuditResult`.
- Röra `src/lib/seo/audit.ts` eller SEO-landningsregistret
  (`SEO_LANDING_PAGES` / `ctaHref: /builder?new=1`).
- Döpa om wizard-läget `analyserad` eller `?mode=analyserad`.
- URL-resultatcache, org.nr-prefill, cold outreach, radar, masskörning.
- Sätta `AUDIT_COSTS` till 0 globalt (skulle ge inloggade gratis audits).
- Koppla auditen till kontots `free_generation_available`.
- Production-indexering / Search Console / promote.

## Föreslagen default (ja = detta paket)

Jakob kan säga **ja** till paketet, **ja med avvikelse**, eller **nej**.

1. Egen sida `/analys` (inte elfte SEO-landning, inte rewrite mot `/`).
2. Gäst: **1 × basic / IP / kalenderdygn**. Advanced kräver inloggning
   och credits. Full rapport i modal. Signup för PDF, spara och
   builder-handoff.
3. `noindex` + inte i sitemap förrän copy och API säger samma sak.
   Index är ett separat ja efter A2+A4.
4. Ny rate-limit-nyckel för gästvägen. Befintlig `audit:create` behålls
   för inloggade; skicka `userId` när det finns.
5. Rätta «helt gratis» oavsett om gästpolicyn landar i samma PR.

**Säkrare avvikelse:** signup-wall före körning (nuvarande 401). Då är
`/analys` en landning med ärlig copy, ingen ny spend — men sämre magnet.

## Beslutspunkter

| # | Fråga | Alternativ | Default i paketet |
|---|---|---|---|
| B1 | Gästpolicy | 1× basic/IP/dygn · signup-wall · preview-scores + signup för PDF | 1× basic/IP/dygn, signup för PDF/spara/handoff |
| B2 | Indexera `/analys` | `noindex` först · `index` + sitemap när ready | `noindex` tills A2+A4 är sanna |
| B3 | Nav/footer | Länka `/analys` · vänta | Länka när sidan inte längre ljuger |
| B4 | Partner `?mode=audit` | Kvar på `/` · peka mot `/analys` | Kvar på `/` i fas 1 |
| B5 | Advanced för gäst | Nej · samma tak som basic | Nej |
| B6 | Startsidans audit-sektion | Orörd · samma flaggor | Orörd för inloggade; copy-fix delas |

Öppna beslut stannar här tills de ratificeras i
[`docs/decisions/README.md`](../../../decisions/README.md). De hör inte
i backloggen som buggar.

## Faser och gates

```text
Jakob ja till paket
  → A4 copy (kan börja direkt; ljuger oberoende av route)
  → A1 noindex-sida + wrapper-flaggor
  → A2 + A3 i samma eller tätt följande PR (gäst utan tak = spender)
  → ev. index + sitemap + nav   (eget ja)
```

| Fas | Aktivitet | Gate in | Gate ut |
|---|---|---|---|
| 0 | Ägarbeslut B1–B6 | Läsbar plan | Ja / ja med avvikelse / nej |
| 1 | [A4](aktiviteter/A4-cta-handoff.md) copy | Inget (kan parallellt) | Ingen «helt gratis»-lögn |
| 1 | [A1](aktiviteter/A1-publik-yta.md) | Ja till route-formen | HTTP 200, `noindex`, unik H1, wrapper |
| 2 | [A2](aktiviteter/A2-gastpolicy-credits.md) + [A3](aktiviteter/A3-abuse-rate-limit.md) | B1 valt | Gästväg med hållbart tak; 401/402 oförändrade för betald väg |
| 3 | Index / nav / partner | B2–B4 + ärlig copy | Sitemap-rad bara om `index` |

A1 ensam är inte en lead magnet (API:t är fortfarande 401). Shippa inte
indexerad «gratis analys» före A2+A3+A4.

## Styrdokument

| Fil | Roll |
|---|---|
| [01-filkarta.md](01-filkarta.md) | Ägare per yta |
| [02-seo-routing.md](02-seo-routing.md) | SEO/routing-underlag som A1 följer |
| [aktiviteter/A1-publik-yta.md](aktiviteter/A1-publik-yta.md) | Route, metadata, wrapper |
| [aktiviteter/A2-gastpolicy-credits.md](aktiviteter/A2-gastpolicy-credits.md) | Gäst vs credits |
| [aktiviteter/A3-abuse-rate-limit.md](aktiviteter/A3-abuse-rate-limit.md) | Tak och in-flight |
| [aktiviteter/A4-cta-handoff.md](aktiviteter/A4-cta-handoff.md) | Copy, CTA, handoff |

SEO-QA att återanvända (inte kopiera registret):
[`../2026-09-16-seo-landningssidor/03-seo-qa-checklist.md`](../2026-09-16-seo-landningssidor/03-seo-qa-checklist.md).

## Verifiering när kod väl skrivs

Ingen kod i den här omgången. När en PR kommer:

```text
npm run verify:pr -- --plan
npm run typecheck
npm run docs:links
```

Riktat minst: `src/app/api/audit/route.test.ts`,
`src/components/layout/site-audit-section.test.tsx`,
`src/app/sitemap.test.ts`, credits-tester för 401/402,
plus nya gäst-/rate-limit-tester som A2/A3 kräver. Browser eller curl:
`/analys` 200, metadata, gästväg enligt B1, 429, ärlig copy.

## Stoppregler

- Pausa utan B1. Gissa inte gästpolicy i koden.
- Rör inte scrape/SSRF/prompt/schema/types/`seo/audit.ts`.
- Lägg inte `/analys` i `SEO_LANDING_PAGES`.
- Byt inte semantik på `analyserad`.
- Nollställ inte `AUDIT_COSTS`. Återanvänd inte `free_generation`.
- Ingen URL-resultatcache utan nytt ja.
- Process-lokal `Map` är inte durabel i serverless — påstå inte att den är det.
- Preview och prod delar databas; gästkvitto måste tåla det.
- Pausa vid dataförlust, cross-tenant eller scope ≳ 40 filer.

## Checklista

- [ ] Jakob ja / ja med avvikelse / nej till defaultpaketet
- [ ] B1–B6 ifyllda
- [ ] A4 copy
- [ ] A1 noindex-route
- [ ] A2 + A3
- [ ] Separat ja innan index/sitemap/nav
- [ ] När spåret är mergat och ev. indexbeslut är överlämnat: väv in en
      rad i [`../../avklarat/README.md`](../../avklarat/README.md) och
      rensa den här mappen
