---
id: gm-akt-C1
status: ready
parent: gm-omrade-01-kontrakt-och-regler
blocked_by: []
owner_files:
  - docs/schemas/README.md
  - docs/schemas/strict/plan-file.schema.json
risk: låg
---

# C1 — markera `plan-file.schema.json` deprecated (rör ej fysiskt)

## Mål
Markera `docs/schemas/strict/plan-file.schema.json` som **deprecated** — planering är en
regel (`plan-lifecycle.mdc`), inte ett schema. Fysisk radering sker i **område 8**.

## Konkret
- Lägg deprecation-notis i `docs/schemas/README.md` (rad: "plan-file.schema.json är
  pensionerat — se `plan-lifecycle.mdc`; raderas i grandmaster-område 8").
- Lägg `"$comment": "DEPRECATED ..."` överst i schemat (ändra inte struktur).

## Inte scope
- Radera filen (område 8).
- Röra övriga scheman (dossier/variant/prompt-format hör till kontraktslagret, behålls).

## Verifiering
- Grep: inga konsumenter bryts av notisen.
- `plan-lifecycle.mdc` är den hänvisade källan.

## Risk
Låg. Notis + kommentar, ingen strukturändring.
