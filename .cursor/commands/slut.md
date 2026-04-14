# Slut

Använd detta när användaren vill stänga ett helt arbetsspår eller ett flerstegsarbete, inte bara göra en vanlig `/avslutning`.

## Mål

Stäng arbetet i följande ordning:

1. Kontrollera att den faktiska runtime-sanningen är verifierad.
2. Ta in eventuell extern review och fixa konkreta buggrisker eller kontraktsglapp.
3. Konsolidera eller rensa tillfälliga kördokument, reviewanteckningar och andra mellanlager som inte längre behöver ligga aktiva.
4. Skriv eller uppdatera en kort slutöversikt om hela arbetet, inklusive:
   - vad som faktiskt förbättrades
   - vad som fortfarande är svagare än idealet
   - vad som medvetet inte rensades eller migrerades nu
5. **Terminologidisciplin:** kontrollera att inga nya begrepp finns utan registrering i `docs/architecture/glossary.md`. Uppdatera glossaryn om termer ändrats.
6. Synka dashboards, ordlistor och centrala docs om de påverkas.
   - När `backoffice/`, `config/dashboard/app.py` eller `sajtmaskin_backoffice.py` ändras ska även delad helperlogik i `backoffice/shared.py` (plus legacy re-exports vid behov) och relevanta docs spegla samma sanning.
7. Kör riktad verifiering och därefter commit + push när användaren uttryckligen vill stänga/ship:a spåret.

## Extra regler för `/slut`

- Var hård med dubbla docs och gamla körplaner: ta bort eller slimma hellre än att lämna kvar tre nästan likadana dokument.
- Behåll historisk kontext bara när den fortfarande hjälper framtida agenter eller reviewers.
- Om ett stegspår avslutas: se till att `docs/plans/README.md` tydligt visar att spåret är stängt och vad nästa riktiga arbete är.
- Om ett särskilt slutdokument behövs för spåret, skapa det med ett enkelt namn nära repo-roten eller i den mest naturliga kanoniska mappen.
- Radera inte bred legacy-/compatlogik utan verifierad ersättning; markera i stället som parkerat problemområde.

## Slutsvar

Rapportera kort:

- vad som stängdes
- vad som konsoliderades eller togs bort
- vilken verifiering som kördes
- vilka problemområden som återstår
- commit-hash och branch efter push
