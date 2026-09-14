# Kostnadsfri-kampanjflödet — sidantal, bolagsdata och pre-generering (2026-09-14)

> **Status: besluten är fattade.** Sidantal (3), bolagsdata (allowlist +
> wizard-prefill, aldrig direkt i prompten), bransch som hint, gemensam
> taxonomiägare och **ingen** verify-prewarm/spekulativ init — se
> [`docs/decisions/README.md`](../../../decisions/README.md). Koden är skriven men
> **inte mergad**, så `master` är auktoritet tills den är det. Inget kvar i
> [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) § Väntar på
> ägarbeslut för det här spåret.

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
| `streetAddress` | Ofta c/o hos revisor eller annat bolag — lagras men förifylls **inte** som besöksadress |
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

**Beslutat 2026-09-15 och byggt (prefill + hint):** `mini-wizard.tsx` läser
profilen. `city` vinner över `registeredOffice` för plats; `businessDescription`
förifyller beskrivningen; `streetAddress` lämnas tomt som besöksadress.
`companyData.industry` sätter bransch-state **bara** vid exakt id eller känd
alias mot de elva facken. `frisörverksamhet` lämnar facket tomt — användaren
väljer. Inget nytt frisör-/skönhets-id. Prompten byggs fortfarande bara av
`buildPromptFromWizardData(wizardData)`.

Taxonomin (id + label + suggestedFeatures / purpose desc) ägs av
`src/lib/builder/wizard-taxonomy.ts`. Prompt-wizardens Lucide-ikoner och
mini-wizardens emoji mappar bara id → ikon.

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

**Beslutat 2026-09-15: ingen spekulativ init och ingen ny prewarm vid
lösenordsverify.** `preview-prewarm` är chat-nycklad och
`FEATURES.previewPrewarm` är av som default. Verify-rutten startar varken VM
eller generation. Auto-start sker som förut efter mini-wizarden; vibe och palett
måste vara valda först. Beslutsrad:
[`docs/decisions/README.md`](../../../decisions/README.md).

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
| ~~`INDUSTRY_LABELS` / `PURPOSE_LABELS` / `VIBE_LABELS`~~ | `src/lib/kostnadsfri/index.ts` | **Klart** — importerar labels från `src/lib/builder/wizard-taxonomy.ts` |
| ~~`INDUSTRY_OPTIONS` / `PURPOSE_OPTIONS` / `VIBE_OPTIONS`~~ | `src/components/kostnadsfri/mini-wizard.tsx` | **Klart** — samma id/label-lista; emoji stannar i UI-lagret |

Taxonomistädningen var förutsättning för punkt 2: att lägga till ett
frisör-/skönhetsfack i tre filer är hur divergensen uppstår. Facket lades inte
till — hint-beslutet gör att det inte behövs.

## Inte avgjort

- Hur väntan efter wizarden ska fyllas (strömmen, copy om «Kista»/verksamhet,
  extra video). Smak, inte grind.

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
  auto-generate-väg. Triggern flyttas **inte** till verifieringen (beslut
  2026-09-15); kontraktet behöver därför inte ändras för den här frågan.
