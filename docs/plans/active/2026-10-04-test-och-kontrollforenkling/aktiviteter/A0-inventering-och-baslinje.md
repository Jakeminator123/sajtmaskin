# A0 — inventering och baslinje

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Ej startad. Beroende: uppdrag att börja. Arbetssätt: read-only.

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
