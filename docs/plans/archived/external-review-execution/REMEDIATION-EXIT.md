# External review — remediation exit

**Datum (orchestrator):** 2026-03-28  
**Syfte:** Fryser **execution-spåret** för extern granskning (`1.txt` / `2.txt` / `3.txt` + W1–W5) som **levererat i kod och kontraktstester**. Det som återstår efter denna punkt är **produkt-, copy- och driftsbacklog** (K-raderna), inte “ofärdig remediation” i samma mening.

## Vad som räknas som klart (remediation)

- **W1 (landning):** track `track-w1-landing-followups.md` — kryssade tekniska punkter (in-view 3D-mönster, reduced motion, sidor `/om` / `/blogg`, m.m.). **K-008** i [`kritik-consolidated-open-items.md`](../../active/kritik-consolidated-open-items.md) förblir `[ ]` tills produkt uttryckligen godkänner “landningspolish klar”.
- **W2 (deploy / integrationer i appen):** manifest, deployReadiness, 409 UX, Vitest för `deployments`-routen och `deploy-precheck.md`. **K-007** förblir `[ ]` för valfri **hårdare valideringsfas** / auto-fix-policy — produktbeslut.
- **W3 (own-engine enligt track):** avslutat enligt `track-w3-own-engine.md`. **K-009** förblir `[ ]` för scope **utanför** den tracken (SSE/produkt).
- **W4 (scripts / `3.txt`):** avslutat; buglista del 3 komplett.
- **W5 (kritik-hygien):** konsoliderad masterlista + arkivmönster.

## Procentsiffror efter exit

- Tabellen **Overall fill** i [`external-review-remediation-progress.md`](../../active/external-review-remediation-progress.md) använder **100%** för **whole vision** i betydelsen *remediation execution complete*. **Segment-rader** (landning ~96%, integrationer ~83%, own-engine ~81%) beskriver fortfarande **kvarvarande produkt/scope**, inte att teknikspår skulle vara trasiga.
- Öppna **K-007 / K-008 / K-009 / K-014** ska inte stängas här utan separat produkt-/copy-beslut.

## Valfri HTTP-smoke (deploy API)

- **Playwright:** `npm run test:deploy-smoke:e2e` med config `playwright.deploy-smoke.config.ts`.
- **Spec:** `e2e/deploy/deploy-api-precheck.smoke.spec.ts` — anropar `POST /api/v0/deployments` med `precheckOnly: true`.
- **Utan env:** alla tester **skippas** (grön körning, inga hemligheter i CI).
- **Env:** se kommentaren överst i spec-filen (`SAJTMASKIN_E2E_BASE_URL`, `SAJTMASKIN_E2E_SESSION_COOKIE`, `SAJTMASKIN_E2E_DEPLOY_CHAT_ID`, `SAJTMASKIN_E2E_DEPLOY_VERSION_ID`).

## Nästa steg (utanför remediation-exit)

**Översikt:** [`REMAINING-WORK.md`](../../active/REMAINING-WORK.md) (samlar pekare utan att duplicera K-tabellen).

1. Produkt: stäng eller omformulera K-rader i `kritik-consolidated-open-items.md`.
2. Drift: kör deploy-smoke mot staging när session + fixtures finns.
3. Vid ny extern granskning av `1.txt`–`3.txt`: uppdatera progress + ev. nya track-filer — denna exit är inte ett löfte om att inga nya krav kan tillkomma.
