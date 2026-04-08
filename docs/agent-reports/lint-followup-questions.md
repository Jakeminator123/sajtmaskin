# Lint follow-up questions

Frågor och funderingar att ta vidare i separat spår om det behövs.

## Direkt relevanta nu

- Vilka ESLint-regler återkommer faktiskt i genererad kod, om man tittar på verkliga verify-loggar?
- Bör `server-verify` köra `lint` för alla eligible versioner, eller bara när projektet faktiskt har eget lint-setup och vissa typer av filer?
- Vilka lintfel är säkra nog att få deterministiska fixar, och vilka ska lämnas till LLM-fixern eller bara rapporteras?
- Ska quality-gate-UI visa lint-resultat mer explicit som egen kategori när `server-verify` eller manuell quality gate har kört det?

## Viktigt att inte göra ad hoc

- Inför inte ett separat "lint-fix-script" utanför verify-/repair-kedjan.
- Gör inte tier-2 live-preview tyngre genom att slå på `lint` som default för vanlig preview-start.
- Lägg inte till massor av regex-fixar för ESLint-regler utan att först verifiera att samma regler återkommer i riktiga loggar.

## Kandidater för senare förbättring

- En liten parser/normaliserare för fler ESLint-format om verify-lanen senare byter formatter.
- Några få deterministiska fixar för återkommande lintproblem, t.ex. tydliga unused-imports eller triviala importdubletter.
- Bättre sammanfattning i versionslogg/UI för lintspecifika quality-gate-fel.
