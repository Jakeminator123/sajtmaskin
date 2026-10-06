# A3 — områdesvis rensning av hela kontrollytan

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Pågår. Beroende: A2. Arbetssätt: återkommande små områdespaket.

Leveransstatus 2026-10-06: systemprompt-, Backoffice- och promptpaketen nedan
är levererade via #1553 på preview `c4f4b188`. Ruleset- och publika
auditpaketen är levererade via #1562 på `cca962c6`; registry-paketet är
levererat via #1576 på `f68d1837` och katalogpaketet via #1582 på `c33daca3`. Ursprungliga lokala
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
| Katalogkontrakt: versioner, shadcn-sök och curatorpopulation | Fem testpaths i `backoffice/` och `src/lib/gen/`; inga produktowners | Levererat via #1582 av samordnaren | Source `21fa810e`/bas `e113a7e2`; reviewed head `4253f6e2`/bas `30b941c5`; faktisk merge `c33daca3` | SKRIV OM historiska versionslistor och counts till kanoniska owners + oberoende projektioner. Två P2-reviewfynd rättade; source-, integrations- och slutreview CLEAN. 102 TS/4 filer och 31 Python PASS; full Backoffice 702 PASS. PR-CI 4:13, 21/21 dossierbyggen 5:55 och exakt READY-deployment. A7 äger terminalt postkvitto. |

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
| Pengar och generationstillträde | BEHÅLL durable admission, fresh access, debit/refund/retry och riktiga Postgresprov med `REQUIRE_POSTGRES_TESTS=1`. Targetless-charge-policy har oklar owner och får inte prunas. | Befintliga runtimeowners; riktad semantisk genomgång krävs före ändring. |
| Auth, tenant och SSRF | BEHÅLL cookieprecedens, felaktiga dubletter, guest-claim och negativa routefall. Mappad IPv6, NAT64, Teredo, link-local, DNS-redirect och pinned transport är skilda SSRF-felklasser. | Befintliga auth-/nätowners; inga skydd slås ihop utan gemensamt felbevis. |
| Migrationsledger | BEHÅLL filnamn, read-only-CI och rollkontrakt. Checksum, pending-only och advisory-lock är dokumenterad skuld; inget DB-mandat finns här. | DB-/migrationsowner. |
| Builder/UI, export och publicering | BEHÅLL downloadownership, env-redaction, binärdata och GitHub user-files. Backup-CAS, atomic replace, rollback och redaction skyddar olika risker. `/api/download` saknar intern caller men extern owner är oklar: behåll auth/tenant/ZIP. | Ingen routeavveckling utan caller-/produktägarbevis. |
| Lokala fixtureantal | Style-choice har 33 parameterfall som representerar 9 scaffoldbeteenden. En operation, en snapshot, `MAX_BACKUPS`, fyra filer och två routes är lokala scenario-/fixturekontrakt, inte globala produktantal. | Behåll beteendeskydd; ersätt bara historiska globala katalog-/versionslås. |
| Dossiers, scaffolds, remove/replace, versionsstatus | Terminala dossier-/scaffoldowners återöppnas inte. Katalogpaketet ersätter historiska versions-/antalslås men bevarar faktisk paritet, force-pins, fallback, membership och addenda/UI. | A4 måste fortfarande bevisa isolerad persistens och senare generation/follow-up/remove/replace. |
| Public analys | Tvåfilspaketet är levererat via #1562. No-Sol-skyddet kontrollerar verklig publikkedja; exakta Sol/Luna-beslut kvar hos audit-tier/manifest-parity. | Övriga prompt-, metadata- och klientkontroller är oförändrade. Ingen generell prispolicy infördes. |
| Backoffice, curator, observability, Python | Curatorns historiska 64-count ersätts av rawmanifest/gallery/TS-exclusion/raw variant-JSON som oberoende oracle. Curator-SSRF/zipbomb/publish, backup/CAS och observability-redaction bevaras. | Aktuellt katalogpaket; ingen produktkod eller total Backoffice-radering. |
| Kontrollplanet, rulesets, agentregler | BEHÅLL GitHub-rulesets självständighet från lokal agentpolicy; ownerhistorik motbevisade ny paritetsgrind. Död `_policy`-plumbing och workflowtestets syntaxlås är levererade via #1562. Registrytestets sidantal/rubrikhistorik ersatt enligt paketet nedan; inga registryowners ändrade. | Ingen live ruleset-ändring. Registry-paketet är levererat via #1576; inget mandat till generell rensning av återstående skydd. |

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
`2b3ea77d` mot `eba1c590`. Paketet är mergat via #1576 på `f68d1837`.
Det stänger inte hela A3.

### Katalogkontrakt 2026-10-06 — levererat via #1582

Scope är exakt fem testfiler:

- `backoffice/test_template_curator_catalog.py`
- `backoffice/test_template_curator_ui.py`
- `src/lib/gen/data/shadcn-recipe-search.snapshot.test.ts`
- `src/lib/gen/export/project-scaffold-baseline-parity.test.ts`
- `src/lib/gen/export/project-scaffold.test.ts`

Source `21fa810e096a9486ffa58000bb114ec4f1469c37` mot `e113a7e2` är
oberoende CLEAN efter att båda P2-täckningsfynden rättats. Normal integration
`de87533efd314949e7b42437870c10c0ea136a3c` mot preview `30b941c5` har
identiska fem test- och lockblobbar. Författarens `verify:pr -- --plan` är
grön. Oberoende avgränsad integrationsreview är CLEAN; berörda produktowners,
fixtures och fem testblobbar är identiska med tidigare granskad source.
#1581:s separata produktfix (`client` → `node:path`) är redan mergad i
basen med full CI/deployment och ingår inte i A3-deltat.

Tre giltiga förändringsprov fällde de gamla låsen men passerar de nya:

- samordnad Next/`eslint-config-next` 16.3.8 → 16.4.0 i source-fixture:
  12 gamla RED,
- en giltig ny shadcn-indexpost: 1 gammal RED,
- curatorpopulation 64 → 65: 5 gamla RED.

Fjorton verkliga felmutationer gav RED och återställdes: sex för
version/force-pin/paritet, tre för shadcn-fallback/intent/typ och fem för
curator-membership/addenda/UI. Sex legacy-fallbackscenarier samt rangordning,
unikhet, typ och medlemskap bevaras. Curatorns rawmanifest, gallery,
TypeScript-exclusion och raw variant-JSON är oberoende oracle. Lokalt bevis:
`C:/Users/jakem/dev/projects/sajtmaskin-tester-restarbete/.tmp/a3-catalog-contracts-proof-20261006.json`.

Författarkvittot är 102 TypeScript PASS i fyra filer och 31 Python PASS. Hela
Backoffice gav 702 PASS på 56,104 sekunder, exit 0, med samordnad oförändrad
Git-vakt. Typecheck, lint och discovery 1 092/1 092 var gröna på sourcebasen
`e113a7e2`. På integrationen `de87533e`/`30b941c5` är färsk discovery
1 093/1 093, docslänkar, historikstatus och plan PASS. Slutlig docsreview är
CLEAN på `4253f6e2`; paketet är mergat via #1582 på `c33daca3` med PR-CI 4:13,
21/21 dossierbyggen 5:55 och exakt READY-deployment enligt samordnaren.
Ingen produkt-, dependency-,
runtime- eller CI-policy ändras, och paketet stänger inte hela A3.

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
