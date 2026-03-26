# PLAN 1 — Kritik (öppna K-rader)

**Kanonisk tabell:** [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md)  
**Konfliktzon (läs före större ändringar):** `registry.ts`, `detect-integrations.ts`, `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kopplat till env/409.

## Öppna rader (`[ ]`)

| ID | Kort beskrivning | Acceptans (för att stänga raden) |
|----|------------------|----------------------------------|
| **K-007** | Deploy auto-fix / hårdare valideringsfas före deploy — **produktbeslut** | Policy dokumenterad + implementation eller medvetet `[x]` med motivering i tabellen; `deploy-precheck.md` / Vitest i linje med beslut |
| **K-008** | Landningspolish / W1-rester (t.ex. mer in-view 3D) — **produktsignoff** | Produkt godkänner “landningspolish klar” eller rad omformuleras/nedprioriteras med datum i tabellen |
| **K-009** | Own-engine **utanför** avslutad W3-track (SSE, produkt) | Scope avgrensat, levererat eller `[x]` med motivering; inga motsägelser mot stream-kontrakt |
| **K-014** | Footer / juridik / cookies — copy + eventuella sidor | Copy/sidor kompletta enligt produkt; `[x]` i tabellen |

## Arbetssteg (för agent)

1. Läs master-tabellen + *Låst / hög konfliktrisk* i `kritik-consolidated-open-items.md`.
2. Ta **en K-id åt gången** om risk är hög; kör `npm run typecheck` && `npx vitest run` före push.
3. Uppdatera tabellen (`[ ]` → `[x]` + datum), ev. `external-review-remediation-progress.md` om segment-% ändras tydligt.
4. `git push origin master` enligt [`.cursor/rules/parallel-agent-collision-safety.mdc`](../../../../.cursor/rules/parallel-agent-collision-safety.mdc).
