# Track W2 — Deploy hardening (valfritt)

**Källa:** `1.txt` steg 6–7 (deploy), befintlig `deployReadiness` + pre-deploy-flöde  
**Parallellt med:** W4 om deploy-kod inte överlappar; annars sekventiellt efter W3/W4 eller enskilt.

---

## Uppdrag för worker-agent

1. Implementera endast punkter du fått; bocka `- [x]` här när klart.
2. `npm run typecheck && npx vitest run`.
3. Uppdatera `external-review-remediation-progress.md` (rad om W2 “Kvar: auto-fix / gate”).
4. Notera i `MASTER-ROADMAP.md` → *Orchestrator / verifiering*.

---

## Checklista

- [x] Kartlägg var **pre-deploy auto-fix** sker; dokumentera i kort kommentar eller `docs/architecture/` → [`docs/architecture/deploy-precheck.md`](../../architecture/deploy-precheck.md)
- [ ] Minska eller gör auto-fix **opt-in** där det är säkert (inga regressions i builder-deploy) — *lämnad öppen; auto-fixar förblir default tills separat produktbeslut*
- [x] **Hård valideringsfas** före deploy: **409 `DEPLOY_MISSING_ENV`** på `POST /api/v0/deployments` om projektet saknar krävda nycklar (efter samma preflight som tidigare), innan deployment-rad / Vercel
- [x] API/deploy-svar: **`precheckOnly: true`** i body → **200** med `deployReadiness`, `fixesApplied`, `preDeployWarnings`, `fileCount` (ingen debitering); befintlig success-payload behåller `deployReadiness` + fix-listor

---

## Exit-kriterium

Relevanta `[ ]` bockade, tester gröna, produktägare/orchestrator OK med deploy-beteendeförändring.
