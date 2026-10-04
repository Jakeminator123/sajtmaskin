# A6 — körpolicy och CI

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Ej startad. Två delar: A6a efter A1; A6b efter A3, A4 och A5.

| Del                         | Status     | Ansvarig / exakta paths | Bas/head, arbetsdiff vid behov och verifieringsbevis |
| --------------------------- | ---------- | ----------------------- | ---------------------------------------------------- |
| A6a — tidigt säkerhetsskydd | Ej startad | Ej tilldelat            | Ej verifierat                                        |
| A6b — sen optimering        | Ej startad | Ej tilldelat            | Ej verifierat                                        |

## Uppdrag

Samla beslut om körning i den befintliga verifieringsmotorn och kör varje
skydd där det behövs. Inför smalare urval bara när det är bevisat att berörda
beroenden fångas. Relevanta obligatoriska GitHub-checks måste fortfarande
publiceras och kunna stoppa leverans på aktuell kod.

Primära owners: `config/agent-workflow.json`,
`scripts/workflow/path-impact.mjs`, `scripts/workflow/ci-scope.mjs`,
`scripts/workflow/check-contract.mjs`, package-scripts, configs och workflows.
Ändra verklig owner, validator och dess tester tillsammans.

## Tidig säkerhetsdel A6a

Verifiera eller komplettera befintligt skydd före A2 och den breda rensningen.
Behåll dagens blockerande körning; inför inte smalare urval i denna del.
Återanvänd befintlig discovery och owners. En återskapbar maskinell rapport
ska jämföra upptäckta testfiler med avsiktliga kommandon/lane-undantag, även
för separata språk. Motiverade undantag hör till befintlig körkonfiguration,
inte ett nytt handunderhållet register över alla tester.

- [ ] Jämför A0:s faktiska discovery med avsiktlig körning. Bekräfta hur en ny
      eller övergiven testfil signaleras utan att fallas bort tyst.
- [ ] Komplettera saknat automatiskt bortfallsskydd i befintlig motor och
      visa en kontrollerad miss: en upptäckt fil utan körplats får inte ge grönt.
- [ ] Visa att okända/gemensamma paths väljer bred kontroll. Behåll dagens
      obligatoriska checks; osäker klassning får inte bli ett tyst lightval.
- [ ] Granska tidiga ändringar oberoende och kör motorns avtalade verifiering.
      Dokumentera aktuell kod/diff och bevis i delstatusen ovan.
- [ ] Lämna ett körbart säkerhetsskydd till A2–A5 så att förändrad discovery
      kan kontrolleras vid varje berört paket.

A6a är verifierad först när bortfall och okända paths ger avsett fail-safe-
utfall. Om dagens motor redan visar detta behövs ingen kodändring; aktuellt
negativt bevis krävs ändå. Mottagare: [A2](A2-pilot-och-kanda-lasningar.md).

## Sen optimeringsdel A6b

Starta efter A3, A4 och A5. Följande checklista gäller slutlig policy och
optimering; säkerhetsdelen måste fortsätta fungera.

- [ ] Bekräfta vilka checks som är deklarerade och vilka som faktiskt krävs i
      GitHub. Läs detta; ändra inte branch protection som del av teststädningen.
- [ ] Ge schema-drift, deterministisk stabilitet och andra separata skydd en
      avsiktlig körplats. Ta bort bekräftad repetition efter likvärdighetsbevis.
- [ ] Bedöm varningsjobbet för stabilitet: om det bara upprepar blockerande
      tester tillför det ingen ny täckning. Koppla inte dit ogranskade tester.
- [ ] Undvik att workflow-/scaffoldtester körs både riktat och i fullsviten
      utan skäl. Behåll riktad täckning när fullsviten inte körs.
- [ ] Återanvänd central impactklassning för relevanta lane-beslut. Avveckla
      parallella sökvägslistor först när deras gamla träffar är verifierat täckta.
- [ ] Definiera önskad körning under utveckling, på kod-PR och inför leverans.
      Full kontroll gäller för gemensamma/okända förändringar och avtalade
      leveranspunkter. Ogranskade blockerande grupper försvinner inte ur urvalet.
- [ ] Visa att ändringar i delade hjälpare, package/config, dynamiska consumers,
      rename/delete och testkonfiguration träffar alla relevanta grupper.
      Importgraf eller sökvägsfilter ensam räcker inte när beroenden är okända.
- [ ] Visa bred fallback för okända paths och att nya/orphan-testfiler upptäcks.
      Återverifiera A6a efter ändrat urval; rapporten ska inkludera även
      separata språk och testkommandon.
- [ ] Visa att ett misslyckat, avbrutet eller saknat obligatoriskt jobb gör
      den samlade grinden röd. Testa faktisk kör-/aggregatekod, inte en kopia.
- [ ] Skilj discovery (`--list`), skip, rådgivande resultat och genomförd
      kontroll i kvittot. Lägg in A4:s körda flöden på avtalad leveransnivå.
- [ ] Kör `npm run verify:pr -- --plan` och den fulla verifieringen enligt
      arbetsregeln för ändrad CI-/verifieringsmotor; använd isolerad test-DB.
- [ ] Kontrollera att current-head-, schema-, högrisk- och deploymentbevis
      fortfarande är obligatoriska där de var det. Ändra inte migrations-
      eller prodjobb för att maskera ett befintligt rött DB-paritetsresultat.
- [ ] Uppdatera riktiga hook-/agent-/dokumentationskonsumenter. Ingen ny manuell
      urvalslista eller global regel om att gamla tester aldrig får ändras.
- [ ] Låt oberoende granskare kontrollera urval, false-green-risk och aktuell
      integrationsbas innan ett smalare urval används för leverans.

## Klart när och handoff

Körpolicyn är begriplig, central och verifierad med både positiva och negativa
fall. Både A6a och A6b är verifierade. Inget test eller högriskskydd har tappats tyst, och obligatoriska checks
har ärliga kvitton. Uppnådd tidsvinst redovisas över hela avtalade leveransen.

Mottagare: [A7](A7-slutverifiering-och-overlamning.md).
