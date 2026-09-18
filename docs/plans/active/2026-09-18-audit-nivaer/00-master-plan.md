# Audit-nivåer: recon och produktplan (2026-09-18)

> **Status: recon. Ingen kod, ingen prisändring, ingen migration i den här
> PR:en.** Underlaget är verifierat mot koden på `preview`; rekommendationerna
> är förslag som väntar ägarbeslut.

Gäller den inloggade Audit-ytan på startsidan
([`site-audit-section.tsx`](../../../../src/components/layout/site-audit-section.tsx)),
inte publika `/analys`. Den publika lead magneten och kundanskaffningsspåren
ligger i [`../2026-09-18-analys-audit-leadmagnet/00-master-plan.md`](../2026-09-18-analys-audit-leadmagnet/00-master-plan.md).

## Varför recon behövdes

Användaren väljer mellan «Vanlig analys» 15 credits och «Avancerad analys»
25 credits. Dialogen lovar att Avancerad ger «djupare marknads- och
affärsanalys med fler dimensioner». Kodgranskningen visar att skillnaden är
mycket mindre än priset antyder.

## Verifierat nuläge

Motorn väljer modell på `promptKind`, inte på nivå
([`run-website-audit.ts`](../../../../src/lib/audit/run-website-audit.ts)):

```ts
primaryModel = promptKind === "public" ? Luna : AUDIT_STRUCTURED_DEFAULT_MODEL
allowWebSearch = promptKind === "product" && FEATURES.useAuditWebSearch
```

| Dimension | Vanlig | Avancerad | Skiljer? | Ägare |
|---|---|---|---|---|
| Modell | `gpt-5.6-sol` | `gpt-5.6-sol` | **Nej** | [`run-website-audit.ts`](../../../../src/lib/audit/run-website-audit.ts) |
| Web search | av | av | **Nej** | flaggan är mode-oberoende; se nedan |
| Scrape-djup | 4 sidor | 4 sidor | **Nej** | [`webscraper.ts`](../../../../src/lib/webscraper.ts) `MAX_PAGES = 4`, `scrapeWebsite(url)` tar inget läge |
| Tokenbudget | ingen gräns | ingen gräns | **Nej** | Responses-vägen sätter ingen; `maxOutputTokens: 16000` finns bara på fallback-vägen och är mode-oberoende |
| Output-schema | allt krävs | allt krävs | **Nej** | [`schema.ts`](../../../../src/app/api/audit/modules/schema.ts) |
| Researchsteg | 1 anrop | 1 anrop | **Nej** | motorn |
| Prompt | «håll affärssektionerna korta» | bredare marknadsanalys, minst 12 förbättringar | Ja | [`audit-prompts.ts`](../../../../src/lib/audit-prompts.ts) |
| Pris | 15 credits | 25 credits | Ja | [`pricing.ts`](../../../../src/lib/credits/pricing.ts) `AUDIT_COSTS` |

Prompten är alltså den enda funktionella skillnaden i motorn.

**Web search körs aldrig idag.** `FEATURES.useAuditWebSearch` kräver att
`AUDIT_WEB_SEARCH` är exakt strängen `"true"`
([`config.ts`](../../../../src/lib/config.ts)), och nyckeln är inte satt i
varken produktion (87 nycklar) eller preview (98) enligt `vercel env ls`
2026-09-18. Den är dessutom kopplad till `promptKind`, inte till nivå — så
även med flaggan på skulle Vanlig och Avancerad få web search samtidigt.

### Vanlig genererar affärsdata som UI:t kastar

`AUDIT_AI_SCHEMA` har `business_profile`, `market_context`,
`customer_segments`, `competitive_landscape`, `target_audience_analysis`,
`content_strategy`, `design_direction` och `priority_matrix` i `required` —
för **båda** nivåerna. En Vanlig analys genererar dem alltid.

Men modalen visar dem bara i Avancerad
([`audit-modal.tsx`](../../../../src/components/modals/audit-modal.tsx)):

```ts
hasAdvancedBusiness = isAdvancedMode && (hasBusinessProfile || hasMarketContext || …)
```

De 10 extra krediterna köper alltså i praktiken **rätten att se data som
15-krediterskörningen redan betalade för**, plus en djupare prompt. Copyn
«fler dimensioner» är osann: dimensionerna är identiska i schemat.

## Mätt kostnad

Tre riktiga körningar via publika `/analys` på Luna, samma schema och samma
basic-prompt, lokalt 2026-09-18 (loggraden `Audit cost summary`):

| Körning | Tokens | USD | SEK |
|---|---|---|---|
| 1 | 13 780 | 0,0115 | 0,13 |
| 2 | 14 313 | 0,0121 | 0,13 |
| 3 | 14 154 | 0,0117 | 0,13 |

Luna prissätts 0,2 / 1,2 USD per Mtok
([`analysis.ts`](../../../../src/app/api/audit/modules/analysis.ts)
`getPricingForModel`), vilket ger fördelningen ca **5 000 input / 8 750
output**. Output dominerar, vilket är väntat med ett stort obligatoriskt
schema.

Sol prissätts 4 / 20 USD per Mtok — 20× input och ca 17× output. Samma
tokenprofil på Sol blir därför:

| Nivå | Tokens (in/out) | Kostnad | Pris | Marginal |
|---|---|---|---|---|
| Publik `/analys` (Luna) | 5 000 / 8 750 (mätt) | **0,13 SEK** | gratis | — |
| Vanlig (Sol) | samma profil | **≈ 2,15 SEK** (härlett) | 15 credits | ~86 % |
| Avancerad (Sol) | + ≥12 förbättringar, djupare prosa | **≈ 3,0–3,7 SEK** (uppskattat) | 25 credits | ~85–88 % |

`1 kr = 1 credit` ([`credit-packages.ts`](../../../../src/lib/billing/credit-packages.ts),
paketen är 49/49, 99/99, 179/179), så credits ≈ kronor intäkt.

**Det är kärnan i problemet:** de 10 extra krediterna motsvarar ungefär
**1–1,5 kr extra beräkning**. Prisskillnaden är sju till tio gånger större
än kostnadsskillnaden.

En bieffekt att känna till: `getPricingForModel` prissätter bara tokens.
Slås web search på kommer `cost.sek` i rapporten att **underskatta** den
verkliga kostnaden, eftersom verktygsanropen inte har någon rad i tabellen.

## Beslutspunkt D1 — två nivåer eller tre?

**Rekommendation: gör de två befintliga ärliga först, lägg Expert som en
egen senare fas.**

Två skäl. De två betalda nivåerna är i praktiken inte skilda idag, och en
tredje nivå ovanpå ett odifferentierat par multiplicerar problemet i stället
för att lösa det. Och Expert kräver maskineri som inte finns: flera
researchsteg existerar inte i audit-motorn alls. Enda befintliga
web-search-anropet utanför audit är
[`wizard/company-lookup`](../../../../src/app/api/wizard/company-lookup/route.ts),
som är ett rimligt mönster att titta på men inte en flerstegspipeline.

Alternativ som avvisas: införa Expert direkt. Då säljs en tredje nivå medan
nivå två fortfarande mest är en promptvariant.

## Beslutspunkt D2 — vad ska skilja nivåerna i motorn

Förslag, med vad som måste ändras för att var sak ska bli möjlig:

| Dimension | Vanlig | Avancerad | Expert (senare) | Kräver |
|---|---|---|---|---|
| Modell | Sol | Sol | Sol | inget — redan sant |
| Web search | av | **på** | på, flera sökningar | flytta `allowWebSearch` från `promptKind` till nivå + sätt `AUDIT_WEB_SEARCH` |
| Scrape-djup | 4 sidor | **8–10 sidor** | 10+ | `scrapeWebsite` behöver ett läges-/optionsargument; `MAX_PAGES` är en konstant idag |
| Tokenbudget | oförändrad | högre | högst | explicit `max_output_tokens` per nivå i Responses-anropet |
| Schema | **kärna** | kärna + affär/marknad | + Expert-artefakter (30/60/90-plan, konkurrentjämförelse) | se D3: strict-läget tillåter inte valfria fält |
| Researchsteg | 1 | 1 + sökning | **flera steg + syntes** | ny orkestrering i motorn |

Teknisk spärr att känna till: `AUDIT_AI_SCHEMA` har
`additionalProperties: false`, och strict-läget kräver att **alla**
properties ligger i `required` — det kontrolleras vid modulladdning av
`validateStrictSchema`. «Valfria avancerade fält» går alltså inte att
uttrycka. Nivåskillnad i output kräver **separata schemaobjekt**, inte
optionella properties.

## Beslutspunkt D3 — affärsdatan i Vanlig: visa eller sluta generera?

Två rena alternativ:

| Alternativ | Innebörd | Konsekvens |
|---|---|---|
| **A: visa den i Vanlig** | ta bort `isAdvancedMode`-gaten | Billigast att göra, gör copyn sann direkt — men då återstår nästan ingenting som skiljer Avancerad |
| **B: sluta generera den för Vanlig** | dela schemat i kärna och utökat | Sänker Vanlig-kostnaden och gör Avancerad verkligt större |

**Rekommendation: B för de tunga affärs-/marknadssektionerna, A för de
lätta som redan visas.** Att betala Sol-outputtokens för fält som UI:t
kastar är rent slöseri, och output är där kostnaden ligger. De sektioner
som redan syns i Vanlig efter #1471 (målgrupp, innehållsstrategi, snabba
vinster) stannar i kärnan.

Grov effekt: affärs-/marknads-/segment-/konkurrenssektionerna är en
betydande del av outputen. Faller de bort landar Vanlig sannolikt kring
**1,4–1,7 SEK** i stället för 2,15. Det är en uppskattning, inte en mätning
— den bör mätas på en riktig körning innan den används som beslutsunderlag.

## Beslutspunkt D4 — minsta ärliga differentiering

Utan ny nivå och utan prisändring:

1. Dela schemat enligt D3 så Vanlig slutar generera det den gömmer.
2. Ge **bara** Avancerad web search: nyckla `allowWebSearch` på nivå och
   sätt `AUDIT_WEB_SEARCH`. Mät kostnaden efter påslag — och lägg en rad
   för verktygsanrop i kostnadsberäkningen, annars blir `cost.sek` osann.
3. Rätta dialogcopyn så den beskriver vad som faktiskt skiljer.

Då köper de 10 extra krediterna något verkligt: extern research och en
bredare analys, inte en upplåst flik. Scrape-djup (punkt i D2) är nästa
billigaste steg om det behövs mer.

## Beslutspunkt D5 — vad Expert kräver (implementeras inte här)

Kartlagt så beslutet kan fattas med öppna ögon. Ingen av raderna är gjord.

**Credits och pris**

| Del | Fil |
|---|---|
| `CreditAction` += `"audit.expert"` | [`pricing.ts`](../../../../src/lib/credits/pricing.ts) |
| `CreditActionPrices` += `auditExpert` | samma fil |
| `DEFAULT_CREDIT_ACTION_PRICES` + `getCreditCost`-case | samma fil |
| `AUTH_REQUIRED_MESSAGES` | [`credits/server.ts`](../../../../src/lib/credits/server.ts) |
| `VALID_ACTIONS` | [`credits/check/route.ts`](../../../../src/app/api/credits/check/route.ts) |
| `CREDIT_ACTION_PRICE_FIELDS` **och** `creditActionPricesPatchSchema` | [`pricing-settings.ts`](../../../../src/lib/db/services/pricing-settings.ts) — båda är `z.strictObject` och avvisar okända nycklar |

**Databas:** ingen migration. `credit_action_prices` är en `JSONB`-kolumn
som bara bär de overrides en admin satt
([`schema.ts`](../../../../src/lib/db/schema.ts),
[`add-pricing-settings.sql`](../../../../src/lib/db/migrations/add-pricing-settings.sql)).
Koden äger defaultvärdena. Men zod-schemana ovan måste utvidgas, annars
avvisas det nya fältet.

**Backoffice/admin:** `StatCard` och `CreditRow` för den nya nivån i
[`priser-section.tsx`](../../../../src/app/admin/components/sections/priser-section.tsx),
plus [`pricing-patches.ts`](../../../../src/app/admin/lib/pricing-patches.ts)
och [`admin/components/types.ts`](../../../../src/app/admin/components/types.ts).

**Motor och typer:** `AuditMode` i
[`types/audit.ts`](../../../../src/types/audit.ts) är `"basic" | "advanced"`;
`AUDIT_AI_SCHEMA.audit_mode` har samma enum; `createFallbackResult` och
`handler.ts`-mappningen tar `AuditMode`. En tredje nivå rör alla fyra.

**UI:** tredje kort i valdialogen
([`site-audit-section.tsx`](../../../../src/components/layout/site-audit-section.tsx))
och nivåetikett/gating i
[`audit-modal.tsx`](../../../../src/components/modals/audit-modal.tsx).

`public-pricing.ts` följer automatiskt eftersom den speglar
`CreditActionPrices`.

## Beslutspunkt D6 — föreslagen prissättning

Som beslutsunderlag, inte som ändring:

| Nivå | Kostnad per körning | Förslag | Kommentar |
|---|---|---|---|
| Vanlig | ≈1,4–2,1 SEK | **15 credits** (oförändrat) | Kostnaden sjunker om D3-B genomförs |
| Avancerad | ≈4–6 SEK med web search och djupare scrape (uppskattat) | **25–35 credits** | 25 räcker om marginalen får sjunka; 35 om Expert ska ligga tydligt över |
| Expert | ≈8–15 SEK vid flera researchsteg (grov gissning) | **50–75 credits** | Måste mätas på en prototyp innan priset sätts |

Alla siffror utom de tre mätta Luna-körningarna är härledda eller
uppskattade. Sätt inte priser på uppskattningarna — mät Avancerad efter att
web search är påslagen, och Expert på en prototyp.

## Föreslagen fasordning

| Fas | Innehåll | Gate ut |
|---|---|---|
| 0 | Ägarbeslut D1–D6 | Ja / ja med avvikelse / nej |
| 1 | D4: schemadelning, web search bara för Avancerad, ärlig copy, kostnadsrad för verktygsanrop | Nivåerna skiljer sig i motorn; `cost.sek` är sann |
| 2 | Mät verklig kostnad per nivå på riktiga körningar | Prissättning vilar på mätning, inte gissning |
| 3 | Ev. scrape-djup per nivå | Avancerad ser mer av sajten |
| 4 | Ev. Expert enligt D5, efter att fas 1–2 är sanna | Ny nivå som är verkligt större |

## Stoppregler

- Ingen prisändring, migration eller runtimeändring i den här PR:en.
- Bygg inte Expert innan Vanlig och Avancerad faktiskt skiljer sig.
- Nollställ inte `AUDIT_COSTS`; publika `/analys` ska förbli Luna och
  behålla sitt tak på 1 körning per IP och dygn.
- Slå inte på `AUDIT_WEB_SEARCH` globalt utan att först nyckla den på nivå —
  annars får Vanlig samma research som Avancerad.
- Påstå inte att Avancerad har djupare research förrän den har det.
- Rör inte `AUDIT_AI_SCHEMA`, `scrapeWebsite` eller SSRF-guarden utan att
  äga följdytorna (tester, Backoffice-paritet, kostnadslogg).

## Checklista

- [ ] D1: två nivåer nu, Expert senare — eller tre direkt
- [ ] D2: vilka motordimensioner som ska skilja nivåerna
- [ ] D3: visa affärsdatan i Vanlig eller sluta generera den
- [ ] D4: godkänn minsta ärliga differentiering
- [ ] D5: ja eller nej till Expert som egen nivå
- [ ] D6: prissättning efter mätning, inte efter uppskattning
