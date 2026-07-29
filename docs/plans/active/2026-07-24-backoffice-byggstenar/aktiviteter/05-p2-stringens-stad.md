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
| P2-2 | Statisk dokumentation ser ut som livedata | `preview.py` hårdkodade markdown-block utan märkning; `orchestration.py:43` har caption, inte badge | Enhetlig badge "Statisk referens, senast uppdaterad manuellt" när sidan **inte** läser disk/DB/API |
| P2-4 | Terminologi-drift i UI-text | `generation_history.py:131,134` "Quality gate"/"Autofix"; `ai_models.py:149` "kodgeneratorn" | Byt mot glossary-termer (RenderGate/ReleaseGate/Normalize/RepairGate, own-engine) |
| P2-5 | `render_where_panel` bara på 23 av 36 sidor | saknas bl.a. i `generation_history.py`, `observability.py`, `projects_admin.py` | Gör den till standardrad i sidmallen i stället för opt-in |
| P2-6 | `scaffold_lifecycle.py` är en enda stor fil | — | Fas B rörde filen utan att dela den. Överväg uppdelning nästa gång den ändå rörs; ingen fristående refaktor |

## Levererat 2026-07-29

| # | Rest | Utfall |
|---|---|---|
| P2-1 | Subprocess-/Node-helper duplicerad | **Klar, PR #647.** En delad helper i `shared.py`, −154/+17 rader netto. Bevislistan här pekade bara ut `_resolve_node_command`, men det fanns en andra, större dubblettfamilj: `shared.py:72` hade en ordagrann kopia i `pipeline_health.py` och en komprimerad i `eval_page.py`. En docstring förklarar nu varför de två probarna har olika semantik, så nästa läsare inte "städar" isär dem igen |
| P2-3 | Testluckor på icke-trivial logik | **Klar, PR #650** — `projects_admin.py`, `templates_blob.py`, `generation_history.py` och Prometheus-parsern. Testarbetet blottade två källkodsfel: den destruktiva fallbacken till `--all-test-users` vid tomt scope-fält (**fixad fail-closed i samma PR**) och Prometheus-parserns av-escape-ordning (kvar som öppen P3-rad i [`BUG-SWARM-BACKLOG.md`](../../../../../BUG-SWARM-BACKLOG.md)) |

**Lärdomen från P2-3 är värd att läsa innan nästa testuppgift.** Första versionen
loggade fallbacken som "fixas senare" och lade tester som *krävde* att den fanns
kvar. Codex fällde det: ett test som låser fast en destruktiv genväg är värre än
inget test, för nästa person som vill fixa buggen möts av ett rött test som ser ut
som ett medvetet beslut. Skriver du tester på en yta du samtidigt misstänker är
fel — fixa felet, eller assertera vägran. Aldrig beteendet.

## Överlapp att inte missa

P2-4 och P2-5 rör delvis samma filer som Fas B och Fas C, som nu är mergade
(#649, #654). Överlappet är därmed inte längre en dubbelarbetsrisk utan bara en
påminnelse: läs den nuvarande koden innan du utgår från bevisraderna ovan, som är
kodverifierade 2026-07-27 och alltså före båda faserna.

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
