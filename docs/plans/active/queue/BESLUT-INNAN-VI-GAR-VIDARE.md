# Beslut innan vi går vidare

**Syfte:** Produkt- och arkitekturfrågor som bör vara **besvarade** (eller medvetet **nedprioriterade med motivering**) innan nästa större kodfas eller orchestrator-körning planeras som «klar».

**Relaterat:** [`COMPLETION-ROADMAP.md`](./COMPLETION-ROADMAP.md) (Fas A) · [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) · [`FRAGOR-SVAR-FAQ.md`](./FRAGOR-SVAR-FAQ.md)

---

## 1. K-007 — Deploy före publicering (auto-fix / validering)

- Ska **auto-fix** eller **strammare validering** före deploy vara **strammare**, **oförändrat**, eller **tydligare opt-in/opt-out** för användaren?
- Vad räknas som **acceptans** när en deploy **blockeras** (meddelande, återförsök, manuell override)?

**Beslut / motivering (fyll i):**

- …

---

## 2. K-009 — Own-engine SSE utanför avslutad W3-track

- Vilken **produkt-scope** gäller för **SSE / own-engine** *utanför* det som redan levererats i W3-spåret?
- Vad är **«klart»** för K-009 i tabellen (FAQ på Sajtmaskin-sajten är **sekundärt** per tidigare beslut)?

**Beslut / motivering (fyll i):**

- …

---

## 3. K-018 — Preview och `iframe`-paritet

- Hur **mäter** vi **preview/`iframe`-paritet** mot **`npm run dev`** i genererad sajt (manuell checklist, automatiserad snapshot, intern demo)?
- **Prioritering** mellan: **VM/session-återanvändning**, **Fas 3 adapters** i genererad kod, **produkt** (shim ↔ sandbox-ordning, felmeddelanden) — vad levereras **först**?

**Beslut / motivering (fyll i):**

- …

---

## 4. K-019 — Orchestration snapshot / promptkedja

- Var ska **kanonisk förberedd kontext** (snapshot) **leva** (minne, DB, blob per chat, annat)?
- När ska en snapshot **ersätta** respektive **mergas** med inkommande follow-up?
- Vilka **sekretess-/storleksgränser** gäller (trimning, redaktion av secrets)?

**Beslut / motivering (fyll i):**

- …

Implementationsspår: [`PLAN-K019-PROMPT-SNAPSHOT.md`](./PLAN-K019-PROMPT-SNAPSHOT.md).

---

## 5. Plan 17 — WS-4 (ENV/policy) och WS-5 (städ)

- **WS-6:** **Klart 2026-03-26** — arkiverad snapshot: [`avklarat/2026-03-plan17-ws6-product-decisions.md`](../../avklarat/2026-03-plan17-ws6-product-decisions.md); kanon i `17-repo-separation-and-independence.md` § WS-6.
- **WS-4:** När ska `ENV.md` / `config/env-policy.json` (eller motsvarande) **bindas hårdare** till kod — nu, eller efter K-018/K-019?
- **WS-5:** Vilken **ordning** för `.gitignore`-scan, `research/`, `docs/old/`-städ — och vem **äger** inventeringen?

**Beslut / motivering (fyll i):**

- …

---

## Checklista

| ID | Beslut taget? | Datum | Uppdatera |
|----|----------------|-------|-----------|
| K-007 | [ ] | | `kritik-consolidated-open-items.md`, `COMPLETION-ROADMAP` |
| K-009 | [ ] | | samma |
| K-018 | [ ] | | samma + `PLAN-PREVIEW-SANDBOX` vid behov |
| K-019 | [ ] | | samma + `PLAN-K019-PROMPT-SNAPSHOT` |
| Plan 17 WS-6 | [x] | 2026-03-26 | `17-repo-separation-and-independence.md`, [`avklarat/2026-03-plan17-ws6-product-decisions.md`](../../avklarat/2026-03-plan17-ws6-product-decisions.md) |
| Plan 17 WS-4/5 | [ ] | | `17-repo-separation-and-independence.md` |

När en rad är **nedprioriterad** i stället för besvarad: skriv **motivering** i denna fil och bocka «taget» med datum = *deferred*.
