# /automat — sekventiella audit-svärmar

Kör **flera** read-only svärmningar i rad. Rundorna **växlar**: udda rundor breddar (8 billiga agenter i roterande delar av repot), jämna rundor **rensar** (en resonerande agent per overifierat fynd, med enda uppdrag att motbevisa det). Fynden landar i en **separat, gitignored** lista som du själv plockar ur när du hinner.

**Audit mode, aldrig fix mode.** Ingen kod ändras, inga git-åtgärder. Fynd som ska bli kod-ändring drivs separat (`/818` för beslut, `/buggrapport` för bekräftad defekt).

## Argument

| Kommando | Rundor | Agenter/scan-runda |
|---|---|---|
| `/automat` | 3 (scan → falsifiera → scan) | 8 |
| `/automat 7` | 7 | 8 |
| `/automat 5 agenter=12` | 5 | 12 |

- **Alltid 8 agenter per scan-runda** om inget annat anges. Falsifieringsrundan har en agent per overifierat fynd, max 8.
- **Rundor körs sekventiellt**; agenterna inom en runda körs parallellt (ett `Task`-anrop per agent, alla i samma assistant-turn).
- **Lanes roterar** automatiskt om du inte namnger områden i meddelandet (t.ex. "/automat 4 fokus backend + env").
- Finns inga overifierade fynd när en falsifieringsrunda står på tur: kör en scan-runda i stället.

## Flöde — scan-runda (udda)

1. Välj nästa 8 lanes från rotationen (se skill-tabellen). Slå upp exakta sökvägar via [`repo-router.mdc`](../rules/repo-router.mdc).
2. Lansera 8 parallella `Task`-agenter: `subagent_type: explore`, `readonly: true`, `model: cursor-grok-4.5-high-fast`. En lane var, hårt tak på **6 tabellrader** och ingen avslutande prosa.
3. Skriv varje rå rapport till `.cursor/swarms/runs/<tidsstämpel>/r<runda>-<lane>.md`.
4. Lansera **en** destill-agent (`cursor-grok-4.5-high-fast`, readonly) mot rundans rapporter + `FINDINGS.md`; den returnerar max 5 nya, icke-dubbletta rader. Skriv in dem med `A#<n>`-id. Gör inte hopslagningen själv — poängen är att äldre rundor aldrig behöver in i din egen kontext igen.
5. Skriv en rad per lane i rundans `index.md` (topp-plock + konfidens).

## Flöde — falsifieringsrunda (jämna)

1. Ta de overifierade `A#`-fynden med högst impact, max 8. En agent per fynd.
2. Lansera parallella `Task`-agenter: `readonly: true`, `model: cursor-grok-4.5-high-fast`. Uppdrag: **motbevisa** fyndet (guard som redan finns, anropsväg som aldrig nås, fel ankare).
3. `falsk` → radera raden ur `FINDINGS.md`. `bekräftad` → lägg `✔` efter id:t. `oklar` → lämna, och falsifiera aldrig om samma fynd.
4. Skriv en rad per fynd i rundans `index.md` (id, verdikt, motivering) — för raderade rader är det enda spåret.

Efter sista rundan: kort summering till användaren (rundor per typ, lanes, antal nya `A#`-fynd per prio, antal bortfalsifierade, pekare till `FINDINGS.md`).

Modellval kommer från [`.cursor/README.md § Modellval för subagenter`](../README.md#modellval-för-subagenter-kanonisk-tabell) — hitta inte på slugar.

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
- Slå ihop rundan mot `FINDINGS.md` själv i stället för via destill-agenten.
- Två scan-rundor i rad medan overifierade fynd växer.

## Projekt-skill

Full mall, lane-tabell och subagent-prompt: [`.cursor/skills/automat-swarm/SKILL.md`](../skills/automat-swarm/SKILL.md).
