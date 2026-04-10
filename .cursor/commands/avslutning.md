# Avslutning

Använd detta när användaren vill göra ett riktigt slutpass på ett arbete: granska, städa inom scope, synka docs och därefter ship:a.

## Mål

Avsluta det aktuella arbetet i följande ordning:

1. Granska ändringarna med code-review-ögon: buggrisker, regressionsrisker, överdrivna docs och missad verifiering.
2. Städa inom **berört scope**:
   - ta bort tydligt död/duplicerad kod eller missvisande text
   - rensa inte brett "legacy" utan verifierad ersättning
3. **Terminologidisciplin:**
   - Kontrollera att inga nya begrepp introducerats utan registrering i `docs/architecture/glossary.md`.
   - Kontrollera glossaryns § Namnskuggor om du använt tvetydiga ord.
   - Om du döpt om eller lagt till termer: uppdatera glossaryn i samma leverans.
4. Synka dokumentation om runtime-sanningen ändrats:
   - relevanta schemas/docs
   - `config/dashboard/app.py`
   - `docs/plans/active/remaining-focus-after-5-step.md`
   - `5-steg.txt` (vid större slutbildsändring)
   - håll fast vid ord som passar repoet: `orchestrate`, `LLM-input`, `generate/finalize/validate`, `preview/version materialization`, `verify`
5. Verifiera med riktade tester/lints/typecheck efter behov.
6. Commit:a och pusha när användaren uttryckligen vill avsluta/ship:a arbetet.

## Obligatorisk rutin

- Börja med att kontrollera `git status`, diff och senaste commit-stil.
- Om du ser oväntade eller andras ändringar: stoppa och fråga användaren innan du fortsätter.
- Leta efter kvarvarande gamla begrepp eller fältnamn om en migration nyss gjorts.
- Leta efter kvarvarande halv-ersatta parallellspår inom scopet: temporära hjälpfunktioner, dubbla beslutsvägar och gammal text som beskriver den ersatta vägen.
- Om dashboards eller docs berörs: låt dem spegla runtime-sanningen, inte definiera den.
- Om du överväger att radera filer eller mappar:
  - verifiera först att de inte importeras, refereras i script eller docs, eller används som kompatspår
  - om det inte är uppenbart säkert: rapportera som "kan städas senare" i stället för att ta bort nu
- Om en planfil finns i kontexten: använd den som referens men ändra den inte om inte användaren uttryckligen ber om det.

## Commit och push

När `/avslutning` används ska det behandlas som ett uttryckligt önskemål om slutpass och leverans, om inte användaren samtidigt säger att push ska hoppas över.

- Följ repoets commit-stil.
- Commit:a bara relevanta filer.
- Kör push utan force.

## Slutsvar

Rapportera kort:

- vilka risker du hittade och fixade
- vad du medvetet **inte** tog bort
- vilken verifiering som kördes
- commit-hash och branch efter push
