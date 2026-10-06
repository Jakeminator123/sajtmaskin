# A5 — testmiljöer och prestanda

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Pågår. Beroende: A2; baslinje från A0.

De två implementerade paketen nedan är levererade via #1553 på faktisk
preview `c4f4b188`. Ursprungliga lokala mätbaser är daterat delunderlag;
[A7](A7-slutverifiering-och-overlamning.md) äger aktuellt leveranskvitto.
Docstestpaketet nedan är implementerat och lokalt verifierat 2026-10-06;
native leveranskvitto återstår.

## Levererat paket 2026-10-05 — Node-miljöpilot

Ensam skrivare: Codex `e1e8`, bas `ff2ac650`, head `9d71cd34`, arbetsdiff.
Avgränsad kandidat: `scripts/dev/` med testfilerna
`assert-git-checkout-unchanged.test.ts`, `check-agent-context-budget.test.ts`,
`check-bug-backlog.test.ts`, `check-term-coverage.test.ts`,
`check-v0-chat-boundary.test.ts`, `clean-scratch.test.ts`,
`codex-shell-environment.test.ts`, `db-startup-policy.test.ts`, `doctor.test.ts`,
`ensure-backoffice-python.test.ts`, `heredoc-guard.test.ts`,
`install-git-hooks.test.ts`, `mcp-secret-read-guard.test.ts`, `tidy.test.ts`.
Read-only granskning hittade inga DOM-/Reactberoenden i dessa Node-/verktygstester.
Fyra omväxlande jämförelsepar kördes med fyra workers. Alla åtta körningar gav
14 filer, 178 pass och samma tre Windows-/POSIX-skip; samtliga testidentiteter
och statusar jämfördes exakt i JSON-rapporterna, inte bara antalet.

| Miljö | Wall, fyra körningar (sekunder) | Median |
| --- | --- | --- |
| jsdom | 21,209; 21,038; 20,181; 21,181 | 21,109 |
| Node | 18,352; 18,284; 18,262; 18,382 | 18,318 |

Wall räknas från rapportens start till sista filens slut. Lokal medianvinst
2,791 sekunder (cirka 13 %), inte ett löfte om hela CI. Sista parets Vitest-
summering gav environment-aggregat 21,80 s → 0,002 s, setup 4,43 → 4,06 s,
transform 0,560 → 0,498 s; dessa parallella delmått ska inte adderas till wall.
Fjärde Node-körningen använde de verkliga per-fil-annotationerna utan CLI-
environmentoverride. Endast en miljökommentar per fil tillagd; alla assertions,
Vitest-config, global setup och CI-urval är orörda. Discovery 1079/1079 och
diffcheck passerade. Befintliga realfault-fixtures för temp-Git-mutation,
ref-läckage, non-fast-forward, hemlighetsläsning och v0-boundary kördes oförändrat.
Paketstatus: **Verifierad lokalt**. Oberoende read-only review av `a0_discovery`
gav CLEAN; kodkropparna är identiska med HEAD efter att miljökommentaren tagits
bort. Slutkörning utan override gav 178 pass/3 skip, exit 0. Rapporterna finns
tillfälligt i `.tmp/a5-{jsdom,node}-{1..4}.json`; inga nya permanenta körprofiler.
Tre POSIX-fall behöver alltjämt Linux-CI; detta kvitto ersätter inte den.

## Levererat paket 2026-10-05 — heredoc testharness

Status: Verifierad lokalt. Exakta paths: `.cursor/hooks/heredoc-guard.mjs` och
`scripts/dev/heredoc-guard.test.ts`. Samma implementerare, bas och head som ovan.
Hooken är ett avsiktligt UX-skydd och behålls. Endast direktstart isoleras så
att befintlig `decide()` kan importeras utan stdin/stdout-sidoeffekter. Alla
beslutscase bevaras; verkliga CLI-kontrakt för deny, allow, plattform och trasig
input ska kvarstå. Ingen matcher, registrering, regel, permissions- eller
säkerhetspolicy ändras.

Samtliga 17 tidigare testfall och 31 `ask()`-anrop är kvar. Totalt 33 processer
blev sju: fyra CLI-/plattformskombinationer, två trasiga inputprov och ett
file-URL-importprov utan stdin/stdout. Tre dedikerade före/efterkörningar gav
17/17 respektive 22/22 pass. JSON-wall: före 2,707/2,714/2,665 s, efter
1,266/1,214/1,201 s; medianvinst 1,493 s (cirka 55 % i denna fil). Själva
testfilens exekveringsmedian sjönk från 1,926 till 0,414 s. Ingen extra vinst
på hela CI:s kritiska väg påstås eftersom längre parallella filer kan dominera.

Kontrollerat fel i main-guardens matchning gav exakt fyra CLI-failures;
återställd hookblob `d374995d8376bd44bb408082de45d284f6837713` gav 22/22 pass.
`hooks:install` var redan aktuell, `node --check`, explicit ESLint `--no-ignore`,
typecheck och discovery 1079/1079 gav exit 0. Vanligt lint ignorerar `.cursor`
och användes därför inte som hookkvitto. Oberoende `a5_hook_review`
(`gpt-5.6-sol`, xhigh) gav CLEAN och körde egna smala CLI-/22-testprov.
Beslutslogiken och meddelandena är oförändrade. Full workflowprofil krävs
alltjämt på det samlade slutpaketet; hooken klassas inte som docs/light.

## Aktuellt paket — två docstester i Node

Exakt scope: `scripts/docs/check-active-doc-links.test.ts` och
`scripts/docs/check-terminology-contract.test.ts`, två filer och 21 fall.
Read-only importgranskning fann Node-builtins och relativa `.mjs`-owners,
inga DOM-/React-/browserberoenden eller implicit Vitest-globalanvändning.
`contract-docs-core.test.ts` lämnas utanför: dynamiska dossier-/scaffold-/env-
imports och cwd-/worker-specialfall kräver annan avgränsning.

På head `1110d65f579b6f3d19b2c7e6b9348769d7167fea` kördes tre alternerande
jsdom/Node-par med CLI-miljöoverride och högst fyra workers. Alla sex gav
exakt samma 21 fil-/fullName-/statusidentiteter, 21 PASS och inga skip/failures.
Ingen testannotation, assertion, config, setup eller CI-urval ändrades.

| Miljö | Wall, tre körningar (sekunder) | Median |
| --- | --- | --- |
| jsdom | 2,236; 2,208; 2,303 | 2,236 |
| Node | 0,876; 0,835; 0,845 | 0,845 |

Wall mäts från JSON-rapportens start till sista filens slut, inte npm-start
eller hela CI. Medianens skillnad är 1,391 sekunder för just paret; den får
inte generaliseras till fullsviten. Rapporter: `.tmp/a5-docs-{jsdom,node}-{1..3}.json`.
Gemensam setup med Testing Library laddas fortfarande även i Node.

Befintliga negativa fixtures kördes oförändrat: saknade aktiva länkar,
unstaged raderad spårad fil, borttagen workflowrouter och verkligt EACCES,
samt malformed/duplicerade/motstridiga termregler och otillåten aktiv prosa.
Fortsättning 2026-10-06: de två testkropparna var exakt identiska mellan
mätbasen `1110d65f` och färsk preview `f9c5acea`. Endast respektive
`@vitest-environment node`-kommentar läggs nu till. Ny baslinje gav 21 PASS;
de verkliga annotationerna kördes sedan utan miljöoverride och gav samma
21 PASS, inga skip. Assertions, config, global setup och urval är oförändrade.
De äldre alternerande mätningarna ovan återanvänds som avgränsat prestandabevis,
inte som en ny CI-tidsmätning. Oberoende review och leveranskvitto hör till A7.

## Uppdrag

Minska faktisk väntetid och setupkostnad utan att försvaga kontrollerna.
Optimera uppmätta flaskhalsar. Teststädning, lint, typkontroll, installationer,
byggen och kötid bedöms var för sig och genom hela leveransens kritiska väg.

Primära owners: Vitest-configs/setup, `package.json` och träffade CI-steg.
Gemensamma config-/workflowpaths reserveras tillsammans med A6; parallella
undersökningar är tillåtna men inte parallella ändringar i dessa filer.

## Checklista

- [ ] Utgå från jämförbara A0-körningar och välj ett mätbart delproblem.
- [ ] Identifiera server-/verktygstester som kan köra i Node och DOM-beroende
      tester som behöver `jsdom`. Pröva en liten grupp före bred miljöändring.
- [ ] Kontrollera att flytten inte förändrar globals, importresolution,
      miljövariabler, isolation eller felvägar och därmed ger falskt gröna tester.
- [ ] Förenkla gemensam mock/setup och upprepade fixtures när det ger konkret
      vinst. Ersätt inte riktiga felvägar med ett generiskt lyckat mockresultat.
- [ ] Mät discovery, startup, transformation och testtid före/efter för samma
      filer och workergräns. Lokalt används högst fyra workers där det stöds.
- [ ] Bedöm lint/typkontroll/bygge och möjlig parallellisering utifrån critical
      path. Cache måste reagera även på ändrade beroenden och konfiguration;
      bygg inte snabbhet på stale typinformation eller ett äldre grönt resultat.
- [ ] Skilj nödvändig installation/materialisering per isolerad runner från
      samma setup som upprepas i samma miljö. Tysta inte embeddings-/manifestfel.
- [ ] Ändra en optimering åt gången i avgränsade paket. Skapa inga extra tunga
      lokala byggen när samma verifiering redan pågår i checkouten.
- [ ] Visa oförändrad avsiktlig testmängd och felrespons efter miljö-/setupändring.
- [ ] Redovisa flera före/efter-körningar, spridning och faktisk tidsvinst.
      Särredovisa mindre bestånd från A3 och snabbare exekvering här.

## Klart när och handoff

Rätt miljö används för de bedömda grupperna. Genomförda optimeringar har en
uppmätt vinst eller tydligt minskat underhåll, med bibehållen felbevakning.
Osäker statistik redovisas som osäker; inget procentlöfte uppfinns i efterhand.

Mottagare: [A6](A6-korpolicy-och-ci.md) och
[A7](A7-slutverifiering-och-overlamning.md).
