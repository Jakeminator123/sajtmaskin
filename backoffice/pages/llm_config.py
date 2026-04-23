from __future__ import annotations

from typing import Any

import streamlit as st

from backoffice.shared import (
    BUILD_PROFILE_ORDER,
    BackofficeContext,
    build_profile_defaults,
    human_model_label,
    load_fault_fix_csv,
    parse_ts_default_model_id,
    phase_routing_defaults,
    read_json,
    read_text,
    render_where_panel,
    resolve_phase_models_for_dashboard,
    summarize_tier_models,
)


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("LLM-faser & runtime-sanning")
    render_where_panel("LLM-faser & runtime-sanning", domain_map)

    st.info(
        "**Var sanningen lever:** `config/ai_models/manifest.json` är navet för standardmodeller och workloads "
        "(miljövariabler överstyr). `src/lib/models/catalog.ts`, `phase-routing.ts` och orchestrering i "
        "`orchestrate.ts` / own-engine avgör vad som faktiskt körs."
    )

    man_path = ctx.manifest_json
    catalog_path = ctx.repo_root / "src" / "lib" / "models" / "catalog.ts"
    llm_readme = ctx.repo_root / "logs" / "llm-segmentts-and-index" / "readme.txt"
    manifest: dict[str, Any] = read_json(man_path) if man_path.is_file() else {}
    default_tier = parse_ts_default_model_id(catalog_path)

    st.caption(
        "Direktlänk till denna vy efter start: `http://127.0.0.1:8501/?nav=llm` (justera port om du satt annan)."
    )

    k1, k2, k3 = st.columns(3)
    with k1:
        st.metric("DEFAULT_MODEL_ID (catalog.ts)", default_tier or "—")
    with k2:
        st.metric("manifest", "OK" if man_path.is_file() else "saknas")
    with k3:
        st.metric("Fas-readme", "finns" if llm_readme.is_file() else "saknas")

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("buildProfiles.defaults (manifest)")
        if man_path.is_file():
            bp = build_profile_defaults(manifest)
            st.dataframe(
                [
                    {"profil": tier, "standardmodell": human_model_label(bp.get(tier, ""))}
                    for tier in BUILD_PROFILE_ORDER
                ],
                width="stretch",
                hide_index=True,
            )
        else:
            st.error(f"Saknar `{man_path.relative_to(ctx.repo_root)}`.")

    with c2:
        st.subheader("phaseRouting.defaultByTier (manifest)")
        if man_path.is_file():
            routing = phase_routing_defaults(manifest)
            phase_keys = ("planner", "generator", "fixer", "verifier", "deploy-assistant")
            pr_rows: list[dict[str, str]] = []
            for tier in BUILD_PROFILE_ORDER:
                row: dict[str, str] = {"profil": tier}
                for ph in phase_keys:
                    row[ph] = routing.get(tier, {}).get(ph, "—")
                pr_rows.append(row)
            st.dataframe(pr_rows, width="stretch", hide_index=True)
            st.caption("`selected_build_model` betyder: följ användarens valda byggprofil → `buildProfiles.defaults`.")
        else:
            st.error("Saknar manifest.")

    st.subheader("Resolverad modell per fas (som Workloads-vyn)")
    if man_path.is_file():
        fx = summarize_tier_models(resolve_phase_models_for_dashboard(manifest, "fixer"))
        vf = summarize_tier_models(resolve_phase_models_for_dashboard(manifest, "verifier"))
        st.markdown(f"- **fixer**: {fx}\n- **verifier**: {vf}")
    else:
        st.warning("Inget manifest att visa resolvering för.")

    st.subheader("Fasindelning & Fault and Fix Index (repo-text)")
    if llm_readme.is_file():
        st.code(read_text(llm_readme), language=None)
    else:
        st.warning(f"Saknar `{llm_readme.relative_to(ctx.repo_root)}`.")

    st.subheader("Källfiler som styr kedjan (urval)")
    st.markdown(
        """
- `config/ai_models/manifest.json` — standardmodeller, workloads, budgets, timeouts  
- `src/lib/models/phase-routing.ts` — fas → modell per tier  
- `src/lib/models/catalog.ts` — kanoniska byggprofiler, `DEFAULT_MODEL_ID`  
- `src/lib/gen/orchestrate.ts` — orkestrering och kontext  
- `src/lib/providers/own-engine/generation-stream.ts` — codegen-ström  
- `src/lib/gen/stream/finalize-version.ts` — finalize efter stream  
        """
    )

    with st.expander("Checklista: inför testgenerering (lokal dev)", expanded=True):
        checks: list[tuple[str, bool]] = []
        checks.append(("manifest.json finns", man_path.is_file()))
        try:
            cg_path = ctx.config_dir / "codegen-core-manifest.json"
            cg = read_json(cg_path)
            frags = cg.get("fragments") or []
            missing = [f for f in frags if not (ctx.config_dir / f).is_file()]
            checks.append((f"core manifest ({cg_path.name}): alla fragmentfiler finns", len(missing) == 0))
        except Exception:
            checks.append(("core manifest går att läsa och validera", False))
        checks.append(("catalog.ts: DEFAULT_MODEL_ID kunde läsas", default_tier is not None))
        checks.append((".env.local finns (API-nycklar m.m., lokalt)", ctx.env_local.is_file()))
        for label, ok in checks:
            st.write(("✅ " if ok else "❌ ") + label)

    st.subheader("Historisk fellogg (error-log.csv)")
    error_log_path = ctx.error_log_csv
    if not error_log_path.is_file():
        st.info(
            f"Filen `{error_log_path.relative_to(ctx.repo_root).as_posix()}` saknas. "
            "Den skapas automatiskt efter första generationen som loggar fel/fixar."
        )
    else:
        error_df, error_log_message = load_fault_fix_csv(error_log_path)
        if error_log_message:
            st.error(error_log_message)
        if error_df.empty:
            st.info("Filen finns men innehåller inga rader.")
        else:
            cols = set(error_df.columns)
            filter_cols = [
                c
                for c in ("severity", "model", "phase", "scaffold_id", "fixer", "resolved")
                if c in cols
            ]
            if filter_cols:
                filter_ui = st.columns(len(filter_cols))
                picks: dict[str, str] = {}
                labels = {
                    "severity": "Allvarlighetsgrad",
                    "model": "Modell",
                    "phase": "Fas",
                    "scaffold_id": "Scaffold",
                    "fixer": "Fixer",
                    "resolved": "Löst",
                }
                for i, col in enumerate(filter_cols):
                    opts = ["Alla"] + sorted(error_df[col].dropna().unique().tolist())
                    with filter_ui[i]:
                        picks[col] = st.selectbox(labels.get(col, col), opts, key=f"errlog_{col}")

                filtered = error_df
                for col, pick in picks.items():
                    if pick != "Alla":
                        filtered = filtered[filtered[col] == pick]
            else:
                filtered = error_df
            st.caption(f"{len(filtered)} av {len(error_df)} rader visas.")
            st.dataframe(filtered, use_container_width=True, hide_index=True, height=400)

    # ── Follow-up tuning ────────────────────────────────────────────────
    st.subheader("Follow-up tuning (hårdkodat)")
    st.caption(
        "Konstanter i `src/lib/config.ts` → `FOLLOW_UP_TUNING`. "
        "Env-overridesen (`SAJTMASKIN_FOLLOWUP_*`) togs bort i omtag-04 "
        "(2026-04-23) — ändra koden för att justera."
    )
    tuning_constants = [
        {"Konstant": "FOLLOW_UP_TUNING.maxRecentHistoryPairs", "Beskrivning": "Antal senaste user+assistant-par i chatthistorik", "Värde": "4"},
        {"Konstant": "FOLLOW_UP_TUNING.lightContextMaxChars", "Beskrivning": "Max tecken filkontext (light policy)", "Värde": "32 000"},
        {"Konstant": "FOLLOW_UP_TUNING.lightContextMaxFilesManyFiles", "Beskrivning": "Max filer med innehåll (>14 filer, light)", "Värde": "4"},
        {"Konstant": "FOLLOW_UP_TUNING.lightContextMaxFilesFewFiles", "Beskrivning": "Max filer med innehåll (<=14 filer, light)", "Värde": "6"},
    ]
    st.dataframe(tuning_constants, use_container_width=True, hide_index=True)

