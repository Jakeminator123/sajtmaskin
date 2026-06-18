---
id: gm-akt-S1
status: ready
parent: gm-omrade-02-stabilitetstester
blocked_by: []
owner_files:
  - package.json
  - docs/testing.md
  - docs/delivery-bias.md
  - .github/workflows/ci.yml (CI-lane-wiring; S4/C2 samordnar sina steg här)
risk: låg
---

# S1 — `test:stability`-lane (warn-only först)

## Mål
Skapa `npm run test:stability` som kör en **kuraterad, snabb** lane (tagg/glob) av
stabilitetstester. Tre körlägen: lokalt (kommando), PR och push. Port-light
delivery-bias-doc från Sajtbyggaren ("förmåga före dokumentation; breda
regressionssviter är inte standard").

Inkludera direkt den deterministiska, nyckelfria `db:schema-drift` (se [`S4`](S4-db-health-gate.md))
som första riktiga gate i lanen — den finns redan men körs bara soft i predev.

## Inte scope
- LLM-evals (parkerade) eller breda regressionssviter.
- CI-**blockering** — börja warn-only; blockering kopplas in när lanen är stabil.
- Själva test-casen (S2/S3 äger dem); här bara lane + glob + docs.

## Owner-yta
`package.json` (script + glob/tagg), `docs/testing.md`, `docs/delivery-bias.md` samt
`.github/workflows/ci.yml` — **S1 äger CI-lane-wiringen**. `S4` (db:schema-drift-gate) och
`C2` (term-check) lägger sina CI-steg **via** S1, så ingen annan aktivitet äger samma
workflow-fil. Verifiera mot HEAD att `test:stability` inte redan finns innan du lägger till.

## Verifiering
- `npm run test:stability` kör grönt lokalt (även med 0 case initialt).
- `npm run typecheck` 0 fel.

## Risk
Låg. Ren additiv test-infrastruktur.
