# Plans

Lifecycle buckets: **`active/`** (steer now) · **`review-needed/`** (verify before reuse) · **`archived/`** (traceability only).  
Workflow and routing rules: **`docs/architecture/documentation-lifecycle.md`**.  
Subfolders (`active/`, `review-needed/`, `archived/`) keep a one-line `README.md` pointing back here.

## Current status map

Last tightened `2026-03-25` (`active/MASTER-ALLT-KVAR.md` — all post-exit backlog i en fil; `queue/KORFIL.md` pekar hit).

`active`

- `active/external-review-remediation-progress.md` — **sanning** för externreview-remediation: helhets-% per segment, “Last code touch”, commit-/push-rutin, Done / Next.
- `active/REMAINING-WORK.md` — hubb efter remediation-exit.
- `active/MASTER-ALLT-KVAR.md` — **operativ kö (allt-i-ett)**: K-018, K-019 (fidelity / promptkedja), kritik, Plan 17-öppet, drift, orchestrator-råd; § 0 = produktintent från `.j_to_agent/fidelity.txt`.
- `active/queue/KORFIL.md` — **pekare** till `MASTER-ALLT-KVAR.md`; valfria `queue/PLAN-*.md` som detalj.
- `active/queue/BESLUT-INNAN-VI-GAR-VIDARE.md` — **produkt-/arkitekturfrågor** som bör besvaras (eller deferred med motivering) innan nästa större fas; kopplad till `COMPLETION-ROADMAP.md` Fas A.
- `active/orchestrator-workloads-external-review.md` — **stub**; full W1–W5-snapshot: `archived/orchestrator-workloads-external-review.md`.
- `active/orchestrator-handoff-sequential-stramning.md` — kopieringsmall för `/orchestrator`-körning; **läs progress-filen ovan** för aktuella siffror (mallen innehåller inte färska %).
- `active/external-review-execution/README.md` — **stub** → `archived/external-review-execution/` (execution-spår arkiverat).
- `active/17-repo-separation-and-independence.md` — repo separation / independence:
  **WS-1–WS-4 largely delivered** (v0 fallback removed from builder paths, Blob
  `StorageProvider`, direct OpenAI/Anthropic for former gateway routes). **Still
  open:** WS-5/WS-6, deferred env/docs cleanup (`AI_GATEWAY_*` references, `ENV.md`).
  Treat this file as **roadmap + audit trail**, not day-to-day architecture (use
  `docs/architecture/engine-status.md` for “how it works now”).

`review-needed`

- None currently.

`archived`

- `archived/01-design-system-registry.md` — **COMPLETED 2026-03-03**
- `archived/02-custom-domain-self-service.md` — **COMPLETED 2026-03-03**
- `archived/03-v0-env-vars-proper-sdk.md` — **COMPLETED 2026-03-03**
- `archived/04-deploy-sse-webhooks.md` — **COMPLETED 2026-03-03**
- `archived/05-template-search-ui.md` — **COMPLETED 2026-03-03**
- `archived/07-world-class-builder-phase-1-trust-launch.md` — completed
- `archived/08-world-class-builder-phase-2-site-planning.md` — completed
- `archived/11-next-vercel-build-plan-core-config.md` — completed
- `archived/12-next-vercel-build-plan-server-routes.md` — completed
- `archived/13-next-vercel-build-plan-ui-performance.md` — completed
- `archived/14-critical-runtime-fixes.md` — **COMPLETED 2026-03-17**
- `archived/15-builder-robustness.md` — **COMPLETED 2026-03-17**
- `archived/09-world-class-builder-phase-3-smb-growth.md` — **COMPLETED 2026-03-18**
- `archived/10-world-class-builder-phase-4-learning-moat.md` — **LEVERERAT 2026-03-18** (production validation remaining)
- `archived/06-world-class-builder-roadmap.md` — **COMPLETED 2026-03-18** (all 4 phases done)
- `archived/16-provider-adapter-architecture.md` — **COMPLETED 2026-03-17**
- `archived/2026-03-bug-recheck-sweep.md` — completed
- `archived/2026-03-openclaw-rollout-roadmap.md` — completed
- `archived/orchestrator-run-2026-03-26-external-review.md` — avslutad orchestrator-körning (extern review); sammanfattning
- `archived/orchestrator-followup-from-39fef25e.md` — commit-uppföljning second opinion (arkiverad 2026-03-28); punkt-i-tid
- `archived/orchestrator-workloads-external-review.md` — W1–W5 workload-text (snapshot 2026-03-28); remediation execution sedan avslutad
- `archived/external-review-execution/` — external-review execution (README, REMEDIATION-EXIT, MASTER-ROADMAP, CONTINUATION, tracks W1–W4, buglista del 3); flyttat från `active/` 2026-03-25
- `archived/own-engine-ai-stack-audit-2026-03-18.md` — audit artifact (moved from review-needed)
- `archived/world-class-commit-selection-report.md` — recovery artifact
- `archived/world-class-branch-map-2026-03-13-to-now.md` — recovery artifact
- `archived/2026-03-plan17-ws6-product-decisions.md` — Plan 17 WS-6 (D-ID, OpenClaw, Brave, Loopia); beslut **klara 2026-03-26**; kanon i `active/17-repo-separation-and-independence.md` § WS-6
- `archived/2026-03-k019-orchestration-snapshot-phase1.md` — K-019 **fas 1** (DB `orchestration_snapshot`, sanering, follow-up prepend); **K-019** fortfarande öppen i kritik tills merge/UI stängt

Plans 14-16 originated from the external deep-research audit
(`docs/old/analyses/2026-03-deep-research-buggar-overlapp.md`).

These are planning artifacts, not runtime documentation. New plan files should
be created in `docs/plans/active/`, not in this root folder.
