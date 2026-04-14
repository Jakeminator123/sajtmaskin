from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass

import streamlit as st

from backoffice.shared import BackofficeContext, collect_prompt_dump_statuses


@dataclass(frozen=True)
class CommandSpec:
    id: str
    label: str
    command: tuple[str, ...]
    group: str
    description: str
    risky: bool = False


NPM_CMD = "npm.cmd" if os.name == "nt" else "npm"
PYTHON_CMD = sys.executable

COMMANDS: list[CommandSpec] = [
    CommandSpec("artifacts_rebuild_safe_validate", "Artifacts: smart rebuild (reuse cache, validate-only)", (NPM_CMD, "run", "artifacts:rebuild"), "Artifacts", "Purge generated outputs, reuse scrape/repo cache, rebuild + runtime validation + typecheck.", True),
    CommandSpec("artifacts_rebuild_safe_with_eval", "Artifacts: smart rebuild (reuse cache, with eval)", (NPM_CMD, "run", "artifacts:rebuild:with-eval"), "Artifacts", "Same as validate-only rebuild, but also runs eval suite.", True),
    CommandSpec("artifacts_rebuild_full_validate", "Artifacts: smart rebuild (full scrape, validate-only)", (NPM_CMD, "run", "artifacts:rebuild:full"), "Artifacts", "Purge generated outputs, refresh scrape-cache, rebuild + runtime validation + typecheck.", True),
    CommandSpec("artifacts_rebuild_full_with_eval", "Artifacts: smart rebuild (full scrape, with eval)", (NPM_CMD, "run", "artifacts:rebuild:full:with-eval"), "Artifacts", "Same as full validate-only rebuild, but also runs eval suite.", True),
    CommandSpec("scaffolds_status", "Scaffolds: status", (NPM_CMD, "run", "scaffolds:status"), "Scaffolds", "Read-only status for scaffold pipeline artifacts."),
    CommandSpec("scaffolds_import", "Scaffolds: import", (NPM_CMD, "run", "scaffolds:import"), "Scaffolds", "Import discovery into canonical raw-discovery root.", True),
    CommandSpec("scaffolds_hydrate", "Scaffolds: hydrate", (NPM_CMD, "run", "scaffolds:hydrate"), "Scaffolds", "Hydrate repo cache from canonical raw-discovery.", True),
    CommandSpec("scaffolds_build", "Scaffolds: build", (NPM_CMD, "run", "scaffolds:build"), "Scaffolds", "Build template-library + scaffold research artifacts.", True),
    CommandSpec("scaffolds_embeddings", "Scaffolds: embeddings", (NPM_CMD, "run", "scaffolds:embeddings"), "Scaffolds", "Generate scaffold embeddings.", True),
    CommandSpec("scaffolds_eval", "Scaffolds: eval", (NPM_CMD, "run", "scaffolds:eval"), "Scaffolds", "Run scaffold selection evaluation.", True),
    CommandSpec("scaffolds_verify", "Scaffolds: verify", (NPM_CMD, "run", "scaffolds:verify"), "Scaffolds", "Run scaffold validation checks."),
    CommandSpec("scaffolds_all", "Scaffolds: all", (PYTHON_CMD, "scripts/scaffolds/scaffold_cli.py", "all", "--include-template-library", "--typecheck"), "Scaffolds", "Import + hydrate + build + all embeddings + eval + verify + typecheck.", True),
    CommandSpec("template_pipeline_refresh_reuse", "Template pipeline: refresh reuse cache", (PYTHON_CMD, "scripts/template-library/full_template_refresh.py", "--skip-scrape"), "Template Library", "Full external pipeline run without fresh scrape and without interactive prompts.", True),
    CommandSpec("template_pipeline_refresh_full", "Template pipeline: refresh full scrape", (PYTHON_CMD, "scripts/template-library/full_template_refresh.py", "--legacy-wide-use-cases", "--per-category=999"), "Template Library", "Full external pipeline run including scraper, explicit and non-interactive.", True),
    CommandSpec("template_library_verify_summary", "Template library: verify summary", (NPM_CMD, "run", "template-library:verify-summary"), "Template Library", "Verify discovered summary shape and parseability."),
    CommandSpec("template_library_validate_runtime", "Template library: validate runtime artifacts", (NPM_CMD, "run", "template-library:validate-runtime"), "Template Library", "Validate generated runtime JSON artifacts."),
    CommandSpec("templates_local_refresh_embeddings", "v0 templates: local refresh + embeddings", (NPM_CMD, "run", "templates:local:refresh:embeddings"), "v0 Templates", "Rebuild local v0 catalog + template embeddings.", True),
    CommandSpec("templates_validate", "v0 templates: validate", (NPM_CMD, "run", "templates:validate"), "v0 Templates", "Validate generated templates.json + categories mapping."),
    CommandSpec("eval", "Eval: full suite", (NPM_CMD, "run", "eval"), "Quality", "Run broader eval suite and scorecards.", True),
    CommandSpec("typecheck", "Typecheck", (NPM_CMD, "run", "typecheck"), "Quality", "Run TypeScript typecheck."),
]

PRESET_SAFE_ALL = ["artifacts_rebuild_safe_validate"]
PRESET_FULL_ALL = ["artifacts_rebuild_full_validate"]


def _run_command(ctx: BackofficeContext, spec: CommandSpec) -> tuple[int, str]:
    proc = subprocess.run(
        spec.command,
        cwd=str(ctx.repo_root),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    output = proc.stdout + proc.stderr
    return proc.returncode, output


def render(ctx: BackofficeContext) -> None:
    st.header("Artifacts pipeline")
    st.caption(
        "Detta ersätter den gamla Tkinter-scriptpanelen. Samma rebuild/scaffold/template-kommandon körs nu från Streamlit."
    )
    statuses = collect_prompt_dump_statuses(ctx.repo_root, env_value=os.environ.get("SAJTMASKIN_PROMPT_DUMP"))
    if statuses:
        st.dataframe(
            [
                {
                    "Kategori": row["category"],
                    "Status": row["status"],
                    "DumpedAt": row["dumpedAt"] or "missing",
                    "Filer": ", ".join(row["presentFiles"]) if row["presentFiles"] else "none",
                }
                for row in statuses
            ],
            hide_index=True,
            width="stretch",
        )

    auto_confirm = st.toggle(
        "Bekräfta riskabla kommandon automatiskt",
        value=False,
        key="artifacts_auto_confirm",
    )
    groups = ["Artifacts", "Scaffolds", "Template Library", "v0 Templates", "Quality"]

    preset_cols = st.columns(2)
    with preset_cols[0]:
        if st.button("Kör säker helkörning", key="preset_safe"):
            st.session_state["artifacts_selected"] = PRESET_SAFE_ALL
    with preset_cols[1]:
        if st.button("Rensa och bygg om allt", key="preset_full"):
            st.session_state["artifacts_selected"] = PRESET_FULL_ALL

    selected = set(st.session_state.get("artifacts_selected", []))
    updated_selected: set[str] = set(selected)

    for group in groups:
        with st.expander(group, expanded=group in {"Artifacts", "Scaffolds"}):
            for spec in [item for item in COMMANDS if item.group == group]:
                c1, c2, c3 = st.columns([0.18, 0.52, 0.30])
                with c1:
                    checked = st.checkbox(
                        "Välj",
                        value=spec.id in selected,
                        key=f"artifacts_select_{spec.id}",
                        label_visibility="collapsed",
                    )
                    if checked:
                        updated_selected.add(spec.id)
                    else:
                        updated_selected.discard(spec.id)
                with c2:
                    st.markdown(f"**{spec.label}**")
                    st.caption(spec.description)
                with c3:
                    warn = spec.risky and not auto_confirm
                    disabled = warn
                    if st.button("Kör", key=f"artifacts_run_{spec.id}", disabled=disabled):
                        with st.spinner(f"Kör {spec.label}..."):
                            exit_code, output = _run_command(ctx, spec)
                        st.session_state["artifacts_last_output"] = output
                        st.session_state["artifacts_last_status"] = (
                            f"{spec.label}: ok" if exit_code == 0 else f"{spec.label}: exit {exit_code}"
                        )
                    if warn:
                        st.caption("Slå på auto-bekräftelse för riskabla körningar.")

    st.session_state["artifacts_selected"] = sorted(updated_selected)

    if st.button("Kör markerade", type="primary", key="artifacts_run_selected"):
        selected_specs = [spec for spec in COMMANDS if spec.id in updated_selected]
        if not selected_specs:
            st.warning("Inga kommandon markerade.")
        elif any(spec.risky for spec in selected_specs) and not auto_confirm:
            st.warning("Markerade körningar innehåller riskabla kommandon. Aktivera auto-bekräftelse först.")
        else:
            combined: list[str] = []
            for spec in selected_specs:
                with st.spinner(f"Kör {spec.label}..."):
                    exit_code, output = _run_command(ctx, spec)
                combined.append(f"=== {spec.label} (exit {exit_code}) ===")
                combined.append(output.strip())
                if exit_code != 0:
                    break
            st.session_state["artifacts_last_output"] = "\n\n".join(combined).strip()
            st.session_state["artifacts_last_status"] = "Markerad sekvens klar"

    last_status = st.session_state.get("artifacts_last_status")
    if last_status:
        st.info(last_status)
    last_output = st.session_state.get("artifacts_last_output")
    if last_output:
        st.code(last_output[-12000:] if len(last_output) > 12000 else last_output)

