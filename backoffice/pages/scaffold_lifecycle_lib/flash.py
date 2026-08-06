from __future__ import annotations

import streamlit as st

from .constants import _POST_ACTION_NOTE_KEY



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
