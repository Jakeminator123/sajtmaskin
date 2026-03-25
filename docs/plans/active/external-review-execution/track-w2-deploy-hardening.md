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

- [ ] Kartlägg var **pre-deploy auto-fix** sker; dokumentera i kort kommentar eller `docs/architecture/`
- [ ] Minska eller gör auto-fix **opt-in** där det är säkert (inga regressions i builder-deploy)
- [ ] (Valfritt) **Hård valideringsfas** före deploy: separat steg som stoppar deploy vid failed readiness utan att tyst fixa
- [ ] API/deploy-svar: tydlig `deployReadiness`-payload till klient om ni utökar kontraktet (bakåtkompatibelt)

---

## Exit-kriterium

Relevanta `[ ]` bockade, tester gröna, produktägare/orchestrator OK med deploy-beteendeförändring.
