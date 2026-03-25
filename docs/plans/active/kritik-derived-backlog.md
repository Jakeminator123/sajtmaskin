# Kritik-derived backlog

**Syfte:** En samlad, deduplicerad lista över öppna punkter från parallell granskning ([`.j_to_agent/structure_bugs_and_parralells/kritik/`](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md)). Procentsiffror i källfiler är ungefärliga; sanningskälla för framsteg: [`external-review-remediation-progress.md`](./external-review-remediation-progress.md).

**Relaterat (ej samma spår):** [`external-review-execution/buglista-del-3.md`](./external-review-execution/buglista-del-3.md) — uppföljning av `.j_to_agent/3.txt` (terminologi, fas-routing, sandbox-doc, Cursor-skills).

## Låst till annan agent (hög konfliktrisk — sista ~15–16 % whole)

Rör **inte** i parallell utan explicit ägarskap:

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`, `config/env-policy.json`
- Deploy-API, `useBuilderDeployActions`, builder publicerings-copy kopplad till env/409
- Nya integrationstester som expanderar registry-pipeline

**Kritik-/landningsagent** äger **låg** risk (landning CSS, a11y, doc-only).

---

## Ingest: källor i denna batch (8 dokument)

| # | Källfil | Roll i ingest |
|---|---------|----------------|
| 1 | `34pct-n.md` | Öppna: fritext-tint, reduced-motion utanför `.landing-chat-bg`, dubbel källa läge, meta |
| 2 | `18pct-k.md` | Kvarvarande teman: tilt (delvis), tech stack vs `package.json`, footer/juridik, float (överlappar 34pct) |
| 3 | `78pct-r.md` | §4 *Kvar* → prioritering mot progress (W2/W1/own-engine) |
| 4 | `64pct-s.md` | Historisk risk/ordning; inga nya kodkrav om W3/W4 klara |
| 5 | `84pct-u.md` | Skummad: leverans + handoff, inga regressionskrav |
| 6 | `84pct-a.md` | Skummad: samma |
| 7 | `84pct-e.md` | Skummad: samma (batchvitest referens) |
| 8 | `vercel-templates-path-verification-note.md` | Checklista (path/ignore), inte produktbugg |

*Utökning till 12 filer:* lägg till valfria `83pct-*`; stäng rad direkt om filen bara bekräftar commit + vitest OK.

---

## Backlog-tabell

| ID | Källa | Kort beskrivning | Typ | Konfliktrisk | Föreslagen plats / åtgärd | Status |
|----|-------|------------------|-----|--------------|---------------------------|--------|
| K-001 | `34pct-n` §3.1 | Explicit **dämpad `fritext`-profil** för shader-orbs (lugn neutral vs default teal) | CSS | låg | [`src/styles/landing-v2.css`](../../../src/styles/landing-v2.css) — `[data-landing-bg="fritext"]` | [x] |
| K-002 | `34pct-n` §3.2, `78pct-r` §4, `18pct-k` | **Reduced motion** för landning utanför `.landing-chat-bg`: marquee, wireframe-spin, modal scan-line, röst-indikator, Tailwind `animate-*` inom landning | CSS | låg | `landing-v2.css` + wrapper-klass `landing-v2-page` på landningens `<main>` | [x] |
| K-003 | `34pct-n` §3.2, `18pct-k` | `IntegrationCard` / feature-modal partiklar: **JS** använder redan `usePrefersReducedMotion` för float | kod (verifierad) | låg | [`chat-area.tsx`](../../../src/components/landing-v2/chat-area.tsx) | [x] |
| K-004 | `34pct-n` §3.3 | Edge case: `selectedCategory` vs `activeCategory` kan teoretiskt ge osynkad tint/hero | kod / test | låg | `landingBackgroundSemanticMode` — Vitest i `landing-background.test.ts` | [x] |
| K-005 | `34pct-n` §3.4 | Policy: `.j_to_agent` i git — PII/leakage-risk; commit-disciplin | process | låg | [`agent-workflows.md`](../contributing/agent-workflows.md) § *Agent-underlag i git* | [x] |
| K-006 | `34pct-n` §3.5 | Worktree måste följa `origin/master` för att spegla remediation | doc | låg | `external-review-remediation-progress.md` § arbetsyta (+ samma § i `agent-workflows.md`) | [x] |
| K-007 | `78pct-r` §4 | W2-rester: deploy auto-fix / valideringsfas | produkt / kod | **hög** | Deploy-spår | [ ] |
| K-008 | `78pct-r` §4, `64pct-s` | W1-rester / landningspolish (delar redan levererade i senare commits) | mixed | medel | Landning vs builder — koordinera | [ ] |
| K-009 | `78pct-r` §4 | Own-engine utanför W3-track | kod | **hög** | SSE / produkt | [ ] |
| K-010 | `64pct-s` §3 | Verifieringsdisciplin: typecheck + vitest före stora batcher | process | låg | [`agent-workflows.md`](../contributing/agent-workflows.md) § *Verifiering före större merge* | [x] |
| K-011 | `84pct-u`, `84pct-a`, `84pct-e` | Inget nytt regressionskrav i handoff; kedjan dokumenterar leverans | — | — | — | [x] skummad |
| K-012 | `vercel-templates-path-verification-note` | Efter ändringar: `git ls-files e2e/vercel-templates/`, `git check-ignore -v vercel_templates_levels`, ev. `references:discover` i ren clone | verifiering | låg | **2026-03-26:** `git ls-files` listar `e2e/vercel-templates/scrape-catalog.spec.ts`; `vercel_templates_levels/` matchar `.gitignore:65` | [x] |
| K-013 | `18pct-k` | Tech stack-rad i landningsdata vs faktisk `package.json` | copy / data | medel | JSDoc-pekare i `landing-chat-data.ts`; innehåll spot-checkat mot `dependencies` (React 19, Next 16, Tailwind 4, Drizzle, Stripe, Resend, `@vercel/analytics`) | [x] |
| K-014 | `18pct-k` | Footer/juridik (cookies, om oss) — produktbeslut | copy | medel | Footer-sidor | [ ] |
| K-015 | `31pct-t` / `27pct-w` (via `34pct-n` §2) | `extract-landing-chat-data.mjs` radbundet — vakt finns; full lösning = robustare extrakt | scripts | medel | `scripts/extract-landing-chat-data.mjs` | [ ] |

### Statusbatch (datum)

| Datum | Notering |
|-------|----------|
| 2026-03-26 | K-001, K-002 levererade (CSS + `landing-v2-page`); K-003 verifierad befintlig kod; K-011 skummad; övriga oförändrade eller delegerade. |
| 2026-03-26 | K-004–K-006, K-010, K-012, K-013: tester + `agent-workflows.md` + path-verifiering + techStack-JSDoc; B3-04 redan täckt i `preview-and-sandbox-flow.md` (endast korsreferens-rad tillagd). |

---

## Arkivering av kritikfiler

Flytta till [`.j_to_agent/archive/kritik-addressed/`](../../../.j_to_agent/archive/kritik-addressed/) först när **alla** i filen relevanta rader är stängda mot `origin/master` (se [`KRITIK-OVERVIEW.md`](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md)). **Ingen** kritikfil flyttades i denna batch — öppna rader kvar (K-007–K-009, K-014–K-015 m.fl.).
