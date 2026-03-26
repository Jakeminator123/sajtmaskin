# Frågor & svar — produktbeslut och begrepp

**Syfte:** Förtydliga vad kritik-rader och `e2e/`-mappen *faktiskt* avser, så beslut inte blandas ihop.

---

## B1 — Två olika saker (läs båda)

### K-007: deploy / auto-fix (oförändrat öppet)

**K-007** handlar om **publiceringsflöde**: preflight före deploy (patcha `package.json`, varna, m.m.), **auto-fix** och **opt-out** (`skipAutoFix`, miljövariabler — se `deploy-precheck.md`).

**Frågan som fortfarande är öppen:** Ska default bli **stramare**, **oförändrat**, eller **tydligare opt-in**?

### K-018: preview / `iframe` för **användarnas** sidor (produktprioritet)

**Separat från K-007.** Ägarbeslut: alla **användargenererade** sidor ska kunna **renderas** med **tillräckligt bra standard** som React (samma **kvalitetsribba** som vid `npm run dev`), och **samma fidelity ska gälla i `iframe`** i buildern. Det spåret finns som **K-018** i kritik-tabellen.

---

## C1 — «Landning» (K-008) — **stängd** tills vidare

**Landning** = Sajtmaskins **egen** marknadssida (`landing-v2` m.m.), inte kunders sajter.

**Beslut:** Ingen utökning av **extra landningsmaterial** just nu; **fokus på användarnas sidor** och hur de visas (**`iframe`**, se **K-018**). Därför är **K-008 [x]** — återstående W1-«polish» på landningen är **inte aktiv backlog** förrän du omaktiverar den.

---

## D1 — K-009 vs FAQ på **Sajtmaskins** sajt

**K-009** är **own-engine** / **SSE** *utanför* avslutad W3 — **inte** samma sak som att bygga ut **FAQ** eller liknande **innehållssidor** på Sajtmaskins marknadssajt.

**Beslut:** Uppföljning kring **FAQ / innehåll** för **Sajtmaskin** (marknad) är **sekundärt**; prioritera **K-018** (preview) och öppna **K-009** endast när du vill precisera **stream-/motor-scope**.

---

## I1 — Tydlig distinktion: **V0-templates** vs **Vercel-templates** (scaffolds)

| Begrepp | Vad det är | Roll i produkten |
|--------|------------|------------------|
| **V0 / v0-templates** | Mallar och projektflöden kopplade till **v0-plattformen** (API, SDK, `V0_API_KEY`, legacy routes). | **Separat spår** (Plan 17 **F1**) — *inte* samma som Vercel-katalogen. |
| **Vercel-templates** | Mallar från **vercel.com** (upptäcks via `e2e/vercel-templates`, hamnar under `research/external-templates/`, processas av **template-library** → **`src/lib/gen/scaffolds/`**). | **Primär källa för scaffolds** som **OwnEngine** / LLM ska **plocka upp** och bygga vidare på. |

**`SAJTMASKIN_E2E_*`** används **bara** för **deploy-API-smoke** (`e2e/deploy/deploy-api-precheck.smoke.spec.ts`) — varken V0- eller Vercel-malllista.

**`e2e/`-mappen:**

| Del | Syfte |
|-----|--------|
| **`e2e/vercel-templates/scrape-catalog.spec.ts`** | Research: **Vercel**-katalog → `research/external-templates/` → pipeline → **scaffolds** (OwnEngine). |
| **`e2e/deploy/…smoke.spec.ts`** | Valfri smoke mot **`POST /api/v0/deployments`** (`precheckOnly`). |

**v0-specifika mallar** synkas m.m. via **`npm run templates:*`** och relaterad kod — **inte** via `SAJTMASKIN_E2E_*`.

Om **vercel-templates**-specen failar: troligen **ändrad webb**, **cookies**, eller **lokal output-mapp** — felsök separat.

**Rutin för deploy-smoke:** tills vidare **ingen ny CI-krav**; se [`e2e/README.md`](../../../../e2e/README.md).

---

## Beslut inlagda från ägare (2026-03-26)

| Kod | Beslut |
|-----|--------|
| **E1** | Sidor som cookies, om oss, juridik **OK som de är för tillfället** → **K-014 stängd** i kritik-tabellen. |
| **F1** | **v0** (SDK + `V0_API_KEY`) **avsiktligt separerat** — ingen fas-ut i närtid; deferred kvar tills egen plan. |
| **G1** | **b)** Låg prio — **dokumentera nuvarande sanning** i `ENV.md` / `env-policy` före hård schemarensning. |
| **H1** | **c)** Kort **policy** för `research/` (se Plan 17 § WS-5). |
| **H2** | **c)** **`docs/old`:** innehåll **flyttat** till `docs/plans/avklarat/2026-03-docs-old-archive/` (2026-03-26); rot = pekare. |
| **B1 (preview)** | Användarsidor: **React-kvalitet som `npm run dev`**, samma i **`iframe`** → **K-018** (öppen). |
| **C1** | Landning: **ingen utökning av material nu**; fokus användarsidor → **K-008 [x]**. |
| **D1** | FAQ/innehåll på **Sajtmaskins** sajt **sekundärt**; **K-009** = SSE/own-engine-scope. |
| **I1** | **Vercel-templates** = **scaffolds** för OwnEngine; **V0-templates** = separat plattformsspår. |

Länk (arkiv): [`../../avklarat/2026-03-handoff-doc-bundle/COMPLETION-ROADMAP.md`](../../avklarat/2026-03-handoff-doc-bundle/COMPLETION-ROADMAP.md)
