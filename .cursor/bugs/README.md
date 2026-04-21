# .cursor/bugs/

Lokal mirror av buggrapporter som filas via `/buggrapport`. **Gitignored** — ligger inte på GitHub.

## Syfte

- Du ska kunna grep:a, läsa och rensa lokalt utan att behöva öppna Linear för varje liten sak.
- Cursor-agenter kan läsa tidigare rapporter för att undvika dubletter och få kontext på återkommande problem (mappen är **inte** i `.cursorignore`).
- Linear förblir källan-till-sanning för status, tilldelning och kommentarer; den lokala filen är en frusen kopia av rapporten som den såg ut när den skapades.

## Filnamn-konvention

```
YYYY-MM-DD_HHMM_<LINEAR-ID>_<kort-slug>.md
```

Exempel: `2026-04-21_1530_SAJ-42_preview-kraschar-utan-manifest.md`

- Tidsstämpel = lokal tid, sortering blir kronologisk.
- `LINEAR-ID` = identifier ur `save_issue`-svaret (t.ex. `SAJ-42`). Om Linear-anropet av någon anledning misslyckats: använd `SAJ-PENDING` och fyll i id:t när det går igenom.
- `kort-slug` = 3–6 ord, kebab-case, utan å/ä/ö (translitterera: `å`→`a`, `ä`→`a`, `ö`→`o`).

## Innehållsmall

```markdown
---
linear_id: SAJ-42
linear_url: https://linear.app/sajtmaskin/issue/SAJ-42
created_at: 2026-04-21T15:30:00+02:00
labels: [Bug]
priority: 3
source: browser   # browser | manual | terminal | test
---

# <samma titel som Linear-issuen>

## Sammanfattning
...

## Repro
1. ...

## Förväntat / Faktiskt
...

## Bevis
- URL: ...
- Console: ...
- Network: ...
- Repo-ref: ...

## Misstänkt orsak / scope
...
```

## Rensning

Ingen automatisk retention. Rensa själv när buggar är fixade och du inte längre behöver lokal historik. Linear behåller den riktiga historiken oavsett.

Om mappen växer förbi ~100 filer: överväg att flytta gamla (status `Done` i Linear) till en `archive/`-undermapp eller bara radera dem.
