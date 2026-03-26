# PLAN 1 — Kritik (öppna K-rader)

**Allt kvar:** [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) § 3.

**Kanonisk tabell:** [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md)  
**K-018 (preview/sandbox/integrationer i *genererad* sajt):** implementationsplan + UI-princip → [`PLAN-PREVIEW-SANDBOX.md`](./PLAN-PREVIEW-SANDBOX.md) + [`INPUT_GPT.txt`](../../../../INPUT_GPT.txt).  
**K-019 (standard-UX + promptkedja):** [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) § 0–3 + [`.j_to_agent/fidelity.txt`](../../../../.j_to_agent/fidelity.txt).  
**Konfliktzon (läs före större ändringar):** `registry.ts`, `detect-integrations.ts`, `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kopplat till env/409.

## Stängda rader (referens)

| ID | Status |
|----|--------|
| **K-007** | **[x] 2026-03-26** — auto-fix **oförändrad standard**; [`deploy-precheck.md`](../../architecture/deploy-precheck.md) + Vitest + deploy-route; se [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md). |
| **K-009** | **`[x]` / [N/A] 2026-03-26** — ingen planerad extra SSE utanför W3; [`own-engine-sse-scope.md`](../../architecture/own-engine-sse-scope.md); nytt behov → ny K/plan. |
| **K-014** | **[x] 2026-03-26** — produkt: sidor/copy kring cookies, om oss, juridik **OK oförändrat** (se [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md)). |
| **K-008** | **[x] 2026-03-25** — ingen utökning av landningsmaterial tills vidare; fokus **K-018** (användarsidor / `iframe`). |

## Öppna rader (`[ ]`)

| ID | Kort beskrivning | Acceptans (för att stänga raden) |
|----|------------------|----------------------------------|
| **K-018** | **Användarnas** genererade sidor: **React**-preview i **samma klass som `npm run dev`**, inkl. **fidelity i `iframe`** | Rimliga acceptanstester / visuell parity dokumenterad; `[x]` med datum eller uppdelade delmoment i tabellen |
| **K-019** | **Standard-UX + promptkedja:** diagnostik sekundär som default; kanonisk promptkontext över stream-steg (ingen tappad/dubblerad kontext mellan närliggande pass) | Beteende verifierat i builder; `[x]` med datum i master-tabellen |

## Arbetssteg (för agent)

1. Läs master-tabellen + *Låst / hög konfliktrisk* i `kritik-consolidated-open-items.md`.
2. Ta **en K-id åt gången** om risk är hög; kör `npm run typecheck` && `npx vitest run` före push.
3. Uppdatera tabellen (`[ ]` → `[x]` + datum), ev. `external-review-remediation-progress.md` om segment-% ändras tydligt.
4. `git push origin master` enligt [`.cursor/rules/agent-intent-board.mdc`](../../../../.cursor/rules/agent-intent-board.mdc) § *Push*.
