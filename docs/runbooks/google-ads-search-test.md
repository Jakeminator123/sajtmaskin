# Search Ads-test — 3 000 kr/mån

Operativ ägare för det lilla Google Search-testet. Beslutsrad:
[`docs/decisions/README.md`](../decisions/README.md) (2026-09-18).
Kundanskaffningsstrategin (v3) och trafikstrategin 2026-09-17 ligger utanför
repot; de motiverar testet men äger inte budget, UTM eller kontoinställningar.

**Syfte:** validera om hög köpintention konverterar till builder-start.
Inte att ersätta outreach, SEO eller att “rädda” en omätt funnel.

---

## Beslut (låst tills ägaren vänder)

| Parameter | Värde |
|---|---|
| Juridisk annonsör | **Pretty Good B.V.** (Nederländerna). Inte svenskt AB, inte Pretty Good Holding B.V., inte Jakob privat. Sajtmaskin är produktnamnet. |
| Kanal | Google **Search** only |
| Budget | **3 000 kr/mån** ≈ **100 kr/dag** |
| Geo | Sverige (kampanjmål; inte samma sak som bolagets hemvist) |
| Språk | Svenska |
| Intentlager | Bara **A – direkt köp** |
| Primär KPI | Klick → builder-start (`/builder?new=1`) |
| Sekundär KPI | Konto → första generation |
| Stopp | Se [Stoppregler](#stoppregler) |

Lager B–E från v2 (nyföretag, digital identitet, lead/bokning, replacement)
startas inte i den här rundan. Display, Performance Max, Search-partners och
brand-kampanj mot “Sajtmaskin” ingår inte.

3 000 kr/mån är okej som första cap. Vid typisk CPC 15–40 kr räcker det till
ungefär 75–200 klick — tillräckligt för att se om landning → builder lever,
inte för statistiskt säkra branschjämförelser.

### Fakturaprofil (Google Payments)

Profilen ska vara **organisation / Pretty Good B.V.**, inte privatperson
och inte Pretty Good AB. Kampanjlandet Sverige och SEK är serving/budget,
inte bolagets hemvist.

Bolagsadress, organisationsnummer, VAT och kvitto-e-post ligger utanför
git (`övrigt/pretty-good-bv/`). Kortuppgifter fylls av ägaren i vanlig
Chrome, inte av agenten. Spend ska gå från bolagskonto.

---

## Innan någon krona går

Kontot och Keyword Planner får sättas upp nu. **Spend är av** tills allt
nedan är sant:

1. ~~Landningssidorna svarar **200** på `https://sajtmaskin.se/…`~~
   **Verifierat 2026-09-18:** `/hemsida-till-foretag`,
   `/vad-kostar-en-hemsida` och `/skapa-hemsida-med-ai` svarar 200 i
   produktion.
2. ~~`robots` är `index, follow` och canonical pekar på produktions-URL.~~
   **Verifierat 2026-09-18** på `/hemsida-till-foretag`.
3. Auto-tagging är på, UTM sitter på final URL, minst en
   **builder-start**-konvertering är skapad i Ads, och production-env
   `NEXT_PUBLIC_GOOGLE_ADS_ID` + `NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START_LABEL`
   är satta (taggen är fail-closed utan dem).
4. Kampanjen är granskad mot [Negativlista](#negativlista) och
   [Tracking](#tracking).

SEO-serien är `ready` på preview-grenen; Production/indexering är ett
separat promote-steg
([SEO-plan](../plans/active/2026-09-16-seo-landningssidor/00-master-plan.md)).
Peka inte betald trafik mot staging.

---

## Kampanj

Ett konto, **en** kampanj, **tre** annonsgrupper.

| Fält | Värde |
|---|---|
| Kampanjnamn | `search-intent-a` |
| Typ | Search |
| Nätverk | Google Sök. Av: sökpartners, Display |
| Daglig budget | 100 kr (konto-/delad månadsbudget 3 000 kr om UI:t erbjuder det) |
| Bud | Start: *Maximize clicks* med max CPC-tak **45 kr**. Byt till *Maximize conversions* först efter minst 30 `builder_start` |
| Annonsschema | Alla dagar |
| Enheter | Alla |

### Annonsgrupper och landningar

Final URL är alltid produktion + UTM enligt [Tracking](#tracking).

| Annonsgrupp | Exempelord (exakt / fras) | Landning |
|---|---|---|
| `hemsida-foretag` | hemsida företag, skapa hemsida företag, hemsida småföretag, hemsida till enskild firma | `/hemsida-till-foretag` |
| `hemsida-pris` | hemsida pris, vad kostar en hemsida, hemsida pris företag | `/vad-kostar-en-hemsida` |
| `skapa-hemsida-ai` | skapa hemsida med ai, ai hemsidebyggare | `/skapa-hemsida-med-ai` |

Bred matchning av. En landning per grupp. CTA på sidan är redan
`/builder?new=1` (`SEO_LANDING_CTA_HREF` i
[`src/lib/seo-landing-pages/registry.ts`](../../src/lib/seo-landing-pages/registry.ts)).

### Keyword Planner 2026-09-18 (Sverige, svenska)

Uppmätt i kontot, inte gissat. Toppbud = *bud för visning högst upp på
sidan*, lågt–högt intervall.

| Sökord | Sökningar/mån | Konkurrens | Toppbud |
|---|---|---|---|
| `vad kostar en hemsida` | 100–1 tn | Hög | **15,50–39 kr** |
| `vad kostar det att göra en hemsida` | 10–100 | Hög | 11,29–31 kr |
| `hemsida företag` / `hemsida till företag` | 100–1 tn | Hög | 38,38–115 kr |
| `billig hemsida` | 100–1 tn | Hög | 37,10–190 kr |
| `skapa hemsida företag` | 100–1 tn | Hög | 48,88–174 kr |
| `företag som gör hemsidor` | 10–100 | Hög | 46,33–243 kr |

Följder för budet: **35 kr räcker inte.** Två av tre grupper ligger under
lägsta toppbud vid 35. Taket är därför **45 kr**; månadscapen 3 000 kr är
oförändrad och är den som faktiskt begränsar spend.

`vad kostar en hemsida` är billigast per klick med bibehållen volym och bör
få störst andel av budgeten.

**Starta-eget-vinkeln (verksamt/Bolagsverket) mättes och valdes bort som
sökordsspår:** `starta eget hemsida` 10–100/mån och 51,27 kr, `starta egen
hemsida` 51,82 kr, `öppna egen hemsida` 50,32 kr. Låg volym, hög CPC. Det
bekräftar att lager B hör hemma i outreach, inte i Search. Domänfönstret
T0→T1→T2 i kundplanens `HÄR.txt` är en **signal att observera**, inte en
annonskanal — Verksamt säljer inte hemsidor, och den som söker «starta
enskild firma» vill registrera ett bolag, inte köpa en sajt.

Ord med uppenbart hobby-/jobb-intent åker till negativlistan, inte in i
gruppen.

### Annons

En RSA per grupp räcker att börja med. Löften som produkten faktiskt håller:

- första version från en beskrivning
- företaget tar över och ändrar
- ingen webbyråjämförelse utan färsk officiell källa

Sälj inte “AI” som huvudbudskap. Sälj att starten redan är gjord.

Rubriker max 30 tecken, beskrivningar max 90. Texterna nedan är de som
ligger i kontot respektive är förberedda.

**`hemsida-foretag`** (i kontot, annonsstyrka Medel)

Rubriker: Hemsida till företaget · Färdig sajt från en text · Företagssajt
på minuter · Beskriv – få hemsidan · Hemsida utan webbyrå · Du äger och
ändrar själv · Starta hemsidan idag

Beskrivningar: «Beskriv företaget med egna ord. Sajtmaskin bygger första
versionen åt dig.» · «Du tar över och ändrar texter, bilder och sidor när
du vill. Ingen byrå behövs.»

**`hemsida-pris`** (förberedd)

Rubriker: Vad kostar en hemsida? · Se priset innan du köper · Hemsida utan
offert · Ingen dold kostnad · Billigare än webbyrå · Hemsida till fast pris
· Prova innan du betalar

Beskrivningar: «Vi förklarar vad en hemsida faktiskt kostar – byrå, verktyg
och eget arbete.» · «Se ditt förslag först. Du bestämmer om det är värt
pengarna.»

**`skapa-hemsida-ai`** (förberedd)

Rubriker: Skapa hemsida med AI · AI bygger första sidan · Från text till
hemsida · Hemsida på svenska · Du ändrar allt efteråt · Ingen mall att
fylla i · Kom igång på minuter

Beskrivningar: «Skriv vad företaget gör. Du får en färdig startpunkt att
bygga vidare på.» · «AI gör grovjobbet – du bestämmer texter, bilder och
struktur.»

---

## Negativlista

Från dag ett, som *kampanjnegativ*. Exakta termer fylls på från Search Terms,
inte från gissningar.

Kategorier att exkludera nu:

- jobb / lön / utbildning / kurs
- skoluppgifter / mall / gratis (om vi inte aktivt vill ha den trafiken)
- HTML/CSS/WordPress-utvecklarfrågor
- privat blogg / hobby
- Wix/WordPress *login, support, dokumentation* (inte “alternativ”)

---

## Tracking

Två lager. Ads-lagret är beslutsunderlag för den här budgeten. Första
part är komplement — bygg inte ett analyticsprojekt före första klicken.

### 1. Google Ads (måste finnas före spend)

**Google-taggen måste sitta på produktion (`sajtmaskin.se`) innan någon
krona går.** En URL-regel i Ads-UI mot «innehåller `/builder`» räcker
**inte** för v1: den räknar refresh, återbesök och öppnade projekt. Appen
skickar tre händelser via första-parts `gtag` när env är satt och
cookie-samtycke är `accepted`.

| Inställning | Värde |
|---|---|
| Auto-tagging | På (`gclid`) |
| Tag | `NEXT_PUBLIC_GOOGLE_ADS_ID` (`AW-…`). Tom = ingen tag, inga events |
| Primär konvertering | `builder_start` — landning på `/builder?new=1` (`SEO_LANDING_CTA_HREF`). Label: `NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START_LABEL`. sessionStorage-dedup så refresh inte dubbelräknar |
| Sekundär | `account_created` — efter lyckad **ny** e-postregistrering och första Google-signup (`signup=1`). Inte login. Inte GitHub (GitHub OAuth skapar inget konto). Label: `NEXT_PUBLIC_GOOGLE_ADS_ACCOUNT_CREATED_LABEL` |
| Tertiär | `first_generation` — första lyckade generation som ger `versionId` i den här webbläsaren (init eller follow-up). Ingen serverflagga för «användaren har aldrig genererat». Label: `NEXT_PUBLIC_GOOGLE_ADS_FIRST_GENERATION_LABEL` |
| Värde | Inte satt i v1; vi mäter händelser, inte kr/konvertering |
| Samtycke | `localStorage` `cookie-consent` måste vara `accepted`. Declined eller saknad = ingen gtag, inga Ads-cookies |
| CSP | `src/proxy.ts` allowlistar `www.googletagmanager.com`, `www.googleadservices.com`, `googleads.g.doubleclick.net`, `www.google.com` |
| Admin | Taggen laddas inte på `/admin` |

Skapa de tre konverteringarna i Ads-UI och klistra **bara label-delen**
(efter `AW-id/`) i env. Sätt inte riktiga AW-id i git. Osatt label = den
händelsen är en no-op även om kontotaggen är satt.

Ingen GA4/GTM-yta, ingen remarketing, ingen `page_views`-/UTM-migration.

### 2. UTM på varje final URL

```text
utm_source=google
utm_medium=cpc
utm_campaign=search-intent-a
utm_content=<annonsgrupp>
```

Exempel:

`https://sajtmaskin.se/hemsida-till-foretag?utm_source=google&utm_medium=cpc&utm_campaign=search-intent-a&utm_content=hemsida-foretag`

### 3. Första part — vad som faktiskt sparas idag

[`AnalyticsTracker`](../../src/components/layout/analytics-tracker.tsx) POST:ar
`path` (pathname, **utan** query) + `document.referrer` till
`/api/analytics`. Tabellen `page_views` har ingen UTM-/`gclid`-kolumn.

Följd: adminstatistiken kan visa att `/hemsida-till-foretag` fick besök och
att referrern var Google. Den kan **inte** svara “vilket sökord blev en
generation”. Det svaret ägs av Ads (Search Terms + konverteringar) tills
någon medvetet utökar trackern.

Gör **inte** en bred analyticsombyggnad före launch. Om Ads-datan inte räcker
för ett beslut: ett smalt tillägg som sparar `utm_source` / `utm_campaign` /
`gclid` på `page_views`, eller ett campaign-event vid CTA-klick. Separat
kodändring, inte en del av kontouppsättningen.

Vercel Analytics och Search Console är organiska ytor. De ersätter inte
Ads-konverteringar.

### Funnel att läsa av varje vecka

```text
Ads-impression
→ klick (Ads)
→ landningssida (Ads + page_views.path)
→ builder-start (Ads builder_start + page_views /builder)
→ konto
→ första generation
```

En generation utan `builder_start` i Ads är ett trackingfel, inte en vinst.

---

## Stoppregler

Pausa kampanjen och återkom till ägaren om något av detta slår:

- 7 dagar och **0** `builder_start` trots ≥30 klick
- Search Terms domineras av irrelevant intent efter negativputs
- daglig spend drivs av ett enda dyrt ord utan konvertering (pausa ordet)
- någon föreslår att höja cap över 3 000 kr/mån utan nytt ägarbeslut
- landningen 404:ar, pekar på staging eller har `noindex`

Fortsätt (inom cap) när minst några klick blir builder-start och Search Terms
ser ut som företag — inte hobby eller jobb.

---

## Läge i kontot 2026-09-18

Faktureringsland Nederländerna, valuta SEK, betalprofil Pretty Good B.V.
(organisation). Konto-id, betalningsmedel och kvittoidentifierare ligger
hos ägaren, inte i git.

| Sak | Status |
|---|---|
| `search-intent-a` | **Pausad.** Search only, Sverige, svenska, 100 kr/dag, Maximera klick med CPC-tak 45 kr |
| Nätverk | Sökpartners och Display **av**. AI Max av, tillgångsoptimering av |
| Annonsgrupp 1 | 8 sökord (fras/exakt), en RSA med 5 rubriker och 2 beskrivningar mot `/hemsida-till-foretag` + UTM |
| Konverteringar | `builder_start` (primär), `account_created` (sekundär) — manuellt med kod, inte URL-regel |
| Konto | Pausat av Google tills **annonsörsverifiering** är klar (handlingar ska skickas in) |

Två spärrar gäller alltså samtidigt: kampanjen är pausad av oss, kontot är
pausat av Google. Ingen visning, ingen spend.

Kvar innan spend: annonsörsverifiering, promote av tagg-koden till
`master` (env är satt; `NEXT_PUBLIC_*` inlineas vid build),
annonsgrupperna `hemsida-pris` och `skapa-hemsida-ai`, negativlistan och
`first_generation`.

Production-env (encrypted, bara `production`, 2026-09-18):
`NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START_LABEL`,
`NEXT_PUBLIC_GOOGLE_ADS_ACCOUNT_CREATED_LABEL`. Inte preview. Inte
`FIRST_GENERATION` — den konverteringen saknas i Ads.

**Webviewvarning:** Google Payments och Cardinal/3-D Secure blockeras av
Cloudflare i Cursors inbyggda browser. Betalning, identitetsverifiering och
annonsörsverifiering görs i vanlig Chrome. Sparfel i kampanjbyggaren
(«Det gick inte att spara ändringar») beror på samma sak — då tappas
sökord och annonstext utan varning.

---

## Uppsättningsordning i Ads-UI

1. Keyword Planner: Lager A, geo Sverige, spara volym/CPC här i chatten.
2. Skapa konto / kampanj `search-intent-a` **pausad**.
3. Tre annonsgrupper, negativlista, UTM, auto-tagging, `builder_start`.
4. Granska final URL:er mot produktion.
5. Ägaren slår på kampanjen när [Innan någon krona går](#innan-någon-krona-går)
   är uppfyllt.

Kontouppgifter, fakturering och inloggning är ägarens. Agenten navigerar UI:t
efter inloggning men publicerar inte spend utan uttryckligt “sätt på”.
