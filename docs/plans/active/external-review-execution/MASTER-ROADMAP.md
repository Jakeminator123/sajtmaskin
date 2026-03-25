# MASTER ROADMAP — External review execution

**Sanning (% , Done-lista, commit):** [external-review-remediation-progress.md](../external-review-remediation-progress.md)  
**W1–W5 översikt:** [orchestrator-workloads-external-review.md](../orchestrator-workloads-external-review.md)

---

## Snabbnavigering — spår

| Spår | Fil | Typisk parallell med |
|------|-----|----------------------|
| W3 Own-engine | [track-w3-own-engine.md](./track-w3-own-engine.md) | W4 (olika träd) |
| W4 Scripts | [track-w4-scripts.md](./track-w4-scripts.md) | W3 |
| W2 Hardening (valfritt) | [track-w2-deploy-hardening.md](./track-w2-deploy-hardening.md) | W4 om deploy-kod inte krockar |
| W1 Follow-ups (valfritt) | [track-w1-landing-followups.md](./track-w1-landing-followups.md) | W4, **inte** W3 stream-routes |

---

## Fas-checklista (rollup)

Bocka här när **hela spåret** uppfyller exit-kriteriet i respektive track-fil, eller när orchestratorn fryser en milestone.

### Fas 0 — Redan levererat (referens)

- [x] W1 kärna: `LandingBackground`, landningsdata/hooks, hero/footer split (se progress-doc Done)
- [x] W2 kärna: registry, manifest i version, deployReadiness (se progress-doc Done)
- [x] W3 delmängd: contract-gate SSE, finalize/rollback, generation-pipeline-namn, generation-meta i session (se [track-w3](./track-w3-own-engine.md) `[x]`)

### Fas A — Pågående huvudfokus (hög hastighet)

- [x] **W3** — Own-engine session + transaktioner/golden enligt [track-w3-own-engine.md](./track-w3-own-engine.md) (alla `[ ]` under *Återstår* bockade, 2026-03-25)
- [x] **W4** — Scripts/README/lab enligt [track-w4-scripts.md](./track-w4-scripts.md) (exit 2026-03-25 ff.; alla *Återstår* `[x]`)

### Fas B — Valfri hårdning

- [x] **W2** — Deploy/auto-fix enligt [track-w2-deploy-hardening.md](./track-w2-deploy-hardening.md) (checklista komplett; återstår ev. e2e/polish i progress § *Återstår*)
- [x] **W1** — Små UX-followups enligt [track-w1-landing-followups.md](./track-w1-landing-followups.md) (checklista komplett; produkt-placeholder `/blogg` kvar i progress *Uncertainties*)
- [x] **W5** — Kritik regressionspass / hygien (2026-03-26): färdigställda `NNpct-*.md` arkiverade under `.j_to_agent/archive/kritik-addressed/`; levande öppna punkter i [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md); `42pct-v.md` **arkiverad**; `KRITIK-OVERVIEW.md` aktiv

---

## Parallellisering (orchestrator-beslut)

| Våg | Samtidiga workers | Villkor |
|-----|-------------------|---------|
| A1 | W3 + W4 | Max **en** W3-worker som rör `src/app/api/v0/chats/**/stream/route.ts` per merge; W4 håller sig till `scripts/**` + dokumentation som pekar på scripts |
| A2 | Endast W3 | Om W3 behöver **två** ändringar i samma stream-filer — kör **sekventiellt** |
| B | W2 + W4 | OK om filöverlapp saknas; annars sekventiellt |

---

## Orchestrator / verifiering

| Datum | Branch | Verifierat | Anteckning |
|-------|--------|------------|--------------|
| 2026-03-26 | master | typecheck + vitest (381) | ~94%: orchestrator K-016 del 3 — `landing-tech-integration-cards.tsx`, `landing-how-it-works-fallback.tsx`; run `2026-03-26-external-review-k016-tech-cards` arkiverad; progress ~94% |
| 2026-03-26 | master | typecheck + vitest (381) | ~93%: orchestrator K-016 del 2 — `landing-comparison-radar.tsx` (useId gradients), `landing-lighthouse-gauges.tsx`; run `2026-03-26-external-review-k016-radar-lh` arkiverad; progress ~93% + § staging |
| 2026-03-26 | master | typecheck + vitest (381) | ~92%: orchestrator-run workload 01-01 — K-016 del 1 `landing-wireframe-shapes.tsx`; run arkiverad (`archive-completed-runs.ps1`); progress ~92% whole |
| 2026-03-26 | master | typecheck + vitest (381) | ~91%: K-015 extract-script (markör/no-op); K-017 `registry-parity.test.ts`; progress § Snabb ingång + § Återstår (~80% integration); MASTER W5 textfix (`42pct-v` arkiverad) |
| 2026-03-26 | master | typecheck + vitest (371) | ~90%: W5 — kritik arkiv + `kritik-consolidated-open-items.md`; `repo-hygiene` Git vs Cursor; MASTER W5 `[x]` |
| 2026-03-25 | master | typecheck + vitest (371) | ~89%: B3-02 — `phase-routing.ts` aux OpenAI-faser → `gpt-4.1-mini`; docs + buglista |
| 2026-03-25 | master | typecheck + vitest (370) | ~88%: W2 — `deploy-readiness.test.ts` + `deployments/route.test.ts` (`precheckOnly`, db client mock) |
| 2026-03-25 | master | typecheck + vitest (365) | ~88%: B3-06 — `scripts/manual/scaffold-pipeline.py`; B3-05 doc vid extract-static-core |
| 2026-03-25 | master | (docs) | ~87%: B3-04 — `preview-and-sandbox-flow.md` ephemeral vs stödtjänster + `agent-workflows` länk |
| 2026-03-25 | master | (docs) | ~86%: B3-01/B3-03/B3-07/B3-08 — `agent-workflows.md`, terminology cheat sheet, Vercel skill routing |
| 2026-03-25 | master | typecheck + vitest (359) | ~85%: **Elasticsearch** registry + detection + env-policy + Vitest |
| 2026-03-26 | master | typecheck + vitest (358) | Handoff / sweep: grönt träd; ingen pending diff; nästa → CONTINUATION + workloads + progress § Återstår |
| 2026-03-26 | master | typecheck + vitest (358) | ~84%: **Typesense** registry + detection + env-policy + Vitest |
| 2026-03-26 | master | typecheck + vitest (357) | ~84%: **Meilisearch** registry + detection + env-policy + Vitest |
| 2026-03-26 | master | typecheck + vitest (356) | ~84%: **Algolia** registry + detection + env-policy + Vitest |
| 2026-03-26 | master | typecheck + vitest (355) | ~84%: `webscraper-url.test.ts` — validateAndNormalizeUrl, getCanonicalUrlKey |
| 2026-03-26 | master | typecheck + vitest (349) | ~84%: registry — Sanity, Contentful, Storyblok (`cms`), MongoDB + detection + env-policy + Vitest |
| 2026-03-25 | master | (docs) | ~83%: språkpolicy + arbetsyta/Git (`progress.md`); `workspace-hygiene.mdc` — repo root vs Cursor project path; pull vs push |
| 2026-03-25 | master | typecheck + vitest (348) | ~83%: svensk copy — `BuilderHeader` hjälp/inställningar, `MODEL_TIER_OPTIONS` i defaults, terminology + builder-model-routing-doc |
| 2026-03-25 | master | typecheck + vitest (348) | ~83%: **Mer**-meny (import, sandbox, ZIP); **Ny chat**; svenska modell-etiketter; OpenClaw Mer-yta |
| 2026-03-25 | master | (docs) | ~83%: dokumenterat **`origin/master`** som kanon för remediation; **`main`** kan vara efter — agenter ska `checkout master` + `pull` |
| 2026-03-25 | master | typecheck + vitest (348) | ~83%: builder — tips under Inställningar; TipCard slankare; Inställningar-menyn på svenska; OpenClaw `lansering` i surface-match |
| 2026-03-25 | master | typecheck + vitest (348) | ~83%: builder — bort duplicerad lanserings-badge i header; `deploy-readiness-copy`; kortare deploy/409-hintar; Lansering-kort utan extra “redo”-ruta |
| 2026-03-26 | master | typecheck + vitest (346) | ~83%: **Sentry** registry + detection; lansering-UI (spärrar, env-hint på Publicera); tips/OpenClaw copy; integration ~68% |
| 2026-03-26 | master | typecheck + vitest (345) | ~82%: W2 builder — **409 `DEPLOY_MISSING_ENV`** visar saknade nycklar + error-log; `deploy-precheck`, track-w2, workloads; integration-segment ~65% |
| 2026-03-26 | master | typecheck + vitest (345) | ~81%: W1 **`/om`** + **`/blogg`**, landnings-footer + sitemap; progress/tabell + track-w1 produkt `[x]`; docs-hub passus `743565d9` + log `5985898e` |
| 2026-03-25 | master | typecheck + vitest (345) | ~80%: config-dashboard **Cursor-agenter**; `eval-output/` för `run-eval`; W2 auto-fix **opt-out** (`skipAutoFix` / env); cipher-test timeout; progress/tabell |
| 2026-03-25 | master | typecheck + vitest (345) | ~79%: W1 — `ParticleOrb` in-view + reduced-motion fallback; `IntegrationCard`/modal float av vid reduce; whole ~79%, landing ~80% |
| 2026-03-25 | master | typecheck + vitest (345) | ~78%: progress-tabell — own-engine ~78% (W3 track komplett), scripts ~95%, whole ~78%; `run-eval` → `EGEN_MOTOR_V2/` dokumenterat |
| 2026-03-25 | master | typecheck + vitest (345) | ~76%: W2 deploy-preflight — `DEPLOY_MISSING_ENV` 409, `precheckOnly`, `deploy-precheck.md`; track W2 (auto-fix opt-in kvar) |
| 2026-03-25 | master | typecheck + vitest (345) | ~75%: W4 — bort `scripts/hamta_sidor.py`; lab `scripts/labs/testning_scarf/`; npm + `.gitignore`; docs/inventory/research/track |
| 2026-03-25 | master | typecheck + vitest (345) | ~72%: W4 slice — `hamta_sidor` wrapper, `--legacy-wide-use-cases`, docs; boundary-test cwd-guard; track W4 hamta + manuella `[x]` |
| 2026-03-25 | master | typecheck + vitest (345) | ~69%: W3 **exit** — `finalize-version` orphan-regression, `own-engine-v0-boundary.test.ts`, Fas A W3 `[x]`; `v0-soft-deprecation.md` boundary-notis |
| 2026-03-25 | master | typecheck + vitest (343) | ~66%: `generation-stream.golden.test.ts`; track W3 generation-SSE golden `[x]`; progress noterar parallell kritik-agent |
| 2026-03-25 | master | typecheck + vitest (342) | ~64%: `addAssistantMessageAndCreateDraftVersion`, `finalizeAndSaveVersion`, `finalize-version.test.ts`; track W3 transactional finalize + post-persist doc |
| 2026-03-25 | master | typecheck + vitest + eslint (plan-mode + routes) | ~61%: `own-engine-plan-mode.ts`, båda chat-stream-routes, `own-engine-plan-mode.test.ts`; progress/track uppdaterade |
| 2026-03-25 | master | typecheck + vitest + eslint (ändrade filer) | ~56% batch: `createOwnEnginePipelineAndGenerationStream`, lab README + inventory, `CONTINUATION.md` |
| 2026-03-25 | master | typecheck + vitest (341 tests) | Orchestrator: W3 `buildPreGenerationContractGateParams` + routes; W4 hamta-kanon + doc-path (parallell våg A1) |
| 2026-03-25 | master | typecheck + vitest | W4: kanon `hamta_sidor_branch_emil.py` + doc-path-städ (`scripts/README`, inventory, discovery, handoff) |
| 2026-03-25 | master | typecheck + vitest | W3: `buildOwnEngineGenerationStreamMeta` (se progress-doc) |

*Nya rader läggs överst av orchestrator eller avslutande worker efter `npm run typecheck && npx vitest run`.*

---

## Agent som får detta som uppdrag

Kopiera minimalt:

```
Läs docs/plans/active/external-review-execution/README.md, CONTINUATION.md och MASTER-ROADMAP.md.
Arbeta enligt docs/plans/active/external-review-execution/<track-fil>.md — bocka av [x] för det du levererar; fortsätt utan ny ping per ruta tills halt i CONTINUATION.md.
Kör npm run typecheck && npx vitest run. Uppdatera external-review-remediation-progress.md om % ändras; sikta ~4–5 Whole vision per commit när det går. Commit + push enligt rutinen där.
```

Byt ut `<track-fil>` mot t.ex. `track-w3-own-engine.md` eller `track-w4-scripts.md`.
