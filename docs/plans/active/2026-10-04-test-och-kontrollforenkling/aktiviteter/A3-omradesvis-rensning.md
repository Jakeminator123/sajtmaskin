# A3 — områdesvis rensning av hela kontrollytan

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Registry levererad via #1576; tre ändliga kandidatfamiljer återstår.
Beroende: A2. Ingen obestämd massrensning eller PR per gammalt test.

Leveransstatus 2026-10-05: systemprompt-, Backoffice- och promptpaketen nedan
är levererade via #1553 på preview `c4f4b188`. Ruleset- och publika
auditpaketen är levererade via #1562 på `cca962c6`. Ursprungliga lokala
provbaser nedan bevaras som bevisunderlag; [A7](A7-slutverifiering-och-overlamning.md)
äger de aktuella head-/merge-/CI-kvittona. Hela beståndet är inte genomgånget.

## Uppdrag

Gå igenom återstående bestånd från A0 med A1:s kriterier och A2:s erfarenhet.
Ta med tests, validators, scripts, hooks, regler, scheman och dokumentation
som hör till ett område. En kontroll tas inte bort bara för att dess fil
ser gammal ut; varje disposition ska förklara dagens ansvar.

## Områden att fördela

- [ ] Pengar, kreditdebitering, generationstillträde och betalningskontrakt.
- [ ] Data, migrationssäkerhet, auth, SSRF och projekt-/kundisolering.
- [ ] Generation, prompt, follow-up, borttagning/ersättning, repair och versionsstatus.
- [ ] Builder/UI, preview, export och publicering.
- [ ] Scaffolds, dossiers, varianter och integrationsval; samordna aktiva planer.
- [ ] Backoffice, curator, observability och egna Node-/Python-/preview-hosttester.
- [ ] Dokumentations-/schema-/registrykontroller, scripts, hooks och agentregler.

Listan beskriver arbetsfördelning, inte nya obligatoriska körprofiler. A0:s
inventering avgör vilka konkreta grupper som ingår och om ytterligare område behövs.

## Aktuell paketstatus

Samordnaren lägger till en rad per avgränsat områdespaket från A0/A1 och
uppdaterar samma rad vid handoff. Ange exakta paths, ansvarig, bas/head,
arbetsdiff vid behov och pekare till senaste verifiering. Matrisen är
operativ paketstatus, inte en lista över varje test eller en historik per körning.
Aktiv skrivreservation finns i genomförandeguiden; flera paket får inte
ha skrivstatus samtidigt.

| Paket och aktuellt krav | Scope / exakta paths | Status och ansvarig agent | Bas/head och eventuell arbetsdiff | Bevis och nästa mottagare |
| ----------------------- | -------------------- | ------------------------- | --------------------------------- | ------------------------- |
| Systemprompt: kontroll och runtime ska godkänna samma core | `src/lib/gen/static-core-loader.ts`; `scripts/dev/check-systemprompt.mjs`; `scripts/dev/check-systemprompt.test.ts`; `package.json` | Verifierad lokalt; Codex `e1e8` | Bas `ff2ac650`, head `9d71cd34`, arbetsdiff | SKRIV OM/SLÅ IHOP: separat loader/fallbacklogik borttagen. Riktig loader används via `node --import tsx`. 21 riktade tester, faktisk preflight, lint, typecheck och discovery 1079/1079 gröna; oberoende review CLEAN. |
| Backoffice: registrerade sidor och synliga generationsrubriker | `backoffice/test_pages_import_smoke.py`; `backoffice/test_generation_history.py` | Verifierad lokalt; Codex `e1e8` | Bas `ff2ac650`, head `9d71cd34`, arbetsdiff | TA BORT tre historiska modulplats-/filfrånvarolås och source-literal-ban. PAGE_SPECS-importsmoke och riktiga dataframe-/statuskontroller kvar. 32→29 riktade Python PASS; ruff, discovery 1079/1079 och diffcheck gröna. Oberoende review CLEAN. |
| Prompt: verklig komposition ska bevara core och request-kontext | `src/lib/gen/static-core-visual-design.test.ts` | Verifierad lokalt; Codex `e1e8` | Bas `ff2ac650`, head `9d71cd34`, arbetsdiff | SKRIV OM egen string-assembly till produktions-compose via riktig Node/tsx. Alla fyra guardblock kvar. 6/6 pass; 17/17 ihop med checker; ESLint/diffcheck gröna; oberoende review CLEAN. |
| F3: retry ska läsa samma committade status som knappen | `src/components/builder/preview-panel/PreviewPanelF3Trigger.tsx` och dess test | Levererad separat via #1558; inte ett nytt #1553-delta | Lokal `0423cd419`, faktisk preview `59a12080` | Fyra RED före runtimefix, 75 riktade PASS efter; oberoende CLEAN. Senaste readiness/busy-status och explicit parent bevaras. Historiskt CI-förlopp är inte säkert orsaksfastställt. |
| Publik audit: modellseparation i faktisk kandidatkedja | `src/lib/audit/public-analys.test.ts`; `src/lib/audit/audit-tier.test.ts` | Levererad via #1562; inte i #1553 | Bas `c4f4b188`, granskad head `1110d65f`, faktisk preview `cca962c6` | SLÅ IHOP duplicerade modellås; unik kostnadsgrind flyttad till `resolveAuditRun`. Två verkliga felinjektioner går från falskt grönt till rött; ursprungligt 54-PASS-kvitto återanvänt med blobidentitet. Färsk integration 220 PASS/8 filer, två oberoende CLEAN och native CI gröna; A7 äger leveranskvittot. |
| Ruleset: oberoende policyowner och semantiska workflowtriggers | `scripts/ci/check-master-ruleset.mjs`; `scripts/ci/check-master-ruleset.test.ts` | Levererad via #1562 | Bas `c4f4b188`, granskad head `1110d65f`, faktisk preview `cca962c6` | TA BORT död policyinläsning, SKRIV OM YAML-syntaxlås. Verklig CLI med stubbat nät svarar korrekt på legitim policyoberoende körning och ruleset-drift. Ruleset-spec, workflows och permissions är orörda. |

### Systemprompt — felbevis och avgränsning

Tre isolerade filfixtures kördes med både originalcheckern och ersättaren:
giltig kort core (19 tecken) gav gammal exit 1 / ny exit 0; absolut fragmentpath
med lång befintlig fil gav gammal 0 / ny 1; endast avvecklad `systemprompt.md`
utan kanoniskt manifest gav gammal 0 / ny 1. Genererade provfiler är borttagna;
produktionsfragment och manifest ändrades inte. Elva nya fixturetester skyddar
assembly, felvägar och cacheisolering mellan roots med identiska tidsstämplar.
Defaultroot och befintliga callers är oförändrade. Review av `a6a_impact` var
read-only och omfattade runtime, Turbopack och faktisk CJS/ESM-invocation.

### Backoffice — krav och felbevis

Runtime konsumerar `PAGE_SPECS` och callable `render`, inte funktionens
`__module__` eller frånvaron av en oanvänd `_ops_impl`-modul. Båda historiska
låsens legitima motexempel provades in-process: ändrad funktionsproveniens
respektive inert modul i `sys.modules` gav gammalt prov rött men registry-smoke
grönt. Förklarande källtext med tidigare rubrik gav source-banen rött men
verklig dataframe grönt. Dessa är avgränsade in-process-prov, inte genomförda
produktrefaktoreringar.

Realfaults upptäcks fortfarande: `PageSpec.render=None` ger rött i smoke och
`COLUMN_QUALITY_GATE="Quality gate"` ger rött i faktisk dataframekontroll.
Alla mutationer återställdes inom provprocessen; inga runtimefiler ändrades.
Legendernas DB-nycklar, statusvärden, felvägar och övriga beteendetester är
orörda. `a0_ci_baseline` granskade scoped diff och verkliga konsumenter read-only:
CLEAN. Genererat provscript är borttaget. Ingen Backoffice-produktavveckling
ingår och inga delade data berördes.

### Verklig promptkomposition — felbevis

Båda olika requesttexterna går genom verkliga `composeEngineSystemPrompt`
och `getSystemPromptLengths`; inga produktionsfunktioner mockas i den nya
testfilen. Ett separat tillfälligt felprov ersatte endast barnprocessens
composerexport med en funktion som tappade core. Då förblev originalets fem
tester gröna (de anropade aldrig composern), medan nya testet gav fem failures.
Detta är isolerad felinjektion, inte en produktionsändring eller live AI-prov.
Utan injektion gav samma slutfil åter 6/6 pass. Testblob
`68fc5b0add194f5bb773ed3819d2a928b9c894c6`; composer-owner är orörd med blob
`7f2289cfbaf87f00ef365347229b6c636f127ba0`. Provfilerna är borttagna.
Oberoende `a1_pilot` bekräftade faktisk funktion och oförändrade guardblock.

## Bedömda grupper och verkligt kvarstående arbete

### Ändlig restlista efter #1576

| Kvarvarande punkt | Kod eller disposition | Acceptans / gräns |
| --- | --- | --- |
| `project-scaffold.test.ts` + `project-scaffold-baseline-parity.test.ts` i `src/lib/gen/export/` | Kandidat: slå ihop dubbla numeriska versionsfacit. | Avsiktlig ownerhöjning passerar; verklig baseline/plattform/KNOWN_PACKAGES/fallback-drift, force-pin och 3D-gating skyddas. Inga runtimeversioner ändras för testets skull. |
| `src/lib/gen/data/shadcn-recipe-search.snapshot.test.ts` | Kandidat: semantik i stället för kompletta resultatlistor. | Relevant kandidat, sökbar typ, fallback vid tomt/otillgängligt index, community-reservation/backfill består. Legitima index-/ordningsändringar får inte kräva snapshotuppdatering. |
| `backoffice/test_template_curator_catalog.py` + `backoffice/test_template_curator_ui.py` | Kandidat: ersätt produktkatalogens literal 64 med faktisk inventeringsparitet. | Giltig katalogökning passerar; saknad/korrupt/icke-valbar post ger fel. SHA-256-längder och självbyggda fixtureantal är inte rensningsmål. Dessa är inte Blob-token-agentens testpaths. |
| Pengar/auth/tenant/SSRF/ledger/release och aktiva builder/export/download-kontrakt | BEHÅLL efter begränsad ägargranskning; ingen ny rensnings-PR utan bevisad ersättning. | Obligatoriska säkerhets-/beteendelanes består. Ledger/D-ID-residualer stannar hos sina befintliga owners och ger inget DB-/providermandat. |
| Style-choice-par, fixturebaserade scaffold/backupantal, backup/CAS/redaction och levererat kontrollplan/rulesets | BEHÅLL efter ägargranskning. | Aktiva beteendefacit skiljs från historiska produktantal; inga produktfunktioner avvecklas. |

De tre kandidatfamiljerna kan samlas i ett avgränsat testpaket efter faktiska
fel-/likvärdighetsprov. Övriga grupper avslutas med motiverad disposition och
ownerbevis i denna matris, inte nya register eller en full ny PR per test.
Scaffold-/dossierproduktkod är separat levererad; återöppna den inte här.

Detta är paketdisposition, inte ett påstående om slutförd semantisk revision
av varje testfil. Discovery omfattar hela beståndet; A3 är fortfarande öppen.

| Grupp | Disposition och bevisgräns | Nästa owner/steg |
| --- | --- | --- |
| Pengar, auth, tenant, SSRF, migrationsledger, externa kontrakt | BEHÅLL säkerhets- och beteendeprov. Ingen DB/provideroperation eller ändrad kostnads-/routingpolicy. | Befintliga runtimeowners; riktad semantisk genomgång krävs före ytterligare ändring. |
| Builder/UI, preview, export/publicering | Huvudsakligen BEHÅLL verkliga tillstånds-/säkerhetsprov. Aktiva legacy-callers och möjlig extern `/api/download`-konsument gör radering obevisad. | Codex fortsätter bara efter exakt scope/kontraktsbevis; ingen routeavveckling beställd. |
| Dossiers, scaffolds, remove/replace, versionsstatus | Dossierreservation frigiven på `59a12080`; ingen generell radering beslutad. Duplicerade scaffold-versionpins och shadcn-snapshot är fortsatt kandidater. | SCHAFFOLDS produktleverans är terminal via #1575. A4:s smala persistensmiljö är ännu inte körbevisad; full generation/providergräns återstår. |
| Public analys | Tvåfilspaketet är levererat via #1562. No-Sol-skyddet kontrollerar verklig publikkedja; exakta Sol/Luna-beslut kvar hos audit-tier/manifest-parity. | Övriga prompt-, metadata- och klientkontroller är oförändrade. Ingen generell prispolicy infördes. |
| Backoffice, curator, observability, Python | Tre bevisade historiklås bort; curator-SSRF/zipbomb/publish, backup/CAS och observability-redaktion bevaras. Produktkatalogens literal 64 återstår som kandidat; självbyggda fixtureantal behålls. | Den ändliga kandidatlistan ovan äger nästa steg; ingen total Backoffice-radering beställd. |
| Kontrollplanet, rulesets, agentregler | BEHÅLL GitHub-rulesets självständighet från lokal agentpolicy; ownerhistorik motbevisade ny paritetsgrind. Död `_policy`-plumbing och workflowtestets syntaxlås är levererade via #1562. Registrytestets sidantal/rubrikhistorik ersatt enligt paketet nedan; inga registryowners ändrade. | Ingen live ruleset-ändring. Registry-paketets felprov, review och leverans via #1576 är verifierade; detta öppnas inte om utan nytt felbevis. |

Separat ruleset-paket: endast `scripts/ci/check-master-ruleset.mjs` och dess
test ändrades från bas `e49988eb3`. Faktisk CLI gav först RED när den försökte
läsa irrelevant agentpolicy. Efter rensning ger saknad/ogiltig/orelaterad
policy inte fel; verklig borttagen `non_fast_forward` ger fortsatt exit 1 och
exakt driftmeddelande. Allt provades offline med stubbat GitHub-svar, inga
filmutationer av verklig policy. 125 riktade tester, typecheck, lint,
workflowkontrakt och discovery gröna; oberoende slutreview CLEAN med egen
9/9-körning. Policy, ruleset-spec, permissions och workflows är orörda.
Detta ursprungliga paket är nu integrerat med identiska blobbar och levererat
via #1562; det var aldrig del av #1553.

Ruleset-uppföljningen på `f74e8b281` ersätter source-regex med YAML-parsning:
ekvivalent citerad/inline branchsyntax accepteras, medan ett otillåtet citerat
`pull_request`-event ger rött. Nio riktade tester, typecheck/lint och exakt-head
review är gröna. Detta ändrar inte GitHubs regler eller det deklarerade kontraktet.

Auditpaketets felprov injicerade produktens primary i den publika kedjans svans
respektive ersatte hela publikkedjan med produktkedjan. Gamla 17 tester förblev
gröna; nya paketet gav ett relevant fel per injektion. En isolerad simulation
av avsiktligt uppdaterade canonical defaults och deras ägartester gav gammalt
sidolås rött, nytt paket grönt. Ingen faktisk modell-/providerändring gjordes.
Grinden skyddar separation från produktens aktuella primary, inte en ny generell
pris-/allowlist-policy för alla andra modeller eller alias.

### Registry-paket 2026-10-06 — levererat via #1576

Kodscope: endast `src/lib/control-plane/registry.test.ts`, ursprungsbas `eba1c590`,
branch `codex/test-registry-cleanup`. TA BORT historiskt sidantal 37:
commit `578fdaa94` visade tidigare ren 36 → 37-bump för legitim Curator-sida.
SKRIV OM fem rubrik-/historiklås till explicit `decisionRows.length > 0`.
Faktisk `PAGE_SPECS`-membership, alla 64 daterade beslutsraders validering,
negativa fixtures och befintliga CLI-/länkowners är oförändrade.

Kontrollerade mutationer gjordes i den verkliga checkoutens ownerfiler, inte
bara i kopierade parserfixtures. Baseline 40 PASS. Extra giltig `PageSpec`
och namnbyte på beslutsområde gav gammalt test 2 RED/38 PASS, nytt test
40 PASS och verklig `control-plane:check` grön med 38 sidor.

| Kontrollerat verkligt fel | Utfall med ersättningen |
| --- | --- |
| Registry-surface saknas i `PAGE_SPECS` | Registrytest RED och faktisk CLI exit 1. |
| Alla daterade beslutsrader saknas | Explicit inventeringsskydd RED. |
| Oescapead pipe/fel cellantal i faktisk rad | Radvalidering RED. |
| Tom owner, godtycklig prosa eller `Samma` | Varje separat mutation ger radvalidering RED. |
| Planowner eller backlogowner | Båda separata mutationerna ger radvalidering RED. |
| Korrekt formaterad ownerlänk till saknad fil | Registrytest PASS men befintlig `docs:links` exit 1; inget nytt länkparserlager. |

Efter varje prov återställdes ownerraden; till sist verifierades tom gitdiff
för `PAGE_SPECS`, policyregistry och beslutsindex. Återställd kontroll med två
befintliga länk-/termtestfiler gav 3 filer/61 PASS med högst fyra workers.
Lokalt tillfälligt underlag: `.tmp/a3-registry-proof-20261006.json`.
Oberoende `a5_a6_rest_review` (`gpt-5.6-sol`/xhigh) gav CLEAN på
`2b3ea77d` mot `eba1c590`. Normal synk till `4659f3bf` bevarar exakt
testblob och ownerfiler. Slutlig integrationsreview gav CLEAN på `5eab11c8`
mot `4659f3bf`; #1576 är mergad till `f68d1837` med identiskt träd och grön
full CI/exakt deployment. A7 äger terminalkvittot. Detta stänger inte hela A3.

## Checklista per paket

- [ ] Koppla paketet till A0:s upptäckta bestånd och uppdatera paketmatrisen.
- [ ] Reservera owner och exakta paths; ange aktuellt krav och disposition.
- [ ] Sök faktiska konsumenter i kod, package-scripts, CI, hooks, configs,
      Backoffice, export och dokumentation. Saknad appkonsument ensam är
      inte bevis för att ett schema eller en deklaration är oanvänt.
- [ ] Skilj driftkontroll av ett verkligt kontrakt från test av kopierad
      implementation, historisk formulering eller godtyckligt antal.
- [ ] Slå ihop överlappande tester bara när ett kvarvarande test fångar samma
      fel och felvägar. Många case i en parameteriserad grupp kan vara relevanta.
- [ ] Ta bort beslutade, övergivna ytor med deras callers/referenser och
      kontroller. Spara inte backupkopior eller oanvända configfält.
- [ ] Samordna prompt-/designbegränsningar med aktuell produktägare. Läsbarhet,
      tillgänglighet och fungerande kod skiljs från fasta estetiska recept;
      detta steg ger inget mandat att återöppna andra planers produktbeslut.
- [ ] Behåll eller ersätt högriskskydd med relevant felbevis. Dokumentera
      kvarstående osäkerhet; tyst bortkoppling eller evig karantän är inte klarstatus.
- [ ] Kör paketets riktade kontroller och oberoende review; bekräfta relevant
      felrespons vid väsentligt ändrade skydd, inte för varje kosmetisk ändring.
- [ ] Kör A6a:s bortfallsskydd efter ändrad discovery, konfiguration eller
      borttagning; inga kvarvarande testfiler får tappa sin avsiktliga körning.
- [ ] Uppdatera faktisk owner, schema/validator och nödvändiga projektioner
      tillsammans. Ändra inte genererade filer manuellt.
- [ ] Rapportera bedömda och kvarstående grupper till samordnaren. Bocka ett
      område ovan först när hela dess upptäckta bestånd är bedömt och dess
      paketmatris har aktuella bevis och nästa mottagare.

## Klart när och handoff

Alla upptäckta områden har genomgåtts. Varje förändring har skäl och relevant
verifiering; kvarstående frågor har owner och leveranspåverkan. Full körtäckning
minskar inte genom att filer oavsiktligt faller ur discovery.

Mottagare: [A6](A6-korpolicy-och-ci.md) och
[A7](A7-slutverifiering-och-overlamning.md).
