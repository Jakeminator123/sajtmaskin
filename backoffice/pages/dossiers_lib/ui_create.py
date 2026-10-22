from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.ai_workloads import WORKLOAD_DOSSIER_CURATION, resolve_model_choices
from backoffice.shared import (
    backup_file,
    backup_tree,
    confirm_by_typing,
    danger_zone,
    field_label,
    render_building_blocks_nav,
    render_save_scope,
    run_repo_command,
    tech_details,
    validate_json_against_schema,
)


def _facade():
    from backoffice.pages import dossiers as page

    return page


from .constants import (
    PAGE_NAME,
    REPO_ROOT,
    DOSSIER_ROOT,
    HARD_ROOT,
    SOFT_ROOT,
    INDEX_ROOT,
    CAPABILITY_MAP_PATH,
    STRICT_SCHEMA_PATH,
    TEMPLATE_REFS_ROOT,
    CAPABILITY_TIERS_PATH,
    REQUIRED_FIELDS,
    VALIDATE_MANIFEST_TS_PATH,
    _KEBAB_RE,
    _COMPLEXITY_FALLBACK,
    _MOCK_FALLBACK,
    _ALLOWED_ENFORCEMENT,
    _INSTRUCTIONS_STUB,
)

from .labels import (
    class_description,
    class_label,
    mock_label,
    is_default_for_capability,
)

from .io import (
    _load_mockless_capability_exceptions,
    _schema_enum,
    _COMPLEXITY_OPTIONS,
    _MOCK_OPTIONS,
    _existing_default_for_capability,
    _load_json,
    _save_json,
    _list_dossier_dirs,
    _walk_all_dossiers,
    _validate_manifest,
    _summarize_enforcement,
    _load_group_view,
    _group_label_for_capability,
    _groups_view_is_stale,
    _run_capability_map_write,
    _rebuild_capability_map,
    _extract_ts_union_values,
    _apply_manifest_field_edits,
    _is_link_like,
    _delete_dossier_dir,
    _list_template_refs,
    _run_curate,
    _apply_capability_override,
    _describe_capability_group_hint,
    _npm_binary,
    _create_dossier_skeleton,
    _run_sdk_version_check,
    _rerun_after_dossier_mutation,
)


def _section_create_from_scratch() -> None:
    st.divider()
    st.subheader("Skapa byggblock från grunden")
    st.caption(
        "Skapar ett manifest-skelett + `instructions.md`-stub under "
        "`data/dossiers/<klass>/<id>/`. Strict-schemat måste vara grönt innan "
        "något skrivs, och en befintlig katalog skrivs aldrig över. Kod, filer "
        "och env-nycklar lägger du till efteråt via Redigera-tabben."
    )
    # Klassvalet ligger utanför formuläret så demoläges-fältet kan reagera på
    # det direkt (widgets inne i ett st.form uppdateras först vid submit).
    target_class = st.radio(
        "Klass",
        ["soft", "hard"],
        horizontal=True,
        key="create_scratch_class",
        format_func=class_label,
        help=(
            f"{class_description('soft')} "
            f"{class_description('hard')}"
        ),
    )
    with st.form("create_dossier_scratch_form", clear_on_submit=False):
        target_id = st.text_input(
            field_label("id", hint="kebab-case, blir katalognamnet"),
            key="create_scratch_id",
        )
        new_label = st.text_input(field_label("label"), key="create_scratch_label")
        capability = st.text_input(
            field_label(
                "capability",
                hint="kebab-case, t.ex. `payments` — återanvänd hellre en befintlig",
            ),
            key="create_scratch_capability",
        )
        cols = st.columns(2)
        with cols[0]:
            complexity = st.selectbox(
                field_label("complexity"),
                list(_facade()._COMPLEXITY_OPTIONS),
                index=1 if len(_facade()._COMPLEXITY_OPTIONS) > 1 else 0,
            )
        with cols[1]:
            code_fidelity = st.selectbox(
                field_label(
                    "codeFidelity", hint="verbatim = LLM:en får inte skriva om filerna"
                ),
                ["rewritable", "verbatim"],
            )
        summary = st.text_area(
            field_label(
                "summary", hint="engelska, 30-600 tecken — går till codegen-prompten"
            ),
            height=80,
            key="create_scratch_summary",
        )
        summary_sv = st.text_area(
            field_label(
                "summarySv", hint="valfri, minst 20 tecken — visas för användare"
            ),
            height=80,
            key="create_scratch_summary_sv",
        )
        default_flag = st.checkbox(
            field_label(
                "defaultForCapability", hint="vinner när flera byggblock delar funktion"
            ),
            key="create_scratch_default",
        )
        provider_ids: list[str] | None = None
        mock_choice: str | None = None
        if target_class == "hard":
            provider_text = st.text_input(
                field_label(
                    "providers",
                    hint="obligatoriska provider-id:n, kommaseparerade; t.ex. `stripe`",
                ),
                key="create_scratch_providers",
            )
            provider_ids = [
                value.strip()
                for value in re.split(r"[,\n]", provider_text)
                if value.strip()
            ]
            mock_choice = st.selectbox(
                field_label("mock", hint="obligatoriskt för Kopplade byggblock"),
                list(_facade()._MOCK_OPTIONS),
                # Enum:arna kommer från schemat, så "visual" kan inte antas finnas.
                index=_facade()._MOCK_OPTIONS.index("visual")
                if "visual" in _facade()._MOCK_OPTIONS
                else 0,
                format_func=mock_label,
            )
            st.caption(
                "`none` godtas bara för funktioner på undantagslistan "
                f"(`{'`, `'.join(sorted(_load_mockless_capability_exceptions()))}`) "
                "— annars stoppar både formuläret och `dossiers:validate-all`."
            )
        submitted = st.form_submit_button("Skapa byggblock", type="primary")

    if submitted:
        ok, msg = _create_dossier_skeleton(
            target_class,
            target_id.strip(),
            label=new_label,
            capability=capability.strip(),
            providers=provider_ids,
            summary=summary,
            complexity=complexity,
            code_fidelity=code_fidelity,
            mock=mock_choice,
            summary_sv=summary_sv,
            default_for_capability=default_flag,
        )
        if not ok:
            st.error(msg)
        else:
            st.session_state["create_scratch_created"] = (
                f"data/dossiers/{target_class}/{target_id.strip()}"
            )
            _rerun_after_dossier_mutation(msg)

    created = st.session_state.get("create_scratch_created")
    if created:
        st.info(f"Senast skapat härifrån: `{created}`.")
        # Tungt subprocess-anrop — ligger bakom knapp, aldrig i default-vyn.
        if st.button(
            "Kör `npm run dossiers:validate-all`", key="create_scratch_validate"
        ):
            with st.spinner("Kör dossiers:validate-all…"):
                result = run_repo_command(
                    _facade().REPO_ROOT,
                    ("npm", "run", "dossiers:validate-all"),
                    timeout=300,
                )
            output = (result["stdoutTail"] + "\n" + result["stderrTail"]).strip()
            (st.success if result["ok"] else st.error)(
                output[-3000:] or "Ingen output."
            )


def _section_curate() -> None:
    st.subheader("AI-kuration från template-references")
    st.caption(
        "Pekar på en klonad mapp under `_template_refs/dossier-references/repos/` "
        "(syskonmapp till checkouten, utanför git) och låter GPT producera ett "
        "**utkast** till dossier-manifest + `instructions.md`. "
        "Granska och spara via Redigera-tabben innan dossiern går live."
    )
    refs = _list_template_refs()
    if not refs:
        # Ingen relative_to(REPO_ROOT) här: roten ligger utanför checkouten och
        # anropet kastade ValueError i exakt den gren som ska förklara felet.
        st.info(
            "Inga template-references hittade. Klona ett repo manuellt till "
            f"`{_facade().TEMPLATE_REFS_ROOT.as_posix()}/<id>/` — mappen ligger "
            "utanför repot som syskon till checkouten."
        )
        return

    st.markdown("**Skapa inom kategori (valfritt)**")
    groups = _load_group_view()
    if not groups:
        st.info(
            "Ingen `groups`-vy hittad i capability-map.json ännu — kör 'Bygg om' "
            "i Kontroller-tabben för att välja kategori här. Du kan ändå "
            "skriva en capability fritt nedan."
        )
    group_ids = list(groups.keys())
    group_labels = {gid: (groups[gid].get("label") or gid) for gid in group_ids}
    group_cols = st.columns(2)
    with group_cols[0]:
        chosen_group_id = (
            st.selectbox(
                "Dossier-grupp (kategori)",
                group_ids,
                format_func=lambda gid: group_labels.get(gid, gid),
                key="curate_group_id",
            )
            if group_ids
            else None
        )
    group_capabilities = (
        groups.get(chosen_group_id, {}).get("capabilities") or []
        if chosen_group_id
        else []
    )
    with group_cols[1]:
        capability_choice = st.selectbox(
            "Capability i gruppen",
            ["(ingen — se fritt fält)"] + group_capabilities,
            key="curate_capability_choice",
        )
    free_capability = st.text_input(
        "…eller ny capability (fritt fält, kebab-case, tar över valet ovan)",
        key="curate_capability_free",
    ).strip()
    decided_capability = free_capability or (
        capability_choice if capability_choice != "(ingen — se fritt fält)" else ""
    )
    if decided_capability:
        st.caption(
            _describe_capability_group_hint(decided_capability, chosen_group_id, groups)
        )
    st.caption(
        "Påminnelse: **varje** hard-dossier måste ha `mock` ≠ `none` — om inte "
        "capabilityn står på undantagslistan "
        "(`MOCKLESS_CAPABILITY_EXCEPTIONS` i `src/lib/gen/dossiers/validate-manifest.ts`, "
        "dokumenterad i `docs/contracts/dossier-system.md`). Annars stoppar "
        "`npm run dossiers:validate-all`."
    )

    cols = st.columns(3)
    with cols[0]:
        ref_id = st.selectbox("Referens-repo", refs)
    with cols[1]:
        target_class = st.radio("Klass", ["hard", "soft"], horizontal=True)
    with cols[2]:
        suggested = ref_id.replace("_", "-").replace(" ", "-").lower() if ref_id else ""
        target_id = st.text_input("Ny dossier-id", value=suggested)
    # Modellvalen ägs av manifestet (workload `backoffice_dossier_curation`),
    # inte av den här sidan och inte av en hårdkodad rad i skriptet.
    curation_models = resolve_model_choices(
        _facade().REPO_ROOT, WORKLOAD_DOSSIER_CURATION
    )
    curation_model = st.selectbox(
        "Modell för kurationen",
        list(curation_models),
        key="curate_model",
        help=(
            "Kommer ur `config/ai_models/manifest.json` → workload "
            f"`{WORKLOAD_DOSSIER_CURATION}`: första valet är dess `defaultModel`, "
            "resten dess `fallbackModels`. Skickas som `--model=` till "
            "`scripts/dossiers/curate-from-reference.ts`."
        ),
    )
    if st.button("🤖 Kurera utkast", type="primary"):
        if not target_id:
            st.error("Ange ett ID för den nya dossiern.")
            return
        # Validate the picked capability BEFORE the expensive LLM run — a typo
        # in the free field must not cost a ~5 min curation first. Mirror the
        # strict schema fully: kebab-case pattern + 2-60 tecken.
        if decided_capability and (
            not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", decided_capability)
            or not (2 <= len(decided_capability) <= 60)
        ):
            st.error(
                f"Ogiltig capability (kebab-case, 2-60 tecken, t.ex. `image-generation`): "
                f"`{decided_capability}` — kurationen startades inte."
            )
            return
        with st.spinner("Kör kurations-skriptet…"):
            ok, output = _run_curate(
                ref_id,
                target_class,
                target_id,
                curation_model,
                decided_capability,
            )
        override_failed = ok and bool(decided_capability) and (
            "KUNDE INTE sätta vald capability" in output
        )
        (st.success if ok and not override_failed else st.error)(output[-3000:])
        if ok and override_failed:
            st.warning(
                "Kurationen publicerades men den valda capabilityn kunde INTE sättas "
                "— utkastet har kvar LLM:ns egen capability. Rätta manuellt i "
                "Redigera-tabben innan dossiern används."
            )
        if ok:
            st.info(
                f"Granska och redigera `data/dossiers/{target_class}/{target_id}/` i Redigera-tabben "
                f"innan dossiern är produktionsklar."
            )
