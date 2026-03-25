# Track W2 — Deploy hardening (valfritt)

**Källa:** `1.txt` steg 6–7 (deploy), befintlig `deployReadiness` + pre-deploy-flöde  
**Parallellt med:** W4 om deploy-kod inte överlappar; annars sekventiellt efter W3/W4 eller enskilt.

---

## Uppdrag för worker-agent

1. Implementera endast punkter du fått; bocka `- [x]` här när klart.
2. `npm run typecheck && npx vitest run`.
3. Uppdatera `external-review-remediation-progress.md` om W2- eller deploy-UX ändras märkbart.
4. Notera i `MASTER-ROADMAP.md` → *Orchestrator / verifiering*.

---

## Checklista

- [x] Kartlägg var **pre-deploy auto-fix** sker; dokumentera i kort kommentar eller `docs/architecture/` → [`docs/architecture/deploy-precheck.md`](../../architecture/deploy-precheck.md)
- [x] **Opt-out för auto-fix:** miljö `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX=1` / `DEPLOY_DISABLE_AUTO_FIX=1` eller body `skipAutoFix: true` — default förblir att fixar körs; dokumenterat i [`deploy-precheck.md`](../../architecture/deploy-precheck.md)
- [x] **Hård valideringsfas** före deploy: **409 `DEPLOY_MISSING_ENV`** på `POST /api/v0/deployments` om projektet saknar krävda nycklar (efter samma preflight som tidigare), innan deployment-rad / Vercel
- [x] API/deploy-svar: **`precheckOnly: true`** i body → **200** med `deployReadiness`, `fixesApplied`, `preDeployWarnings`, `fileCount` (ingen debitering); befintlig success-payload behåller `deployReadiness` + fix-listor
- [x] **Builder:** vid **409** + `DEPLOY_MISSING_ENV` — toast/error-text inkluderar **saknade nycklar** + pekare på miljövariabler / **Lanseringskortet**; `error-log` får `meta.missingEnv`

---

## Exit-kriterium

Relevanta `[ ]` bockade, tester gröna, produktägare/orchestrator OK med deploy-beteendeförändring.
