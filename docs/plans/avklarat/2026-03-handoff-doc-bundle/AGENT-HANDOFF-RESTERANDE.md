# Handoff — allt som fortfarande är öppet (sammanfattning)

**Syfte:** En **kort** lista för en agent som ska köra «det sista» utan att läsa hela [`MASTER-ALLT-KVAR.md`](./MASTER-ALLT-KVAR.md) först.  
**Sanning med `[ ]` / `[x]`:** [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) (K-ID) och kryss i [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md) (Plan 17). Uppdatera alltid de filerna när något stängs.

**Senast sammanställd / städad:** 2026-03-26. **Färdig prompt till nästa agent:** [`NASTA-AGENT-PROMPT.md`](./NASTA-AGENT-PROMPT.md). **Beslut Fas A (K-007/009/018/019 + Plan 17 WS-4/5-rester):** [`BESLUT-INNAN-VI-GAR-VIDARE.md`](./BESLUT-INNAN-VI-GAR-VIDARE.md) **2026-03-26** — kritik-rader fortfarande **`[ ]`** tills implementation.

---

## 1. Bild: vad är «stort» kvar?

| Spår | Ungefär vad | Prioritet / notis |
|------|-------------|-------------------|
| **K-018** | Preview/sandbox/`iframe` = samma fidelity som `npm run dev` för **genererad** sajt; Fas 2–4, VM-återanvändning, adapters, tydlig shim↔runtime-UX | Produkt/kod, **hög** — driver builder-upplevelsen |
| **K-019** | Promptkedja: orchestration-kontext (delar levererade: snapshot-kolumn, follow-up prepend); **kvar:** merge-policy, ev. UI, ev. sync create | **Hög**; se [`queue/PLAN-K019-PROMPT-SNAPSHOT.md`](./queue/PLAN-K019-PROMPT-SNAPSHOT.md) |
| **K-007** | Deploy: policy för auto-fix / stramare validering före deploy (delmoment: strikta JSON-filer i version) | **Hög**; produktbeslut |
| **K-009** | Own-engine SSE / scope **utanför** stängd W3 — **inte** marknads-FAQ | **Hög**; spika scope eller stäng med motivering |
| **Plan 17** | WS-5 (stor fil / `research/`; **`docs/old` innehåll → `avklarat/2026-03-docs-old-archive/`**) + **deferred** WS-2 (v0 SDK/env) + WS-4 (gateway-env i schema / `ENV.md`) | Mest **städ + dokumentation**; v0 **medvetet separat** (F1) |

**Stängda i kritik (referens):** K-008, K-014, K-015–K-017, C-101–C-104 — behöver normalt **inga** nya åtgärder om inget regresserat.

---

## 2. Kritik — öppna K-rader (endast dessa kräver aktiv backlog)

| ID | Kort vad som återstår |
|----|------------------------|
| **K-007** | Deploy-readiness / validering — se `version-file-integrity.ts`, `deploy-precheck.md`, ev. produktbeslut |
| **K-009** | Own-engine utanför W3-track (SSE m.m.) — definiera scope eller dokumentera «wontfix» |
| **K-018** | Sandbox som primär preview, shim fallback, session/VM, integration adapters Fas 3, UI shim/runtime/build — se § 2 i MASTER + [`queue/PLAN-PREVIEW-SANDBOX.md`](./queue/PLAN-PREVIEW-SANDBOX.md) |
| **K-019** | Finare merge av orchestration snapshot, ev. UI; stäng när produkt accepterar beteendet — [`queue/PLAN-K019-PROMPT-SNAPSHOT.md`](./queue/PLAN-K019-PROMPT-SNAPSHOT.md) |

**Låst / hög konfliktrisk** om flera agenter rör samma sak: `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`, `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kring env/409.

---

## 3. Plan 17 — det som fortfarande har `[ ]` i planfilen

**WS-2 deferred (medvetet — ingen tvingad borttagning nu):**

- v0 SDK (`src/lib/v0.ts`), `V0_API_KEY` i required env — *ägarbeslut: v0 separat spår.*

**WS-4 deferred (låg prio — dokumentera sanning först):**

- Rensa `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` ur env-schema när health/admin inte behöver dem
- `ENV.md` + `config/env-policy.json` i synk med verkligheten

**WS-5 (städ / repo-hygien):**

- Stora JSON: `.gitignore` om nya > relevant storlek tillkommer; ev. git-lfs / build-time gen
- `research/` — policy (extern rådata, inte hårdkrav för `npm run dev`)
- `docs/old/` — **klar 2026-03-26:** material i [`docs/plans/avklarat/2026-03-docs-old-archive/`](../avklarat/2026-03-docs-old-archive/); rot = pekare

**WS-6:** klar (produktbeslut 2026-03-26).

**När Plan 17 kan arkiveras helt:** när WS-5 + deferred är **gjorda** eller **N/A med skriftlig motivering** i [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md) — sedan flytt till [`../avklarat/`](../avklarat/) enligt livscykel.

**Detalj:** [`queue/PLAN-REPO-SEPARATION-OPEN.md`](./queue/PLAN-REPO-SEPARATION-OPEN.md).

---

## 4. Andra körfilar (pekar bara — ingen dubbellista här)

| Fil | Innehåll |
|-----|----------|
| [`MASTER-ALLT-KVAR.md`](./MASTER-ALLT-KVAR.md) | Full berättelse, § 0 fidelity, faser, acceptansrader |
| [`REMAINING-WORK.md`](./REMAINING-WORK.md) | Hub efter remediation exit |
| [`queue/PLAN-PREVIEW-SANDBOX.md`](./queue/PLAN-PREVIEW-SANDBOX.md) | K-018-detalj |
| [`queue/PLAN-KRITIK-OPEN.md`](./queue/PLAN-KRITIK-OPEN.md) | K-007 / K-009 (om fylld) |
| [`queue/PLAN-DRIFT-VERIFICATION.md`](./queue/PLAN-DRIFT-VERIFICATION.md) | Smoke / verifieringsrutin |
| [`BESLUT-INNAN-VI-GAR-VIDARE.md`](./BESLUT-INNAN-VI-GAR-VIDARE.md) | Öppna produkt-/arkitekturfrågor |
| [`INPUT_GPT.txt`](../../../INPUT_GPT.txt) | Pseudokod, env-merge, faser (§ 7–14) |

---

## 5. Rekommenderad ordning för «sista svepet» (förslag)

1. **Läs** [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) + denna fil.  
2. **Välj ett spår:** antingen **K-018** (störst användarimpact) eller **Plan 17 WS-5** (låg risk, mest städ) — undvik samma PR som tung preview-refaktor om ni vill minska konflikter.  
3. **Efter batch:** `npm run typecheck` && `npx vitest run`; uppdatera kritik-tabellen och ev. [`external-review-remediation-progress.md`](./external-review-remediation-progress.md).

Orchestrator (`/orchestrator`) är valfritt — använd när arbetet är många delmoment med logg mellan steg; för en fokuserad PR räcker ofta en agent + denna handoff.

---

## 6. Underhåll av denna fil

När en K-rad stängs eller Plan 17-kryss bockas: uppdatera **källfilerna** först, sedan **§ 1–3** här så nästa agent inte får intrycket att något fortfarande är öppet. Vid större omstrukturering kan denna fil ersättas av en ny sammanfattning med nytt datum i § 0.

**Ändringshistorik (ungefär, plan/doc-tema):** [`DOKUMENTATION-ANDRINGAR-SAMMANFATTNING.md`](./DOKUMENTATION-ANDRINGAR-SAMMANFATTNING.md)

