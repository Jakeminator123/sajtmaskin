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
    CLASS_LABELS,
    MOCK_LABELS,
    _MOCKLESS_FALLBACK,
    _COMPLEXITY_FALLBACK,
    _MOCK_FALLBACK,
    _ALLOWED_ENFORCEMENT,
    _NORMALIZE_MODELS,
    _INSTRUCTIONS_STUB,
)

from .labels import (
    class_label,
    mock_label,
    requires_f3,
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
    _save_raw_manifest,
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
    _prospect_root,
    _load_prospect_plan,
    _load_prospect_report,
    _read_prospect_verdict_files,
    _run_normalize,
    _promote_prospect,
    _create_dossier_skeleton,
    _run_sdk_version_check,
)



def _section_edit(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Redigera byggblock")
    if not dossiers:
        return
    options = {f"{d['_class']}/{d['id']}": d for d in dossiers}
    pick_key = st.selectbox(
        "Välj byggblock",
        list(options.keys()),
        format_func=lambda k: f"{options[k]['id']} — {class_label(options[k]['_class'])}",
    )
    if not pick_key:
        return
    chosen = options[pick_key]
    manifest_path = _facade().REPO_ROOT / chosen["_path"] / "manifest.json"
    manifest = _load_json(manifest_path)

    if manifest:
        st.caption(
            f"{field_label('capability')}: `{manifest.get('capability')}` · "
            f"Klass: {class_label(chosen['_class'])} — funktion och klass byts "
            "via rå JSON (teknik-expandern nedan)."
        )
        current_mock = str(manifest.get("mock") or "none")
        mock_index = (
            _facade()._MOCK_OPTIONS.index(current_mock) if current_mock in _facade()._MOCK_OPTIONS else len(_facade()._MOCK_OPTIONS) - 1
        )
        current_complexity = str(manifest.get("complexity") or "medium")
        complexity_index = (
            _facade()._COMPLEXITY_OPTIONS.index(current_complexity)
            if current_complexity in _facade()._COMPLEXITY_OPTIONS
            else 1
        )
        with st.form(f"dossier_field_form_{pick_key}"):
            edited_label = st.text_input(
                field_label("label"), value=str(manifest.get("label") or "")
            )
            edited_summary_sv = st.text_area(
                field_label("summarySv", hint="visas för användare, aldrig i prompten"),
                value=str(manifest.get("summarySv") or ""),
                height=80,
                help="Minst 20 tecken, eller tomt för att ta bort fältet (UI faller då tillbaka på engelska `summary`).",
            )
            edited_complexity = st.selectbox(
                field_label("complexity"), list(_facade()._COMPLEXITY_OPTIONS), index=complexity_index
            )
            edited_default = st.checkbox(
                field_label("defaultForCapability", hint="vinner när flera byggblock delar funktion"),
                value=is_default_for_capability(manifest),
            )
            edited_mock = st.selectbox(
                field_label("mock", hint="hur ytan fungerar i preview utan riktig nyckel"),
                list(_facade()._MOCK_OPTIONS),
                index=mock_index,
                format_func=mock_label,
            )
            if chosen["_class"] == "hard":
                st.caption(
                    "`none` godtas bara för funktioner på undantagslistan "
                    f"(`{'`, `'.join(sorted(_load_mockless_capability_exceptions()))}`) "
                    "— annars vägrar sparningen, precis som i skapa-formuläret."
                )
            submitted = st.form_submit_button("Spara fält", type="primary")
        if submitted:
            if not edited_label.strip():
                st.error(f"{field_label('label')} krävs.")
            else:
                updates: dict[str, Any] = {
                    "label": edited_label.strip(),
                    "complexity": edited_complexity,
                    "summarySv": edited_summary_sv.strip() or None,
                    # `none` är samma sak som utelämnat fält — skriv inte in det.
                    "mock": edited_mock if edited_mock != "none" else None,
                    # Sätt bara False explicit om fältet redan finns i filen.
                    "defaultForCapability": True
                    if edited_default
                    else (False if "defaultForCapability" in manifest else None),
                }
                ok, msg = _apply_manifest_field_edits(
                    manifest_path, updates, dossier_class=chosen["_class"]
                )
                if ok:
                    st.success(f"Sparat {manifest_path.relative_to(_facade().REPO_ROOT)}")
                    st.cache_data.clear()
                else:
                    st.error(msg)
    else:
        st.warning(
            "Manifestet kunde inte läsas som JSON — rätta det via rå-JSON-editorn nedan."
        )

    # Rå JSON = full kontroll över alla schemafält (envVars, files, exposes …),
    # men samma klassregel + strict-schema som runtime måste vara gröna före
    # backup/skrivning.
    with tech_details("Rå JSON (full kontroll över alla fält)"):
        raw = manifest_path.read_text(encoding="utf-8")
        edited = st.text_area("manifest.json", value=raw, height=400, key=f"edit_{pick_key}")
        if st.button("Spara rå JSON", type="primary", key=f"save_{pick_key}"):
            try:
                parsed = json.loads(edited)
            except json.JSONDecodeError as exc:
                st.error(f"Ogiltig JSON: {exc}")
                return
            ok, msg = _save_raw_manifest(
                manifest_path, parsed, dossier_class=chosen["_class"]
            )
            if not ok:
                st.error(msg)
                return
            st.success(f"Sparat {manifest_path.relative_to(_facade().REPO_ROOT)}")
            st.cache_data.clear()




def _section_delete(dossiers: list[dict[str, Any]]) -> None:
    """Radera ett byggblock ur live-poolen med checklistan från
    `.cursor/rules/dossier-rules.mdc` (capability, defaultForCapability,
    envVars, dependencies, capability-map) renderad som konkret läges-info
    för just det valda byggblocket. Farlig zon-mönstret från Fas B:
    `danger_zone` + kryssad checklista + `confirm_by_typing` i ett formulär."""
    st.divider()
    if not dossiers:
        return
    zone = danger_zone(
        "Radera byggblock",
        help_text=(
            "Tar bort byggblockets katalog ur live-poolen. En zip-snapshot tas "
            "först (se Återställning) — kan den inte tas händer ingenting."
        ),
    )
    with zone:
        _render_delete_body(dossiers)




def _render_delete_body(dossiers: list[dict[str, Any]]) -> None:
    options = {f"{d['_class']}/{d['id']}": d for d in dossiers}
    pick_key = st.selectbox(
        "Välj byggblock att radera",
        list(options.keys()),
        key="delete_pick",
        format_func=lambda k: f"{options[k]['id']} — {class_label(options[k]['_class'])}",
    )
    if not pick_key:
        return
    chosen = options[pick_key]
    capability = chosen.get("capability") or ""
    # Normalized comparison (trim + lowercase) — mirrors resolveDossierGroup
    # and the TS capability-map script, so a manifest edited with stray
    # casing/whitespace still counts as a sibling in the checklist.
    cap_norm = str(capability).strip().lower()
    siblings = [
        d
        for d in dossiers
        if str(d.get("capability") or "").strip().lower() == cap_norm
        and d.get("id") != chosen.get("id")
    ]
    env_keys = [
        str(ev.get("key")) for ev in (chosen.get("envVars") or []) if isinstance(ev, dict)
    ]
    deps = [str(dep) for dep in (chosen.get("dependencies") or [])]

    if siblings:
        cap_line = (
            f"{len(siblings)} leverantörssyskon kvar under `{capability}`: "
            + ", ".join(sorted(str(d.get("id")) for d in siblings))
            + "."
        )
    else:
        cap_line = (
            f"detta är ENDA byggblocket under `{capability}` — funktionen försvinner "
            "ur poolen; kontrollera referenser (brief-prompt, follow-up-vokabulär, "
            "capability-inference)."
        )
    if is_default_for_capability(chosen) and siblings:
        default_line = (
            "detta är funktionens **Standardval** — flagga ett syskon som nytt "
            "standardval, annars stoppar `dossiers:validate-all` "
            "(mock-fallback-invarianten kräver en upplösbar default)."
        )
    elif is_default_for_capability(chosen):
        default_line = "detta är Standardval, men hela funktionen försvinner med det."
    else:
        default_line = "ingen standardvals-flytt behövs (byggblocket är inte Standardval)."

    st.markdown(
        "**Checklista före radering** (per `dossier-rules.mdc`):\n"
        f"- **capability**: {cap_line}\n"
        f"- **defaultForCapability**: {default_line}\n"
        f"- **envVars**: {', '.join(env_keys) if env_keys else 'inga'} — städa ev. lagrade projekt-env/placeholder-flöden.\n"
        f"- **dependencies**: {', '.join(deps) if deps else 'inga'}.\n"
        "- **capability-map**: bygg om efter radering (Kontroller-tabben) och kör `npm run dossiers:validate-all`."
    )

    # Bekräftelsen ligger i ett formulär, samma mönster som scaffold-/variant-
    # raderingen i Fas B: fritextfältet skickar sitt värde först vid submit, så
    # ingen halvskriven bekräftelse kan råka gälla.
    with st.form("delete_dossier_form"):
        ack = st.checkbox("Jag har gått igenom checklistan ovan", key="delete_ack")
        confirmed = confirm_by_typing(
            str(chosen.get("id") or ""),
            "delete_confirm",
            label="Bekräfta genom att skriva byggblockets id",
        )
        submitted = st.form_submit_button("Radera från live-poolen", type="primary")
    if submitted:
        if not ack:
            st.error("Du måste gå igenom checklistan ovan först — inget raderades.")
            return
        if not confirmed:
            st.error(
                f"Bekräftelsetexten måste vara exakt `{chosen.get('id')}` — inget raderades."
            )
            return
        ok, msg = _delete_dossier_dir(chosen)
        (st.success if ok else st.error)(msg)
        if ok:
            # Drop the widget state that points at the now-deleted dossier —
            # otherwise the next rerun's selectbox/text_input restore a value
            # that no longer exists in options (StreamlitAPIException).
            for state_key in ("delete_pick", "delete_ack", "delete_confirm"):
                st.session_state.pop(state_key, None)
            st.cache_data.clear()
