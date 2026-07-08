---
status: active
owner: unassigned
created: 2026-07-08
topic: Backoffice — mer stringent, visuellt konsekvent, sannare mot runtime (Streamlit-appen under backoffice/)
source: Kodläsning (app_main.py, shared.py, alla 34 pages/*.py) + read-only granskning
---

# Backoffice-stringensplan

## TL;DR

Backoffice (`backoffice/` + `sajtmaskin_backoffice.py`, `npm run backoffice`) fungerar
och har goda mönster på sina bästa sidor (`overview.py`, `dossiers.py`,
`database_health.py`), men har växt organiskt till **34 sidor i bara 2 grupper**
med stor spridning i storlek (13–1816 rader), inkonsekvent UI-mönster, luckor i
"var ligger detta"-hjälpen, och några konkreta ställen där panelen visar fel
eller stale information om runtime (precis det principen i
`.cursor/skills/sajtmaskin-context/SKILL.md` varnar för: *"backoffice måste
spegla faktisk runtime, inte aspiration"*).

Det här är en **plan, ingen implementation.** Två triviala sanningsfel är redan
rättade i samma session (se "Redan åtgärdat" nedan) eftersom de var
enradsfixar med noll risk. Allt annat nedan väntar på din prioritering.

## Underlag

- Egen läsning: `backoffice/app_main.py`, `backoffice/shared.py`,
  `backoffice/pages/__init__.py`, samt stickprov (`overview.py`, `dossiers.py`,
  `mental_model.py`, `user_degraded_env.py`, `repair_loop.py`,
  `cursor_agents.py`) + radantal för alla 34 sidor.
- Läs-bar djupaudit (samma session): 9 rangordnade fynd + tabeller för
  stringens/IA/sanning/visuellt/tester/duplicering/namngivning.
- `backoffice/test_*.py` (9 testfiler) — vad som testas och inte.

## Redan åtgärdat (i samma pass, noll risk)

| Fil | Fel | Fix |
|---|---|---|
| `backoffice/pages/repair_loop.py` | `useErrorLogRag` visades som `NODE_ENV == development` (dev-only) | Rättat till `NODE_ENV != "test"` (på i **både** dev och prod) — matchar `src/lib/config.ts:449`. Operatörer trodde RAG var av i prod när den är på. |
| `backoffice/pages/cursor_agents.py` | Radioknapp-etikett sa `repository-and-platform.md` för en fil som heter `docs/architecture/code-map.md` | Etikett rättad till `code-map.md` |
| `backoffice/test_pages_import_smoke.py` | Kommentar hårdkodade "27 sidor" (verkligheten: 34, växer) | Kommentar generaliserad |

## Nulägesbild (siffror, verifierade)

| Mått | Värde |
|---|---|
| Registrerade sidor (`PAGE_SPECS`) | 34 (+ `__init__.py`) |
| Grupper (`PAGE_GROUPS`) | 2 — `Konfiguration` (14), `Overhead` (20) |
| Radantal per sida | 13 (`user_degraded_env.py`) → 1816 (`scaffold_lifecycle.py`) |
| Sidor med `render_where_panel` ("var ligger detta?") | 18 av 34 |
| Sidor med post i `config/dashboard/domain-map.json` | ~20 av 34 |
| Testfiler (`backoffice/test_*.py`) | 9, alla gröna (49 tester) |

## Rangordnade fynd

### P0 — sanning mot runtime

1. **Domain-map täcker bara ~57 % av sidorna.** `render_where_panel` blir tyst
   ("Saknar post för X") på ~15 sidor (bl.a. `Scaffolds`, `Dossiers`,
   `Pipeline Health`, `Observability`, `Repair Loop`, `Mental modell`).
   `test_domain_map_parity.py` skyddar bara EN riktning (stale nycklar i
   mapen flaggas), inte den andra (en registrerad sida utan map-post flaggas
   inte). En ny sida kan alltså tystas ur "var ligger detta"-hjälpen för
   evigt utan att något test rödmarkerar det.
   **Rekommendation:** fyll i de saknade posterna (summary + canonicalPaths
   + docsPaths per sida — kräver att någon med domänkunskap skriver texten,
   inte en mekanisk fix) och gör testet dubbelriktat
   (`PAGE_NAMES` ⊆ `domain-map.pages.keys()` OCH omvänt).

### P1 — stringens (samma sak byggs olika på olika ställen)

2. **Dubbla manifest-editorer.** `ai_models.py` och `autofix.py` har nästan
   identisk UI för fas-modell/thinking-inställningar och skriver båda
   `manifest.json` via samma `validate_manifest_or_error`-mönster men som
   separat kod. Risk: en ändring i den ena UI:n glöms i den andra → drift
   eller motstridiga sparningar från två håll.
   **Rekommendation:** en ägaryta som skriver, den andra blir read-only-spegel
   (eller slå ihop till en sida med två tabs).

3. **Scaffold-ytorna är tre nivåer utan tydlig ingång.** `Runtime scaffolds`
   (read-only detalj), `Scaffolds` (tabell + manifest.ts-redigering),
   `Scaffold Lifecycle` (~1800 rader full CRUD) — plus `Mental modell` och
   `Orchestration Map` som sidoblickar på samma domän. Alla tre
   manifest-redigerarna har egna kopior av TS-regex-parsing istället för att
   dela `shared.parse_manifest_ts` / `_escape_ts_string`.
   **Rekommendation:** definiera en tydlig "börja här"-kedja (t.ex.
   `Scaffolds` som hub med länkar till Lifecycle för djup-CRUD), och
   konsolidera TS-parsingen i `shared.py` (redan där — bara sluta duplicera).

4. **"Overhead"-gruppen är en platt lista på 20 sidor.** Fyra tydliga kluster
   syns redan i innehållet men inte i navigationen:
   - *Repair/fix*: Normalize/RepairGate, Fixer Registry, Repair Loop, Error-log RAG
   - *Hälsa*: Pipeline Health, Observability, Databashälsa, Redis-hälsa
   - *Telemetri/historik*: LLM-flöde telemetri, LLM-flöde status, Generation History, Selection Rationale, Preview
   - *Scaffold-drift*: Scaffolds, Scaffold Lifecycle, Scaffold Performance, Mental modell, Orchestration Map
   **Rekommendation:** byt `PAGE_GROUPS` från 2 till 5–6 (`Konfiguration`,
   `Repair/Kvalitet`, `Hälsa`, `Telemetri`, `Scaffold`, `Drift/admin`) —
   mekanisk ändring i `backoffice/pages/__init__.py` (bara `group=`-fältet
   per `PageSpec`, ingen sidkod behöver ändras).

5. **`render_where_panel` saknas på halva sidorna** (16 av 34) trots att det
   är den etablerade, återanvändbara komponenten för "var redigerar jag det
   här på riktigt". Gör den till standard i sidmallen istället för opt-in.

### P2 — underhåll och synlighet

6. **Subprocess/Node-helper-mönstret upprepas** (egen `_resolve_node_command`
   + JSON-parsing) i minst `database_health.py`, `redis_health.py`,
   `generation_history.py`, `log_export.py`, `scaffold_performance.py`. Flytta
   till en delad `backoffice/subprocess_runners.py` eller `shared.py`.

7. **Statisk dokumentation maskerad som live data.** `preview.py` och
   `orchestration.py` blandar äkta filkontroller med långa hårdkodade
   markdown-block/kartor (`orchestration.py`s `vercel_map`) utan visuell
   markering av vad som är "läst just nu" vs "skriven referens som kan åldras
   tyst". Lägg en enhetlig "📌 Statisk referens, senast uppdaterad manuellt"-
   badge när en sida INTE läser från disk/DB/API.

8. **Testluckor på icke-trivial logik utan täckning utöver import-smoke:**
   `dossiers.py` (manifest-validering, capability-map-ombyggnad, subprocess
   curate/normalize), `scaffold_lifecycle.py` (variant-CRUD,
   manifest.ts-generering, **radering**), `generation_history.py`
   (`_preview_label`-semantik), `observability.py` (Prometheus-parsern),
   `projects_admin.py` (**destruktiv** projekt-radering — högst prioritet av
   dessa givet blastradius), `templates_blob.py` (upload-subprocess).

9. **Terminologi-drift i UI-text** mot `docs/architecture/glossary.md`:
   `generation_history.py` kolumnrubriker "Quality gate"/"Autofix" istället
   för RenderGate/ReleaseGate/Normalize/RepairGate; `ai_models.py` säger
   "kodgeneratorn" istället för `own-engine`. `autofix.py`/`preview.py` gör
   det redan rätt (kodnamn i parentes) — sprid det mönstret.

10. **Storleksspridning (13–1816 rader)** är inte i sig ett problem, men
    `scaffold_lifecycle.py` på ~1800 rader i en enda fil är svår att
    granska/testa i sin helhet. Överväg att dela upp i
    `scaffold_lifecycle/{crud,variants,manifest_io}.py` när den ändå rörs
    nästa gång — inte en fristående uppgift bara för sakens skull.

## Visuellt intryck

De mest polerade sidorna (`database_health.py`, `redis_health.py`,
`control_plane.py`, `env_readiness.py`, `selection_rationale.py`,
`log_export.py`) delar redan ett bra mönster: `st.metric`/`st.columns` för
sammanfattning överst, `st.tabs` för detalj, konsekvent ✅/⚠️/❌-färgkodning.
De minst polerade (`mental_model.py`, `user_degraded_env.py`,
`pipeline_health.py` som saknar sidtitel, `repair_loop.py`) är rena
text/kod-dumpar utan struktur.

**Konkret, litet steg (låg risk, hög synlig effekt):** en delad
`render_status_badge(label, state)`-helper i `shared.py` (samma idé som
✅/⚠️/❌ redan används ad-hoc på hälso-sidorna) + en gemensam regel: varje
`render()` börjar med `st.title`/`st.header` (aldrig ingetdera — `pipeline_health.py`
bryter idag) och, om sidan har en domain-map-post, `render_where_panel` direkt
efter. Detta är en **mall**, inte en omskrivning av 34 filer på en gång.

## Föreslagen ordning (faser, ingen är påbörjad)

| Fas | Innehåll | Risk | Uppskattad yta |
|---|---|---|---|
| **1 — Mekanisk** | Dela upp `PAGE_GROUPS` i fler kategorier (punkt 4); gör `test_domain_map_parity.py` dubbelriktad (punkt 1, testet); lägg `render_where_panel` som standardrad i sidmallen (punkt 5) | Låg — ingen logik ändras, bara navigation/test | 2-3 filer + `__init__.py` |
| **2 — Innehåll** | Fyll i de ~15 saknade domain-map-posterna (kräver att skriva korrekt `summary`/`canonicalPaths` per sida — domänkunskap, inte mekaniskt) | Låg-Medel | `config/dashboard/domain-map.json` |
| **3 — Konsolidering** | Slå ihop/tydliggör scaffold-trippeln (punkt 3) och dubbla manifest-editorer (punkt 2); flytta subprocess-helpers till `shared.py` (punkt 6) | Medel — rör flera sidor, kräver regressionstest av varje flyttad funktion | 6-8 filer |
| **4 — Testtäckning** | Testa destruktiva/parsing-tunga moduler, prioritera `projects_admin.py` (destruktiv) och `scaffold_lifecycle.py` (störst yta) | Låg risk att lägga till, men kräver tid att skriva bra tester | Nya testfiler |
| **5 — Terminologi + visuell mall** | Byt UI-text mot glossary-termer (punkt 9); inför delad status-badge-helper + header-regel (visuellt-avsnittet) | Låg | Spridd, många små diffar |

Ingen fas kräver arkitekturbeslut eller databasändringar — allt är
Streamlit/Python-internt. Fas 3 är den enda som rör flera sidor samtidigt och
bör därför delas i mindre PR:ar (en konsolidering i taget), i linje med
`.cursor/rules/workflow.mdc`.

## Explicit icke-mål

- Ingen ny backoffice-auth/behörighetsmodell (redan täckt av
  `BUG-SWARM-BACKLOG.md` som ett separat, lågprioriterat fynd om admin-gating).
- Ingen migrering bort från Streamlit.
- Ingen ändring av vilka data sidorna visar — bara hur sant, hur hittbart och
  hur enhetligt de visar det.
