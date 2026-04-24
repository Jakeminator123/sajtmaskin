# STATUS — Backoffice (Streamlit) drift efter wave 1–3

**Datum:** 2026-04-23
**Producerad av:** orkestrator-agent efter wave 3-merge
**Syfte:** Identifiera backoffice-pages som inte speglar wave 1–3-ändringar. Inga filer modifieras här — ger plan-09-agenten en handlingslista.

> Komplement till STATUS-04-AUDIT, STATUS-09-CANDIDATES, STATUS-10-CANDIDATES, STATUS-DOSSIER-CONFUSION-AUDIT.

## Verifierat: schemas är aktuella

| Schema | Status |
|---|---|
| `docs/schemas/strict/dossier.schema.json` | ✅ Innehåller `enforcement: build|feature-runtime|warn-only` (P31) — matchar runtime |
| `docs/schemas/strict/plan-file.schema.json` | ✅ Inte rörd av wave 1–3 |
| `docs/schemas/strict/preview-session-contract.schema.json` | ✅ Inte rörd |
| `docs/schemas/strict/scaffold-variant.schema.json` | ✅ Inte rörd |

Plan 06 + 07 introducerade nya runtime-typer (`CapabilitySpecificityTier`, `DetectedCapability`, `PromptSource`) men INGA persisterade artifact-fält. Schemas behöver inte uppdateras.

## Backoffice-pages som driftar

### 🔴 `backoffice/pages/fixer_registry.py` — saknas lane-tags

`CATEGORY_COLORS`-tabell på rad 36-54 listar bara de gamla 17 kategorierna:

```
mechanical-import, mechanical-syntax, mechanical-jsx, mechanical-shadcn,
mechanical-r3f, mechanical-tailwind, mechanical-meta, mechanical-next-config,
mechanical-misc, validator-syntax, validator-jsx, validator-dep, llm-syntax,
llm-verifier, llm-partial-file, llm-server-repair, verifier-pass
```

**Plan 05 introducerade `lane`-fält på FixEntry** (`mechanical | static_gate | llm_repair | stream_suspense | post_merge | server_repair`). Backoffice visar inte detta lane-fält alls.

**Åtgärd för plan 09:** lägg till lane-färgmappning + visa lane-badge per fixer-rad. Liten ändring (~10 rader).

### 🟡 `backoffice/pages/observability.py` — verifiera new event types

`OBSERVED_PHASES` på rad 30-43 är aktuell (12 phases matchar `src/lib/observability/metrics.ts`). Ingen ändring behövs **just nu**.

**Men** plan 02 introducerade `merge:cross-file-stub`-warnings i `engine_version_error_logs`, och plan 06 introducerade `capability-add` follow-up-intent. Om backoffice har sektion för "intent-distribution" eller "warning-by-category" — kolla att de räknar de nya kategorierna.

### 🟡 `backoffice/pages/dossiers.py` — kan visa tier-info

Plan 06 introducerade `requestedCapabilityTiers: { capability_id: "generic" | "specific" | "beyond-dossier" }` på `OrchestrationBase`. Detta exponeras inte i backoffice idag.

**Åtgärd för plan 09 (om enkelt):** lägg till en kolumn "Last detected tier" som läser senaste run från observability och visar tier-distribution per dossier.

### 🟡 `backoffice/pages/orchestration.py` — kan visa PromptSource

Plan 03 introducerade `PromptSource = "user" | "auto_repair"` discriminator. Backoffice visar antagligen inte denna ännu.

**Åtgärd för plan 09:** filtrera "auto-repair-pass" från follow-up-statistik så användaren ser sann user-driven aktivitet.

### 🟢 Övriga pages (inga drift identifierade)

| Page | Status |
|---|---|
| `overview.py` | OK |
| `pipeline_health.py` | Verifiera att den läser nya `lane`-fält om den summerar fixer-statistik |
| `repair_loop.py` | OK |
| `prompt_core.py` | OK |
| `codegen_core.py` | OK |
| `llm_config.py` | OK |
| `ai_models.py` | OK |
| `scaffolds.py`, `scaffold_lifecycle.py`, `runtime_scaffolds.py` | OK |
| `error_log_rag.py` | OK |
| `eval_page.py` | OK |
| `mental_model.py` | Värt att uppdatera om mental modellen ändrats av wave 1–3 — låg prio |
| `env_policy.py` | OK |
| `preview.py` | OK |
| `projects_admin.py` | OK |
| `cursor_agents.py` | OK |
| `shadcn_audit.py` | OK |
| `autofix.py` | Kollas — kan behöva visa lane-fält för fixers |
| `user_degraded_env.py` | OK |
| `_ops_impl.py` | OK |

## Sammanfattning för plan-09

| Tier | Page | Effort |
|---|---|---|
| HIGH-impact | `fixer_registry.py` (lane-färger) | låg |
| MEDIUM | `dossiers.py` (tier-info), `orchestration.py` (auto-repair filter) | medel |
| LOW | `pipeline_health.py`, `autofix.py` (lane-aware summaries) | låg-medel |

Plan 09 ska handla **alla röda och gula** ovan + flagga `mental_model.py` som follow-up för en framtida doc-pass.

## Kontroll: är Streamlit-appen igång?

Ingen automatisk verifiering här. Om du vill köra backoffice lokalt:

```powershell
cd backoffice
streamlit run app.py
```

(Se `backoffice/README.md` för exakt kommando.)
