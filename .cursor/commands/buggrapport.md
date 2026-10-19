# Buggrapport

Uppdatera den enda spårade bugglistan, `BUG-SWARM-BACKLOG.md`. Sök först exakt
`SM-###`, rubrik och 2–4 rotorsaksord; läs inte hela filen. Lokal evidens under
`.cursor/bugs/` är gitignorerat stöd, aldrig en parallell sanning.

## Klassificera

- Bekräftad defekt på aktuell `origin/master` → `## Aktiv kö`.
- Kräver körning/livebevis → `## Behöver repro`, med exakt vad som ska köras.
- Beteendet är beslutat men ett nytt val behövs → `## Väntar på ägarbeslut`,
  med beslutsägare och deadline eller trigger.
- Hardening, testlucka, docs- eller arkitekturskuld → `## Säkerhet, infra och
  teknisk skuld`.
- PR-introducerat fynd → fixa i PR:n, ingen backloggrad.

Aldrig i Aktiv kö: körningsbrus (nätverksblipp, CORS/CORB, Fast Refresh,
report-only-CSP), "känns trasigt" utan falsifierbar premiss och ankare,
önskemål, ett obekräftat Observatörsfynd från `/logg-internet` eller en dublett
av samma rotorsak (uppdatera befintlig rad).

## Bevis och ID

En aktiv rad kräver bevis från kod på aktuell `origin/master` (utan
branchbyte: `git show origin/master:<sökväg>`, `git grep <symbol> origin/master`)
eller konkret produktionsbevis. En draft, ett lokalt fynd-ID eller en agents
slutsats är inte masterbevis. Evidenscellen anger repo-sökväg/symbol och vad
koden visar, en mergad PR eller en konkret prod-repro — aldrig `M#`-taggar.

Varje rad har ett `SM-###`. Ta det deklarerade nästa numret, uppdatera räknaren
i samma diff och återanvänd aldrig ett arkiverat eller pensionerat nummer
(kontrollera även `docs/plans/avklarat/bug-swarm/README.md`).

## Format

```markdown
| Klar | Status    | Prio | Fynd                              | Bevis på `master`                    | Nästa steg      |
| ---- | --------- | ---- | --------------------------------- | ------------------------------------ | --------------- |
| [ ]  | Öppen bug | P2   | `SM-###` <en falsifierbar defekt> | `<repo/sökväg.ts:rad>` visar <bevis> | <minsta åtgärd> |
```

`Fynd` börjar med ID:t och har en rotorsak. `P0` prod nere/dataförlust/säkerhet;
`P1` kärnflöde utan workaround; `P2` reell bugg med workaround; `P3`
kosmetiskt/edge. Tom, hypotetisk eller enbart `M#`-baserad evidens är förbjuden.

## Fix och arkiv

PR:en som fixar en aktiv rad flyttar den till `## Arkiv` med PR-länk och ändrad
kodväg; arkivflytten blir canonical först när PR:n mergas, och en stängd omergad
PR återställer raden. Längre repro får sparas som
`.cursor/bugs/YYYY-MM-DD_HHMM_SM-###_<kort-slug>.md`, men raden bär alltid
beviset.

Kör `npm run check:bug-backlog`. Rapportera sektion, ID, prio, masterbevis och
om en dublett uppdaterades. Ändringen persisteras via `pr-workflow`.
