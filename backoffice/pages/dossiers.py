"""Backoffice page: Byggblock (dossiers) — capability-driven, v2 layout.

Facade — helpers live in ``dossiers_lib/``.
"""

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


from .dossiers_lib.constants import (
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
    _NORMALIZE_MODELS,
    _INSTRUCTIONS_STUB,
)

from .dossiers_lib.labels import (
    class_label,
    mock_label,
    requires_f3,
    is_default_for_capability,
)

from .dossiers_lib.io import (
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
    _save_raw_manifest,
    _summarize_enforcement,
    _load_group_view,
    _ensure_capability_map_current,
    _render_dossier_flash,
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

from .dossiers_lib.ui_overview import (
    _section_overview,
    _section_list,
    _section_enforcement_overview,
    _section_capability_tiers,
    _section_capability_map,
    _section_health,
)

from .dossiers_lib.ui_edit import (
    _section_edit,
    _section_delete,
    _render_delete_body,
)

from .dossiers_lib.ui_create import (
    _section_create_from_scratch,
    _section_curate,
    _section_legacy_prospect,
)

from .dossiers_lib.ui_system_map import _section_system_map


# Importerna ovan är re-exporter, inte lokalt använda namn: modulerna i
# ``dossiers_lib/`` slår upp dem sent via sin ``_facade()`` (t.ex.
# ``_facade()._MOCK_OPTIONS``, ``_facade().REPO_ROOT``), så de måste finnas som
# attribut här även när den här filen inte rör dem. ``__all__`` säger det till
# `npm run lint:py` i stället för att fasaden gömms bakom en ignore-rad.
#
# Underscore-namnen står med med flit — de är interna för backoffice men ändå
# en del av fasadens kontrakt mot ``dossiers_lib/``.
__all__ = [
    "Any",
    "CAPABILITY_MAP_PATH",
    "CAPABILITY_TIERS_PATH",
    "DOSSIER_ROOT",
    "HARD_ROOT",
    "INDEX_ROOT",
    "Path",
    "REPO_ROOT",
    "REQUIRED_FIELDS",
    "SOFT_ROOT",
    "STRICT_SCHEMA_PATH",
    "TEMPLATE_REFS_ROOT",
    "VALIDATE_MANIFEST_TS_PATH",
    "_ALLOWED_ENFORCEMENT",
    "_COMPLEXITY_FALLBACK",
    "_COMPLEXITY_OPTIONS",
    "_INSTRUCTIONS_STUB",
    "_KEBAB_RE",
    "_MOCK_FALLBACK",
    "_MOCK_OPTIONS",
    "_NORMALIZE_MODELS",
    "_apply_capability_override",
    "_apply_manifest_field_edits",
    "_create_dossier_skeleton",
    "_delete_dossier_dir",
    "_describe_capability_group_hint",
    "_ensure_capability_map_current",
    "_existing_default_for_capability",
    "_extract_ts_union_values",
    "_group_label_for_capability",
    "_groups_view_is_stale",
    "_is_link_like",
    "_list_dossier_dirs",
    "_list_template_refs",
    "_load_group_view",
    "_load_json",
    "_load_mockless_capability_exceptions",
    "_load_prospect_plan",
    "_load_prospect_report",
    "_npm_binary",
    "_promote_prospect",
    "_prospect_root",
    "_read_prospect_verdict_files",
    "_rebuild_capability_map",
    "_render_delete_body",
    "_render_dossier_flash",
    "_run_capability_map_write",
    "_run_curate",
    "_run_normalize",
    "_run_sdk_version_check",
    "_save_json",
    "_save_raw_manifest",
    "_schema_enum",
    "_section_system_map",
    "_summarize_enforcement",
    "_validate_manifest",
    "backup_file",
    "backup_tree",
    "class_label",
    "confirm_by_typing",
    "danger_zone",
    "datetime",
    "field_label",
    "is_default_for_capability",
    "json",
    "mock_label",
    "os",
    "re",
    "render",
    "requires_f3",
    "run_repo_command",
    "shutil",
    "subprocess",
    "timezone",
    "validate_json_against_schema",
]


def render(ctx) -> None:
    # `app_main` sätter redan sidtiteln — sidan ska bara ha sin egen rubrik.
    st.header("Byggblock (dossiers)")
    _render_dossier_flash()
    render_building_blocks_nav(PAGE_NAME)
    st.markdown(
        "Ett **byggblock** är en färdig funktion som kan byggas in i en genererad "
        "sajt — betalning, inloggning, sökfält, 3D-vy. Byggblocken är en **egen "
        "pool**, inte samma sak som mallar: de väljs deterministiskt utifrån vilka "
        "funktioner briefen ber om."
    )
    render_save_scope("repo", paths=("data/dossiers/hard/", "data/dossiers/soft/"))
    with tech_details():
        st.markdown("- Disk: `data/dossiers/{hard|soft}/<id>/manifest.json`")
        st.markdown("- Strict-schema: `docs/schemas/strict/dossier.schema.json`")
        st.markdown("- Kontrakt: `docs/contracts/dossier-system.md`")
        st.markdown(
            "- Genererad vy: `data/dossiers/_index/capability-map.json` "
            "(byggs om i Kontroller-tabben)"
        )
        st.markdown("- Validera efter ändring: `npm run dossiers:validate-all`")

    dossiers = _walk_all_dossiers()
    # Sex tabbar. OBS: st.tabs kör ALLA tab-bodies vid
    # varje rerun — tunga subprocess-anrop (hälsokoll, validate-all, kuration,
    # capability-map-bygge) ska ligga bakom knappar, aldrig i default-vyn.
    tabs = st.tabs(["Översikt", "Lista", "Systemkarta", "Redigera", "Skapa", "Kontroller"])
    with tabs[0]:
        _section_overview(dossiers)
    with tabs[1]:
        _section_list(dossiers)
    with tabs[2]:
        _section_system_map()
    with tabs[3]:
        _section_edit(dossiers)
        _section_delete(dossiers)
    with tabs[4]:
        _section_curate()
        st.divider()
        _section_legacy_prospect(dossiers)
        _section_create_from_scratch()
    with tabs[5]:
        _section_enforcement_overview(dossiers)
        st.divider()
        _section_capability_tiers()
        st.divider()
        _section_capability_map(dossiers)
        st.divider()
        _section_health()
