---
status: active
owner: unassigned
created: 2026-07-27
topic: Backoffice — kvarvarande P2-städ från stringensplanen (subprocess-helpers, statisk-referens-badge, testluckor, terminologi, filstorlek)
source: Stringensplanen 2026-07-08 (raderad; kärnan levererad 2026-07-21 och indexerad i docs/plans/avklarat/README.md) + kodverifiering 2026-07-27 mot master 3b419115
---

# Etapp 7 — P2-städ från stringensplanen

Backoffice-stringensplanens kärna levererades 2026-07-21 (6 grupper, konsoliderade
sidor, dubbelriktad domain-map-paritet, en enda manifest-skrivyta, backup-/
Återställningslagret). Det som medvetet lämnades kvar är samlat här, så det inte
ligger som en egen halvdöd plan bredvid Byggstenar-arbetet.

**Ta detta sist**, eller plocka enstaka rader när du ändå rör en sida. Ingen rad
blockerar Fas B/C/D. Master-plan: [`../00-master-plan.md`](../00-master-plan.md).

## Rader (kodverifierade 2026-07-27)

| # | Rest | Bevis | Åtgärd |
|---|---|---|---|
| P2-1 | Subprocess-/Node-helper duplicerad | egna `_resolve_node_command` i `database_health.py:49`, `redis_health.py:34`; samma mönster i `generation_history.py:44`, `log_export.py:91`, `scaffold_performance.py:59` | En delad helper i `shared.py` (eller `backoffice/subprocess_runners.py`) |
| P2-2 | Statisk dokumentation ser ut som livedata | `preview.py` hårdkodade markdown-block utan märkning; `orchestration.py:43` har caption, inte badge | Enhetlig badge "Statisk referens, senast uppdaterad manuellt" när sidan **inte** läser disk/DB/API |
| P2-3 | Testluckor på icke-trivial logik | saknas för `projects_admin.py` (destruktiv → högst prio), `templates_blob.py`, `generation_history.py` (`_preview_label`); `test_observability_io.py` testar `load_tail_ndjson` men inte Prometheus-parsern | Lägg tester, börja med den destruktiva ytan |
| P2-4 | Terminologi-drift i UI-text | `generation_history.py:131,134` "Quality gate"/"Autofix"; `ai_models.py:149` "kodgeneratorn" | Byt mot glossary-termer (RenderGate/ReleaseGate/Normalize/RepairGate, own-engine) |
| P2-5 | `render_where_panel` bara på 23 av 36 sidor | saknas bl.a. i `generation_history.py`, `observability.py`, `projects_admin.py` | Gör den till standardrad i sidmallen i stället för opt-in |
| P2-6 | `scaffold_lifecycle.py` är 2 675 rader i en fil (2026-07-29) | — | Överväg uppdelning **när filen ändå rörs** i Fas B; ingen fristående refaktor |

## Överlapp att inte missa

P2-4 och P2-5 rör delvis samma filer som **Fas B** (scaffold-ytorna) och **Fas C**
(Byggblock). Gör dem i så fall i den fasens PR i stället för här — dubbelarbete är
den enda verkliga risken i den här etappen.

P2-6 och Fas B:s opt-in-förslag att flytta variant-CRUD till en egen modul är två
förslag om samma fil. Välj ett; dela inte upp filen två gånger.

## Verifiering

```bash
npm run backoffice:test
npm run docs:check
npm run check:terms:contract
```

## Explicit icke-mål

- Ingen migrering bort från Streamlit, ingen ny auth-modell.
- Ingen ändring av vilka data sidorna visar — bara hur sant, hittbart och enhetligt.
- Ingen bred omformattering av 36 filer på en gång; en yta per PR.
