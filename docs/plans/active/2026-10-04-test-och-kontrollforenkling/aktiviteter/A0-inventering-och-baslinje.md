# A0 — inventering och baslinje

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Verifierad 2026-10-05. Beroende: uppdrag att börja. Arbetssätt: read-only.

## Resultat

Baslinjen frystes på ren `origin/preview` `ff2ac650` med Volta/Node 22.23.1.
Faktisk discovery gav 1 078 testlika filer: 1 000 standard-Vitest, 6 stability,
17 Postgres, 39 Python, 1 Playwright, 13 preview-host och 2 explicita
`node:test`. Alla hade en nuvarande körplats, men ett generellt automatiskt
bortfallsskydd saknades. Det hanteras i A6a.

Åtta jämförbara fulla CI-körningar hade exekveringsmedian 3:52 och totalmedian
4:22; intervallet 3:40–10:14 dominerades i två fall av cirka fem minuters kö
från superseded körningar, inte testarbete. Sju fulla dossiermatriser hade
median 6:53 totalt och 5:32 faktisk matrisspann. Åtta Vercel-deployments hade
median 1:58. Underlaget är närliggande körningar från ett dygn; empirisk p95 är
inte stabil. De sju senaste röda preview-pusharna föll på samma 13 kända
DEV↔PROD-schemaavvikelser, inte testflakighet.

Verifierad live-policy är GitHub Rulesets, inte klassisk branch protection.
`preview` kräver `quality`, `backoffice-tests`, `schema-drift`, `build`,
`dossier-acceptance`, GitGuardian och lösta reviewtrådar. A0 var read-only;
ingen DB-, provider- eller GitHub-mutation utfördes.

Återskapbara CI-referenser för urvalet (run-ID → uppmätt head):
[37245177060](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37245177060)
→ `04729010`,
[37243340546](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37243340546)
→ `7297caea`,
[37237731283](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37237731283)
→ `84c47844`,
[37233886370](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37233886370)
→ `f88f7c4b`,
[37230420839](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37230420839)
→ `ff2ac650`,
[37229571686](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37229571686)
→ `e0f90f92`,
[37223701612](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37223701612)
→ `dfe2c65a`,
[37221165642](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37221165642)
→ `d9107679`.
Urvalets `f88f7c4b` hade sex dossierassertioner röda och `ff2ac650` den kända
schemaavvikelsen; dessa räknas inte som slumpmässig flakighet. Tiderna hör till
dessa gamla CI-heads, inte den lokala reformdiffen eller en ny deployment.

## Uppdrag

Kartlägg vad som faktiskt upptäcks och körs, vilka krav det skyddar och var
väntan uppstår. Använd dagens checkout och CI; återanvänd inte samtalets antal
eller en gammal grön körning som ny baslinje.

## Ägare och avgränsning

Läs `package.json`, Vitest-/Playwright-configs, workflowfiler,
`config/agent-workflow.json`, `scripts/workflow/path-impact.mjs`, hooks och
registrerade validators. Kartlägg också egna Node-/Python-/preview-hosttester
och genereringens kontroller. Inventeringen är en rapport från faktisk
discovery och kommandon, inte ett manuellt `tests/registry.yml`.

Ingen implementation, testbortkoppling, DB-anslutning eller tjänstekostnad.
Samordnaren reserverar inga andra planers skrivpaths i detta steg.

## Checklista

- [ ] Dokumentera checkout, aktuell head, jämförelsebas och orelaterade ändringar.
      Om påståendet gäller staging/produktion, läs och frys rätt remote-SHA.
- [ ] Kontrollera aktuella engines/Volta och vald Node-version.
- [ ] Inventera testfiler och faktisk discovery; inkludera alternativa namn,
      skilda språk, separata configs och tester utanför standardsviten.
- [ ] Koppla varje testgrupp till körkommando, miljö och verklig CI-roll:
      blockerande, rådgivande, manuell eller ej körd. Skilj deklarerad policy
      från verifierad live branch protection.
- [ ] Lista scripts/regler/scheman som kan stoppa dev, CI eller generation.
      Ange kravägare och faktisk konsument; metadata ensam bevisar inte användning.
- [ ] Identifiera övergivna tester, dubbelkörningar, överlappande filter och
      fall där en kontroll kan bli grön utan att avsett beteende körs.
- [ ] Mät minst fem jämförbara fulla CI-körningar om sådana finns. Separera
      kö, setup/install, tester, lint, typkontroll, byggen och andra workflows.
      Summera inte parallella jobb till upplevd väntetid.
- [ ] Redovisa median, spridning och tillgängligt underlag för p95. Om urvalet
      är litet eller blandar light/full, märk begränsningen i stället för att
      framställa en stabil p95. Ta med dossier-acceptance och deployment när
      de ingår i den avtalade leveransen.
- [ ] Identifiera återkommande flakighet från befintliga resultat; starta inte
      kostsamma omkörningar för att fylla en statistikmall.
- [ ] Lämna prioriterade kandidater och konflikter med andra aktiva initiativ till A1.

## Klart när och handoff

Samordnaren kan återskapa inventeringen och se faktisk körning för varje
test-/kontrollgrupp samt vilka luckor som ännu är okända. Baslinjen har
SHA-/runreferenser, jämförbara tidsmått och tydliga begränsningar.

Mottagare: [A1](A1-aktuella-krav-och-prioritering.md), senare
[A5](A5-testmiljoer-och-prestanda.md) och [A6](A6-korpolicy-och-ci.md).
