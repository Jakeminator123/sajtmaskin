# D1 — Chromium-core-dump: reproducerad single-process-krasch vid teardown

## Status

**Kandidatfix lokalt verifierad 2026-10-05; inte verifierad eller släppt i
Vercel.** Känd residual av `SM-072`. Tidigare status var «Parkerat, inte löst».
Beställ ingen ny generell prune-fix — `#1234` och `#1318` finns redan.

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

Återstående acceptans: motsvarande Vercel-preview med upprepade postcheckar,
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

PR:n ska behållas som **draft** tills oberoende review och Vercel-preview-
acceptansen ovan är klara. Detta sparuppdrag ger inget mergemandat.
`BUG-SWARM-BACKLOG.md` är inte ändrad och `SM-072` ska inte markeras löst av
offlineprovet. Ingen DB-, env-, provider- eller produktionsåtgärd ingår.
`node_modules/` och `tsconfig.tsbuildinfo` är enbart återbildningsbara lokala
beroenden/cache; underlaget och det körbara reprot finns i Git-filerna.

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
starten. Det är annan `/tmp`-läcka, troligen Playwright-profiler eller
Sparticuz-extraktion. Exakt vad är inte fastställt.

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
