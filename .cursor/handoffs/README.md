# .cursor/handoffs/

Lokal mirror av agent-handoffs (task-prompts redo att klistras in i en Cursor Background Agent eller skickas till en annan dev). **Gitignored** — ligger inte på GitHub.

## Syfte

- Frusna kopior av tighta task-prompts som producerats inom en Cursor-session och som ska tas vidare av:
  - en Cursor Background Agent (isolerad cloud-VM med egen branch)
  - en annan dev (manuellt arbete)
  - en framtida session (du själv om en vecka)
- Linear förblir källan-till-sanning för status och kommentartrådar; den lokala filen är en frusen snapshot av handoffen som den såg ut när den skapades.
- Cursor-agenter kan grep:a tidigare handoffs för att förstå pågående/öppna task-överlämningar utan att öppna Linear för varje fråga.

## Filnamn-konvention

```
YYYY-MM-DD_HHMM_<LINEAR-ID>_<kort-slug>.md
```

Exempel: `2026-04-21_1100_SAJ-25_finalize-versionid-pruning.md`

- Tidsstämpel = lokal tid (Stockholm). Hämta via `Get-Date -Format "yyyy-MM-dd_HHmm"`.
- `LINEAR-ID` = identifier på den Linear-issue handoffen adresserar. Om ingen Linear-issue finns: använd `NO-LINEAR` och förklara varför i frontmattern.
- `kort-slug` = 3–6 ord, kebab-case, transliterera å→a, ä→a, ö→o.

## Innehållsmall

```markdown
---
linear_id: SAJ-25
linear_url: https://linear.app/sajtmaskin/issue/SAJ-25
created_at: 2026-04-21T11:00:00+02:00
suggested_runner: cursor-background-agent   # cursor-background-agent | manual | task-subagent
estimated_effort: 30–60 min
parent_plan: docs/plans/active/<plan>.md
---

# Handoff: <kort beskrivning>

## Mål

<1–2 meningar om vad som ska levereras>

## Kontext (read first)

- <fil:rad-referenser>
- <commit-hash som introducerade situationen>
- <Linear-länkar till relaterade issues>

## Steg

1. ...
2. ...

## Acceptans

| # | Kontroll | Förväntat |
|---|---|---|

## Risk + skydd

<feature-flag-strategi, rollback-plan, mätning>

## Vad som INTE ska göras

- ...
```

## Skillnaden mot `docs/plans/active/`

- **`docs/plans/active/<plan>.md`**: tracked i git, beskriver ARBETSSPÅRET ("vad ska byggas"). Ofta flerstegs, levereras över tid.
- **`.cursor/handoffs/<id>.md`**: lokal kopia av en TASK-PROMPT redo att exekveras av en specifik runner. En handoff implementerar oftast EN steg från en plan.

Handoffen ska kunna klistras direkt i Cursor Background Agent → "New Task" utan ytterligare redigering.

## Rensning

Ingen automatisk retention. Radera när handoffen är levererad och Linear-issuen är `Done`. Om du vill behålla historik: pusha handoffen som kommentar på Linear-issuen innan radering (Linear bevarar historiken oavsett).
