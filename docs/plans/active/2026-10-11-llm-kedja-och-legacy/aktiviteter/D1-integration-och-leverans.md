# D1 — en samlad integration, inget kontrollberg

Utförare: samordnaren. Oberoende granskare: 3 för tidigare paket, ny readonly-
underagent för slutlig integration efter bruten appkontakt; inga författarändringar.
Beroende: föregående paket. Status: se [körbordet](../00-master-plan.md).

1. Stäng varje aktivitet med verkligt utfall. Separera parkerad extern radering,
   lokal kodklarhet och återstående runtimeacceptans. Återöppna inte levererade
   delar från andra planer eller förklara deras kvarvarande krav uppfyllda.
2. Sammanställ exakt diff och återanvänd riktade testkvitton för oförändrade
   filer/miljö. Kör endast nytillkommen integration och aktuell plan.
3. Commit kräver mandat. Därefter genereras exakta bas/head/prompt/schema med
   befintlig Buggpass-väg. Chatt 3 granskar självständigt och returnerar faktisk
   rapport enligt den vägen; samordnaren importerar, triagerar och disponerar fix.
4. Ingen korsreview ersätter nödvändigt oberoende kvitto. Ingen ny betald
   API-bot som extra krav. Om chatt 3 inte uppfyller oberoende-/formatkravet:
   redovisa det och välj tillåten färsk reviewväg före publicering.
5. Samla riktiga fynd i en rättningsrunda; granska delta/integration därefter.
   Följ befintlig gräns om tre rundor och ägarbeslut för ytterligare pass.
6. Läs aktuell leveranspolicy. Fråga Jakob före preview-push med exakt SHA;
   verifiera CI och deployment separat efter godkänd push. Ingen Master-merge.

Mät enkelhet med borttagna vägar/fallbacks, färre ägare för samma beslut och
färre duplicerade bearbetningssteg. Netto-rader är stöd, inte mål. Gör inte
latency-/kostnadspåståenden utan mätning; en betald benchmark är inte obligatorisk.

Vid avslut: tunn stabil dokumentation på rätt plats, kvarvarande delbeslut
tydligt ägda och planlivscykeln följd. Ingen ny kontrolltjänst eller permanent
rapportmapp ska vara restprodukten av städningen.

## Resultat

Jakob godkände 2026-10-12 lokala Git-commits efter verifiering och granskning.
Inget push-/PR-/merge-/drift-/DB-apply-mandat finns. Lokal implementation,
riktad verifiering och integrationsreview är klara; inget publiceringsbundet
Buggpass-/leveranskvitto är ännu utfärdat.
A1/A2, den säkra B1/B2-delen och C1.1–3a/b/cf/c0/im/q/c1 är lokalt
paketgranskade och riktat verifierade. Atomicbootstrap, delade bild-/preview-/
QG-ägare och serverägt produktresultat är införda. Produktkontrollen finns i
`c681e6fe778a158c88ff6633ed62f0c1f15d330a`; q finns i `46034ed3f…`.
q: 176 tester och review utan fynd, produkt −92/test +172. c1: 26 filer,
produkt −408/test +350; konkret reviewfynd om klientdom är stängt efter
16-fils deltareview och återanvänd granskning av tio oförändrade filer.
Alla 48 dåvarande WIP-filinnehåll bevarades vid c1-commit, index tomt.

C1.3m är committat i 177f0d500: 215 riktade tester, typecheck/lint/diff/plan
och 3:s slutreview PASS. C1.3p i 4047f4ce0: 130 mocktester, samma kontroller
och sju granskade stabila blobbar. C1-save i 72e0162c0: tre filer, produkt −5/
test +76; tolv mocktester och review PASS. Spara startar inte extra bildarbete.

C1.3d + d-fix är sparade i a906b951fdc4987326b23dc3740013ac1fb77502:
åtta filer, produkt +86/test +227. Bas 189 tester, fix 60 riktade (ingen
överlappande totalsumma), cachefri tsc/lint/diff/plan PASS. 3 har stängt fyndet
om modellstart efter en försenad reservation och granskat alla åtta blobbar.
Alla 13 dåvarande WIP-innehåll bevarades vid commit.

C1.3r är sparat i 6a378746f4d783fbfda4c6092b5c99f231ec3bd2:
två filer, produkt +179/test +244; 102 tester, lint/diff/plan PASS och cachefri
tsc återanvänd. 3:s slutreview utan konkreta fynd. Canonical importförläsning
undviker extra poolanslutning under lås; current version/lease/kvittoauthority
verifieras i TX. Ett fångat Vitest-fasadmockfel rättades vid query-ägaren utan
försvagade samtidighetsassertions. Samtliga fem dåvarande WIP-innehåll bevarades.
Tidigare mandatstopp är lösta via direkta specifika användarmeddelanden i 1,
inte bypass. Endast tre rootplaner är WIP före nästa skrivfönster.

C1.3t är sparat i 24b9bc8ae17733765f5735fa6a9a8de28993d977: nio filer,
produkt +20/test +111. 112 mocktester, cachefri tsc/lint/diff/plan PASS och
3:s review utan fynd med nio stabila blobbar. Alla tolv dåvarande WIP-innehåll
bevarades. Ursprungsdeadline trådad och därefter konsumerad av C1.4-servercore.

C1.4-server/client är frysta och skrivrätten överlämnad till samordnaren.
Servermanifestet: 19 filer, 467 offlinetester/14 sviter, produkt +56/test +655.
Klientmanifestet: 36 paths, 329 tester/24 sviter, produkt −4 805 och 14 filer
raderade. Båda har cachefri tsc/lint/diff/plan PASS; klienten även testupptäckt.
Root verifierade 58/58 poster (inklusive borttagningar och tre skyddade planer).
Klientens manifest-SHA256 är
`DB15CBF379CA410031E23BFCF9BC78F190D2777C2FE8AE1E75AD5320EEEAD74E`.
Ingen kod behöver flyttas från chattarna; allt finns redan i arbetskopian.

Samordnaren har synkat llm-pipeline, quality-gate-flow och templates till
faktisk serverägare och tagit bort den brutna länken. Ny oberoende readonly-
underagent slutgranskade kombinationen mot 24b9bc8ae17733765f5735fa6a9a8de28993d977:
CLEAN, inga konkreta integrationsfynd; 41 kod-/testhashar och 14 raderingar
matchade. Rapporten återanvänder oförändrade offlinebevis, inte liveacceptans.

Root: 49 dokumentationstester i fyra sviter PASS. docs:check/docs:links,
plans:history:check, check:terms:contract, canvas:check, route-timeouts:check,
knip:files, staged diffcheck och plan --no-fetch PASS. Knips enda output var
en icke-blockerande konfigurationshint om logs/**. Ingen ny kodfix krävdes.
Gemensam lokal checkpoint sparas med meddelandet
`refactor: make postchecks server-owned and remove client orchestration`.
Sista paketets produktnetto är −4 749 rader inklusive timeoutmappningens +4;
test-/docs-rader räknas separat. Inga latency-/kostnadsbesparingar har mätts.

Cron-posten nekades av verktygsprövningen och är inte införd; vercel.json är
oförändrad. Den förberedda routen är oschemalagd. Automatisk periodisk
återstart/importverifiering kräver separat godkännande och runtimeprov före
publicering. Detta får inte döljas av att klientens gamla återstart är raderad.

Lokal checkpoint är inte leveransgodkännande eller runtimeacceptans. Inget
fullbygge, live-DB-/provider-/modelltest eller schemaprov har körts. Node/Volta
22.23.1 och engines >=22.14.0 <23 kontrollerades igen före dokumentkontroller.
Slutligt färskkontext-Buggpass och publiceringsgrindar återstår före eventuell
push; befintlig paketreview får inte presenteras som ett sådant kvitto.

## Förberett enda manuellt runtimeprov — 2026-10-12

Status: ett faktiskt testanrop genomfört, stoppat före modellstart; se resultat nedan.
Kodkandidat `e5e5b7d7258dc8aa2a2d2876c75514149863b43c`.
Schemaläggningsflaggan ligger kvar på `0` lokalt och i Vercel; inget cron-anrop ingår.
Provet kör den lokala kandidatens vanliga generationsväg och gemensamma servercore.
Den lokala env-filens DB-adress har kontrollerats med den befintliga guarden:
DEV `yubbckduwblyrbnlglwf`, utan DB-anslutning inför provet.

I en ny terminal används Node/Volta 22.23.1, kandidatcheckouten och huvudcheckoutens
befintliga env-fil utan att kopiera eller ändra dess värden. Budgetarna nedan gäller
bara testprocessen. Ingen ändring av Vercels modellval eller tokenbudgetar:

```powershell
Set-Location 'C:\Users\jakem\.codex\worktrees\llm-legacy-cleanup\sajtmaskin'
$env:SAJTMASKIN_POSTCHECKS_SCHEDULE_ENABLED = '0'
$env:NEXT_PUBLIC_APP_URL = 'http://localhost:3100'
$env:SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS = '16384'
$env:SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS = '4096'
$env:SAJTMASKIN_VERIFIER_MAX_OUTPUT_TOKENS = '4096'
$env:SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS = '4096'
& 'C:\Program Files\Volta\node.exe' --env-file='C:\Users\jakem\dev\projects\sajtmaskin\.env.local' scripts/dev/next-runner.mjs dev --port 3100
```

Efter att lokal server, inloggning och preview-host fungerar: öppna buildern på
`http://localhost:3100`, välj **Låg / pro**, håll bildgenerering/materialisering av
och använd en ny testchatt med denna enda beställning:

> Skapa en enkel svensk ensidig sajt för det fiktiva caféet Testfika. Använd bara
> text, CSS och enkla ikoner, inga foton eller bildtjänster. Ha rubrik, kort
> presentation, tre menypriser och kontaktsektion. Knappen "Se menyn" ska scrolla
> till menyn. Ingen inloggning, formulärsändning, betalning eller extern integration.
> Visa att detta är en testsajt.

Skicka en gång och invänta serverns faktiska slutstatus. Spara chatId/versionId,
exakt revision, runtime-/produktresultat, relevant kvalitetsgrind och samtliga
usage-rader för körningen (även förhandsfasernas senare bundna usage).
Kontrollera desktop/mobil och menyknappen. Därefter Spara och återöppna samma
projekt: samma snapshot ska visas och usage ska inte öka på grund av Spara/GET.
Ingen ny generation eller manuell repair beställs vid fel; felet rapporteras.
Ingen avstängning av sidans observation räknas som färdig serverkontroll.

Kostnadsuppskattning: **5–15 SEK i leverantörens modellkostnad**; **15–30 SEK**
som planeringsmarginal om avgränsade reparationer/fler anrop behövs. Detta är inte
ett hårt gemensamt krontak eller ett verifierat historiskt medelvärde. Antagande:
bygganropet använder 30–80k input och 5–16k output inklusive reasoning, utan
antagen cacherabatt. Sols bygganrop blir då cirka $0.22–$0.64; återstående marginal
täcker brief, verifier, LiveReview och möjliga fixer-anrop. Befintliga försökstak
behålls. Sajtmaskins creditdebitering/påslag och eventuell driftkostnad räknas
separat; det aktuella kontots creditpris har inte lästs från DB.

Priserna kontrollerades 2026-10-12 mot
[OpenAI](https://developers.openai.com/api/docs/models/gpt-5.6-sol) och den publika
[Gateway-katalogen](https://ai-gateway.vercel.sh/v1/models): Sol $4/$20, Terra $2/$12,
Luna $0.20/$1.20 per miljon input/output-tokens. SEK använder repots uttryckliga
approximativa kurs 10.5. Efter provet summeras `llm_usage.cost_microusd` för exakt
chatt/version/körning och stäms av mot billing; saknade usage-kvitton betyder att
kostnaden är ofullständig, inte noll. Faktiskt utfall redovisas nedan.

Detta prov ger runtimebevis för den vanliga F2-generationen och dess serverkontroller.
Schemalagd återstart, avbrott/takeover, F3 och bildmaterialisering verifieras inte
av detta enda prov.

### Faktiskt resultat — 2026-10-12 17:06:43 UTC

En korrekt UI-beställning nådde `POST /api/engine/chats/stream`: `pro`,
`imageGenerations=false`, `materializeImages=false`. Svar **403 origin_not_allowed**,
innan route-handler eller någon modell startade. Testets port 3100 matchade inte
huvudcheckoutens `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Exact-Origin-guarden
i `src/proxy.ts:326` avvisade den. Detta var en brist i testuppsättningen, inte
ett påvisat fel i den nya LLM-kedjan. Startreceptet ovan har korrigerats med en
processlokal app-URL; någon andra serverbeställning har inte gjorts.

Faktisk AI-kostnad **$0 / 0 SEK**: inga provideranrop passerade proxygränsen,
och readonly DEV-frågan hittade noll `llm_usage`-rader för testkontot efter
starttiden samt noll testchattar. Ingen version skapades; preview, serverkontroller,
Spara/återöppna och deras kostnadskvitton kunde därför inte runtimeverifieras.
Tidigare knapp-/cookie-/bildinställningskontroller nådde aldrig serverns generation.

Buildern och vanlig login fungerade; login använde ett redan verifierat konto
med tillräckligt saldo, utan kontoskapande eller credit-bootstrap. Browserverktygets
kernel kraschade, så repots installerade Playwright-browser användes. Inga
produktkodändringar, migrationer, pushar eller deploys. Schemaläggningsflaggan
verifierades som `0` lokalt och i Vercels tre mål. Nytt modellprov är inte utfört.

Körkvitto och skärmbild ligger under den här uppgiftens lokala visualiseringsmapp:
`manual-pipeline-result.json` och `manual-pipeline-generated.png`. Root har återställt
Nexts automatiskt tillagda block i AGENTS.md; det ingår inte i produktändringen.

### Testkonto och fungerande lokal inloggning — 2026-10-12

Jakob gav separat mandat att skapa ett lättanvänt testkonto med cirka 1 000 credits.
`pipeline-test@local.test` skapades i den verifierade DEV-databasen genom befintliga
kontoägare, med hashat lösenord, verifierad mejl och **1 000 credits**. Vanligt konto,
inte admin eller env-whitelistat gratis-/superadminkonto. Krediterna lades till med
den atomiska, idempotenta `createTransaction`-ägaren: bonuskvitto
`3Zmx4W4CcpkKrXlnH4S1o`, konto `D5kcurIdM53raamLN2t8a`. Lösenordet ligger endast i
uppgiftens lokala credentialfil/chatt, inte i spårad dokumentation eller produktkod.

Endast arbetscheckoutens ignorerade `.env.local` har lokal app-URL 3100. Vår
testserver startades om med process-override för denna URL och de befintliga små
tokenbudgetarna. Huvudcheckoutens app-URL 3000 och Vercels app-konfiguration behölls.
Normal login med faktisk Origin 3100 gav **200**; `/api/auth/me` bekräftade autentisering,
mejlstatus och saldo 1 000. Genereringsroutens icke-genererande OPTIONS gav **204**,
så föregående origin-fel är rättat i testuppsättningen utan att ändra origin-guarden.
Ingen ny modellbeställning skickades vid konto-/loginverifieringen.

Schemaläggningen ligger kvar på `0`. Ingen produktkod, migration, PROD-data, push
eller deploy ändrades. DEV delas med Preview enligt den befintliga DB-ägaren;
kontot ska därför benämnas utvecklingskonto, inte en separat lokal databas.
