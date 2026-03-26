# Slutföringsplan — hur mycket är kvar och i vilken ordning

**Syfte:** Svara på «hur mycket återstår?» och ge en **realistisk väg till «allt klart»** utan att låtsas att produktbeslut redan är tagna.

**Beslut innan nästa större kodfas:** [`BESLUT-INNAN-VI-GAR-VIDARE.md`](./BESLUT-INNAN-VI-GAR-VIDARE.md) — samma frågor som under **Fas A → Kvar** nedan, med plats att fylla i svar.

## Ungefärlig kvarvarande andel (grovt)

| Spår | Status | Kommentar |
|------|--------|-----------|
| **External-review remediation (1.txt–3.txt, W1–W5)** | **~100 %** | Avslutat per `REMEDIATION-EXIT` — inget mer i *det* spåret. |
| **Kritik-tabellen (K-rader)** | **4 öppna** (K-007, K-009, K-018, K-019) | **K-014**, **K-008** m.fl. stängda — se [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md). |
| **Plan 17** | **WS-5 + deferred** (WS-2/WS-4) | **WS-6 klar 2026-03-26**. **`docs/old` → `avklarat/2026-03-docs-old-archive/`** (2026-03-26). Kvar: JSON/research/ENV m.m. |

**Samlad bedömning:** Av *allt som historiskt körts* fram till remediation-exit är **execution-spåret i princip färdigt**. Det som återstår är **medvetet efterkvar** — ofta **dagar–veckor** per större punkt om man ska göra det ordentligt, inte «en eftermiddag».

**Landning (K-008)** är **stängd** tills vidare (2026-03-25): inget fokus på mer landningsmaterial; **primärfokus = K-018** (användarsidor i `iframe`). **K-014** stängd (2026-03-26). Kvar för «allt klart» i kritik-lagret: **K-007**, **K-018**, **K-009**, **K-019** — se master-tabellen. **WS-6** besvarad (2026-03-26). Begrepp: [`FRAGOR-SVAR-FAQ.md`](./FRAGOR-SVAR-FAQ.md).

---

## Fas A — Beslut du måste ta (blockerar kod)

### Beslut tagna

- **WS-6 (2026-03-26):** **Behåll** D-ID (`/avatar`) och **OpenClaw**. **Brave Search** och **Loopia** **behålls som optional** — se Plan 17 § WS-6.
- **K-014 / E1 (2026-03-26):** Sidor och copy kring **cookies, om oss, juridik** är **OK oförändrat tills vidare** — raden **[x]** i [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md).
- **Plan 17 (2026-03-26):** **F1** v0 medvetet separerat · **G1b** ENV låg prio (dokumentera sanning) · **H1c** research-policy · **H2c** `docs/old` flyttad till arkiv **2026-03-26** — se [`17-repo-separation-and-independence.md`](../17-repo-separation-and-independence.md).
- **K-008 / C1 (2026-03-25):** Landning — **ingen utökning av material** nu; fokus användarsidor (**K-018**).
- **B1 → K-018 (2026-03-25):** Användarsidor ska preview:as som **bra standard React** (som `npm run dev`), **samma i `iframe`**.
- **D1 (2026-03-25):** FAQ/innehåll på **Sajtmaskins** sajt **sekundärt**; **K-009** = SSE/own-engine, inte marknads-FAQ.
- **I1 (2026-03-25):** **Vercel-templates** → **scaffolds** för OwnEngine; **V0-templates** → separat plattformsspår (se FAQ § *I1*).
- **Fas A — K-007, K-009, K-018, K-019 + Plan 17 WS-4/5-rester (2026-03-26):** skriftliga produkt-/prioriteringsbeslut i [`BESLUT-INNAN-VI-GAR-VIDARE.md`](./BESLUT-INNAN-VI-GAR-VIDARE.md) (checklista **[x]**); kritik-rader förblir **`[ ]`** tills kod levererats eller rad stängs med **[N/A]**.

### Kvar

- **Implementation** enligt [`MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) och öppna **K-**rader — inte fler «tomma» beslut i Fas A förrän backlog ändras.

---

## Fas B — Kod & städ (efter A, eller parallellt där ingen konflikt)

| Ordning | Innehåll | Plan |
|--------|----------|------|
| B1 | `ENV.md` + `config/env-policy.json` — **låg prio**; **dokumentera sanning först** (G1b) | Plan 17 WS-4 |
| B2 | Rensa / dokumentera `AI_GATEWAY_*` + OIDC-referenser när policy är klar | Plan 17 WS-4 |
| B3 | v0 SDK / `V0_API_KEY` — **avsiktligt separerat** tills vidare (F1); inget migreringskrav nu | Plan 17 WS-2 |
| B4 | WS-5: `.gitignore`-scan, **`research/`** enligt policy (H1c), ~~`docs/old`~~ **flyttad** till `avklarat/2026-03-docs-old-archive/` (H2c) | Plan 17 WS-5 |

---

## Fas C — Drift & bevis

| Steg | Innehåll | Vem |
|------|----------|-----|
| C1 | `npm run typecheck` + `npx vitest run` före/efter varje batch | Agent |
| C2 | `npm run test:deploy-smoke:e2e` när `SAJTMASKIN_E2E_*` finns | Du / CI |
| C3 | Uppdatera `kritik-consolidated` + `external-review-remediation-progress` när något stängs | Agent |

---

## Definition av «helt klart»

- **K-007, K-018, K-009:** alla `[x]` med datum eller **nedprioriterade** med motivering (**K-014**, **K-008** redan **[x]**).  
- **Plan 17:** alla `[ ]` antingen bockade eller **N/A** med kort motivering; filen kan då flyttas till `avklarat/`.  
- **`queue/PLAN-*.md`:** avsnitt markerade klara eller borttagna.

---

## Koppling till körfilen

**Allt kvar i en fil:** [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) (ersätter samlad `KORFIL`-körlista). Den här filen är **tidslinje + beslut** ovanpå samma sak.

**Preview-UX (K-018):** Se MASTER § 2 / [`PLAN-PREVIEW-SANDBOX.md`](./PLAN-PREVIEW-SANDBOX.md) § *UI-princip*.
