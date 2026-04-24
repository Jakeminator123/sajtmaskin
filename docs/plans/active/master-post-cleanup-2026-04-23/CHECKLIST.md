# Checklista — master-post-cleanup-2026-04-23

Status: 2026-04-24 (uppdaterad efter wave 5 plan-10 + plan-11 merge)

## Wave 0 — Koordinator (denna chatt)
- [x] Plan 00 — head-lock + full/short/skip-tabell · STATUS-00 finns
- [x] Plan 01 — manuell rollout + smoke-baseline · STATUS-01 finns (3 runs alla promotade)

## Wave 1
- [x] Plan 02 — F2/F3 runtime truth + version modal · merged (PR #88)
- [x] Plan 04 — fixer-surface inventory · merged + STATUS-04-AUDIT

## Wave 2
- [x] Plan 03 — followup_technical reason + verifier truth · merged (PR #90)
- [x] Plan 05 — single fixer entrypoint + lane-tag · merged (PR #89)

## Wave 3
- [x] Plan 06 — Deep Brief delta + capability-classifier · merged (PR #92)
- [x] Plan 07 — 3D capability-injection + three-fiber hardening · merged (PR #91)

## Wave 4
- [x] Plan 08 — core simplification (orchestrate.ts + route-plan.ts) · merged (PR #94)
- [x] Plan 09 — legacy-ripout + backoffice-drift + config pruning · merged (direct)

## Wave 5
- [x] Plan 10 — latency budgets + observatorie-routing-fixar · merged (PR #96)
- [x] Plan 11 — scaffold-required-files-check + variant-lock + capability-modify-existing · merged (PR #97)
- [ ] Plan 12 — PromptKit / slug-bounce / #15 dossier-env-resolver · väntar

## Mellanrunda — investigation + hot-fixes
- [x] Investigation — page.tsx-loss root-cause · merged (PR #95)
- [x] HMR pg.Pool-fix — globalThis-cache i db/client.ts · committat
- [x] ThinkingOverlay v3 — inline rad utanför MessageList-container · committat
- [x] AJV `format: "uri"`-warning · silenced via `addFormat` · committat
- [x] STATUS-09-CANDIDATES (legacy-rester per tier) · committat
- [x] STATUS-10-CANDIDATES (latency + observatorie-läckage) · committat
- [x] STATUS-DOSSIER-CONFUSION-AUDIT · committat
- [x] STATUS-BACKOFFICE-DRIFT · committat
- [x] STATUS-INVESTIGATE-PAGETSX-LOSS · committat
- [x] open-questions.md · 17 frågor, 8 resolved, 9 aktiva

## Verifierat i UI
- [x] Plan 02: modal-truth — 3 av 3 init-runs grön/ärlig
- [x] Plan 03: reason-mapping fungerar
- [x] Plan 05: lane-tag på FixEntry syns i fixer_registry-page
- [x] Plan 06: capability-classifier — `Capabilities: Motion, 3D, Physics` på 3D-prompt
- [x] Plan 07: dossier-injection — three-canvas-shell.tsx + floating-coffee-overlay.tsx + three-deps i package.json
- [x] Plan 09: backoffice — fixer_registry visar nya lane-färger

## Återstående bugs (tracked i open-questions.md)
- ❌ #15 Hard-dossier env-vars false-promptas (HIGH severity, blockerar F3) → **plan 12 eller manual fix**
- ❌ #14 Slug-route bouncer hem (LLM-redirect-bug) → plan 12 PromptKit-regel
- 🚀 #16 game/interactive capability-tier (KRAFTIG FÖRBÄTTRING, ny capability) → ny plan post-wave-5
- 💡 #17 Inline integrations-onboarding (UX-feature) → ny plan post-wave-5
- ❓ #2 Blitz/browser-side preview (long-term) → post-wave-5 spike
- ❓ #7 THREE Context Lost (cosmetic, IDE-noise sannolikt)
- ❓ #9 CSP iframe empty src (UI-cleanup)
- ❓ #11 Inspector scroll-lock (UI-cleanup)
- 💡 #13 Promoted → Fidelity rename (UI-rename, post-wave-5)

## Granskning klar
- [x] Lokal = origin (allt pushat)
- [x] `npm run typecheck` 0 errors efter wave 5
- [x] 7 wave-5-relaterade test-filer: **106 tester passerade**
- [x] Plan-10/11 fixar verifierade i kod (grep mot specifika identifierare)

## Pågående osäkerhet
- backoffice/Streamlit kan behöva mindre uppdateringar för plan-10:s `autoRepairCount` + `followupCount`-split (om någon page läser `history.ndjson` direkt)
- `pipeline_health.py` läser INTE history.ndjson i nuvarande implementation (per plan-10 STATUS-10), så troligen ingen åtgärd behövs
