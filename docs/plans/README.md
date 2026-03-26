# Plans

Lifecycle buckets: **`active/`** (steer now) · **`review-needed/`** (verify before reuse) · **`avklarat/`** (avklarade planer; motsvarar tidigare *archived*).  
Workflow and routing rules: **`docs/architecture/documentation-lifecycle.md`**.  
Undermappar (`active/`, `review-needed/`, `avklarat/`) har en kort `README.md` som pekar tillbaka hit.

## Current status map

Last tightened `2026-03-26` (`active/SAJTMASKIN-EXECUTION-PLAN.md` — primär körplan; `MASTER-ALLT-KVAR.md` — djup referens; handoff-historik i `avklarat/2026-03-handoff-doc-bundle/`).

`active`

- `active/external-review-remediation-progress.md` — **sanning** för externreview-remediation: helhets-% per segment, “Last code touch”, commit-/push-rutin, Done / Next.
- `active/REMAINING-WORK.md` — hubb efter remediation-exit (länkar till execution plan + arkiverad handoff-bundle).
- `active/SAJTMASKIN-EXECUTION-PLAN.md` — **primär** översikt: K-spår, ordning, länkar till detaljplaner.
- `avklarat/2026-03-handoff-doc-bundle/` — arkiverade handoff-/kö-dokument (AGENT-HANDOFF, NASTA-AGENT-PROMPT, BESLUT, COMPLETION-ROADMAP, BACKLOG-dashboard, orchestrator-mall); uppdatera inte som sanning.
- `active/DOKUMENTATION-ANDRINGAR-SAMMANFATTNING.md` — ungefärlig doc-/plan-historik (git är sanning).
- `active/MASTER-ALLT-KVAR.md` — **operativ kö (allt-i-ett)**: K-018, K-019 (fidelity / promptkedja), kritik, Plan 17-öppet, drift, orchestrator-råd; § 0 = produktintent från `.j_to_agent/fidelity.txt`.
- `active/queue/KORFIL.md` — **pekare** till `MASTER-ALLT-KVAR.md`; valfria `queue/PLAN-*.md` som detalj.
- `avklarat/2026-03-handoff-doc-bundle/BESLUT-INNAN-VI-GAR-VIDARE.md` — **historik:** produkt-/arkitekturfrågor Fas A (besvarad 2026-03-26); sanning om öppet arbete = kritik-tabell + execution plan.
- `active/orchestrator-workloads-external-review.md` — **stub**; full W1–W5-snapshot: `avklarat/orchestrator-workloads-external-review.md`.
- `avklarat/2026-03-handoff-doc-bundle/orchestrator-handoff-sequential-stramning.md` — **arkiverad** kopieringsmall för `/orchestrator`-körning; **läs progress-filen ovan** för aktuella siffror (mallen innehåller inte färska %).
- `active/external-review-execution/README.md` — **stub** → `avklarat/external-review-execution/` (execution-spår arkiverat).
- `active/17-repo-separation-and-independence.md` — repo separation / independence:
  **WS-1–WS-4 largely delivered** (v0 fallback removed from builder paths, Blob
  `StorageProvider`, direct OpenAI/Anthropic for former gateway routes). **WS-6
  closed 2026-03-26** (product decisions). **Still open:** WS-5, deferred WS-2/WS-4
  (v0, gateway env / `ENV.md`).
  Treat this file as **roadmap + audit trail**, not day-to-day architecture (use
  `docs/architecture/engine-status.md` for “how it works now”; see plan file § «Hur du ska läsa»).

`review-needed`

- None currently.

`avklarat` (avklarade planer)

- `avklarat/01-design-system-registry.md` — **COMPLETED 2026-03-03**
- `avklarat/02-custom-domain-self-service.md` — **COMPLETED 2026-03-03**
- `avklarat/03-v0-env-vars-proper-sdk.md` — **COMPLETED 2026-03-03**
- `avklarat/04-deploy-sse-webhooks.md` — **COMPLETED 2026-03-03**
- `avklarat/05-template-search-ui.md` — **COMPLETED 2026-03-03**
- `avklarat/07-world-class-builder-phase-1-trust-launch.md` — completed
- `avklarat/08-world-class-builder-phase-2-site-planning.md` — completed
- `avklarat/11-next-vercel-build-plan-core-config.md` — completed
- `avklarat/12-next-vercel-build-plan-server-routes.md` — completed
- `avklarat/13-next-vercel-build-plan-ui-performance.md` — completed
- `avklarat/14-critical-runtime-fixes.md` — **COMPLETED 2026-03-17**
- `avklarat/15-builder-robustness.md` — **COMPLETED 2026-03-17**
- `avklarat/09-world-class-builder-phase-3-smb-growth.md` — **COMPLETED 2026-03-18**
- `avklarat/10-world-class-builder-phase-4-learning-moat.md` — **LEVERERAT 2026-03-18** (production validation remaining)
- `avklarat/06-world-class-builder-roadmap.md` — **COMPLETED 2026-03-18** (all 4 phases done)
- `avklarat/16-provider-adapter-architecture.md` — **COMPLETED 2026-03-17**
- `avklarat/2026-03-bug-recheck-sweep.md` — completed
- `avklarat/2026-03-openclaw-rollout-roadmap.md` — completed
- `avklarat/orchestrator-run-2026-03-26-external-review.md` — avslutad orchestrator-körning (extern review); sammanfattning
- `avklarat/orchestrator-followup-from-39fef25e.md` — commit-uppföljning second opinion (arkiverad 2026-03-28); punkt-i-tid
- `avklarat/orchestrator-workloads-external-review.md` — W1–W5 workload-text (snapshot 2026-03-28); remediation execution sedan avslutad
- `avklarat/external-review-execution/` — external-review execution (README, REMEDIATION-EXIT, MASTER-ROADMAP, CONTINUATION, tracks W1–W4, buglista del 3); flyttat från `active/` 2026-03-25
- `avklarat/own-engine-ai-stack-audit-2026-03-18.md` — audit artifact (moved from review-needed)
- `avklarat/world-class-commit-selection-report.md` — recovery artifact
- `avklarat/world-class-branch-map-2026-03-13-to-now.md` — recovery artifact
- `avklarat/2026-03-plan17-ws6-product-decisions.md` — Plan 17 WS-6 (D-ID, OpenClaw, Brave, Loopia); beslut **klara 2026-03-26**; kanon i `active/17-repo-separation-and-independence.md` § WS-6
- `avklarat/2026-03-k019-orchestration-snapshot-phase1.md` — K-019 **fas 1** (DB `orchestration_snapshot`, sanering, follow-up prepend); **K-019** fortfarande öppen i kritik tills merge/UI stängt
- `avklarat/2026-03-handoff-doc-bundle/` — arkiverade handoff-/kö-dokument (ersatta av `active/SAJTMASKIN-EXECUTION-PLAN.md` + kritik som sanning)

Plans 14-16 originated from the external deep-research audit
(`docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-deep-research-buggar-overlapp.md`).

These are planning artifacts, not runtime documentation. New plan files should
be created in `docs/plans/active/`, not in this root folder.

