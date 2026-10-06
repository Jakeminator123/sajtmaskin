# D1 — Chromium-core-dump: reproducerad single-process-krasch vid teardown

## Status

**Oberoende kod-/metodgranskad kandidat för avgränsad preview-leverans
2026-10-06; deployment finns på Vercel men live capture-/resursacceptans
saknas. Fixen är inte släppt i produktion.**
Känd residual av `SM-072`. Tidigare status var «Parkerat, inte löst».
Beställ ingen ny generell prune-fix — `#1234` och `#1318` finns redan.
Samordningens preview-disposition nedan ersätter inte Vercel-/produktionsacceptans.

## Ny utredning 2026-10-05

Produktionsincidenten 2026-10-04 22:40–22:43 UTC (5 oktober svensk tid),
chat `096e6f0c-0071-4583-9a44-e5ffbd20c796`, version
`f1687690-7248-410c-a9ec-64ad1f192a8a`, granskades mot master `c3f62b636`.
Initial leveransbas var preview `ff2ac650`; branchen synkades senare utan
ownerkonflikt till `84e0061a9` efter dossierfixen #1551. Båda bilderna laddades upp före en dump
på 407 MB; postchecken var `passed`, `productBlocked=false`, HTTP 200.
`/tmp` hade 513 MB fritt vid de två mätningarna före launch. Loggen bevisar
ingen native avslutssignal eller exakt kraschfas i just den invocationen.

Det granskade loggurvalet innehöll 48 `browser_crashed` över 23 chattar;
detta är inte ett påstående om alla browserstarter. Sajtagenten tillfrågades
men uppgav att den saknade underliggande Chromium-loggåtkomst.

Offline-repro på Ubuntu/WSL x86_64, Node 22.22.0 (inom deklarerat engines),
med lockfilens `@sparticuz/chromium` 149.0.0 och `playwright-core` 1.61.1,
två isolerade `browser.newPage()`-kontexter och två JPEG-bilder:

| Variant | Native utfall |
| --- | --- |
| Oförändrade Sparticuz-args, mobile.close → desktop.close → browser.close | SIGTRAP 6/6 vid mobile.close, efter lyckade bilder |
| Oförändrade args, endast browser.close | SIGTRAP 3/3 vid browser.close |
| Endast `--single-process` borttagen, ursprunglig stängningsordning | Normal exit 0, signal null, 19/19 (varav 3 med WebGL2-probe) |

Playwrights `close()` returnerade även efter SIGTRAP; `browser.isConnected()`
blev false. Att bara logga kastade close-fel hade alltså missat detta.
Reprot använder inga kund-URL:er eller kundfiler. `ulimit -c 0` gör att
exit-signalen kan observeras utan stora dumpfiler. Browserns rapporterade
`version()` var `149.0.7827.0`.
Den slutliga reproduktionsscriptversionen extraherar i en egen tillfällig
katalog och städar bara den. Ett oberoende omprov där gav samma SIGTRAP 3/3
för originalet och normal exit 3/3 för kandidaten. Ytterligare 3/3 körningar
renderade WebGL2 utan GL-fel och avslutades normalt.

Det kontrollerade A/B-testet isolerar **single-process-läget som utlösande
villkor för den lokala native-kraschen**. Det bevisar inte native-stackens
interna rotorsak, och WSL är inte Vercels servermiljö. Det gör samma mekanism
för produktionsincidenten sannolik, inte direkt bevisad.

Reproducerbara kommandon från repo-roten i Linux (första två väntas exit 1,
sista exit 0):

```sh
ulimit -c 0
node scripts/dev/repro-capture-teardown.mjs owned-contexts 3
node scripts/dev/repro-capture-teardown.mjs browser-close-only 3
node scripts/dev/repro-capture-teardown.mjs multi-process 10
node scripts/dev/repro-capture-teardown.mjs multi-process 3 --webgl
```

Kandidaten filtrerar bort enbart `--single-process` i den gemensamma
serverless-launchen. Grafik, övriga säkerhetsflaggor, separata sidkontexter,
SSRF-grindar, lås och omförsök bevaras. Den lokala dev-browsern ändras inte.
Postchecken loggar dessutom bild-/persist-/close-faser, frånkoppling och
page-crash med samma capture-/verification-ID samt browser-/Node-version.
Dumpmetadata skiljer logisk storlek från `stat.blocks * 512`; en misslyckad
radering får inte längre dölja en upptäckt dump som `count=0`.

Lokalt verifierat mot `84e0061a9`: 289/289 riktade tester (11 filer, högst fyra
workers), typecheck, riktad ESLint, docs:check, docs:links, canvas:check,
route-timeouts:check och diffcheck. Args-regressionen visade först RED mot
oförändrad kod (1/37 fel), därefter GREEN. verify:pr -- --plan väljer full
runtimeprofil för CI; en full build/CI-körning har inte utförts här.

Återstående full Vercel-acceptans: motsvarande preview med upprepade postcheckar,
mobil/desktop, samtidiga miniatyrer, WebGL och mätning av processminne och
`/tmp`. Fler browserprocesser kan ändra resursåtgången. Ingen merge eller
produktionspromotion ingår i denna verifiering. Det befintliga in-process-
låset bevisar inte isolering mellan olika Vercel-isolates; dumpstädningens
koppling till just en körning är fortfarande best-effort.

## Leveransunderlag inför datorbyte

Kandidaten ligger på `codex/chromium-teardown-diagnostics`. Vid sparuppdraget
2026-10-05 synkades den utan ownerkonflikt till preview `f9c5acea6`.
Samma 289 riktade tester, typecheck, riktad ESLint, docs:check och docs:links
passerade på denna bas. Runtime- och reprofilerna är oförändrade från den
lokalt verifierade kandidaten ovan.

Sparuppdraget lämnade PR:n som **draft** i väntan på oberoende review och
Vercel-preview-acceptans. Det gav inget mergemandat. Fortsättningsuppdragets
aktuella grindar och kvarvarande livebegränsning finns nedan.
`BUG-SWARM-BACKLOG.md` är inte ändrad och `SM-072` ska inte markeras löst av
offlineprovet. Ingen DB-, env-, provider- eller produktionsåtgärd ingår.
`node_modules/` och `tsconfig.tsbuildinfo` är enbart återbildningsbara lokala
beroenden/cache; underlaget och det körbara reprot finns i Git-filerna.

## Fortsättning 2026-10-06 — review, lokalt resurskvitto och preview-disposition

[PR #1572](https://github.com/Jakeminator123/sajtmaskin/pull/1572), kodhead
`e79dce40939d02c0c87f038ae4bf7f4d665b5178` mot preview `f9c5acea6`, fick
oberoende readonly review av alla åtta filer och relevanta capture-callers:
**0 verifierbara buggar/false-greens/kontraktsbrott**. Granskaren körde även
182/182 tester i tre berörda testfiler, Node 22.23.1, högst fyra workers.
Ingen runtime-/test-/reprofilsändring behövdes efter review.

GitHub CI [37313656050](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37313656050)
på samma kodhead körde full runtimeprofil: `quality` anger `heavy=true`, alla
fyra testshards, typecheck/lint, build, Backoffice och schema-drift är gröna.
Dossier-acceptansens matris hoppades korrekt över med
`matrix=false reason=out-of-contract files=8 matched=0`; det är inte ett
live capture-kvitto eller bevis för att dossierbyggen kördes.

Vercel-deployment `dpl_5aKKDbVMCq7TQ6zkDkzdjngzLY5m` är `READY`, metadata
binder exakt samma kodhead och projektet deklarerar Node `22.x`.
Ett direkt GET mot dess immutabla host
`sajtmaskin-1cyl6vt1o-jakeminator123s-projects.vercel.app` gav HTTP 302 till
`vercel.com` (SSO-skydd), inte ett svar från capture-runtimen. Deploymentens
runtime-loggurval från 2026-10-05 13:02:34 UTC gav inga request-rader.
Ingen auth-bypass, kundgeneration eller capture-invocation skapades.

Den önskade kedjan är verifieringsroute → serverless Chromium → desktop/mobil
→ bilder → nedstängning. Befintliga vägar kan inte användas som godtycklig
nyckelfri fixture utan att ändra testets gränser:

| Väg | Konkret begränsning före/efter browserstart |
| --- | --- |
| Product-postcheck | Tar DB-claim och startar live-review-session före capture; slutför claim och kan persistera bilder/rapport. Saknar read-only/dry-run-kontrakt. |
| Projektminiatyr | Sparar Blob och `app_projects.thumbnail_path`, kan radera tidigare bild. Inte ett DB-/provider-readonly-prov. |
| Inspector-capture | Kräver appinloggning och aktuell Tier-2-tuple/allowlist. Returnerar bild utan egen DB-persistens, men rate limit kan skriva Redis och ingen isolerad testfixture eller autentiserad kandidat-session har etablerats. Ger inte postcheckens två-context-/native-teardown-kvitto. |
| Inspector-element-map | Avvisar serverless innan browserstart; kan därför inte bevisa Vercel-capture. |

### Lokalt owner-/mutex-/resurskvitto

[Mätningen och dess begränsningar](https://github.com/Jakeminator123/sajtmaskin/pull/1572#issuecomment-6013487216)
är bundna till PR-head `955238ccf618fe64d0f8aa16cc62dbec0b808536`.
Alla nio kopierade owner-/import-/konfig-/lockfiler matchade detta head;
den verkliga `launchCaptureBrowser`-ownern och mutexen användes, inte en
kopierad launch-implementation. Runtime-/test-/reproblobbarna var identiska
med kodhead `e79dce4`. Ingen live-route eller kundgeneration kördes.

WSL Linux, Node 22.22.0 (engines-kompatibel, inte Volta-pinen 22.23.1),
låsta Sparticuz 149.0.0/Playwright-core 1.61.1 och browser 149.0.7827.0:

| Kontroll | Lokalt utfall |
| --- | --- |
| Faktiska gränser | Dedikerad cgroup: 4 GiB `memory.max`, 2 CPU-bandbredd, 256 PID:ar; egen ext4-TMPDIR. |
| Capture/WebGL | En kall och två varma seriella körningar plus två samtidigt köade jobb: två isolerade desktop-/mobilkontexter per browser, 10 icke-tomma JPEG och 10 korrekta WebGL2-pixlar. |
| Native teardown/mutex | 5/5 exit 0, signal null; max en native browserrot. Kö-B startade efter A:s native exit och avslutade close. Inga spawn-/closefel eller watchdogs. |
| Städning | Inga profiler eller Chromiumprocesser kvar. Alla scope-PID:ar kontrollerades, även omföräldrade barn; endast Node och två före capture identifierade esbuild-supportprocesser återstod. |
| Minne | Hela scopets topp 739.24 MiB inklusive page-cache/extraktion. Summerad familje-RSS 824.09 MiB, Chromium-RSS 492.55 MiB och Node-RSS 314.54 MiB; RSS kan dubbelräkna delade sidor. |
| Egna temporärfiler | Allokerad topp 213.25 MiB, efter varje close stabilt 208.66 MiB; ingen ackumulation genom de varma/köade jobben. Kvarvarande filer är förenliga med extraktionscache, inte observerad profilläcka. |
| Mätgränser | 164 observationer med 50 ms intervall, tre sampling-race/missar, fyra null-PSS-samples; komplett PSS-topp okänd. OOMräknare 0, CPU strypt i 24 perioder; 8.283 s är lokal observation, inte Vercel-latens. |

Oberoende readonly metod-/rådata-/blobgranskning fann **0 nya metodfynd**.
De tre tidigare labbuppstarterna failade stängt före capture och bevarades
separat; de räknas inte som genomförda browser-/resursprov. Harness och rådata
är lokala gitignored artefakter, inte en ny runtime eller diagnostikroute.

Detta bevisar owner, in-process-mutex och normal native teardown i det
lokala provet, **inte** faktisk Vercel-kernel/Fluid, cross-isolate-last,
kundlast eller hela postcheckens DB-kedja. Ext4 hade ingen 525 MiB-gräns;
egna filallokeringar är inte ett kapacitetskvitto för incidentvolymen.
`ulimit -c 0` stängde av core dumps: native exit/signal, inte avsaknad av
dumpfiler, är avslutsbeviset. Projektets lästa inställningar anger Node
22.x, Fluid/elastic concurrency och minnestyp `performance`, men fastställer
inte capture-routens faktiskt deployade allocation/deadline. Build-maskinens
minne är inte function-minne.

### Samordningens avgränsade preview-disposition

Efter det nya, faktiskt uppmätta och oberoende granskade underlaget bedömde
samordningen 2026-10-06 att **den smala flaggmitigeringen och diagnostiken
kan behandlas som kandidat för preview-leverans utan en ny Vercel-resurs
först**. Beslutet bygger på native exit, verklig owner/mutex, inga oväntade
processöverlevare/OOM och uppmätt minne/temporärdata; det är inte en
borttagen testgrind för att få grönt.

Slutlig preview-merge kräver fortfarande normal bassynkning, blobbundet
aktuellt integrations-/dokumentreview samt full required CI och exakt
headbundet deployment-kvitto. Samordningen äger mergebeslutet. Detta är
inte Vercel-/produktionsacceptans eller fastställd incidentrotorsak:
`SM-072`, live-/resursresidualen och backloggraden förblir öppna; master
är orörd. Nya liveanrop, DB/provider/env/indexändringar eller en ny
testdeployment ingår inte i denna disposition.

### Kvarvarande prov för full liveacceptans

Det säkra fulla liveprovet kräver en uttryckligt godkänd isolerad Vercel-testyta
som kör **den gemensamma launch-ownern**, utan DB/Redis/Blob/LLM-nycklar eller
kund-URL:er. Testytan finns inte i denna kandidat; ingen ny offentlig
diagnostikroute eller providerkonfiguration har lagts till som genväg.
Den ska ta en fast inbäddad HTML-fixture, inte en URL från anroparen, och
använda testägd temporärkatalog med städning endast av egna filer/processer.

| Prov | Körning och kvitto |
| --- | --- |
| Desktop/mobil | Fem seriella körningar med separata 1280×900/375×667-kontexter, två icke-tomma JPEG-bilder och mobile.close → desktop.close → browser.close. |
| Samtidighet | Två samtidigt köade capture-jobb genom samma launch-owner; kontrollera mutexordning, framdrift och städning. Separata Vercel-invocations redovisas separat, inte som bevis för ett globalt lås. |
| WebGL | Tre körningar med canvas/WebGL2, `readPixels` av känd färg och ingen GL-error; normal teardown efter båda bilderna. |
| Resurser | Mät Node och testägd Chromium-processfamiljs topp-RSS/processantal samt verkligt ledigt `/tmp` före launch, efter bilder och efter close. `stat.size` får inte användas som RAM-/diskförbrukning. |
| Native avslut | Bind invocation/capture-ID, browser-/Node-version, faser, close-fel, native exit/signal och dumpmetadata. Normal exit 0, ingen signal/dump och ingen kvarlevande testprocess krävs; HTTP 200 eller Playwright-disconnect räcker inte. |

Observerade resursvärden måste jämföras med testdeploymentens faktiskt
konfigurerade minne/deadline; de är inte kända från projektets Node-pin.
Detta verifierar launch-/capture-/teardown-ownern i Vercel, **inte** hela
postcheckens DB-attestation/live-review-kedja. Den kedjan behöver i sin tur
en isolerad datafixture innan någon write-route kan kallas inom nuvarande
DB-readonly-mandat. Linux-reprot ovan är fortfarande bara lokal native-evidens.

Fortsättningsmandatet tillåter ready-status när kod/review är färdiga så att
GitHub kan köra aktuell required CI. Ready är inte liveacceptans eller
mergemandat. Den avgränsade preview-dispositionen ovan ersätter det tidigare
kravet på nytt isolerat Vercel-prov före preview-kandidatur, inte kravet på
korrekt CI/review eller den kvarvarande live-/produktionsacceptansen.
`SM-072` och hela buggraden ska fortfarande inte markeras lösta.

## Vad som observerades

Efter varje bygge tar Sajtmaskin skärmdumpar av den körande previewen med
Chromium i en Vercel-funktion. En dump upptäcks efter nedstängningsförsöken.
Den äldre loggen pekade på teardown, men saknade native signal och fasbevis.

- 391 MB efter init-postchecken
- 914 MB efter AUTO-FIX-postchecken

Två processer, två filer. Siffran är rapporterad filstorlek på en gles fil, inte
allokerad disk — därför kan 914 MB «rymmas» på en 525 MB-volym. Samma storlek
sågs i `SM-072`-underlaget 2026-09-01.

## Varför det inte blockerade

`/tmp` gick 513 → 305 MB fritt mellan körningarna. Tryckgränsen i
[`src/lib/capture/browser.ts`](../../../../../src/lib/capture/browser.ts) är
200 MB, så nästa Chromium-start överlevde. Båda postcheckarna returnerade
`verdict=passed` och `product_degraded=false`.

Den ursprungliga `SM-072`-skadan — 513 → 31 → 23 MB, nästa start dör, sajten
visas som «Degraderad» — inträffade inte.

De ~208 MB som försvann var **inte** den första dumpen; den prunades före andra
starten. Det är annan `/tmp`-förbrukning, möjligen profiler eller
Sparticuz-extraktion; en läcka är inte fastställd. Det nya lokala provet
behöll cirka 208.66 MiB stabilt efter rena closes, utan profiler eller
ackumulation. Det är förenligt med extraktionscache men klassificerar inte
den äldre Vercel-invocationens filer; exakt vad som tog utrymmet där är
fortfarande okänt.

## Förhållande till de andra spåren

Core-dumpen är **en** av varningarna inuti de två «Kontroller att se över»-korten
i spår B1, tillsammans med live review och autofix-risk. Den är inte orsaken
till att korten finns, och inte orsaken till att sajten byggdes.
`product_postcheck.browser_crashed` är avsedd yta: den finns för att göra
kraschen synlig, inte för att blockera.

## Bevakning

Utred vidare först när något av detta inträffar:

- En burst som går **under** 200 MB fritt `/tmp`. Då loggas raden med största
  konsumenter och namnger boven.
- `browser-closed` **med** gott om fritt `/tmp`. Då är det `SM-025`, inte
  `SM-072`.
- Nytt minnes- eller disktryck i en annan capture-väg.

## Owner

- [`src/lib/capture/browser.ts`](../../../../../src/lib/capture/browser.ts)
- [`src/lib/gen/verify/product-postcheck.ts`](../../../../../src/lib/gen/verify/product-postcheck.ts)

Backloggrad: `SM-072` i
[`BUG-SWARM-BACKLOG.md`](../../../../../BUG-SWARM-BACKLOG.md). Ingen ny rad.
