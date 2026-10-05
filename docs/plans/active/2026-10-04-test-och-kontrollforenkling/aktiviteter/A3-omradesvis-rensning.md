# A3 — områdesvis rensning av hela kontrollytan

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Pågår. Beroende: A2. Arbetssätt: återkommande små områdespaket.

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

Detta är paketdisposition, inte ett påstående om slutförd semantisk revision
av varje testfil. Discovery omfattar hela beståndet; A3 är fortfarande öppen.

| Grupp | Disposition och bevisgräns | Nästa owner/steg |
| --- | --- | --- |
| Pengar, auth, tenant, SSRF, migrationsledger, externa kontrakt | BEHÅLL säkerhets- och beteendeprov. Ingen DB/provideroperation eller ändrad kostnads-/routingpolicy. | Befintliga runtimeowners; riktad semantisk genomgång krävs före ytterligare ändring. |
| Builder/UI, preview, export/publicering | Huvudsakligen BEHÅLL verkliga tillstånds-/säkerhetsprov. Aktiva legacy-callers och möjlig extern `/api/download`-konsument gör radering obevisad. | Codex fortsätter bara efter exakt scope/kontraktsbevis; ingen routeavveckling beställd. |
| Dossiers, scaffolds, remove/replace, versionsstatus | UTRED/HOLD för skrivning. Duplicerade scaffold-versionpins och shadcn-snapshot är kandidater, inte beslutade borttagningar. | Dokumentera Master-promotion samordnar SCHAFFOLDS och levererar actual core-preview före överlappande paket/A4. |
| Public analys | BEHÅLL tills separat paket får full ersättningsbevisning. No-Sol i publik fallback har unik kostnadstäckning; modellnamn är inte automatiskt inaktuella. | Befintlig audit-/modellowner; ingen större public-analys-rensning i detta paket. |
| Backoffice, curator, observability, Python | Tre bevisade historiklås bort; curator-SSRF/zipbomb/publish, backup/CAS och observability-redaktion bevaras. Katalog-/scaffoldberoende antalslås återstår. | Dossier-/scaffoldhandoff för överlapp; ingen total Backoffice-radering beställd. |
| Kontrollplanet, rulesets, agentregler | BEHÅLL GitHub-rulesets självständighet från lokal agentpolicy; ownerhistorik motbevisade ny paritetsgrind. Död `_policy`-plumbing och registry/projektionsavvikelser återstår i separata paket. | Codex reserverar exakta owners före nästa ändring; inga nya checks införs på felaktig premiss. |

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
