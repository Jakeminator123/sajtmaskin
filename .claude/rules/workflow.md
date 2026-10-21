<!-- Genererad av npm run claude:sync från .cursor/rules/workflow.mdc — redigera källan, inte den här filen. -->

# Workflow

`förstå scope → hitta owner/callers → ändra → synka referenser → verifiera → rapportera`

1. Sök referenser före flytt/radering; 0 sökträffar i ett kallt index är inte bevis.
2. Rör bara uppgiftens filer och bevara orelaterade ändringar. Stage exakta
   paths; undvik bred formattering.
3. Ersätt stale text/kod; skapa inte parallella sanningslager eller backupdocs.
4. Uppdatera länkar, tester, schema och genererade projektioner i samma diff när
   ändringen äger dem; `npm run sync:derived` när en generatorowner ändrats.

## Verifiera

Kör `npm run verify:pr -- --plan` när diffen fått form; path-impactmotorn väljer
ytor och CI-profil, så skapa ingen egen pathmatris. Kör och redovisa
riktade kontroller lokalt, minst: TypeScript → `typecheck` + riktade tester; Python →
`backoffice:test`; scaffold → `scaffolds:validate`; dossier →
`dossiers:validate-all` + `dossiers:capability-map:check`; docs/regler →
relevant `docs:*` eller `workflow:contract`. Full regression ägs av CI; profiler
i `pr-workflow` § 3.

## Pausa

Pausa vid dataförlust, security/cross-tenant, oklar canonical owner, bred rename,
arkitekturbeslut eller oväntat scope över cirka 40 filer.
