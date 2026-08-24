# Buggrapport

Uppdatera den enda spårade bugglistan:
[`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md). Lokal evidens under
`.cursor/bugs/` är gitignored stöd, aldrig en parallell sanning.

## Klassificera först

- Bekräftad defekt på aktuell `origin/master` → `## Aktiv kö`.
- Kräver körning/livebevis → `## Behöver repro`, med exakt vad som ska köras.
- Systemet gör som beslutat men ett nytt val behövs → `## Väntar på
ägarbeslut`, med beslutsägare och deadline eller trigger.
- Hardening, testlucka, docs- eller arkitekturskuld →
  `## Säkerhet, infra och teknisk skuld`.
- PR-introducerat fynd → fixa i PR:n; lägg inte in det som masterbugg.

Körningsbrus, önskemål, ofalsifierbara antaganden och dubletter hör inte i
Aktiv kö. Sök först på exakt `SM-###`, rubrik och 2–4 rotorsaksord.

## Ska inte bli en aktiv bugg

- Körningsbrus som enstaka nätverksblipp, CORS/CORB, Fast Refresh eller
  report-only-CSP utan en reproducerbar defekt.
- ”Känns trasigt” utan falsifierbar premiss och kod-, route- eller prodankare.
- Önskemål eller saknad feature; klassificera som beslut när ett val behövs.
- Ett Observatörsfynd från `/logg-internet` utan bekräftelse från Felsökaren.
- En dublett av samma rotorsak; uppdatera den befintliga raden i stället.

## Verifiera master

En aktiv rad måste ha bevis från kod på aktuell `origin/master` eller konkret
produktionsbevis. Kontrollera utan branchbyte, exempelvis med `git show
origin/master:<sökväg>` eller `git grep <symbol> origin/master`. En draft, ett
lokalt fynd-ID eller en agents slutsats är inte masterbevis.

Evidenscellen ska ange ett verkligt ankare: repo-sökväg/symbol och vad koden
visar, en mergad PR eller konkret prod-repro. Använd aldrig gamla `M#`-taggar.

## Stabilt ID

Varje kanonisk rad använder ett enda ID: `SM-###`. Kontrollera alla tabeller i
backloggen och `docs/plans/avklarat/bug-swarm/README.md`, använd det deklarerade
nästa numret och uppdatera räknaren i samma diff. Återanvänd aldrig ett
arkiverat eller pensionerat nummer; `check:bug-backlog` verifierar det globala
ID-kontraktet och det monotona tombstone-ledgret.

## Exakt aktivt format

Tabellen har exakt sex kolumner:

```markdown
| Klar | Status    | Prio | Fynd                              | Bevis på `master`                    | Nästa steg      |
| ---- | --------- | ---- | --------------------------------- | ------------------------------------ | --------------- |
| [ ]  | Öppen bug | P2   | `SM-###` <en falsifierbar defekt> | `<repo/sökväg.ts:rad>` visar <bevis> | <minsta åtgärd> |
```

- `Fynd` börjar alltid med ID:t och innehåller en rotorsak.
- `P0`: prod nere/dataförlust/säkerhet; `P1`: kärnflöde utan workaround;
  `P2`: reell bugg med workaround; `P3`: kosmetiskt/edge.
- En tom, hypotetisk eller enbart `M#`-baserad evidenscell är förbjuden.

Kör `npm run check:bug-backlog` efter ändringen. Rapportera ID, sektion, prio
och masterbevis. Backloggändringen följer därefter det vanliga
`.agents/skills/pr-workflow/SKILL.md`-flödet.

## Fix och arkiv

När en PR fixar en aktiv rad får samma PR flytta raden till `## Arkiv` och ange
PR-länk samt ändrad kodväg. Länken blir mergebevis när PR:n landar.
Arkivflytten blir canonical först då; stängs PR:n utan merge ska raden
återställas till Aktiv kö.

Fixa direkt upptäckta PR-fynd utan ny backloggrad. Skapa inte flera rader för
samma rotorsak.

Behövs längre repro eller skärmdumpar kan de sparas under
`.cursor/bugs/YYYY-MM-DD_HHMM_SM-###_<kort-slug>.md`. Den ytan är gitignored
lokalt stöd; backloggraden måste fortfarande bära det kanoniska beviset.

Rapportera sektion, ID, prio, masterbevis och om en dublett uppdaterades.
Backloggraden är en spårad ändring och persisteras först genom det vanliga
PR-flödet.
