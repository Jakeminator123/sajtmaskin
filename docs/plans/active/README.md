# Aktiva planer — router

**Denna fil är router, inte arkiv.** En aktiv drivlinje + kort index till parkerade spår och öppna P1/P2. Detaljer bor i [`../archived/`](../archived/) (vilande/skrotat), [`../avklarat/`](../avklarat/) (mergat) och [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) (buggsanning). Git-historiken bevarar allt — länka, duplicera inte.

Lifecycle-kontrakt: [`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).

---

## Aktiv drivlinje: Grandmaster-plan (2026-06-18)

Konsoliderad körplan: **[`grandmaster/00-master-plan.md`](grandmaster/00-master-plan.md)** (nivå 1) + 8 områden (nivå 2) i samma mapp; nivå 3-aktiviteter skapas just-in-time. Slår ihop deep-research, cleanup-handoff och "Controlled Aggression" till en lättviktig stabilitets-/kontrakt-/städplan. Kontraktslager: [`docs/contracts/`](../../contracts/README.md).

**Körordning** (skiljer sig från områdesnumret): branch-hygien → stabilitetstester (omr 2) → dokumentation (omr 3) → kontrakt/regler (omr 1) → event-bus UI (omr 6) → FollowUpContract (omr 5) → false-green (omr 7). Städning (omr 8) löpande/gemensamt.

Repo-tvätt-initiativet är infällt som **område 1 (term-check light)**; full historik: [`../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md`](../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md).

---

## Öppna P1/P2 (koncentrat — full sanning i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md))

### P1
| Tema | Vad | Källa |
|---|---|---|
| F2 false-green | quality-gate fångar inte runtime/UI; Product Postcheck default-off/fail-open | G#10, N#4, N#H3, R#6 |
| Autofix-stubbar | `cross-file-import-checker` null-render/dossier-stubbar → tyst success | N#1 |
| Brief-degradering | simplified brief-fallback sänker premium/3D | G#13 |
| Eval merge-syntax | `arcade-with-klarna` merged-syntax-fail, LLM-fixer abortar | E#1, R#10 |

### P2 (teman)
| Tema | Källa |
|---|---|
| Verify-gates fail-open | G#31–33, N#4 |
| F3 readiness/integration | G#20–22, N#H2, R#7 |
| Capability single-source | G#25, G#26, N#2 |
| Env-sanning/precedence | G#16–19, N#H4 |
| Status/degraded UX (event-bus UI-flip) | N#6, G#35, N#5, N#3 |
| Säkerhet/policy | G#40, G#38, R#12 |

P1/P2 adresseras i grandmaster-områdena 5/6/7.

---

## Parkerade/historiska spår (index → [`../archived/`](../archived/))

| ID | Spår (nästa steg) | Källa |
|---|---|---|
| O | LLM-masterplan startlinje (init/follow-up-konsistens, latency, prompt-kvalitet) | [`2026-04-28-llm-flode-startlinje.md`](../archived/2026-04-28-llm-flode-startlinje.md) |
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
