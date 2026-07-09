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
| R1 | Auth: extrahera delad `parseAuthCookie` + en `isAdminEmail`-källa (dubblerad mellan `auth.ts` Node och `edge-auth.ts` Edge) | medveten paus — `edge-auth.ts` måste förbli Edge-säker (Web Crypto), får ej slås ihop rakt av; se `../avklarat/2026-07-07-repo-cleanup.md` |

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

Öppna cherry-picks från **stängda PR #175** (`collab/chgenberg`, plan arkiverad):

- **P1 — next/font weight-fix** (litet, testtäckt, fristående): injicera obligatorisk `weight` för icke-variabla `next/font` som saknar den. Finns overifierat på commit `e933d2fe9` (ej i master); `src/lib/gen/autofix/rules/font-import-fixer.ts(+test)` + `src/lib/gen/data/google-font-registry.ts`. → egen liten PR mot dagens master.
- **P2 — uppladdade bilder i materializern** (medel): låt finalize mata `![alt](url)` ur originalprompten till image-materializern i st.f. Unsplash. `fast-path.ts` kan ha drivit isär; **källcommit ej lokaliserad — hitta/verifiera branch först**.

Större studio-port-arkitekturbeslut (§4/§6, P3–P8) bevarat i planen → [`../archived/pr-175-split-plan.md`](../archived/pr-175-split-plan.md).

Parkerad merge-fordon → split per kluster: PR #355 bug-swarm-batch (26 fynd) bryts ut i små PR:ar (batch A #391, B #393, C #395 mergade; kvar: preview/readiness, pipeline, scaffolds, domains/engine-rester). Plan arkiverad (PR #355 stängd) → [`../archived/pr-355-parked-bug-swarm-split.md`](../archived/pr-355-parked-bug-swarm-split.md).

Dossier legacy-import 2026-07-08 (levererat: normalizer + backoffice-flik mergade i #419, 12 utkast accept, 7 promoterade i två vågor #422/#430/#445; kvar: 5 promotions + preview-test/`lastVerified` för de 7 + F2-synlighet) → [`2026-07-08-dossier-legacy-import.md`](2026-07-08-dossier-legacy-import.md).

OpenClaw edit-agent 2026-07-01 (2 av 3 spår levererade: mallar→Blob #336 mergad, follow-up-imported-repo-fix i koden; kvar: spår A = PR #346, draft, `[HOLD - MERGA INTE]`) → [`2026-07-01-openclaw-edit-agent-och-followup-fix.md`](2026-07-01-openclaw-edit-agent-och-followup-fix.md).

Backoffice-stringensplan 2026-07-08 (underlag klart: 34 sidor granskade, 2 triviala sanningsfel redan rättade i samma pass; resten väntar på prioritering — domain-map-täckning, dubbla manifest-editorer, scaffold-navigation, testluckor) → [`2026-07-08-backoffice-stringens-plan.md`](2026-07-08-backoffice-stringens-plan.md).

Levererat (2026-07-09, PR #456): Publicera-stringensplan — publicera/deploy + F3-integrationer stringentare (ReleaseGate-lås, domänlås, deploy-repair-loop, inspectorUrl/felstate, RAG-härdning, terminologi) + kompletteringspass A#12/A#5/A#3. Kvar: bug-backlog `BB#deploy2–5` (i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md)) → [`../avklarat/2026-07-08-publicera-stringens-plan.md`](../avklarat/2026-07-08-publicera-stringens-plan.md).

Levererat (kod): #4 distribuerat per-version-lås (`engine_version_jobs`) för server-verify/repair via **#256** (2026-06-27) + base-bound repair-save/accept via **#265** (2026-06-28, stänger #260 P2 #5) + #260 **P2 #4** (quality-gate höll leasen över verify-budgeten) löst via **#276** och härdat via **#284** (verify-timeout härleds nu från route-budgeten med marginal). #260 är därmed helt stängd i koden. **Enda kvarvarande punkten är ägarens manuella prod-migration av `engine_version_jobs`** (runbook i plan-doc) → [`../avklarat/2026-06-27-server-verify-distributed-lock.md`](../avklarat/2026-06-27-server-verify-distributed-lock.md).

Levererat (2026-06-25, PR #241 + Fly/Vercel-deploy): preview-surface-stabilitet + iframe-fokus (F2) — iframe-tangentbordsfokus, preview-host reset-recovery, HMR-no-storm under reboot, Next stdout/stderr i runtime-logg → [`../avklarat/2026-06-25-preview-surface-stability-och-iframe-fokus.md`](../avklarat/2026-06-25-preview-surface-stability-och-iframe-fokus.md).

Levererat (repo-cleanup 2026-07-07, arkiverad 2026-07-08): 4 bevisat-döda ytor raderade + C1–C3 ägarbeslut alla byggda klart (verifierat kod-för-kod). Enda kvarvarande punkten (R1) ligger nu i hygien-backloggen ovan → [`../avklarat/2026-07-07-repo-cleanup.md`](../avklarat/2026-07-07-repo-cleanup.md).
