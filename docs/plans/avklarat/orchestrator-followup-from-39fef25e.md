# Orchestrator / remediation — commit-uppföljning (efter `39fef25e`)


**Arkiverad** `2026-03-28` — punkt-i-tid-granskning av commits (tabellen nedan går inte automatiskt till `nu`); för nyare historik kör `git log` på `origin/master`. Levande sanning om vad som återstår: [`../active/kritik-consolidated-open-items.md`](../active/kritik-consolidated-open-items.md) + [`../active/external-review-remediation-progress.md`](../active/external-review-remediation-progress.md).

**Baslinje:** Senast denna tråd uttryckligen följde upp kritik/manifest låg HEAD kring `39fef25e` / `7f2c86a8`-linjen. Här granskas commits på `origin/master` **efter** `39fef25e` (äldst → nyast): **tre batchar à fyra** + **en avslutande commit** som landade efter sitemap-steget.

**Källkommando:** `git log 39fef25e..origin/master --oneline` (verifiera mot din clone med `git fetch`). Senast granskad HEAD i denna fil: **`357f0882`** (`origin/master` vid uppföljning 2026-03-27).

**Relaterat:** [`kritik-consolidated-open-items.md`](../active/kritik-consolidated-open-items.md), [`external-review-remediation-progress.md`](../active/external-review-remediation-progress.md).

---

## Översikt (vad agenten gjorde)

| SHA (kort) | Ämnesrad (kärna) | Knytning till backlog |
|------------|------------------|------------------------|
| `56f2cdee` | ~91pct K-015 extract + K-017 Vitest | K-015 `[x]`, K-017 `[x]` |
| `8970e6a6` | ~92pct K-016 del1 wireframe | K-016 |
| `ff9b3d4a` | ~93pct K-016 del2 radar + LH | K-016 |
| `67428e5e` | ~94pct K-016 del3 tech/integration + fallback | K-016 |
| `5841ff86` | ~95pct K-016 del4 feature blocks; K-016 stängd i kritik | K-016 `[x]` |
| `4e22c81b` | K-007 delmoment `skipAutoFix` Vitest | K-007 fortfarande `[ ]` (delmoment) |
| `4e93f639` | K-014 footer `#cookies` / `#gdpr` + integritetssidor | K-014 fortfarande `[ ]` (delmoment) |
| `22281723` | run-summaries metadata (K-014-run) | doc-only |
| `5cc60f2f` | orchestrator hygien + dokumenthierarki | process |
| `28295bbd` | K-008 `/blogg` + e2e README | K-008 `[ ]` |
| `da83ae15` | ~96pct `STATIC_SITEMAP_REL_PATHS` + Vitest | SEO/regression |
| `3b468935` | ~97pct B3-05 ta bort `extract-static-core.mjs` | `3.txt`-spår / buglista del 3 komplett |

### Commits efter `3b468935` (nyare än tabellen ovan)

| SHA (kort) | Ämnesrad (kärna) | Knytning |
|------------|------------------|----------|
| `4f21d9fe` | docs: orchestrator commit-uppföljning (`reviews/`) | skapade/uppdaterade denna fil |
| `3fbc3032` | ~97pct K-014 layout `Footer` — `/om`, `/privacy#…`, `footer.test.tsx` | K-014 delmoment |
| `d2db9da2` | ~97pct e-handelsscaffold `/om` + `app/om/page.tsx`; fetch/pull före push i docs | scaffold + agent-rutin |
| `357f0882` | ~97pct `route-plan` **om oss** → `/om`; push-regel i `parallel-agent-collision-safety.mdc` | gen + Cursor-regel |

**Bedömning av spårbarhet:** Konsoliderad kritik och progress verkar uppdaterade i takt med dessa steg (inkl. orchestrator-loggar). Inga uppenbara “öppna K-rader utan commit” i denna kedja.

---

## Batch 1 — `56f2cdee` … `67428e5e`

### Bekräftat bra

- **`scripts/extract-landing-chat-data.mjs`:** Markörer `SAJTMASKIN_LANDING_DATA_EXTRACT_*`, legacy-slice som sista utväg, **no-op** när `landing-chat-data.ts` redan exporterar `categories` — rimlig K-015-lösning.
- **`registry-parity.test.ts`:** Unika `key` och unika `provider ?? key` — träffar K-017 utan att röra `DETECTION_PIPELINE`-ordning.
- **`landing-comparison-radar.tsx`:** `useId` + sanitiserade SVG-gradient-ID:n — minskar kollision vid flera instanser.
- **`landing-tech-integration-cards.tsx`:** Delad ref för tilt + in-view; `usePrefersReducedMotion` på integrationskort (i linje med tidigare landnings-a11y).
- **`landing-feature-blocks.tsx` (del4 i batch 2, men samma tema):** Modalpartiklar respekterar `usePrefersReducedMotion`.

### Risker / förbättringar (inga showstoppers)

1. **Legacy-radslice 137–746** i extract-skriptet är fortfarande **skört** om `chat-area.tsx` omstruktureras; markörvägen är rätt primär. Överväg att ta bort legacy helt efter en övergångsperiod (låg prioritet).
2. **`outPath` och `dataPath`** pekar på samma fil — redundant variabel; kosmetiskt.
3. **`LighthouseGauges`:** Fasta siffror (96/98/100/98) är **illustration**, inte mätdata. För transparens: en kort disclaimertext i UI eller komponentkommentar (“exempelvärden”) så inte besökare tolkar det som en faktisk rapport.
4. **`HowItWorksFallback`:** Flera `animate-pulse`-block utan `prefers-reduced-motion`-avstängning. Resten av landningen har ofta scoped reduce; här är en **rimlig uppföljning** (K-008-relaterad polish).

---

## Batch 2 — `5841ff86` … `22281723`

### Bekräftat bra

- **K-016 del4:** `landing-feature-blocks.tsx` + `chat-area`-komposition — tydlig uppdelning; `FeatureCard` har `role="button"`, fokus och Enter/Space för öppning.
- **K-007 delmoment:** `deployments/route.test.ts` täcker **`precheckOnly` + `skipAutoFix`** — `fileCount` oförändrad när lockfile annars skulle stripas; `fixesApplied` nämner skip. Stämmer med [`deploy-precheck.md`](../../../architecture/deploy-precheck.md)-kontraktet.
- **K-014 delmoment:** `LandingFooter` länkar till `/privacy#cookies` och `/privacy#gdpr`; [`src/app/privacy/page.tsx`](../../../../src/app/privacy/page.tsx) har `<Section id="cookies">` och `id="gdpr"` med `scroll-mt-24` — **ankare fungerar**.
- **`22281723`:** Ren metadata/dokumentation för körning — låg risk.

### Risker / luckor

1. **K-007 är inte “klar”** — bara ett **delmoment** (test + ev. doc). Självaste produktfrågorna (tunnare auto-fix, hårdare validering före deploy) står kvar som `[ ]` i kritik-tabellen; det är **korrekt** och ska inte tolkas som att K-007 är löst.
2. **K-014:** Footer nämner “cookie-banner” i copy; **`cookie-banner.tsx` finns** i layout — OK. Däremot **juridisk enhet:** `LandingFooter` säger “SajtMaskin AB” medan integritetssidans metadata/body pratar “Pretty Good AB” — **redaktionellt / juridiskt** bör någon produktägare säkerställa en **enda sanning** (inte introducerat i denna batch men synligt vid K-014-granskning).
3. **`FeatureCard`:** `onKeyDown` för Space anropar `onClick()` men **saknar `preventDefault()`** — standardmönster är att hindra sidscroll när Space används på knapp-liknande element. Liten a11y-fix.

---

## Batch 3 — `5cc60f2f` … `da83ae15`

### Bekräftat bra

- **Doc-hierarki / orchestrator-hygien:** README under execution + progress — minskar att gamla `run/`-mappar lever kvar som falska “aktiva” körningar (förutsatt att arkiveringen gjorts konsekvent i samma commit-kedja).
- **K-008 — `/blogg`:** Tydlig placeholder, ärlig copy, länkar till builder + FAQ; metadata uppdaterad.
- **`e2e/README.md`:** Deploy/Vitest-notis — hjälper agenter som blandar Playwright och Vitest.
- **`sitemap.ts` + `sitemap.test.ts`:** `STATIC_SITEMAP_REL_PATHS` som **exporterad konstant** + tester för innehåll och **unika** paths — bra regression för footer/marknadsrutter.

### Risker / luckor

1. **K-008** i kritik handlade också om **landningspolish / in-view 3D**; blogg+e2e-doc är **ett** delmoment — raden `[ ]` i kritik är fortfarande **motiverad** om ni räknar återstående landnings-Motion.
2. **Sitemap vs nya sidor:** När ni lägger till en ny marknadssida under `src/app` måste ni uppdatera **både** `STATIC_SITEMAP_REL_PATHS` och footern manuellt; testet fångar dubbletter men **inte** saknade sidor. Eventuellt framtida script eller en kommentar i `sitemap.ts` som pekar på checklistan.

---

## Batch 4 — `3b468935` (efter sitemap)

### Bekräftat bra

- **`scripts/extract-static-core.mjs` borttaget** i linje med att monolitisk `STATIC_CORE` inte längre är källan; `scripts/README.md`, `prompt-tree.md`, `buglista-del-3.md`, `track-w4-scripts.md` och progress uppdaterade — **konsekvent hygien-commit**.
- **Orchestrator-logg + MASTER-ROADMAP** noterar typecheck + vitest (384) — spårbar leverans.

### Liten notis (inte fel i commiten)

- **`.j_to_agent/3.txt`** (export av originalgranskning) kan fortfarande nämna `extract-static-core.mjs` på äldre rader — det är **historisk källa**, inte operativ checklista. Operativ sanning: `buglista-del-3.md` + `scripts/README.md`.

---

## Rekommenderade nästa steg (prioriterade)

| Prio | Åtgärd | Typ | Status (verifierat mot `master` 2026-03-27) |
|------|--------|-----|-----------------------------------------------|
| 1 | Enhetlig **bolagsbenämning** (footer vs integritetssida / metadata) | Produkt/juridik | **OK:** `landing-footer.tsx` copyright + länktext **Pretty Good AB**; integritetssidan **Pretty Good AB (DG97)**. **SajtMaskin** = varumärke/produktnamn, inte juridisk enhet i footern. |
| 2 | `HowItWorksFallback` + **reduced-motion** för `animate-pulse` | a11y | **Redan åtgärdat:** `usePrefersReducedMotion()` → tom `pulse`-klass vid reduce (`landing-how-it-works-fallback.tsx`). |
| 3 | `FeatureCard`: **Space** → `preventDefault` + `onClick()` | a11y | **Redan åtgärdat:** `e.preventDefault()` för `" "` före `onClick()` (`landing-feature-blocks.tsx`). |
| 4 | **Disclaimer** vid demostatistik i Lighthouse-kort | copy/transparens | **Redan åtgärdat:** fotnot under gauges (`landing-lighthouse-gauges.tsx`). |
| 5 | Rensa **dubbel variabel** i `extract-landing-chat-data.mjs` | kosmetik | **Inget kvar:** endast `outPath` används (ingen separat `dataPath`). |

**Instruktion till agent (låg–medel risk):** *Implementera punkterna under “Rekommenderade nästa steg” som fortfarande saknar **Redan åtgärdat** / **OK**; rör inte registry/deploy/own-engine utan separat uppdrag. Kör `npm run typecheck` och `npx vitest run`.*  
För **K-007 / K-009** lägg till [`kritik-consolidated-open-items.md`](../active/kritik-consolidated-open-items.md) och vid behov [`deploy-precheck.md`](../../architecture/deploy-precheck.md) — detta followup-dokument täcker främst landnings-/granskningsdetaljer.

**Implementerat i kod (efter review):** punkt 2–5 ovan + landningsfooter (Pretty Good AB + länk som i layout-footer), se commit som refererar till denna fil.

---

## Slutsats

Orchestrator-spåret efter `39fef25e` är **genomfört konsekvent** mot dokumenterade K-punkter: K-015/K-016/K-017 är rimligt stängda i kod/test; K-007/K-014/K-008 har **avsiktliga delmoment** och ska fortfarande visas som `[ ]` där helheten inte är beslutad. De största **nya** findingsen här är **a11y** (pulse + Space), **copy/transparens** (Lighthouse-siffror), och **juridisk enhet** (bolagsnamn) — inte att commits skulle vara trasiga.

*Granskning skapad som fristående dokumentation; inga kodändringar i denna commit utifrån denna fil.*

---

**Uppföljning 2026-03-27:** Tabellen **Commits efter `3b468935`**, kolumn **Status** under *Rekommenderade nästa steg*, och **Senast granskad HEAD** uppdaterades så review-listan speglar `357f0882` och faktisk kod — inga nya kodändringar krävdes för prio 1–5.
