# PLAN 3 — Drift, e2e, dokumentationssynk

**Inte** ny feature-backlog — **verifiering** och **hygien** så repot stämmer med verkligheten efter remediation exit.

## A. Valfri HTTP-smoke (deploy API)

- Spec: `e2e/deploy/deploy-api-precheck.smoke.spec.ts`
- Kör: `npm run test:deploy-smoke:e2e` (kräver `SAJTMASKIN_E2E_*` — se [`e2e/README.md`](../../../../e2e/README.md) § *Deploy API*)
- **Acceptans:** Körning dokumenterad (datum + miljö) i orchestrator-logg eller progress *Last code touch* om ni tar in det i rutinen; inget krav att CI alltid har secrets.

## B. Segment-% och progress-fil

- [`external-review-remediation-progress.md`](../external-review-remediation-progress.md) § *Overall fill* — **indikatorer**, inte “ofärdigt W-spår”.
- **Acceptans:** När K-rader/plan 17 stängs: uppdatera tabell/rader så de inte låser utdaterade förväntningar; *Last code touch* i sync (jmf. stängda C-rader i kritik-tabellen).

## C. Produkt-follow-ups (kort)

- Ev. `/blogg`-placeholder, social-copy utan URL:er — nämns under progress § *Uncertainties*; samlas i produktbacklog eller stängs med issue/commit-notis.

## D. Efter varje batch

- `npm run typecheck` && `npx vitest run`
- Uppdatera [`REMAINING-WORK.md`](../REMAINING-WORK.md) “Senast synkad” vid behov
- [`docs/plans/README.md`](../../README.md) *Last tightened* vid större hub-ändring
