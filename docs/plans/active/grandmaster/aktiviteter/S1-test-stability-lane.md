---
id: gm-akt-S1
status: ready
parent: gm-omrade-02-stabilitetstester
blocked_by: []
owner_files:
  - package.json
  - docs/testing.md
  - docs/delivery-bias.md
risk: låg
---

# S1 — `test:stability`-lane (warn-only först)

## Mål
Skapa `npm run test:stability` som kör en **kuraterad, snabb** lane (tagg/glob) av
stabilitetstester. Tre körlägen: lokalt (kommando), PR och push. Port-light
delivery-bias-doc från Sajtbyggaren ("förmåga före dokumentation; breda
regressionssviter är inte standard").

## Inte scope
- LLM-evals (parkerade) eller breda regressionssviter.
- CI-**blockering** — börja warn-only; blockering kopplas in när lanen är stabil.
- Själva test-casen (S2/S3 äger dem); här bara lane + glob + docs.

## Owner-yta
`package.json` (script + glob/tagg), `docs/testing.md`, `docs/delivery-bias.md`.
Verifiera mot HEAD att `test:stability` inte redan finns innan du lägger till.

## Verifiering
- `npm run test:stability` kör grönt lokalt (även med 0 case initialt).
- `npm run typecheck` 0 fel.

## Risk
Låg. Ren additiv test-infrastruktur.
