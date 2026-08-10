# .cursor/kedja/

Sparade kandidat-diffar från `/kedja` — den stegade buggfix-pipelinen. Mappen är **gitignored** (utom denna README) och ligger inte på GitHub.

> **Diffarna här är en säkerhetskopia, inte leveransen.** Vinnaren **committas** på sin `kedja/<slug>-<x>`-branch i worktreet (`..\sajtmaskin-kedja-<slug>-a`) — ej push/PR utan begäran. Commit är livförsäkringen mot `kedja-clean` (brancher utan egna commits sopas bort). Filerna här finns för att förlorarnas worktrees rivs efter körningen — utan dem vore de kandidaterna borta, och ibland är en förlorares ansats bättre.

## Layout

```text
.cursor/kedja/
  README.md                       # committad — denna konvention
  YYYY-MM-DD_HHMM/
    kandidat-a.diff               # git diff per kandidat, sparad före teardown
    kandidat-b.diff
```

## Livscykel

1. `/kedja` skapar en worktree per kandidat och låter en agent fixa buggen i var och en.
2. Domarsteget kör testet, grannskapets tester och typecheck. Minsta gröna diff vinner.
3. **Före** teardown skrivs varje kandidats `git diff` hit.
4. Förlorarnas worktrees tas bort med `npm run worktree:remove -- <sökväg> --force`. Vinnarens står kvar med **committad** fix (orkestratorn efter steg 7).

Kan rensas när som helst — så snart vinnarens fix är mergad har diffarna inget värde.

**Taket är tre körningsmappar.** `npm run clean:scratch` (torrkörning) / `npm run clean:scratch:apply` behåller de tre nyaste `YYYY-MM-DD_HHMM/`-mapparna och tar bort resten oavsett ålder — se `COUNT_TREES` i `scripts/dev/clean-scratch.mjs`. Det rör bara diff-arkivet här; worktrees och brancher städas av `kedja:clean` nedan.

## Städa upp efteråt

`git worktree remove` tar bort katalogen men lämnar branchen kvar, så en avbruten eller ofullständig körning lämnar skräp. Sopa upp med:

```powershell
npm run kedja:clean                                                              # torrkörning, visar bara
node scripts/cursor/kedja-clean.mjs --yes --keep ..\sajtmaskin-kedja-x-a         # utför, rör inte vinnaren
```

**Anropa flaggorna via `node`, inte via `npm run -- …`.** npm äter både `--yes` (dess egen `-y`-alias) och `--keep` (okänd config) innan de når skriptet, så npm-vägen faller tillbaka på torrkörning utan att säga varför. Verifierat 2026-08-02. Fallet är åt rätt håll — inget raderas av misstag — men flaggorna får bara effekt via `node`.

Skriptet sparar varje worktrees diff hit **innan** den tas bort, och vägrar röra en worktree vars tillstånd det inte kunde läsa — en oläsbar worktree är oftast en som körs just nu. Branchar raderas bara när de heter `kedja/*` och saknar egna commits.

`--keep` tar **worktree-sökväg** och behövs främst för ocommittat arbete du vill skydda. En **committad** vinnare (`commits ahead of trunk`) behålls automatiskt även utan `--keep` — skriptet vägrar röra brancher/worktrees med egna commits. Ocommittade förlorare (inga commits ahead) sopas bort; deras diff sparas hit först.

## Relation till bugglistan

`BUG-SWARM-BACKLOG.md` (repo-rot) rörs **aldrig** av `/kedja`. Att bocka av en rad är en manuell åtgärd efter att fixen är mergad, precis som `/automat` aldrig skriver dit.

## Kör

- `/kedja <bugg eller backlog-rad>` — hela pipelinen på en bugg.
- Detaljer: [`.cursor/commands/kedja.md`](../commands/kedja.md) och [`.cursor/skills/kedja-fix-pipeline/SKILL.md`](../skills/kedja-fix-pipeline/SKILL.md).
