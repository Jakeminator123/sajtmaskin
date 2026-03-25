# Parallell granskning — commit `bfd7cc8e` (~80% whole)

**Commit:** `bfd7cc8e` — `chore: remediation ~80pct — Cursor-dashboard, eval-output, deploy skipAutoFix`

## Leverans (enligt commit)

- **config-dashboard:** vy Cursor-agenter, `NAV_PAGES`-fix, domain-map + käll-doc.
- **run-eval:** utdata till `eval-output/`; `.gitignore` behåller legacy `EGEN_MOTOR_V2/`.
- **POST /api/v0/deployments:** auto-fix opt-out via `skipAutoFix` eller `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX`.
- **Vitest:** timeout på `env-var-cipher` `it.each`; `deploy-precheck` + W2-track + progress ~80%.

## Verifiering

*Ej körd i denna fil — kör `npm run typecheck && npx vitest run` vid behov.*

## Handoff

Nästa commit i kedjan: `743565d9` (docs hub).

---

*En fil per commit — kedja mot ~100% whole vision.*
