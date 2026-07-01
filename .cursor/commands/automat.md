# /automat — sekventiella audit-svärmar

Kör **flera** read-only svärmningar i rad. Varje runda = **8** billiga Composer-agenter som letar buggar, död kod, namnöverlappningar, förbättringar, optimeringar, testluckor och drift i **roterande** delar av repot. Du (orchestratorn) samlar in deras korta rapporter och för in de **mest värdefulla** fynden i en **separat, gitignored** lista som du själv plockar ur när du hinner.

**Audit mode, aldrig fix mode.** Ingen kod ändras, inga git-åtgärder. Fynd som ska bli kod-ändring drivs separat (`/818` för beslut, `/buggrapport` för bekräftad defekt).

## Argument

| Kommando | Rundor | Agenter/runda |
|---|---|---|
| `/automat` | 3 | 8 |
| `/automat 7` | 7 | 8 |
| `/automat 5 agenter=12` | 5 | 12 |

- **Alltid 8 agenter per runda** om inget annat anges.
- **Rundor körs sekventiellt**; agenterna inom en runda körs parallellt (ett `Task`-anrop per agent, alla i samma assistant-turn).
- **Lanes roterar** automatiskt om du inte namnger områden i meddelandet (t.ex. "/automat 4 fokus backend + env").

## Flöde (per runda)

1. Välj nästa 8 lanes från rotationen (se skill-tabellen). Slå upp exakta sökvägar via [`repo-router.mdc`](../rules/repo-router.mdc).
2. Lansera 8 parallella `Task`-agenter: `subagent_type: explore`, `readonly: true`, `model: composer-2.5-fast`. En lane var, strikt kort output (tabell + en "Nästa:"-rad).
3. Skriv varje rå rapport till `.cursor/swarms/runs/<tidsstämpel>/r<runda>-<lane>.md`.
4. Destillera de värdefullaste fynden till `.cursor/swarms/FINDINGS.md` (dedupa mot fil:rad-ankare, sätt `A#<n>`-id).
5. Nästa runda.

Efter sista rundan: kort summering till användaren (rundor, lanes, antal nya `A#`-fynd per prio, pekare till `FINDINGS.md`).

## Var saker hamnar

| Plats | Innehåll |
|---|---|
| `.cursor/swarms/FINDINGS.md` | kuraterad rollande fynd-lista (plocka härifrån) |
| `.cursor/swarms/runs/<ts>/` | rå per-agent-rapporter + `index.md` |
| `BUG-SWARM-BACKLOG.md` | **rörs aldrig automatiskt** — endast manuellt via `/buggrapport` |

## Anti-mönster

- Köra en runda utan parallella `Task`-anrop.
- Samma lane till flera agenter (dubblerar fynd).
- Skrivrätt på audit-agenter eller någon kod/git-ändring.
- Skriva fynd någon annanstans än `.cursor/swarms/`, eller auto-skriva till `BUG-SWARM-BACKLOG.md`.

## Projekt-skill

Full mall, lane-tabell och subagent-prompt: [`.cursor/skills/automat-swarm/SKILL.md`](../skills/automat-swarm/SKILL.md).
