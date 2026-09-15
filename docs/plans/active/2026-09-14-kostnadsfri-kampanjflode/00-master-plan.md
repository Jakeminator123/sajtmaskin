# Kostnadsfri-kampanjflödet — sidantal, bolagsdata och pre-generering (2026-09-14)

> **Status: ett beslut fattat och implementerat, två kvar.** Sidantalet är avgjort
> 2026-09-14 (3 sidor, se [`docs/decisions/README.md`](../../../decisions/README.md))
> och koden är levererad på `preview` i #1370 som
> `53daaa6ebc6766f4cd919f1e792af4162d53aaf0`. Den leveransen ändrade inte
> `master`. Vad som ändrades står i avsnitt 1. Bolagsdata och
> pre-generering ligger kvar som rader i
> [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) § Väntar på
> ägarbeslut. Städlistan längst ned hänger på besluten och ska köras i samma
> ändring som respektive beslut, inte som ett eget "senare".

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

**Väg B valdes och är levererad på `preview` i #1370 som
`53daaa6ebc6766f4cd919f1e792af4162d53aaf0`.** Talet reser strukturerat, inte i
prosa:

| Fil | Ändring |
|---|---|
| `src/app/builder/page-controller/useBuilderAutoStartGeneration.ts` | Fyller `pageCount` i byggvalsstoren före auto-starten, men bara när inget val redan uttalats (`0 = auto`). `buildInitBuildChoicesMeta` gör det till `meta.pageCountHint`. |
| `src/lib/kostnadsfri/index.ts` | `INDUSTRY_PAGES` är icke-bindande prioriteringar utan eget tal; prompten uttrycker varken `(N pages)` eller en exakt sidlista. |

Bieffekt värd att känna till: när hinten är satt blir `earlyExplicitPageCount` 3,
vilket är under `MAX_ROUTES_PER_GENERATION`. Då sätts `allowCeilingExemptions`
inte alls, så namngivna sidor kan inte längre lyfta bygget över taket. Det är
själva mekanismen som gjorde sajten femsidig, och den är nu stängd för
kampanjflödet utan att ruttplanens regler ändrades.

Sidprioriteringarna omordnades samtidigt så att `Hem`, branschens kärnsida och
`Kontakt` kommer först. De är uttryckligen önskemål, inte en andra route-lista:
`pageCountHint` är enda antalssanningen och ruttplanen kapar till 1, 2 eller
kampanjstandarden 3. Prioriteringar som inte blir egna rutter kan bli sektioner.

Verifierat med prompt→ruttplan-regressioner för uttryckliga val på 1 och 2,
auto-startens standard/preserve-fall, route-planens tester, `npm run typecheck`
och riktad lint.

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

**Två saker måste avgöras innan koden skrivs:**

1. **PII-gränsen.** Dashen visar personnummer och styrelseledamöternas
   hemadresser. `extra_data` skickas till browsern efter lösenordsverifiering —
   rutten säger det själv i kommentaren till `serializePage` — och blir dessutom
   LLM-input. Utan en uttrycklig fältlista kan en ledamots hemadress hamna
   publicerad på den genererade sajten. Föreslagen gräns: företagsnamn, org.nr,
   säte/ort, företagets c/o-adress, verksamhetstext, primärkontaktens förnamn och
   e-post. Inga personnummer, inga hemadresser, inga åldrar.
2. **Bransch som fack eller fritext.** Dashen ger fritext; koden kräver ett av
   elva id:n. `frisörverksamhet` har inget fack och landar närmast på `health`
   («Hälsa/Wellness»). Antingen används verksamhetstexten som beskrivning och
   bransch blir en hint, eller så växer taxonomin — men då måste den växa på det
   ställe som äger den (se städlistan), inte i tre kopior.

Lucka att täcka i implementationen: `markKostnadsfriPageSent` (upsert-vägen när
`sentAt` skickas) skriver inte `extra_data` i dag, så en dash som skickar profilen
tillsammans med sändregistreringen får den tappad.

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
| ~~`INDUSTRY_PAGES` satte sidantal~~ | `src/lib/kostnadsfri/index.ts` | **Klart** — listorna är icke-bindande prioriteringar, antalet kommer strukturerat |
| ~~`Scope: … (${pages.length} pages)`~~ | `buildPromptFromWizardData`, samma fil | **Klart** — varken tal eller exakt sidlista i prosa |
| `INDUSTRY_LABELS` / `PURPOSE_LABELS` / `VIBE_LABELS` | `src/lib/kostnadsfri/index.ts` | **Öppet** — filens egen kommentar säger «mirrors PromptWizardModalV2 constants», alltså en medveten kopia av `src/components/modals/prompt-wizard/constants.ts`. |
| `INDUSTRY_OPTIONS` / `PURPOSE_OPTIONS` / `VIBE_OPTIONS` | `src/components/kostnadsfri/mini-wizard.tsx` | **Öppet** — tredje kopian av samma taxonomi (emoji i stället för Lucide-ikoner). Värdena är identiska i dag, så inget är fel än, men en bransch kan bara läggas till på ett av tre ställen och då driftar de tyst. |

Taxonomistädningen är förutsättning för punkt 2: att lägga till ett
frisör-/skönhetsfack i tre filer är hur divergensen uppstår igen.

## Inte avgjort

- Om spekulativ init är värd risken att företaget känner igen sig dåligt i en
  sajt som redan är byggd när de kommer till wizarden.
- Om `profile` ska vara ett fritt `extra_data`-objekt eller ett schemalagt fält
  med egen validering. Ett fritt objekt går snabbare; ett schema är det som
  faktiskt hindrar personnummer från att åka med.
- Om taxonomin ska växa (frisör/skönhet, hantverk, transport) eller ersättas av
  fritext plus hint. Registreringsunderlag är fritext i grunden.

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
