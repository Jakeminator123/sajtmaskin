# Aktiva planer — router

**Denna fil är router, inte arkiv.** En aktiv drivlinje + kort index till parkerade spår och öppna P1/P2. Detaljer bor i [`../archived/`](../archived/) (vilande/skrotat), [`../avklarat/`](../avklarat/) (mergat) och [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) (buggsanning). Git-historiken bevarar allt — länka, duplicera inte.

Lifecycle-kontrakt: [`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).

---

## Status: Grandmaster-plan AVKLARAD (arkiverad 2026-06-22)

Stabiliserings-/kontrakts-/städplanen (8 områden nivå 1–3 + bug-swarm-drive) är **levererad och arkiverad** → [`../avklarat/grandmaster/`](../avklarat/grandmaster/) (master-plan, områdesdokument, aktiviteter, `_loggbok.md`, `_backlog-deferrad.md`). Closing-handoff: [`../../handoffs/2026-06-21-grandmaster-closing-handoff.md`](../../handoffs/2026-06-21-grandmaster-closing-handoff.md). Tag/backup: `MILSTOLPE-2026-06-21-grandmaster-stabil`.

**Ingen aktiv drivlinje just nu.** Nästa fas = pivot "härda → bygga" mot [`../../architecture/llm-flow-target-worldclass.md`](../../architecture/llm-flow-target-worldclass.md). Repo-tvätt-historik: [`../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md`](../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md).

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
| O | LLM-masterplan startlinje (init/follow-up-konsistens, latency, prompt-kvalitet) — superseded | [`../../architecture/llm-flow-target-worldclass.md`](../../architecture/llm-flow-target-worldclass.md) + [`llm-pipeline.md`](../../architecture/llm-pipeline.md) |
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
