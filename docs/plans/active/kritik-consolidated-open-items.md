# Kritik — konsoliderade öppna punkter (alla `NNpct-*.md` genomlästa)

**Syfte:** En **enda** levande lista över buggar / förbättringar som återstår efter att `.j_to_agent/structure_bugs_and_parralells/kritik/*.md` (utom nedan) **arkiverats** under [`../../../.j_to_agent/archive/kritik-addressed/`](../../../.j_to_agent/archive/kritik-addressed/README.md). Dubbletter mellan filer är sammanslagna till **en rad per tema**.

**Viktigt:** Att en `NNpct-*.md` ligger i **arkiv** betyder bara att **själva filen** inte längre ska vara “aktiv handoff” i `kritik/`. Det betyder **inte** automatiskt att varje påstående i den filen är fixat i kod. Öppet arbete ska synas här (`[ ]` i tabellen nedan) eller under *Stängda / införlivade* om vi medvetet behandlar det som klart. Arkiverade filer finns kvar i git för kontext.

**Operativ kö:** [`queue/KORFIL.md`](./queue/KORFIL.md) (3 punkter → 3 `PLAN-*.md`).

**Sanning om framsteg:** [`external-review-remediation-progress.md`](./external-review-remediation-progress.md) + `git log origin/master`.

**Relaterat:** [`archived/external-review-execution/buglista-del-3.md`](../archived/external-review-execution/buglista-del-3.md) (`.j_to_agent/3.txt`), [`kritik-derived-backlog.md`](./kritik-derived-backlog.md) (kort pekare hit).

**Aktiva kritikfiler:** inga milstolpsfiler just nu — se [`KRITIK-OVERVIEW.md`](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md). `42pct-v.md` (C-101–C-104) är **arkiverad** under [`kritik-addressed/`](../../../.j_to_agent/archive/kritik-addressed/README.md) efter fix 2026-03-26.

---

## Låst / hög konfliktrisk (slutspurt integration + deploy)

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`, `config/env-policy.json`
- Deploy-API, `useBuilderDeployActions`, builder copy kopplad till env/409

---

## Öppna punkter (master-tabell)

| ID | Källor (konsoliderade) | Beskrivning | Typ | Risk | Status |
|----|-------------------------|-------------|-----|------|--------|
| K-007 | `78pct-r`, `64pct-s`, progress | W2-rester: deploy auto-fix / hårdare valideringsfas före deploy (valfritt produktbeslut) | kod / produkt | hög | [ ] |
| K-008 | `78pct-r`, `34pct-n` §5 (historisk) | Landningspolish / W1-rester: ev. mer in-view 3D; delar redan levererat (`79pct-l` m.fl. — nu arkiverat) | mixed | medel | [ ] |
| K-009 | `78pct-r`, `64pct-s` | Own-engine **utanför** avslutad W3-track (SSE, produkt) | kod | hög | [ ] |
| K-014 | `18pct-k` (arkiverad sammanfattning) | Footer / juridik / cookies — produktcopy och eventuella sidor | copy | medel | [ ] |
| K-015 | `31pct-t`, `27pct-w`, `34pct-n` | `extract-landing-chat-data.mjs`: markörblock + legacy-slice + **no-op** när `landing-chat-data.ts` redan bär `categories` | scripts | medel | [x] 2026-03-26 |
| K-016 | `27pct-w`, `31pct-t` | Landnings-UI utbrutet: wireframe, radar/LH, tech+integration+fallback, feature+kort/modal (`landing-feature-blocks.tsx` m.fl.); `chat-area` = sidkomposition | refaktor | låg–medel | [x] 2026-03-26 |
| K-017 | `31pct-t` | `REGISTRY_BY_PROVIDER`: unika `key` + `provider ?? key` — `registry-parity.test.ts` | data | låg | [x] 2026-03-26 |
| C-101 | `42pct-v` §2.1 | Progress **Last code touch** i sync med tabell / senaste batch | doc | låg | [x] 2026-03-26 |
| C-102 | `42pct-v` §2.2 | Vitest: ogiltig manifest → fallback, tomma filer, inject-idempotens, merge + custom-env | test | medel | [x] 2026-03-26 |
| C-103 | `42pct-v` §2.3 | `deployReadiness.invalidFiles` fylls när `package.json` inte kan patchas i preflight | kod | låg | [x] 2026-03-26 |
| C-104 | `42pct-v` §2.4–2.5 | Canonical path dokumenterad i `deploy-precheck.md` | arkitektur | medel | [x] 2026-03-26 |

---

## Stängda / införlivade (tidigare spread över många `NNpct-*.md`)

Följande teman behandlas som **stängda** mot nuvarande `master` (implementation eller doc). Detaljer fanns i arkiverade filer som `18pct-k`, `27pct-w`, `31pct-t`, `34pct-n`, `78–84pct-*`, `vercel-templates-path-verification-note.md`.

| Tema | Var det löst / dokumenterat |
|------|------------------------------|
| Fritext-bakgrund, reduced-motion landning (marquee, wf-spin, m.m.) | `landing-v2.css`, `landing-v2-page`, tidigare commits |
| `landingBackgroundSemanticMode` edge cases | `landing-background.test.ts` |
| `.j_to_agent`-hygien, worktree, pre-merge typecheck/vitest | `agent-workflows.md`, progress-doc |
| Tech stack vs `package.json` (marknadsföring) | JSDoc vid `techStack` + spot-check |
| Vercel templates kanonisk path + ignore | `e2e/vercel-templates/`, `.gitignore` — verifierat |
| IntegrationCard / ParticleOrb reduced motion | `79pct-l`-linjen (arkiverad) + senare CSS |
| Svensk copy, Mer-meny, deploy 409 UX, CMS/sök registry-kedja | Commit-kedja 80–84pct (arkiverad som historik) |
| Tilt utan `setState`, reduced-motion i `use3DTilt` | `landing-hooks.ts` |

---

## Underhåll

- När en rad stängs: uppdatera denna fil + ev. `integration-manifest.test.ts` / progress-intro.
- Nya milstolpar: antingen kort notis här **eller** ny fil i `kritik/` + en rad i [`KRITIK-OVERVIEW.md`](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md).

**Batch:** 2026-03-26 — konsolidering + massarkivering av handoff-/historikfiler. **2026-03-26 (senare):** C-101–C-104 stängda i kod/docs; `42pct-v.md` arkiverad. **2026-03-26 (K-015/K-017):** extract-script + registry-parity Vitest; progress § Återstår / Snabb ingång synkade. **2026-03-26 (orchestrator):** run `2026-03-26-external-review-to-100` → arkiv + K-016 del 1 (`landing-wireframe-shapes.tsx`). **2026-03-26 (orchestrator 2):** run `2026-03-26-external-review-k016-radar-lh` → K-016 del 2 + progress § staging-notis. **2026-03-26 (orchestrator 3):** run `2026-03-26-external-review-k016-tech-cards` → K-016 del 3. **2026-03-26 (orchestrator 4):** run `2026-03-26-external-review-k016-feature-modal` → K-016 del 4 + **`[x]`**. **2026-03-26 (orchestrator 5):** run `2026-03-26-external-review-k007-precheck-skip` → K-007 **delmoment:** `precheckOnly`+`skipAutoFix` Vitest + `deploy-precheck.md` § kontraktstester (**K-007** rad oförändrat `[ ]`). **2026-03-26 (orchestrator 6):** run `2026-03-26-external-review-k014-privacy-anchors` → K-014 **delmoment:** footer `#cookies` / `#gdpr` + integritetssidan (**K-014** rad oförändrat `[ ]`). **2026-03-26 (orchestrator 7):** run `2026-03-26-external-review-doc-hierarchy-sweep` → arkiverade stale `run/` + README § dokumenthierarki. **2026-03-27 (orchestrator 8):** run `2026-03-27-external-review-k008-blogg-e2e-doc` → `/blogg` polish + `e2e/README` deploy/Vitest-notis (**K-008** `[ ]`). **2026-03-27:** whole **~96%**, `sitemap.test.ts` + `STATIC_SITEMAP_REL_PATHS`. **2026-03-27 (senare):** whole **~97%**, **B3-05** — `extract-static-core.mjs` borttaget; buglista del 3 komplett. **2026-03-27 (layout-footer):** **K-014** delmoment — `components/layout/footer.tsx` `/om` + `/privacy#gdpr`/`#cookies` + Vitest; landning **~91%**; **K-014** rad `[ ]` oförändrad. **2026-03-27 (ecommerce + push-doc):** `ecommerce/manifest` `/om` + `app/om/page.tsx`; CONTINUATION/progress/KRITIK — fetch+pull före push. **2026-03-27 (route-plan + regel):** `route-plan` **om oss** → `/om` + Vitest; `parallel-agent-collision-safety.mdc` § före push. **2026-03-27 (orchestrator ~98%):** K-008 delmoment — `HowItWorksLazy` in-view + reduce, terminal cursor; `deploy-precheck` § K-007-framtid; whole **~98%**; **K-008** rad `[ ]`. **2026-03-27 (orchestrator ~99%):** Lanyard in-view + reduce; ParticleOrb dpr; whole **~99%**; **K-008** `[ ]`. **2026-03-27 (orchestrator ~99% micro):** Tailwind v4 `bg-linear-to-*` (Lanyard + BudgetEstimate); **K-008** `[ ]`. **2026-03-28 (remediation exit):** `REMEDIATION-EXIT.md` — whole vision **100%** *execution-scope*; valfri deploy-smoke; **K-007 / K-008 / K-009 / K-014** oförändrat `[ ]`. **2026-03-28 (repo hygiene):** `.gitignore` dedup + plans README + arkiverad orchestrator-sammanfattning + `.cursorignore` kritik-addressed; ingen ändring av K-tabellen. **2026-03-28 (plans):** `orchestrator-followup-from-39fef25e` → `archived/`; `active/README` förtydligar 100% vs plan 17. **2026-03-28 (doc sweep):** `orchestrator-workloads` snapshot → `archived/` + stub; `REMAINING-WORK` hub; progress förkortad.
