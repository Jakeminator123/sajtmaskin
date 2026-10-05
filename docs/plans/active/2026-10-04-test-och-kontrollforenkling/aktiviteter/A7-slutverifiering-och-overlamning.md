# A7 — slutverifiering och överlämning

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Två delpaket levererade till preview; hela A7 öppen för kvarvarande A3/A4/A5/A6b.
Beroende: A3–A6.

## Aktuell avgränsning

Verifierade lokala paket: A6a discovery/fallback, A2 audit-orkestrering,
A3 systemprompt/checker + Backoffice-testhygien + verklig promptkomposition,
A5 fjorton Node-testmiljöer + effektivare heredoc-testharness. Fullkörningens underlag: branch
`codex/test-control-relevance`, head `9d71cd34f7a8e47d840afb18a5c61da329ac09d4`,
bas `origin/preview` `ff2ac650cc2d3ef37ccd1dcb3e286a0f39c6775c`, med arbetsdiff.
Detta fullkvitto avser arbetsdiffen före publicering. Jakobs senare direkta
leveransmandat i samordningschatten är verifierat och paketet publicerades i
[PR #1553](https://github.com/Jakeminator123/sajtmaskin/pull/1553).
Aktuell head, bas, merge och separat deploymentkvitto finns nedan. Det
ursprungliga lokala fullkvittot ska inte förväxlas med ett senare CI-resultat.

### Faktisk previewleverans 2026-10-05

| Paket | Granskad head / bas | Faktisk merge och identitet | Native verifiering |
| --- | --- | --- | --- |
| [#1553](https://github.com/Jakeminator123/sajtmaskin/pull/1553) — samlat discovery-/pilot-/miljöpaket | `d1bd214ec0dc523690cd17b43a441ca144f02ea5` / `e37e4d83a32be2bdaf9207ff8b2c3328c35a8ae3` | 05:17:43 UTC, `c4f4b18817b802399434986960e0a3e0086eb014`; träd `874c0195f19f3135d6ac75c890333bd4fb693ca7` identiskt med granskad head | CI [37266630324](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37266630324) SUCCESS, 4:45; dossier [37266630354](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37266630354) 21/21 byggen, 5:59. Två oberoende CLEAN och native gates gröna. |
| [#1562](https://github.com/Jakeminator123/sajtmaskin/pull/1562) — endast fyra ruleset-/auditpaths | `1110d65f579b6f3d19b2c7e6b9348769d7167fea` / `c4f4b18817b802399434986960e0a3e0086eb014` | 05:35:35 UTC, `cca962c693f90b83d41b3cd46cba3e2275df180b`; träd `ecaac2546cf06dc083b11e69a063537ff96645c5` identiskt med granskad head | Ready-CI [37268024330](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37268024330) SUCCESS, 3:51, alla fyra shards och sex required checks gröna. Dossier [37268024323](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37268024323) gav explicit light-kvitto, inte 21 acceptancebyggen. |

#1562 integrerade normalt originalcommitterna `94ac4c3` → `f74e8b2` →
`340724b`. Alla fyra payloadblobbar var identiska med de tidigare granskade
paketen. Färsk lokal integration: 8 filer/220 PASS med högst fyra workers,
typecheck, fyrfilslint, checker-syntax, workflowkontrakt, discovery 1080/1080
och normal verify-plan gröna. Oberoende `a5_hook_review` (`gpt-5.6-sol`, xhigh)
granskade exakt head/bas och faktiska callers: CLEAN, utan egen testomkörning.
Samordnarens separata `industry_pr_review` gav också CLEAN. Det lokala
författarkvittot och de två reviewpassen är olika bevis.

Samordnaren verifierade exact-head Vercel READY/`aliasError=null` före båda
mergarna: #1553 `dpl_GX7x8Pe5LLDwzVMEcQxpNW87YVSV`, #1562
`dpl_46XHvCKThyyN2sJ43D3UgvHXiLfn`. Efter #1553 verifierade samordnaren
post-CI `37267139493`: standardchecks gröna, endast samma 13 kända
DB-paritetsavvikelser som på tidigare bas; postdeployment
`dpl_6GjdgDJVnrGZwegrsiDE1KQqNMku` READY/`aliasError=null`.
Efter #1562 verifierade samordnaren post-CI `37268476396` på `cca962c6`:
alla fyra shards, quality, Backoffice, schema, contracts och build gröna;
enda avvikelsen är samma 13 DB-paritetsrader, utan diff mot `c4f4b188`.
Separat exact-postdeployment `dpl_AVG1EFPcVxK2zvGdYniW2QwVtujG` är
READY/`aliasError=null`. Detta är postmergebeviset; före-merge-deployment
på `1110d65f` används inte som ersättning för det.

Ingen masterpromotion, delad DB-apply, env-/providerändring eller ny
CI-urvalsminskning ingick. Originalplanens tio filer och aktiva indexrad
bevaras. Aktuell doc-onlybranch `codex/test-control-status` uppdaterar endast
befintlig status; nya A3-/A5-kandidater är HOLD, A4:s riktiga isolerade harness
saknas och A6b/A7:s slutchecklistor är öppna. Samordnaren har frigivit
docs-publicering efter faktisk SCHAFFOLDS-merge och lokal kontroll/review.

### Slutlig dokumentationsbas efter SCHAFFOLDS

[SCHAFFOLDS #1563](https://github.com/Jakeminator123/sajtmaskin/pull/1563)
mergades 2026-10-05 06:26:11 UTC till
`8267a10eb0954102eaef2afe74f356913fe74cdf`. Trädet
`66b87e953ad87436707f713589774b1944e9c7fc` är identiskt med granskad head
`d5a344a4bce05ff8e31c5b7d499356c194981bf2`. Samordnaren redovisade två CLEAN,
sex gröna required checks och ready-CI
[37271926372](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37271926372)
SUCCESS med fyra shards, 5:11. Dossier
[37271926406](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37271926406)
var legitim light med hoppad byggmatris, inte ett nytt 21/21-byggkvitto.
Exact-head deployment `dpl_2KP6Aei2Mw92aiFrh5dwbLn2N4iC` var enligt
samordnaren READY/`aliasError=null`. Postmerge-CI/deployment för `8267a10e`
följs av samordnaren och är ännu inte färdigbevisade i denna status.

En normal basmerge `3fdff50d158658c532baaec5dc2b784406ebf8ac` tog in
`8267a10e` utan konflikt. Direkt efter mergen var alla sju docs identiska med
tidigare CLEAN-granskade `1a395cfe`; därefter ändrades bara masterplanens,
genomförandeguidens och denna aktivitets status för den nya basen. Övriga fyra
docs återanvänder identiska blobbar. SCHAFFOLDS runtime ligger i basen och är
inte ett nytt TESTER-delta. Dess unit-/stabilitetsprov ersätter inte A4:s
okörda isolerade browser-/persistens-/providerflöden. Aktuell granskning och
native checks styr dokumentations-PR:ns leverans; samordnaren äger merge.

Efter bassynken gav normal verify-plan och dess sju dokumentkontroller exit 0:
fyra testfiler/49 PASS med högst fyra workers, discovery 1083/1083, genererade
docs, länkar, planhistorik, termkontrakt och workflowkontrakt gröna. Det är ett
aktuellt dokumentationskvitto, inte en ny full runtime- eller A4-körning.

Full `verify:pr -- --keep-going` med `VITEST_MAX_WORKERS=4` gav exit 0 på det
frysta kodpaketet 2026-10-05. Samtliga 21 valda kontroller blev gröna:
workflow/discovery, dokumentation/planhistorik, term-/agentkontrakt,
embeddings, typecheck, lint, standardsviten, Backoffice, dependency-baseline
och npm-träd, scaffolds, dossiers, route-timeouts, backlog, canvas och knip.
Standardsviten körde 1 001 testfiler: 12 954 godkända tester och 26 skippar,
667,63 sekunder med fyra workers. Backoffice körde 700 tester, alla godkända,
på 58,988 sekunder. Discovery gav 1 079/1 079 avsiktliga runner-tilldelningar.
Full native-output finns lokalt i `.tmp/test-control-full-20261005.log`;
verktygskvittot visar `VERIFY_EXIT=0`. Fingerprint, head och bas nedan var
oförändrade även efter fullkörningen. Detta bevisar endast valda lokala körprofiler, inte
browser/DB/provider/A4 eller Linux-specifika skip. Inga 13 kända
DEV↔PROD-schemaavvikelser har maskerats eller ändrats. Sen CI-urvalsminskning
A6b genomförs inte innan beroendena har verkliga bevis.

Samlad read-only integrationsreview av `a5_hook_review` (`gpt-5.6-sol`, xhigh)
gav CLEAN. De 34 icke-doc-pathernas ordnade SHA-256-fingerprint var identisk
före och efter review:
`48b774398eb82ee4619bd78c00b2c5f9a2730404d572189e7ec19c5d352ff168`.
Nya otrackade test-/discoveryfiler och den borttagna tier-testfilen ingår i
fingerprinten. Review återanvände tidigare delpaketsbevis och kontrollerade
samspel, owners, faktisk CLI och CI-/required-wiring på slutdeltat.

Discovery bevisar avsiktlig runner-tilldelning, inte att varje test var körd,
oskippad eller blockerande. Den valda lokala profilen innehåller inte
preview-host-körningen; en faktisk PR med workflowdiff väljer däremot
`run_preview_host=true`. Denna lokala review ger inte ensam nya kvitton för
native CI, Linux, browser, isolerad DB eller externa providers. Senare native
CI redovisas separat ovan; browser-/DB-/providerflödena i A4 är obevisade.

### Aktuell bassynk

PR #1553 normalsynkades 2026-10-05 en gång efter den avslutade dossier- och
industryleveransen, mot faktisk preview
`e37e4d83a32be2bdaf9207ff8b2c3328c35a8ae3`, via merge
`8d5408b12cd26bd3ec2356e95dc11758bc8df919`. Enda konflikt var planindexet:
testreformens aktiva rad bevarades, dossierplanens levererade/raderade rad
återinfördes inte. Ingen runtimekonflikt löstes.

Diffen mot basen är fortfarande 45 paths: 34 kod-/test-/configpaths och 11
befintliga planpaths. Alla 34 filhashar, inklusive avsiktlig testfilradering,
matchar det tidigare fulltestade och CLEAN-granskade paketet exakt; fingerprinten
ovan är oförändrad. Basens dossier-, F3- och industrykod är inte nya PR-deltan.
F3-fixen är redan levererad via #1558. Separata lokala audit `340724bd1` och
ruleset `f74e8b281` ingår inte i #1553; de är därefter levererade via #1562.

Riktad integration efter synk: 33 testfiler, 756 PASS och 26 plattformsskippar
med högst fyra workers. Alla ändrade Vitest-filer samt provider-/server-verify,
F3, dossier-/promptintegration och industry-route/UI ingår. Tre berörda
Backoffice-moduler gav 80 Python PASS. Typecheck och faktisk discovery
1 080/1 080 är gröna. Logg: `.tmp/test-control-e37-integration.log`.
Detta är ett integrationskvitto, inte en ny fullsuite eller ett A4-flödesbevis.

Tidigare fullprofil återanvänds endast för identiska kodbytes. Aktuell review,
native CI och deployment måste avse PR:ns nya publicerade head och aktuella
bas; äldre gröna PR-resultat är inte ett nytt mergekvitto. Samordnaren äger
merge. Planens A3 är fortfarande ofullständig, A4 harnessblockerad och A6b
endast read-only kartlagd. Hela A7/slutchecklistan är inte färdig.

## Uppdrag

Visa att den samlade förenklingen uppfyller målet på aktuell kod och kan
överlämnas utan gömda luckor. Skilj lokal verifiering, PR-leverans, staging
och produktion. Aktivitetens avslut styrs av avtalat mandat, inte av antagen merge.

## Checklista

- [ ] Frys aktuell head och integrationsbas. Granska ändringsdelta efter
      eventuella synkar och bevara andras nya ändringar.
- [ ] Återskapa A0:s inventering: vilka grupper bedömdes, behölls, skrevs om,
      slogs ihop eller togs bort? Kvarvarande okända/orphan-tester ska vara noll.
- [ ] Kontrollera masterplanens klarkriterier mot faktiskt bevis. En öppen
      fråga som påverkar ett nödvändigt skydd får inte döljas som lågprioriterad residual.
- [ ] Visa fortsatt skydd för pengar/data/auth/isolering/migrationssäkerhet
      och faktiskt körda borttagnings-/ersättningsflöden efter sparning/reload.
- [ ] Sammanställ centrala negativa felbevis och återställd grön kontroll.
      Visa att den obligatoriska körningen reagerar, inte bara ett lokalt testnamn.
- [ ] Kör relevanta samlade kontroller på aktuell leverans. Återanvänd bara
      äldre sakbevis för verifierat identiska bytes; redovisa det tydligt.
- [ ] Jämför flera före/efter-körningar med A0. Redovisa testmängd, verkliga
      körningar, flakighet, kö/setup och kritisk CI-/leveranstid var för sig.
      Skriv vad som förbättrades, vad som inte gjorde det och underlagets gränser.
- [ ] Kontrollera aktuella regler, scripts, scheman, dokumentation och länkar;
      inga dubbla körowners, oanvända configfält eller stora backupinventarier.
- [ ] Låt oberoende agent granska hela förändringens kvarvarande risker och
      integrationsbevis. Rätta trovärdiga fynd och granska därefter deltat.
- [ ] Redovisa PR/check/deployment och terminalt fjärrläge när detta ingår i
      mandatet. Ett lokalt grönt paket är inte ett bevis på merge eller production.
- [ ] Lämna kvarvarande verkliga frågor till rätt befintlig owner/backlog;
      skriv en kort handoff med resultat, begränsningar och nästa mottagare.
- [ ] När leveransen är genomförd och mergad: uppdatera active/avklarat-router
      enligt planlivscykeln. Behåll detaljer bara om en aktuell konsument behöver
      dem; git bevarar historiken. Planpaketet stannar aktivt tills dess.

## Lokalt delkvitto

Historiska syntax-/placeringslås har ersatts med verklig audit- och
promptkörning eller tagits bort där befintligt beteendeskydd består.
Backoffice-produktkoden, audit-runtime, promptkompositören och promptfragmenten
är oförändrade. Kontrollerade felprov och återställda gröna resultat finns i
[A2](A2-pilot-och-kanda-lasningar.md), [A3](A3-omradesvis-rensning.md),
[A5](A5-testmiljoer-och-prestanda.md) och [A6](A6-korpolicy-och-ci.md).

Tillfälliga felinjektioner och provbytet tillbaka till det äldre
prompttestet är återställda. Vid slutkontroll hade audit-runtime blob
`d60342da939d56942516275a8b088d48b99c56c9`, composer
`7f2289cfbaf87f00ef365347229b6c636f127ba0`, slutligt prompttest
`68fc5b0add194f5bb773ed3819d2a928b9c894c6` och heredoc-hook
`d374995d8376bd44bb408082de45d284f6837713`. Provscript är borttagna;
ignorerade mätloggar finns kvar som lokalt underlag. Originalplanen och
användarens bifogade uppdrag har inte raderats eller ersatts med en ny plan.

Mätta lokala delvinster: Node-miljöpiloten gav median 21,109 → 18,318 sekunder
(cirka 13 procent); heredoc-harness gav 2,707 → 1,214 sekunder
(cirka 55 procent). Detta är separata riktade mätningar, inte bevis på
motsvarande förbättring av full CI, kötid eller deployment. Inga obligatoriska
checks eller CI-shards har avvecklats.

Nästa mottagare är Jakob och samordnaren `Dokumentera Master-promotion`.
Publiceringsmandatet är verifierat; samordnaren ansvarar för mergeordning och
aktuella native checks/reviews. Fortsatt A3 kräver områdesvis krav-/felbevis
och samordnad skrivreservation; A5:s nästa tvåfilspaket är bara miljömätt.
A4 kräver riktig isolerad DB-/providerharness. A6b:s slutliga urvalsminskning
väntar på beroendena; same-head-eventdedup är separat read-only underlag,
inte en genomförd workflowändring. Planpaketet stannar aktivt.

## Slutkvitto för hela planen

```text
Avtalat leveransläge och uppnått läge:
Granskad head / integrationsbas / eventuell PR och merge:
Aktuella krav och skydd som består:
Ändrade eller borttagna grupper med skäl:
Faktiskt körda kontroller och centrala negativa bevis:
Före/efter-tid, testmängd, flakighet och mätbegränsningar:
Kvarvarande risker / owner / nästa steg:
Planstatus och mottagare:
```

Mottagare: Jakob eller den agent som ansvarar för avtalad leverans. Denna
checklista ger inget extra merge-, produktions-, DB- eller providermandat.
