"""Normalize / RepairGate & Kvalitet — central överblick + manifest-baserad konfig."""

from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import (
    AVAILABLE_PHASE_MODELS,
    BUILD_PROFILE_ORDER,
    PHASE_LABELS,
    PHASE_ORDER,
    REASONING_EFFORT_OPTIONS,
    BackofficeContext,
    build_profile_defaults,
    human_model_label,
    load_fault_fix_csv,
    phase_model_display_label,
    phase_routing_defaults,
    phase_thinking_defaults,
    phase_token_budget_entry,
    read_autofix_runtime_config,
    read_json,
    validate_manifest_or_error,
    write_json,
    write_phase_thinking,
)


def render(ctx: BackofficeContext) -> None:
    st.header("Normalize / RepairGate & Kvalitet")
    st.caption(
        "Central överblick för Normalize (kod: autofix), RepairGate (kod: LLM-fixer) och kvalitetspass. Den här sidan speglar samma `config/ai_models/manifest.json` som config-dashboarden använder."
    )

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
    st.subheader("Runtime-gränser för RepairGate")
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
    st.subheader("Centrala styrningar (manifest.json)")
    if not isinstance(manifest, dict):
        st.error(f"Kunde inte läsa `{ctx.manifest_json.relative_to(ctx.repo_root).as_posix()}`.")
    else:
        _render_manifest_controls(ctx, manifest)


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
            "CSV-loggen lagrar nu full ISO-tid i kolumnen `time`. Vyn visar senaste rader och kan senare utökas med riktiga dag/vecka-trender."
        )


def _render_manifest_controls(ctx: BackofficeContext, manifest: dict[str, Any]) -> None:
    rp = manifest.setdefault("repairPolicies", {})
    tb = manifest.setdefault("tokenBudgets", {})
    pgp = manifest.setdefault("postGenerationPasses", {})
    routing = phase_routing_defaults(manifest)

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Normalize-pass", int(rp.get("deterministicAutofixPasses", 2)))
    c2.metric("Syntax-pass", int(rp.get("syntaxFixPasses", 3)))
    c3.metric("Server repair-pass", int(rp.get("serverRepairPasses", 2)))
    c4.metric("Manual repair-pass", int(rp.get("manualRepairRouteLlmPasses", 2)))
    c5.metric("Repair accept-timeout (min)", int(rp.get("repairAcceptTimeoutMinutes", 5)))

    left, right = st.columns(2)
    with left:
        st.markdown("### Repair-pass")
        deterministic_passes = st.number_input(
            "Normalize-pass före RepairGate",
            value=int(rp.get("deterministicAutofixPasses", 2)),
            min_value=1,
            max_value=10,
            step=1,
            key="bo_repair_deterministic",
        )
        syntax_passes = st.number_input(
            "Syntax-fix-pass efter generering",
            value=int(rp.get("syntaxFixPasses", 3)),
            min_value=1,
            max_value=10,
            step=1,
            key="bo_repair_syntax",
        )
        manual_passes = st.number_input(
            "Manuell repair-route: max LLM-pass",
            value=int(rp.get("manualRepairRouteLlmPasses", 2)),
            min_value=1,
            max_value=10,
            step=1,
            key="bo_repair_manual",
        )
        server_passes = st.number_input(
            "Background server verify: max repair-pass",
            value=int(rp.get("serverRepairPasses", 2)),
            min_value=1,
            max_value=10,
            step=1,
            key="bo_repair_server",
        )
        repair_accept_timeout = st.number_input(
            "Repair available: auto-accept timeout (minuter)",
            value=int(rp.get("repairAcceptTimeoutMinutes", 5)),
            min_value=1,
            max_value=120,
            step=1,
            key="bo_repair_accept_timeout",
            help="Efter denna tid kan pending `repair_available` auto-accepteras i chat/versions/readiness-routes.",
        )

    with right:
        st.markdown("### Tokenbudgetar")
        engine_tokens = st.number_input(
            "Build/generator max output tokens",
            value=int((tb.get("engineMaxOutputTokens") or {}).get("default", 82768)),
            step=1024,
            key="bo_tb_engine",
        )
        autofix_tokens = st.number_input(
            "Normalize / RepairGate max output tokens",
            value=int((tb.get("autofixMaxOutputTokens") or {}).get("default", 12288)),
            step=512,
            key="bo_tb_autofix",
        )
        verifier_tokens = st.number_input(
            "Verifier max output tokens",
            value=int((pgp.get("verifierMaxOutputTokens") or {}).get("default", 8192)),
            step=256,
            key="bo_pgp_verifier_tokens",
        )
        verifier_snippet = st.number_input(
            "Verifier: snippet-tecken per fil",
            value=int((pgp.get("verifierSnippetCharsPerFile") or {}).get("default", 14000)),
            step=500,
            key="bo_pgp_verifier_snippet",
        )

    st.markdown("### Phase routing")
    st.caption(
        "Choose a model per phase. `selected_build_model` is shown as `Tier model (...)`, and planner/generator still require the existing builder thinking toggle to be on."
    )
    build_defaults = build_profile_defaults(manifest)
    thinking_defaults = phase_thinking_defaults(manifest)
    edited_routing: dict[str, dict[str, str]] = {}
    edited_thinking: dict[str, dict[str, dict[str, Any]]] = {}
    tier_tabs = st.tabs([tier for tier in BUILD_PROFILE_ORDER])
    for idx, tier in enumerate(BUILD_PROFILE_ORDER):
        tier_routing = routing.get(tier) or {}
        tier_thinking = thinking_defaults.get(tier) or {}
        edited_routing[tier] = {}
        edited_thinking[tier] = {}
        with tier_tabs[idx]:
            for phase in PHASE_ORDER:
                current_model = (
                    str(tier_routing.get(phase, "selected_build_model")).strip()
                    or "selected_build_model"
                )
                current_thinking_cfg = tier_thinking.get(phase) or {}
                current_thinking = bool(current_thinking_cfg.get("thinking", False))
                current_effort = (
                    str(current_thinking_cfg.get("reasoningEffort", "medium")).strip()
                    or "medium"
                )
                budget = phase_token_budget_entry(manifest, phase)
                st.markdown(f"#### {PHASE_LABELS.get(phase, phase)}")
                c1, c2, c3, c4 = st.columns([1.8, 0.9, 1.1, 1.1])
                with c1:
                    model_value = st.selectbox(
                        "Model",
                        AVAILABLE_PHASE_MODELS,
                        index=AVAILABLE_PHASE_MODELS.index(current_model)
                        if current_model in AVAILABLE_PHASE_MODELS
                        else 0,
                        key=f"bo_phase_model_{tier}_{phase}",
                        format_func=lambda model_id, _tier=tier: phase_model_display_label(
                            model_id,
                            _tier,
                            build_defaults,
                        ),
                    )
                with c2:
                    thinking_value = st.toggle(
                        "Thinking",
                        value=current_thinking,
                        key=f"bo_phase_thinking_{tier}_{phase}",
                    )
                with c3:
                    effort_value = st.selectbox(
                        "Reasoning effort",
                        REASONING_EFFORT_OPTIONS,
                        index=REASONING_EFFORT_OPTIONS.index(current_effort)
                        if current_effort in REASONING_EFFORT_OPTIONS
                        else REASONING_EFFORT_OPTIONS.index("medium"),
                        key=f"bo_phase_effort_{tier}_{phase}",
                        disabled=not thinking_value,
                    )
                with c4:
                    resolved_model_value = (
                        build_defaults.get(tier, "").strip()
                        if model_value == "selected_build_model"
                        else model_value
                    )
                    st.text_input(
                        "Resolved model",
                        value=human_model_label(resolved_model_value),
                        key=f"bo_phase_resolved_{tier}_{phase}",
                        disabled=True,
                    )
                st.caption(
                    f"Budget: `{budget['label']}` default={budget['default']} min={budget['min']} max={budget['max']} env={budget['envKey'] or '—'}. {budget['note']}"
                )
                edited_routing[tier][phase] = model_value
                edited_thinking[tier][phase] = {
                    "thinking": thinking_value,
                    "reasoningEffort": effort_value,
                }

    if st.button("Spara Normalize / RepairGate & Kvalitet", type="primary"):
        tb.setdefault("engineMaxOutputTokens", {})["default"] = int(engine_tokens)
        tb.setdefault("autofixMaxOutputTokens", {})["default"] = int(autofix_tokens)
        pgp.setdefault("verifierMaxOutputTokens", {})["default"] = int(verifier_tokens)
        pgp.setdefault("verifierSnippetCharsPerFile", {})["default"] = int(verifier_snippet)
        rp["deterministicAutofixPasses"] = int(deterministic_passes)
        rp["syntaxFixPasses"] = int(syntax_passes)
        rp["manualRepairRouteLlmPasses"] = int(manual_passes)
        rp["serverRepairPasses"] = int(server_passes)
        rp["repairAcceptTimeoutMinutes"] = int(repair_accept_timeout)
        manifest.setdefault("phaseRouting", {})["defaultByTier"] = edited_routing
        for tier, phase_entries in edited_thinking.items():
            for phase, cfg in phase_entries.items():
                write_phase_thinking(
                    manifest,
                    tier,
                    phase,
                    bool(cfg.get("thinking", False)),
                    str(cfg.get("reasoningEffort", "medium")),
                )
        errs = validate_manifest_or_error(manifest)
        if errs:
            st.error(
                "Sparar inte — manifestet bryter mot schemat:\n"
                + "\n".join(f"- {message}" for message in errs)
            )
            st.stop()
        try:
            write_json(ctx.manifest_json, manifest)
            st.success(
                "Sparade Normalize / RepairGate & Kvalitet-inställningar till config/ai_models/manifest.json."
            )
            st.rerun()
        except Exception:
            st.error("Kunde inte spara manifest.json.")
