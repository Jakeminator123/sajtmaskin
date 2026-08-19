# Housekeeping — spår H

**Lokalt.** Körs mellan vågorna, aldrig samtidigt som en våg.

Spår H äger ensamt de fyra konfliktmagneterna: `BUG-SWARM-BACKLOG.md`,
`docs/decisions/README.md`, `docs/plans/active/README.md` och de genererade
projektionerna. Därför får ingen våg vara igång samtidigt.

## H1 — skrivpasset (högst prioritet, gör det först)

39 svärmfynd triagerades aldrig in i backloggen. Rådata ligger i
[`../underlag/2026-08-19-svarmfynd.md`](../underlag/2026-08-19-svarmfynd.md).

Fyra bekräftade, nya defekter är redan inskrivna som `SM-058`–`SM-061`. Kvar att
göra:

1. Gå igenom P2- och P3-raderna i underlaget. Flera har redan ett `SM`-nummer —
   de behöver inte en ny rad, men flera **ankare har flyttat sig** och behöver
   rättas.
2. Fynd märkta `[HYPOTES]` hör i `## Behöver repro`, inte i `Aktiv kö`.
   `Aktiv kö` är bekräftade defekter — den distinktionen är hela dess värde.
3. Underlagets egen tabell listar fyra `SM`-rader som «sannolikt lagade»
   (`SM-011`, `SM-020`, `SM-022`, `SM-012`). Stickprova och arkivera dem som är
   det.
4. **Radera underlagsfilen när passet är gjort.** Den finns bara för att inget
   skulle gå förlorat, inte som en andra bugglista. Två köer är värre än en
   ofullständig.

## H2 — docs och projektioner speglar runtime

```powershell
npm run docs:generate
npm run docs:check
npm run docs:links
npm run check:bug-backlog
npm run plans:history:check
```

## H3 — scheman, policy och drift

```powershell
npm run db:schema-drift
npm run env:audit
npm run control-plane:check
npm run dossiers:validate-all
npm run dossiers:capability-map:check
```

Kör efter spår D, eftersom dossier-arbetet skriver capability-kartan.

## H4 — städ

```powershell
npm run tidy          # torrkörning först
npm run clean:orphans:dry
npm run knip
```

Att städa, konkret:

| Vad | Läge |
|---|---|
| Worktree `sajtmaskin-a-dossierplan` | Planen ligger på master. Kan tas bort |
| Worktree `sajtmaskin-a-chat-logg` | Räddad till `origin/wip/chat-readiness-to-diagnostics`. Kan tas bort |
| Worktree `sajtmaskin-a-live-review` | **Behåll** tills PR #1052 är avgjord |
| Nio lokala brancher med `gone` upstream | Mergade. Kan tas bort |
| `review/1047-lucide` … `review/1052-live` | Granskningsbrancher. Kan tas bort |

Ta bort worktrees med `npm run worktree:remove -- <sökväg>` — **aldrig** med rå
`git worktree remove`, som följer junctionen och tömmer huvudcheckoutens
`node_modules`.

**Rör aldrig en branch med `BRA` i versaler.** De är ägarens frysta backuper. Att
en branch ligger långt bakom master är inget argument — det är hela poängen med
en backup.

## H5 — testskuld

Ändringar som rör pipeline, preview, DB, autofix eller dependency-hantering ska
ha test. Två kända hål:

- `scaffold-query-context.test.ts` kör utan embeddings medan produktion kör med
  — hanteras i [`scaffold-tone-vs-typ.md`](scaffold-tone-vs-typ.md).
- Kostnadsrapporten saknar lås på att huvudtotal == ledgersumma — hanteras i
  [`kostnadsrapport-huvudtotal.md`](kostnadsrapport-huvudtotal.md).

Hittar du fler falskt gröna tester under vågarbetet: skriv en rad i backloggen,
laga inte i förbifarten.
