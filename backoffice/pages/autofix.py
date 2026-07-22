"""Normalize / RepairGate & Kvalitet — samlad läsvy för fix-pipelinen.

Read-only sedan 2026-07-21: den här sidan hade tidigare en egen kopia av
manifest-editorn (repair-pass, tokenbudgetar, phase routing) som skrev samma
`config/ai_models/manifest.json` som ai_models-sidan — två skrivytor för samma
fil driftade isär. Nu ägs all redigering av **ai_models** (delen
"Repair / budget / timeout" + "Generator-kedja"); den här vyn visar läget,
statistiken och hardening-historiken (tidigare den separata sidan
"Repair Loop (hardening)").
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import (
    BUILD_PROFILE_ORDER,
    BackofficeContext,
    human_model_label,
    load_fault_fix_csv,
    nav_link_button,
    phase_routing_defaults,
    read_autofix_runtime_config,
    read_json,
    render_where_panel,
    resolve_phase_models_for_dashboard,
)

# Hardening-historik (fd. sidan "Repair Loop"). Phases 2A–2C inlinades
# 2026-04-28 — beteendet är ovillkorligt i verifier-phase.ts,
# finalize-preflight.ts och persist-side-effects.ts.
REPAIR_LOOP_INLINED_HISTORY = (
    (
        "Phase 2A — repairPassIndex propagation + pruneStaleVersionErrorLogs (SAJ-25)",
        "Stops stale diagnostics from keeping a clean follow-up red by propagating repairPassIndex into finalize and pruning earlier-pass error-log rows when the latest pass has no preflight/syntax blockers. Verifier-only findings stay on the latest pass but no longer keep older rows active. Inlined 2026-04-28 (was FEATURES.consistentRepairPassIndex).",
    ),
    (
        "Phase 2B — verifier re-run after RepairGate",
        "After RepairGate succeeds, re-run runVerifierPass once to confirm the fix actually addressed the Blocker finding. Capped at 1 re-run + 30s timeout. Inlined 2026-04-28 (was FEATURES.verifierRerunAfterFix).",
    ),
    (
        "Phase 2C — skip RepairGate escalation on merged-only syntax fail",
        "When stream-syntax already passed but merged-syntax fails, run only Normalize + esbuild revalidation. Saves a RepairGate call per follow-up. Inlined 2026-04-28 (was FEATURES.skipDoubleValidateAndFixOnMerge).",
    ),
)

REPAIR_LOOP_TUNABLE = (
    (
        "recurringPatternsInMainPrompt",
        "Phase 2D — recurring failures block in main system-prompt",
        "Inject `### Recurring failures on this site` into the system-prompt for follow-ups so the codegen LLM sees what it just got wrong.",
        "NODE_ENV == development",
    ),
    (
        "useErrorLogRag",
        "Phase 3 — vector RAG over error-log + auto-ingest",
        "Producer writes NDJSON, indexer rebuilds TF-IDF snapshot, retriever surfaces `### Lessons from similar past builds` in system-prompt. Auto-rebuilt at npm run dev|build|start.",
        'NODE_ENV != "test" (on in BOTH dev and prod, not dev-only)',
    ),
)


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Normalize / RepairGate & Kvalitet")
    render_where_panel("Normalize / RepairGate & Kvalitet", domain_map)
    st.caption(
        "Samlad **läsvy** för Normalize (kod: autofix), RepairGate (kod: LLM-fixer), "
        "kvalitetspass och repair-loop-hardening. Vill du ändra pass-gränser, "
        "tokenbudgetar eller phase routing: gör det på **ai_models**-sidan "
        "(enda skrivytan för `config/ai_models/manifest.json`)."
    )
    nav_link_button("→ Redigera i ai_models", "ai_models", key="autofix_goto_ai_models")

    manifest = read_json(ctx.manifest_json) if ctx.manifest_json.exists() else None
    runtime_cfg = read_autofix_runtime_config(ctx.autofix_hook_ts)

    st.subheader("Pipeline-översikt")
    st.markdown(
        """
```
LLM-generering
     |
[Normalize]  ← repairPolicies.deterministicAutofixPasses
     |
[Syntax validate/fix]  ← repairPolicies.syntaxFixPasses
     |
[Bildmaterialisering + Verifier]  ← endast finalizePath=full
     |                                (verifier Blocker i F2 kan vara Advisory)
     |
[Preflight]  ← server, före DB-sparning
     |
=== SPARAS I DATABAS ===
     |
[Post-checks / CapabilitySmoke]  ← klient, efter DB-sparning
     |                  (kan trigga RepairGate)
[RenderGate / ReleaseGate] ← VM, npx tsc --noEmit (+ build/lint i F3)
     |                  (kan trigga server repair → RepairGate)
[Server repair pass]  ← delad runRepairLoop() via RepairGate
     |
[repair_available]    ← repaired_files_json + repair_available_at
     |
[accept-repair]       ← explicit användaraccept i versionspanelen
     |
[timeout auto-accept] ← repairPolicies.repairAcceptTimeoutMinutes
```
"""
    )
    st.caption(
        "Preflight kan stoppa leverans före databasen. Verifier-pass i finalize är hybrid (deterministiska guards som `undefined-jsx-symbol` + LLM-audit) — Blocker-fynd matas in i RepairGate men stoppar inte persist om de inte är render-/build-breaking. Post-checks/CapabilitySmoke och RenderGate/ReleaseGate körs efter att versionen har sparats. Serverrepair appliceras inte längre tyst: först `repair_available`, sedan `accept-repair` (eller timeout-autoaccept)."
    )

    st.divider()
    st.subheader("Aktuella styrvärden (läses ur manifest + kod)")
    if isinstance(manifest, dict):
        rp = manifest.get("repairPolicies") or {}
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Normalize-pass", int(rp.get("deterministicAutofixPasses", 2)))
        c2.metric("Syntax-pass", int(rp.get("syntaxFixPasses", 3)))
        c3.metric("Server repair-pass", int(rp.get("serverRepairPasses", 2)))
        c4.metric("Manual repair-pass", int(rp.get("manualRepairRouteLlmPasses", 2)))
        c5.metric("Repair accept-timeout (min)", int(rp.get("repairAcceptTimeoutMinutes", 5)))

        tb = manifest.get("tokenBudgets") or {}
        pgp = manifest.get("postGenerationPasses") or {}
        b1, b2, b3 = st.columns(3)
        b1.metric(
            "Build max output tokens",
            (tb.get("engineMaxOutputTokens") or {}).get("default", "—"),
        )
        b2.metric(
            "Normalize/RepairGate max tokens",
            (tb.get("autofixMaxOutputTokens") or {}).get("default", "—"),
        )
        b3.metric(
            "Verifier max tokens",
            (pgp.get("verifierMaxOutputTokens") or {}).get("default", "—"),
        )

        routing = phase_routing_defaults(manifest)
        fixer_rows = []
        for tier in BUILD_PROFILE_ORDER:
            resolved = resolve_phase_models_for_dashboard(manifest, "fixer").get(tier, "")
            fixer_rows.append(
                {
                    "byggprofil": tier,
                    "fixer-modell (routing)": routing.get(tier, {}).get("fixer", "—"),
                    "resolverad modell": human_model_label(resolved),
                }
            )
        st.markdown("**Fixer-modell per byggprofil** (RepairGate)")
        st.dataframe(fixer_rows, width="stretch", hide_index=True)
    else:
        st.error(f"Kunde inte läsa `{ctx.manifest_json.relative_to(ctx.repo_root).as_posix()}`.")

    st.markdown("**Runtime-gränser för RepairGate** (hårdkodade i `useAutoFix.ts`)")
    rc1, rc2 = st.columns(2)
    rc1.metric(
        "Max RepairGate/autofix per chatt",
        runtime_cfg.get("maxAutofixPerChat")
        if runtime_cfg.get("maxAutofixPerChat") is not None
        else "okänd",
    )
    rc2.metric(
        "Max försök per orsak",
        runtime_cfg.get("maxAttemptsPerReason")
        if runtime_cfg.get("maxAttemptsPerReason") is not None
        else "okänd",
    )
    soft_only = runtime_cfg.get("softOnlyReasons") or []
    if soft_only:
        st.caption("Soft-only-orsaker som aldrig triggar RepairGate/autofix av sig själva:")
        st.code(" | ".join(soft_only), language=None)

    st.divider()
    st.subheader("Fix-statistik från error-log.csv")
    if not ctx.error_log_csv.is_file():
        st.info(
            f"Filen `{ctx.error_log_csv.relative_to(ctx.repo_root).as_posix()}` saknas. Den skapas när generationloggning är aktiv och fixar/fel börjar loggas."
        )
    else:
        _render_fix_statistics(ctx)

    st.divider()
    _render_repair_loop_hardening(ctx)


def _render_repair_loop_hardening(ctx: BackofficeContext) -> None:
    st.subheader("Repair-loop hardening (historik + tunables)")
    st.caption(
        "Source of truth: `src/lib/config.ts` → `FEATURES`. Phases 2A/2B/2C inlinades "
        "2026-04-28 — beteendet är ovillkorligt i `verifier-phase.ts`, "
        "`finalize-preflight.ts` och `persist-side-effects.ts`. För Phase 2D + Phase 3 "
        "(kvar i FEATURES): ändra konstanterna i `src/lib/config.ts`."
    )

    with st.expander("Inlined unconditional behaviour (post-2026-04-28)", expanded=False):
        for label, helptext in REPAIR_LOOP_INLINED_HISTORY:
            st.markdown(f"**{label}**")
            st.caption(helptext)

    with st.expander("Tunable feature state (FEATURES i src/lib/config.ts)", expanded=False):
        for feature_key, label, helptext, value in REPAIR_LOOP_TUNABLE:
            st.markdown(f"**{label}**")
            st.caption(helptext)
            st.code(f"FEATURES.{feature_key} = {value}", language="typescript")

    with st.expander("Senaste 20 repair-loop-telemetri-events", expanded=False):
        events = _read_recent_devlog_lines(ctx.repo_root, limit=20)
        if not events:
            st.caption(
                "Inga events hittade i `logs/sajtmaskin-local.log` än. "
                "Kör en generering och kom tillbaka."
            )
        else:
            st.dataframe(events, width="stretch", hide_index=True)
    st.caption(
        "RAG-indexstatus och reindex-knapp finns på sidan **Error-log RAG** "
        "(Drift & hälsa)."
    )


def _read_recent_devlog_lines(repo_root: Path, limit: int = 20) -> list[dict[str, Any]]:
    """Return the most recent dev-log JSON events relevant to repair-loop telemetry."""
    log_path = repo_root / "logs" / "sajtmaskin-local.log"
    if not log_path.exists():
        return []
    interesting_types = {
        "version_error_log_pruned",
        "version_error_log_pruned.error",
        "verifier_rerun_after_fix",
        "verifier_rerun_after_fix.error",
        "merged-syntax.mechanical-only.result",
    }
    events: list[dict[str, Any]] = []
    try:
        # Dev-log is typically < 5 MB — read all of it and filter.
        with log_path.open("r", encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    obj = json.loads(raw)
                except Exception:
                    continue
                evt_type = obj.get("type") if isinstance(obj, dict) else None
                if evt_type in interesting_types:
                    events.append(obj)
    except Exception:
        return []
    return list(reversed(events[-limit:]))


def _render_fix_statistics(ctx: BackofficeContext) -> None:
    error_df, error_log_message = load_fault_fix_csv(ctx.error_log_csv)
    if error_log_message:
        st.error(error_log_message)

    if error_df.empty:
        st.info("CSV-filen finns men innehåller inga rader ännu.")
        return

    created_by = (
        error_df["created_by"]
        if "created_by" in error_df.columns
        else pd.Series("", index=error_df.index)
    )
    fixed_by = (
        error_df["fixed_by"]
        if "fixed_by" in error_df.columns
        else pd.Series("", index=error_df.index)
    )
    scaffold_col = (
        error_df["scaffold_id"]
        if "scaffold_id" in error_df.columns
        else pd.Series("-", index=error_df.index)
    )
    autofix_mask = fixed_by.isin(["deterministic-autofix", "llm-fixer"]) | created_by.isin(
        ["deterministic-autofix", "syntax-validator"]
    )
    fix_df = error_df[autofix_mask].copy()
    fix_df["created_by"] = created_by[autofix_mask].values
    fix_df["fixed_by"] = fixed_by[autofix_mask].values
    if "scaffold_id" not in fix_df.columns:
        fix_df["scaffold_id"] = scaffold_col[autofix_mask].values

    if fix_df.empty:
        st.info("Inga Normalize-/RepairGate-rader hittades i CSV-loggen ännu.")
        return

    fix_df["fix_kind"] = fix_df["fixed_by"].apply(
        lambda value: "LLM" if str(value) == "llm-fixer" else "Mekanisk"
    )
    scaffold_opts = ["Alla"] + sorted(
        str(value)
        for value in scaffold_col.dropna().unique().tolist()
        if str(value).strip() and str(value).strip() != "-"
    )
    selected_scaffold = st.selectbox(
        "Filtrera på scaffold",
        scaffold_opts,
        key="autofix_stats_scaffold",
    )
    if selected_scaffold != "Alla" and "scaffold_id" in fix_df.columns:
        fix_df = fix_df[fix_df["scaffold_id"] == selected_scaffold]

    fixer_series = (
        fix_df["fixer"]
        if "fixer" in fix_df.columns
        else pd.Series("-", index=fix_df.index)
    )
    fixer_df = fix_df[fixer_series.fillna("-") != "-"].copy()

    s1, s2, s3, s4 = st.columns(4)
    s1.metric("Fix-rader", len(fix_df))
    s2.metric("Normalize", int((fix_df["fix_kind"] == "Mekanisk").sum()))
    s3.metric("RepairGate", int((fix_df["fix_kind"] == "LLM").sum()))
    s4.metric(
        "Unika fixers",
        int(fixer_df["fixer"].nunique()) if not fixer_df.empty else 0,
    )

    if not fixer_df.empty:
        top_fixers = (
            fixer_df.groupby(["fix_kind", "fixer"])
            .size()
            .reset_index(name="antal")
            .sort_values(["antal", "fixer"], ascending=[False, True])
        )
        st.markdown("### Vanligaste fixers")
        st.dataframe(top_fixers.head(25), width="stretch", hide_index=True)

    if "scaffold_id" in fix_df.columns:
        scaffold_fix_df = fix_df[fix_df["scaffold_id"].fillna("-") != "-"].copy()
        if not scaffold_fix_df.empty:
            by_scaffold = (
                scaffold_fix_df.groupby(["scaffold_id", "fix_kind"])
                .size()
                .unstack(fill_value=0)
                .reset_index()
                .sort_values("scaffold_id")
            )
            st.markdown("### Fixer per scaffold")
            st.dataframe(by_scaffold, width="stretch", hide_index=True)

    recent_cols = [
        col
        for col in [
            "time",
            "scaffold_id",
            "fix_kind",
            "fixer",
            "problem",
            "chat_id",
            "version_id",
            "file",
        ]
        if col in fix_df.columns
    ]
    if recent_cols:
        st.markdown("### Senaste fixrader")
        st.dataframe(
            fix_df[recent_cols].tail(50).iloc[::-1],
            width="stretch",
            hide_index=True,
        )
        st.caption(
            "CSV-loggen lagrar full ISO-tid i kolumnen `time`. Vyn visar senaste rader."
        )
