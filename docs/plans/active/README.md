# Aktiva planer — router

**Denna fil är router, inte arkiv.** En aktiv drivlinje + kort index till parkerade spår och öppna P1/P2. Detaljer bor i [`../archived/`](../archived/) (vilande/skrotat), [`../avklarat/`](../avklarat/) (mergat) och [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) (buggsanning). Git-historiken bevarar allt — länka, duplicera inte.

Lifecycle-kontrakt: [`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).

---

## Stabilisering 2026-07 + Kontrollflöde-konsolidering — kod levererad, arkiverade 2026-07-07

Båda initiativens **kod är levererad och mergad** (stabilisering Våg 1–4 #374–#383; kontrollflöde alla 7 faser #360–#367). Enda kvarvarande punkten är den delade prod-mätavstämningen (~2026-07-10) + beslutsunderlag (P34 lint C–E, postcheck advisory→hard, partial-file-utfasning, verifier-frekvens). Planerna flyttades till `avklarat/` på ägarens begäran 2026-07-07 (mätningen görs mot de arkiverade planerna):

- [`../avklarat/stabilisering-2026-07/00-master-plan.md`](../avklarat/stabilisering-2026-07/00-master-plan.md)
- [`../avklarat/kontrollflode/00-master-plan.md`](../avklarat/kontrollflode/00-master-plan.md) — underlag (f.d. `kontrollflödesmapp/`) i [`../avklarat/kontrollflode/underlag/`](../avklarat/kontrollflode/underlag/).

## Status: Grandmaster-plan AVKLARAD (arkiverad 2026-06-22)

Stabiliserings-/kontrakts-/städplanen (8 områden nivå 1–3 + bug-swarm-drive) är **levererad och arkiverad** → [`../avklarat/grandmaster/`](../avklarat/grandmaster/) (master-plan, områdesdokument, aktiviteter, `_backlog-deferrad.md`). Closing-handoff + loggbok: git-historik. Tag/backup: `MILSTOLPE-2026-06-21-grandmaster-stabil`.

Repo-tvätt-historik: [`../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md`](../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md).

## Kvarvarande efter grandmaster (live backlog)

**Ägarbeslut (dina — systemet funkar som det är, inte buggar):**

| Post | Vad | Läge |
|---|---|---|
| B05 / A7-2 | `refuseDossierStubs` kod-default OFF (env redan ON i Vercel) | ditt beslut |
| B07 | publik vs privat media-GET | du valde öppet; säkerhet = eget pass |
| B08 | quality-gate fail-open | du valde släpp-igenom; felet loggas redan |

**Arkitektur-/hygien-backlog (egna scope:ade pass):**

| Post | Vad | Allvar |
|---|---|---|
| B3 / E2 | durable event-bus (in-memory/efemär → multi-instans serverless) | **enda korrekthetsrisken** |
| B1 | S3 false-green-lane warn-only → blockerande `test:ci` | lane-arkitekturbeslut |
| B4 | canvas auto-PR `CANVAS_PR_TOKEN` (ingen CI på `chore/llm-flow-canvas`) | secret-beslut |
| F4 / F5 | odefinierade bus-emits · manifest `perTier*` ej i Zod | detalj |

Detalj: [`../avklarat/grandmaster/_backlog-deferrad.md`](../avklarat/grandmaster/_backlog-deferrad.md).

**Bugg-backlog (orchestrator äger nu — parallell bugg-agent avslutad 2026-06-22):**

- Grandmaster-svärm **B01–B15**: 10 fixade (#181–#187), 3 ägarbeslut (B05/B07/B08), B12/B13/B01-klient = edge → [`../avklarat/bug-swarm/README.md`](../avklarat/bug-swarm/README.md).
- **Enda buggsanningen** (rot, load-bearing — preflight + canvas läser `## Aktiv kö`): [`../../../BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md). Slimmad 2026-06-24 till **Aktiv kö** (verkliga öppna defekter), **Behöver repro** och **Beslut & policy** (medvetna val, ej buggar). Avslutad/historik utflyttad till [`../avklarat/bug-swarm/backlog-arkiv-2026-06-24.md`](../avklarat/bug-swarm/backlog-arkiv-2026-06-24.md).

> Öppna P1/P2 listas **inte** här längre — det blev en parallell sanning som driftade. Full och enda sanning: `BUG-SWARM-BACKLOG.md § Aktiv kö`.

---

## Parkerade/historiska spår (index → [`../archived/`](../archived/))

| ID | Spår (nästa steg) | Källa |
|---|---|---|
| O | LLM-masterplan startlinje (init/follow-up-konsistens, latency, prompt-kvalitet) — superseded | [`../../architecture/README.md`](../../architecture/README.md) + [`llm-pipeline.md`](../../architecture/llm-pipeline.md) |
| R | Builder follow-up/preview-incident (kvar: E UX-copy + e2e) | [`2026-05-02-builder-followup-preview-incident.md`](../archived/2026-05-02-builder-followup-preview-incident.md) |
| P | Prompt-slim (Core Rules <35k, follow-up <45k) | [`prompt-slim-systemprompt.md`](../archived/prompt-slim-systemprompt.md) |
| A | P34 blocking lint (Fas C–E) | [`P34-blocking-lint-in-validate-and-fix.md`](../archived/P34-blocking-lint-in-validate-and-fix.md) |
| B | Dossier doc-rewrite (D3/D5/D7) | [`cloudagent-paket-A-doc-rewrite.md`](../archived/cloudagent-paket-A-doc-rewrite.md) |
| Q | F2/F3 UX-copy | [`2026-05-01-f2-f3-ux-copy-konsolidering.md`](../archived/2026-05-01-f2-f3-ux-copy-konsolidering.md) |
| L | Kräver-dialog (DB/Redis observability, 7 ägarbeslut) | [`KRAVER-DIALOG-2026-04-24.md`](../archived/KRAVER-DIALOG-2026-04-24.md) |
| M | Öppna scaffold-trådar (SAJ-37/42/44/55/57) | [`OPEN-THREADS-SCAFFOLDS-2026-04-24.md`](../archived/OPEN-THREADS-SCAFFOLDS-2026-04-24.md) |
| N | Follow-up vs auto-repair lane-kollision | [`2026-04-27-followup-vs-autorepair-lane-collision.md`](../archived/2026-04-27-followup-vs-autorepair-lane-collision.md) |
| T | LLM-tools för builder (Wave 1 scope) | [`llm-tools-builder-spar.md`](../archived/llm-tools-builder-spar.md) |
| parked | L1/L2/L3, P32, pixelkällaren | [`../archived/parked/`](../archived/parked/) |

Längre horisont (ej P1/P2): core-split v2, WebContainers-migration, ÅÄÖ pre-commit. Detaljer: [`../archived/Kvarvarande-uppgifter.md`](../archived/Kvarvarande-uppgifter.md).

Beslutsunderlag (scope, ej startat): inspector/"Inspektera preview" rendering-arkitektur — render-worker vs instrumenterad preview → [`2026-06-19-inspector-rendering-arkitektur.md`](2026-06-19-inspector-rendering-arkitektur.md).

Beslutsunderlag (scope, ej startat): PR #175 (`collab/chgenberg`) — dela upp/ersätt/stäng monster-PR:n (marketing-sajt + `src/viewser/**`-studio + BFF + motor-fixar) → [`pr-175-split-plan.md`](pr-175-split-plan.md).

Parkerad merge-fordon → split per kluster: PR #355 bug-swarm-batch (26 fynd) bryts ut i små PR:ar (batch A #391, B #393, C #395 mergade; kvar: preview/readiness, pipeline, scaffolds, domains/engine-rester) → [`pr-355-parked-bug-swarm-split.md`](pr-355-parked-bug-swarm-split.md).

Repo-cleanup 2026-07-07 (levererat: 4 bevisat-döda ytor raderade; kvar: 3 ägarbeslut C1–C3 + auth-refaktor R1) → [`2026-07-07-repo-cleanup.md`](2026-07-07-repo-cleanup.md).

Dossier legacy-import 2026-07-08 (levererat: normalizer + backoffice-flik mergade i #419, 12 utkast accept; kvar: kuraterad promotion + capability-wiring + F2-synlighet + nya soft-dossiers) → [`2026-07-08-dossier-legacy-import.md`](2026-07-08-dossier-legacy-import.md).

Levererat (kod): #4 distribuerat per-version-lås (`engine_version_jobs`) för server-verify/repair via **#256** (2026-06-27) + base-bound repair-save/accept via **#265** (2026-06-28, stänger #260 P2 #5) + #260 **P2 #4** (quality-gate höll leasen över verify-budgeten) löst via **#276** och härdat via **#284** (verify-timeout härleds nu från route-budgeten med marginal). #260 är därmed helt stängd i koden. **Enda kvarvarande punkten är ägarens manuella prod-migration av `engine_version_jobs`** (runbook i plan-doc) → [`../avklarat/2026-06-27-server-verify-distributed-lock.md`](../avklarat/2026-06-27-server-verify-distributed-lock.md).

Levererat (2026-06-25, PR #241 + Fly/Vercel-deploy): preview-surface-stabilitet + iframe-fokus (F2) — iframe-tangentbordsfokus, preview-host reset-recovery, HMR-no-storm under reboot, Next stdout/stderr i runtime-logg → [`../avklarat/2026-06-25-preview-surface-stability-och-iframe-fokus.md`](../avklarat/2026-06-25-preview-surface-stability-och-iframe-fokus.md).
