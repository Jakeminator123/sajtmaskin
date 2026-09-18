# Publik `/analys` via befintlig audit (2026-09-18)

> **Status: mergad till preview i #1471.**
> Publik `/analys` är en egen yta (inte Audit-modalen). Motor:
> `runWebsiteAudit` + `POST /api/analys`. Gratisvägen = `gpt-5.6-luna` +
> basic, ingen web_search. Inloggad produkt-audit = `gpt-5.6-sol`. Routern
> i [`../README.md`](../README.md) pekar hit.

Runtime-ägare är audit-motorn, inte den här mappen:
[`src/app/api/audit/modules/handler.ts`](../../../../src/app/api/audit/modules/handler.ts).
`src/lib/seo/audit.ts` är **en annan sak** (källkods-SEO på genererade
projekt) och hör inte hit.

## Syfte

Återanvänd befintlig website-audit (scrape → LLM → scores → PDF) som
publik lead magnet på `sajtmaskin.se/analys`.

Inbound: vem som helst matar in en URL och får en rapport, med tydlig
CTA till konto och builder. Outbound (samma motor före outreach) är
idé, inte det här spåret.

## Kundanskaffning: widget-spåret är struket

Av de fem kundanskaffningsspåren är **punkt 2, den publika
webbplatsgranskningen**, avklarad i kod (#1471) och stryks från listan.
De fyra övriga namnges i
[`resterande-fyra-spar.md`](resterande-fyra-spar.md) så de inte bara
finns i Jakobs opushade Windows-checkout.

| # | Spår | Status |
|---|---|---|
| 1 | Inline bild i kalla mejl/DM | Protokoll klart, experiment ej kört — [`aktiviteter/K1-inline-bild-ab-test.md`](aktiviteter/K1-inline-bild-ab-test.md) |
| 2 | Publik «gratis webbplatsgranskning»-widget (`/analys`) | Gjort i #1471 |
| 3 | T-1: varumärkesansökan hos PRV | Beställning: datatillgänglighetsstudie |
| 4 | Nyemission registrerad hos Bolagsverket | Beställning: litet manuellt premiumexperiment |
| 5 | DNS/nameserver-byte hos befintligt bolag | PARK tills Radar v1 |

Ordningen följer v3-disciplinen: testa signalvärdet på ett litet antal
riktiga leads innan något automatiseras. **PRV T-1 och nyemission är
beställningar; DNS-bytet är PARK tills Radar v1 finns.** Inget av dem är
arbete som pågår. Annonsspåret («verksamt»-ögonblicket) är paid intent och
hålls utanför de fem. Utskick och leadhantering ägs av ägarens separata repo
`Jakeminator123/JakobScrape`, inte av det här repot.

Numreringen i tabellen ovan är den **ursprungliga** fem-listan. Restlistan
numrerar om de kvarvarande fyra, så hänvisa till spåren med namn, inte
nummer.

Ett skrivet protokoll är inte ett utfall: spår 1 är avklarat först när K1:s
A/B faktiskt körts och resultatet står i aktivitetsfilen.

Levererat i det här spåret:

| Del | Var |
|---|---|
| Publik yta `/analys`, `noindex`, egen H1 | [`src/app/analys/`](../../../../src/app/analys/) |
| Gästväg utan konto/credits, 1 körning/IP/24h | [`src/app/api/analys/route.ts`](../../../../src/app/api/analys/route.ts), `analys:public` i [`rate-limit.ts`](../../../../src/lib/rate-limit.ts) |
| Delad motor, billig modell på gratisvägen | [`run-website-audit.ts`](../../../../src/lib/audit/run-website-audit.ts), `audit_structured_public` i [`manifest.json`](../../../../config/ai_models/manifest.json) |
| Publik projektion (inget internt payload till gäst) | [`public-report.ts`](../../../../src/lib/audit/public-report.ts) |
| Ärlig copy i audit-entry | [`entry-modal.tsx`](../../../../src/components/modals/entry-modal.tsx) |

Kvar som separata ägarbeslut, inte som en del av spåret: indexering och
sitemap (B2), partnerflytt av `?mode=audit` (B4) och org.nr-prefill.

## Hypotes

Auditen är redan tillräckligt “wow” (PDF, scores, förbättringar) för att
fungera som granskning — om vi exponerar den publikt med ärlig copy och
en kostnadsspärr, utan ny analysmotor.

## Läge före #1471 (bevis 2026-09-18, historik)

Det här är utgångsläget spåret skrevs mot, inte dagens sanning. Den
inloggade audit-vägen ser fortfarande ut så här; raderna som #1471 gjorde
falska är markerade i tabellen.

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
| ~~Copy ljuger: «kostnadsfri AI-analys … helt gratis»~~ — rättat i #1471 | [`entry-modal.tsx`](../../../../src/components/modals/entry-modal.tsx) |
| ~~`/analys` finns inte~~ — sidan finns sedan #1471. Sitemap/robots nämner den fortfarande inte (B2 är öppet) | [`sitemap.ts`](../../../../src/app/sitemap.ts), [`robots.ts`](../../../../src/app/robots.ts) |
| `analyserad` är wizard, inte audit | [`use-entry-params.ts`](../../../../src/lib/entry/use-entry-params.ts), [`route-target.ts`](../../../../src/components/landing-v2/route-target.ts) |
| ~~Landing-nav/footer har ingen audit-länk~~ — nav och footer länkar `/analys` sedan #1471. App-nav «Audits» → `/audits` (inloggad) står kvar. | [`landing-v2/navbar.tsx`](../../../../src/components/landing-v2/navbar.tsx), [`navbar.tsx`](../../../../src/components/layout/navbar.tsx) |

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
| [resterande-fyra-spar.md](resterande-fyra-spar.md) | De fyra kvarvarande kundanskaffningsspåren, med ordning och läge |
| [aktiviteter/K1-inline-bild-ab-test.md](aktiviteter/K1-inline-bild-ab-test.md) | A/B-protokoll för inline bild i outreach |

SEO-QA att återanvända (inte kopiera registret):
[`../2026-09-16-seo-landningssidor/03-seo-qa-checklist.md`](../2026-09-16-seo-landningssidor/03-seo-qa-checklist.md).

## Verifiering (kört på branchen)

```text
npm run verify:pr -- --plan
npm run typecheck
npm run docs:links
npx vitest run src/lib/audit src/app/api/analys src/app/api/audit src/components/modals
```

Riktat: `public-report.test.ts` (publik projektion, cap, prioritering),
`route.test.ts` för `/api/analys` (validering före kvot, privat host,
inget internt payload, `no-store`), `public-analys.test.ts` (prompt- och
klientkontrakt), `audit-modal.overview.test.tsx` (målgrupp i vanligt läge,
ingen auto-overlay), `entry-modal.copy.test.tsx` (ärlig copy) plus
befintliga `src/app/api/audit/route.test.ts` och
`audit-modal.save-state.test.tsx`.

Live: `POST /api/analys` mot en riktig sajt ger 200 med `gpt-5.6-luna`,
`web_search=false` och ~0,13 SEK per körning; `/analys` renderar
rapporten i browsern.

## Säkerhetsbeslut på den publika ytan

| Beslut | Varför |
|---|---|
| Validering och SSRF-förkontroll **före** rate limit | En felstavning eller en probe ska inte bränna gästens enda dygnskörning |
| Publik projektion (`toPublicAnalysReport`) | Gäst får aldrig `site_content`, `template_data`, `color_theme`, budget, konkurrensdata eller kostnad — annars är `/analys` ett gratis scraping-/promptAPI |
| Cap på strängar och listor | En fientlig målsajt ska inte kunna blåsa upp svaret |
| `Cache-Control: no-store` + `X-Robots-Tag: noindex` | Gästrapporten är per anropare och ska inte mellanlagras eller indexeras |
| Modell-id bara utanför produktion | Intern modellval är inte publik information |
| PDF/spara/bygge bakom konto | B1-defaulten; också det som gör magneten till en magnet |

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

- [x] Jakob ja / ja med avvikelse / nej till defaultpaketet
- [x] B1 (1× basic/IP/24h, signup för PDF/spara/bygge), B3 (nav/footer länkad)
- [ ] B2 (index/sitemap), B4 (partner `?mode=audit`), B5, B6 kvarstår
- [x] A4 copy — entry-modalen lovar inte längre avgiftsfri audit
- [x] A1 noindex-route
- [x] A2 + A3
- [ ] Separat ja innan index/sitemap
- [x] Widget-spåret mergat till preview (#1471)
- [x] De fyra övriga kundanskaffningsspåren namngivna i
      [`resterande-fyra-spar.md`](resterande-fyra-spar.md)
- [x] K1 (inline bild) har ett körbart A/B-protokoll; render-till-bild
      verifierat på befintlig capture
- [ ] Kör K1:s A/B och skriv in utfallet (vinst, förlust eller
      `INCONCLUSIVE`) — ägarens steg, i `JakobScrape`
- [ ] Spår 3–5 beställs separat i den ordning restlistan anger
- [ ] Mappen stannar **aktiv** tills K1 har ett faktiskt utfall. Städa den
      inte till [`../../avklarat/`](../../avklarat/) bara för att
      protokollet är skrivet. När både indexbeslutet är överlämnat och K1
      har utfall: väv in en rad i
      [`../../avklarat/README.md`](../../avklarat/README.md) och låt
      `resterande-fyra-spar.md` och `aktiviteter/K1-*` följa med eller få
      ny hemvist, så listan inte bara finns i git-historiken
