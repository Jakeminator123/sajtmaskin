# Execution plan — avslutade sektioner K-007 & K-009

**Arkiverad:** 2026-03-26 (ursprungligen §A–B i `active/SAJTMASKIN-EXECUTION-PLAN.md`).  
**Sanning nu:** öppna K-rader i [`../active/kritik-consolidated-open-items.md`](../active/kritik-consolidated-open-items.md); operativ plan [`../active/SAJTMASKIN-EXECUTION-PLAN.md`](../active/SAJTMASKIN-EXECUTION-PLAN.md).

---

## A. K-007 — Deploy (auto-fix / validering före deploy)

| # | Brist | Typ | Status |
|---|--------|-----|--------|
| K7-1 | Produktbeslut: ska auto-fix i deploy-preflight **förbli** som idag, bli stramare, eller tydligare opt-in? | produkt | [x] 2026-03-26 — **oförändrad** (standard på; befintlig opt-out) |
| K7-2 | När beslut finns: synka [`deploy-precheck.md`](../../architecture/deploy-precheck.md), deploy-API och ev. Vitest med beslutet | kod | [x] 2026-03-26 — JSDoc på `shouldSkipPreDeployAutoFix`, Vitest default auto-fix, doc § *Produktbeslut K-007* |
| K7-3 | **Delmoment klart:** `GET` readiness blockerar om `package.json` / `components.json` / `jsconfig.json` i versionen är **ogiltig strikt JSON** — [`src/lib/deploy/version-file-integrity.ts`](../../../src/lib/deploy/version-file-integrity.ts) | kod | [x] |

---

## B. K-009 — Own-engine SSE **utanför** avslutad W3-track

| # | Brist | Typ | Status |
|---|--------|-----|--------|
| K9-1 | Otydlig gräns: vad som räknas som «W3-klart» vs vidare SSE-/stream-arbete på **andra ytor** än W3-kontraktet | doc/ark | [x] 2026-03-26 — tabell + process i [`own-engine-sse-scope.md`](../../architecture/own-engine-sse-scope.md) |
| K9-2 | Eventuell **implementation** utanför W3 (om scope säger ja) — får **inte** blandas ihop med marknads-FAQ på sajten | kod | **[N/A]** 2026-03-26 — inget leveranskrav; ny SSE → ny spårning |
| K9-3 | Stäng K-009 med `[x]` eller `[N/A]` i kritik-tabellen när scope + ev. kod är i linje med beslut | doc | [x] 2026-03-26 — kritik-rad + scope-doc uppdaterad |
