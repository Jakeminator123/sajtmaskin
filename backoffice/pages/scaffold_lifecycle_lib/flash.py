from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    _escape_ts_string,
    backup_file,
    backup_tree,
    confirm_by_typing,
    danger_zone,
    field_label,
    get_all_manifests,
    nav_link_button,
    read_json,
    read_text,
    render_building_blocks_nav,
    render_save_scope,
    tech_details,
    validate_json_against_schema,
    write_json,
    write_text,
)
from backoffice.shared import extract_ts_string_array_field as _extract_ts_string_array_field
from backoffice.shared import extract_ts_string_field as _extract_ts_string_field


from .constants import (
    PAGE_NAME,
    THEME_TOKEN_KEYS,
    SITE_KIND_OPTIONS,
    COMPLEXITY_OPTIONS,
    BUILD_INTENT_OPTIONS,
    _SIG_MIN_LAYOUTS,
    _SIG_MIN_MOTIFS,
    _SIG_MIN_ANTI,
    _POST_ACTION_NOTE_KEY,
    _REBUILD_EMBEDDINGS_HINT,
    BLOB_MANIFEST_REL,
    BASELINE_TAG,
    BASELINE_PATHS,
)



def _flash_note(message: str, *, level: str = "success") -> None:
    """Persist a note across the ``st.rerun()`` that create/edit/delete trigger.

    A plain ``st.success``/``st.warning`` rendered right before ``st.rerun()`` is
    discarded by the rerun, so post-action guidance (e.g. "rebuild embeddings")
    would never be seen. Stash it in session state and render it on the next run.
    """
    st.session_state[_POST_ACTION_NOTE_KEY] = {"message": message, "level": level}




def _render_flashed_note() -> None:
    note = st.session_state.pop(_POST_ACTION_NOTE_KEY, None)
    if not isinstance(note, dict):
        return
    level = str(note.get("level", "success"))
    message = str(note.get("message", ""))
    if not message:
        return
    if level == "warning":
        st.warning(message)
    elif level == "error":
        st.error(message)
    else:
        st.success(message)
