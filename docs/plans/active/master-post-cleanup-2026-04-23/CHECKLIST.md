# Checklista — master-post-cleanup-2026-04-23

Status: 2026-04-24 (uppdaterad löpande)

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
- [ ] Plan 10 — latency budgets + observatorie-routing-fixar · agent kör
- [ ] Plan 11 — scaffold-required-files-check + variant-lock + capability-modify-existing · agent kör
- [ ] Plan 12 — PromptKit canonical composer · väntar på 11

## Mellanrunda — investigation + hot-fixes
- [x] Investigation — page.tsx-loss root-cause · merged (PR #95)
- [x] HMR pg.Pool-fix — globalThis-cache i db/client.ts · committat
- [x] ThinkingOverlay v3 — inline rad utanför MessageList-container · committat
- [x] AJV `format: "uri"`-warning · silenced via `addFormat` · committat
- [x] STATUS-09-CANDIDATES (legacy-rester per tier) · committat
- [x] STATUS-10-CANDIDATES (latency + observatorie-läckage) · committat
- [x] STATUS-DOSSIER-CONFUSION-AUDIT · committat
- [x] STATUS-BACKOFFICE-DRIFT · committat
- [x] open-questions.md · 13 frågor, 5 resolved, 1 borttagen, 7 aktiva

## Verifierat i UI
- [x] Plan 02: modal-truth — 3 av 3 init-runs grön/ärlig
- [x] Plan 03: reason-mapping fungerar
- [x] Plan 05: lane-tag på FixEntry syns i fixer_registry-page
- [x] Plan 06: capability-classifier — `Capabilities: Motion, 3D, Physics` på 3D-prompt
- [x] Plan 07: dossier-injection — three-canvas-shell.tsx + floating-coffee-overlay.tsx + three-deps i package.json
- [x] Plan 09: backoffice — fixer_registry visar nya lane-färger

## Kvarstående bugs (tracked i open-questions.md)
- #2 Blitz/browser-side preview (long-term, post-wave-5)
- #4 Observatorie-routing-läckage (plan 10 fixar)
- #5 page.tsx-loss (plan 11 fixar)
- #7 THREE Context Lost (cosmetic, IDE-noise sannolikt)
- #8 scaffoldVariant ej lockad (plan 11 fixar)
- #9 CSP iframe empty src (UI-cleanup, post-wave-5)
- #11 Inspector scroll-lock (UI-cleanup, post-wave-5)
- #12 Follow-up modify-existing (plan 11 fixar)
- #13 Promoted → Fidelity rename (UI-rename, post-wave-5)
