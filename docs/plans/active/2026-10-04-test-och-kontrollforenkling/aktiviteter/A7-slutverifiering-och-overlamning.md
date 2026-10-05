# A7 — slutverifiering och överlämning

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Lokalt delpaket verifierat; slutleveransen blockerad av kvarvarande A3/A4/A6b.
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
PR:n binder aktuell publicerad head och bas till kodkvittot. Merge/deployment
för den aktuella integrationsheaden är inte bevisade här.

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
`run_preview_host=true`. Native CI, Linux, browser, isolerad DB och externa
providers har inte fått ett nytt grönt leveranskvitto genom denna review.

### Aktuell bassynk

PR #1553 normalsynkades 2026-10-05 med faktiskt levererad core i preview
`84e0061a91af91cfafd02bf914af14b8fc9af6a9`, via konfliktfri merge
`129f7a7c556b12ea7c6e512af531ed7dcc9b9b89`. De 34 kodpathernas fingerprint
är fortfarande identisk med det tidigare fulltestade och CLEAN-granskade
paketet. Den nya basens dossierkod är inte ett nytt TESTER-delta.

Riktad integration efter synk: 24 testfiler, 533 PASS och 26 plattformsskippar;
alla ändrade Vitest-filer samt provider-kompatibilitet och server-verify/F3
ingår. Plan, typecheck, workflowkontrakt, discovery 1 079/1 079, docs och
diffcheck är gröna. Tidigare fullprofil återanvänds endast för identiska
kodbytes; aktuella native CI-/deploymentresultat måste avse PR:ns nya head.
Separat lokal ruleset-commit `94ac4c3fd` är inte inkluderad i PR #1553.
Planens A3 är fortfarande ofullständig, A4 blockerad och A6b inte genomförd.

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
aktuella native checks/reviews. Fortsatt A3/A4 väntar på reserverade owners
och en godkänd isolerad DB-/providerharness; A6b får inte påbörjas innan
beroendena är uppfyllda. Planpaketet stannar aktivt.

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
