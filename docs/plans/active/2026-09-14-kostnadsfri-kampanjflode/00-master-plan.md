# Kostnadsfri-kampanjflödet — sidantal, bolagsdata och pre-generering (2026-09-14)

> **Status: två beslut fattade och implementerade, ett kvar.** Sidantalet är
> avgjort 2026-09-14 (3 sidor) och bolagsdatans PII-gräns 2026-09-15 (allowlist
> plus personnummerspärr) — båda i
> [`docs/decisions/README.md`](../../../decisions/README.md). Koden är skriven men
> **inte mergad**, så `master` är auktoritet tills den är det. Kvar som rad i
> [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) § Väntar på
> ägarbeslut: pre-generering vid lösenordsverifiering. Städlistan längst ned
> hänger på besluten och ska köras i samma ändring som respektive beslut, inte som
> ett eget "senare".

Utlöst av ägarens genomgång 2026-09-14 av `/kostnadsfri/[slug]`: varför en
kampanjsajt blev femsidig, och om första versionen kan börja byggas redan när
företaget loggar in med koden. Videon och omdesignen av landningssidan är ett
separat spår (draft-PR från cloud-agent) och hör inte hit.

Evidensen nedan är läst i arbetsträdet mot `preview`-basen 2026-09-14. Den är
**inte** omverifierad mot `master`.

## 1. Sidantalet har tre ägare och ett tal

| Ställe | Säger | Ursprung |
|---|---|---|
| `INDUSTRY_PAGES` i `src/lib/kostnadsfri/index.ts` | 4–5 namngivna sidor per bransch | odaterad, ingen beslutsrad |
| `buildPromptFromWizardData` samma fil | `Scope: … (${pages.length} pages)` | följer tabellen ovan |
| `MAX_PAGE_COUNT_CHOICE` i `src/lib/builder/init-build-choices.ts` | 3 | ägarbeslut 2026-07-31 (tokenbudget/kvalitet) |
| `MAX_ROUTES_PER_GENERATION` i `src/lib/gen/route-plan/route-plan-builder.ts` | 4 (mjukt tak per runda) | beslutsrad 2026-08-14, djupmedvetet sidtak |
| `ABSOLUTE_MAX_ROUTES_PER_GENERATION` samma fil | 8 (hårt stopp) | samma beslutsrad |

Mekaniken som gör att fem sidor levereras: prompten både namnger fem sidor och
skriver ut `(5 pages)`. `detectExplicitPageCount` läser talet, `route-plan-builder`
klämmer det till 4 — men eftersom det klämda talet då är `>= MAX_ROUTES_PER_GENERATION`
sätts `allowCeilingExemptions`, och uttryckligen namngivna sidor får överleva det
mjuka taket upp till 8. Nettoresultatet är en femsidig sajt, vilket stämmer med
den senaste körningen ägaren tittade på.

Ingen del av kedjan är trasig i sig. Divergensen är att kampanjflödet sätter sitt
eget sidantal i en tabell utan beslutsrad, och därmed går runt 3-sidesbeslutet
utan att någon behövde ompröva det.

**Beslutat 2026-09-14: 3 sidor gäller även kampanjsajter.** Talet får en ägare —
`MAX_PAGE_COUNT_CHOICE` — och kostnadsfri-modulen slutar bestämma det själv.
Beslutsrad: [`docs/decisions/README.md`](../../../decisions/README.md).

**Väg B valdes och är implementerad (ej mergad).** Talet reser strukturerat, inte
i prosa:

| Fil | Ändring |
|---|---|
| `src/app/builder/page-controller/useBuilderAutoStartGeneration.ts` | Fyller `pageCount` i byggvalsstoren före auto-starten, men bara när inget val redan uttalats (`0 = auto`). `buildInitBuildChoicesMeta` gör det till `meta.pageCountHint`. |
| `src/lib/kostnadsfri/index.ts` | `resolvePageStructure` tar `maxPages` utifrån; `INDUSTRY_PAGES` är prioritetsordning utan eget tal; `Scope`-raden slutade skriva ut `(N pages)` |
| `src/components/kostnadsfri/kostnadsfri-page.tsx` | Skickar `MAX_PAGE_COUNT_CHOICE` som `maxPages` |

Bieffekt värd att känna till: när hinten är satt blir `earlyExplicitPageCount` 3,
vilket är under `MAX_ROUTES_PER_GENERATION`. Då sätts `allowCeilingExemptions`
inte alls, så namngivna sidor kan inte längre lyfta bygget över taket. Det är
själva mekanismen som gjorde sajten femsidig, och den är nu stängd för
kampanjflödet utan att ruttplanens regler ändrades.

Sidlistorna omordnades samtidigt så att de tre som ryms är `Hem`, kärnsidan och
`Kontakt` — tidigare låg `Om oss` på tredje plats och `Kontakt` sist, vilket vid
en kapning hade tappat kontaktsidan. Sidor utanför taket blir sektioner i stället.

Verifierat: 35 tester i `src/lib/kostnadsfri`, `src/components/kostnadsfri` och
`src/app/builder/page-controller`, plus `npm run typecheck` och lint på de
ändrade filerna.

## 2. Bolagsdata: push in, inte pull ut

Underlaget till utskicken finns redan i JakobScrape-dashen (annat repo,
`sajtmaskin-dash.onrender.com`, inloggning krävs). För `Zax 2.0 AB`
(`K603156-26`) bär den plats och kontakt, verksamhetsbeskrivning
(«Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet») och
personer — alltså nästan exakt de fält mini-wizarden frågar om.

Vägen in finns redan och kräver ingen ny auth: `POST /api/kostnadsfri`
(`src/app/api/kostnadsfri/route.ts`) är en maskin-ingång bakom
`x-api-key: KOSTNADSFRI_API_KEY`, och dashen anropar den redan när sidorna skapas
och utskick registreras (`source`, `sentAt`-upserten). Rutten tar dessutom redan
emot ett nästlat objekt som sparas i `extra_data` (`openclaw`), så ett `profile`-
objekt följer ett mönster som finns. `extractCompanyData` returnerar `extraData`
till klienten efter lösenordsverifiering, så inget nytt läs-API behövs.

Pull åt andra riktningen är sämre: dashen ligger på Render free tier med
kallstarter, och en pull skulle lägga ett externt anrop i exakt det ögonblick
användaren väntar.

**Beslutat 2026-09-15 och byggt (ingest):** allowlistad profil på
`extra_data.profile`, och profilen matar **mini-wizarden** — aldrig
generationsprompten direkt. Prompten byggs som förut av wizardens utdata, så
inget kan nå den publicerade sajten som företaget inte har sett och kunnat rätta.
Det löser samtidigt oron för vad som händer när de vill ändra ett förifyllt
värde. Beslutsrad: [`docs/decisions/README.md`](../../../decisions/README.md).

| Fält | Varför |
|---|---|
| `orgNumber` | Standard i svensk sidfot. Normaliseras till `NNNNNN-NNNN` |
| `registeredOffice`, `city`, `postalCode` | «based in», lokal SEO, kontaktsida |
| `streetAddress` | Ofta c/o hos revisor eller annat bolag — förifylls för bekräftelse, publiceras inte automatiskt som besöksadress |
| `businessDescription` | Mest användbara fältet: bär både bransch och vad bolaget faktiskt gör |
| `registeredAt` | «Grundat 2026» som copy |

Företagsnamn, bransch, webbplats, kontaktnamn och kontakt-e-post har egna
kolumner på `kostnadsfri_pages` och dubbleras inte hit. Personnummer,
hemadresser, åldrar, aktiekapital och den råa kungörelsetexten skickas inte, och
`findPersonalIdentityViolations` fäller requesten med 400 om de ändå kommer — med
fältnamn, aldrig värdet, eftersom `extra_data` går både till browsern och in i
wizarden. Organisationsnummer har identisk form som personnummer, så `orgNumber`
undantas mönsterkontrollen och valideras i stället som exakt ett org.nr.

Luckan i `markKostnadsfriPageSent` är stängd: upsert-vägen tar en
`extraDataPatch` som slås ihop med `jsonb ||`, så en profil som skickas
tillsammans med sändregistreringen inte längre tappas. Den ytliga
sammanslagningen är avsiktlig — patchen ska byta ut `profile` men lämna
`openclaw` orörd.

**Kvar:** wizarden läser inte profilen än. Förifyllningen bor i
`mini-wizard.tsx`, som ligger i videoagentens scope, så den hör i en egen PR
efteråt.

**Fortfarande oavgjort — bransch som fack eller fritext.** Dashen ger fritext;
koden kräver ett av elva id:n. `frisörverksamhet` har inget fack och landar
närmast på `health` («Hälsa/Wellness»). Antingen används `businessDescription`
som beskrivning och bransch blir en hint, eller så växer taxonomin — men då måste
den växa på det ställe som äger den (se städlistan), inte i tre kopior.

## 3. Pre-generering vid lösenordsverifiering

Kampanjmekaniken bär redan idén. `bindVerifiedKostnadsfriCampaign` i
`src/lib/db/services/kostnadsfri-campaign.ts` skapar entitlementet **vid
lösenordsverifieringen**, bundet till den anonyma sessionen via signerat kvitto.
`bindKostnadsfriCampaignInitialChat` säger uttryckligen att bindningen inte är
konsumtion: init-platsen tas först när settlement skriver en lyckad version. En
spekulativ körning som misslyckas bränner alltså ingen förmån. Kampanjen har
dessutom både init och follow-up, vilket är exakt formen «bygg på bolagsdata,
justera med användarens svar».

Trigger ska vara verifieringen, inte utskicket. Utskick betyder betalda tokens
för mejl som aldrig öppnas.

Det som gör tidsvinsten gratis: `src/lib/gen/preview/preview-prewarm.ts` finns
redan. Preview-VM:en kan värmas vid verifiering utan att någon modell körs.

Ordningen löser invändningen om att förifyllda svar låser fel:

```
verify → prewarm (+ ev. bygge)        mini-wizard
   |  fakta: ort, verksamhet, kontakt   förifyllt från dash, går att rätta
   |  vibe + palett                     kan inte gissas ur bolagsdata → före start
   |  USP + målgrupp                    besvaras medan bygget strömmar → follow-up
```

Vibe och färg styr hela bygget och går inte att härleda ur ett
registreringsunderlag, så de måste frågas före start. Fakta går att gissa och är
billiga att rätta. Nuvarande auto-start (`canAutoStartKostnadsfriGeneration` i
`src/app/builder/page-controller/auto-start-generation.ts`) startar först efter
hela wizarden och är den yta som i så fall byter läge.

**Beslutet som behövs:** bara prewarm (ingen tokenkostnad, ingen felrisk), eller
prewarm plus spekulativ init efter vibe-valet?

Om väntan behöver fyllas: buildern strömmar redan synligt. En andra video direkt
efter den treminuters som ligger på landningssidan är sannolikt för mycket, och
en spelifiering signalerar att det tar lång tid. Att visa vad bygget faktiskt
använder om just dem («Kista», «frisörverksamhet») är billigare och mer
trovärdigt. Detta är en smakfråga, inte ett blockerande beslut.

## Städning som ingår i besluten

Ingen av raderna får bli en egen «senare»-post. Var och en hänger på ett beslut
ovan och körs i samma ändring.

| Vad | Var | Status |
|---|---|---|
| ~~`INDUSTRY_PAGES` satte sidantal~~ | `src/lib/kostnadsfri/index.ts` | **Klart** — listorna är prioritetsordning, taket kommer utifrån |
| ~~`Scope: … (${pages.length} pages)`~~ | `buildPromptFromWizardData`, samma fil | **Klart** — inget tal i prosa längre |
| `INDUSTRY_LABELS` / `PURPOSE_LABELS` / `VIBE_LABELS` | `src/lib/kostnadsfri/index.ts` | **Öppet** — filens egen kommentar säger «mirrors PromptWizardModalV2 constants», alltså en medveten kopia av `src/components/modals/prompt-wizard/constants.ts`. |
| `INDUSTRY_OPTIONS` / `PURPOSE_OPTIONS` / `VIBE_OPTIONS` | `src/components/kostnadsfri/mini-wizard.tsx` | **Öppet** — tredje kopian av samma taxonomi (emoji i stället för Lucide-ikoner). Värdena är identiska i dag, så inget är fel än, men en bransch kan bara läggas till på ett av tre ställen och då driftar de tyst. |

Taxonomistädningen är förutsättning för punkt 2: att lägga till ett
frisör-/skönhetsfack i tre filer är hur divergensen uppstår igen.

## Inte avgjort

- Om spekulativ init är värd risken att företaget känner igen sig dåligt i en
  sajt som redan är byggd när de kommer till wizarden.
- Om taxonomin ska växa (frisör/skönhet, hantverk, transport) eller ersättas av
  fritext plus hint. Registreringsunderlag är fritext i grunden.

Avgjort sedan planen skrevs: `profile` är **schemalagt med egen validering**, inte
ett fritt `extra_data`-objekt. Beslutsraden 2026-09-15 äger innebörden.

## Säkerhetsfixar efter första granskningen

Tre läckvägar fanns kvar i ingest-koden och är stängda i samma PR:

| Väg | Vad höll inte | Nu |
|---|---|---|
| `orgNumber` runt PII-guarden | Fältet är undantaget mönsterkontrollen, men valideringen strök bort alla icke-siffror och godtog vilka tio siffror som helst — ett personnummer lagrades som org.nr | Strikt rått format (`NNNNNN-NNNN` eller tio siffror), gruppnummer ≥ 2 på tredje siffran (ett personnummer bär månad 01–12 där) och Luhn-kontrollsiffra |
| 500-svar från `POST /api/kostnadsfri` | `error.message` gick till anroparen och hela felobjektet till loggen; ett Drizzle-fel bär querytexten och dess parametrar, alltså profil, kontakt-e-post och lösenordshash | Konstant `Internt fel…` ut, och loggen får bara felets typnamn |
| Rå `extra_data` i publik DTO | `extractCompanyData` returnerade hela kolumnen till browsern efter lösenordsverifiering, vilket gick runt allowlisten för poster som lagrades före den eller lades in för hand | Fältet finns inte längre på DTO:n; bara `profile` och `openclawConfig` (båda normaliserade) exponeras |

Samtidigt härdat: PII-guarden går nu igenom nästlade objekt och arrayer till fyra
nivåer och räknar även JSON-tal, men rapporterar fortfarande bara toppnivåns
nyckel — en nästlad sökväg är avsändarstyrd text och hör inte i vårt felsvar.
`registeredAt` kräver ett verkligt kalenderdatum (`2026-02-31` och
`2026-07-10 (osäkert)` avvisas) men tar fortfarande dashens hela ISO-timestamp.

## Kopplingar

- Beslutsrad 2026-08-14 «Ruttplan / sidtak» i
  [`docs/decisions/README.md`](../../../decisions/README.md) äger talet 4 och
  reglagets 3. Ett kampanjundantag ska in där, inte i kostnadsfri-modulen.
- Öppen ägarfråga i backloggen om nav-synk och `detectExplicitPageCount` rör
  samma taköverskridande mekanik.
- Beslutsrad 2026-09-11 «Prissättning / affärsmodell»: kampanjsajter som blir
  publicerade hamnar i den framtida månadsavgiften, vilket påverkar hur mycket
  gratisgenerering som är försvarbar.
- `docs/schemas/builder-entry-contract.md` beskriver `kostnadsfri`-entryns
  auto-generate-väg och måste uppdateras om triggern flyttas till verifieringen.
