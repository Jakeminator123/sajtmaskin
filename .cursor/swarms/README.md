# .cursor/swarms/

Lokal **rapportfabrik** för `/automat` — sekventiella read-only audit-svärmar (8 billiga Composer-agenter per runda) som letar buggar, död kod, namnöverlappningar, förbättringar, optimeringar, testluckor och drift. Mappen är **gitignored** (utom denna README) och ligger inte på GitHub.

> **Audit mode, aldrig fix mode.** Svärmen ändrar **aldrig** kod. Den producerar bara fynd. När du själv hinner plockar du ut värdefulla fynd härifrån och driver dem vidare (t.ex. `/818` för beslut eller `/buggrapport` för att lyfta en bekräftad defekt till den kanoniska `BUG-SWARM-BACKLOG.md`).

## Varför gitignored (inte indexerad, men läsbar)

`.gitignore` respekteras av Cursors index, så innehållet hamnar **inte** i semantisk sökning och stör inte andra agenter. Men filerna är fortfarande **läs/skrivbara via explicit sökväg** — så `/automat`-orchestratorn kan föra in fynd, medan vanliga agenter inte råkar dra in dem. (Vi använder medvetet **inte** `.cursorignore`, eftersom det skulle blockera även orchestratorns Read/Write.) Detta är inte en hård sandbox — en agent som uttryckligen får sökvägen kan läsa filerna.

## Layout

```text
.cursor/swarms/
  README.md                       # committad — denna konvention
  FINDINGS.md                     # gitignored — den ROLLANDE kuraterade fynd-listan (plocka härifrån)
  runs/
    YYYY-MM-DD_HHMM/
      index.md                    # rund-sammanfattning (rundor, lanes, agentantal, topp-plock)
      r<runda>-<lane>.md          # rå per-agent-rapport (en per agent)
```

- **`FINDINGS.md`** = den enda lista du behöver titta i. Orchestratorn destillerar varje runda hit och behåller bara de mest värdefulla fynden (dedupar mot fil:rad-ankare). Källa-tag: `A#<n>` (automat).
- **`runs/`** = rå hög-volym-output. Behåll för spårbarhet; kan rensas när som helst.

## Relation till den kanoniska bugglistan

`BUG-SWARM-BACKLOG.md` (repo-rot) är fortfarande **enda** spårade bugglistan. `FINDINGS.md` är medvetet **separat och lokal** — ett triage-förråd, inte en konkurrerande sanning. Inget flyttas automatiskt till backloggen; du gör det manuellt via `/buggrapport` när ett fynd är bekräftat.

## Kör

- `/automat` → 3 svärmningar (rundor), 8 agenter per runda.
- `/automat 7` → 7 svärmningar sekventiellt, 8 agenter per runda.
- Detaljer: [`.cursor/commands/automat.md`](../commands/automat.md) och [`.cursor/skills/automat-swarm/SKILL.md`](../skills/automat-swarm/SKILL.md).
