from __future__ import annotations

from pathlib import Path

import streamlit as st

from backoffice.pages import PAGE_GROUPS, PAGE_MAP, PAGE_NAMES, PAGE_QUERY_ALIASES
from backoffice.pages.llm_flow_status import build_canvas
from backoffice.shared import build_backoffice_context, ensure_utf8_stdio, load_domain_map


def _page_from_nav_query() -> str | None:
    try:
        raw = st.query_params.get("nav")
        if raw is None:
            return None
        if isinstance(raw, list):
            value = (raw[0] or "").strip() if raw else ""
        else:
            value = str(raw).strip()
        if not value:
            return None
        mapped = PAGE_QUERY_ALIASES.get(value, value)
        return mapped if mapped in PAGE_MAP else None
    except Exception:
        return None


def run_backoffice_app(
    *,
    title: str = "Sajtmaskin Backoffice",
    legacy_source: str | None = None,
    initial_page: str | None = None,
) -> None:
    ensure_utf8_stdio()
    st.set_page_config(
        page_title=title,
        page_icon="⚙",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    st.markdown(
        """
<style>
    div[data-testid="stMetricValue"] { font-size: 1.1rem; }
</style>
""",
        unsafe_allow_html=True,
    )

    if "backoffice_repo" not in st.session_state:
        st.session_state["backoffice_repo"] = build_backoffice_context().repo_root
    ctx = build_backoffice_context(Path(st.session_state["backoffice_repo"]))

    # Regenerera den deterministiska LLM-flöde-canvasen en gång per session, så
    # `docs/canvases/llm-flow.canvas.{txt,json}` speglar nuvarande signaler när
    # backoffice startar. Mjuk: blockerar aldrig appen om `node` saknas/fel.
    if not st.session_state.get("canvas_built"):
        st.session_state["canvas_built"] = True
        with st.spinner("Uppdaterar LLM-flöde-canvas ..."):
            _canvas_res = build_canvas(ctx.repo_root)
        if not _canvas_res.get("ok"):
            st.session_state["canvas_build_warning"] = _canvas_res.get("error")

    domain_map = load_domain_map(str(ctx.domain_map_json))

    if "backoffice_nav" not in st.session_state:
        st.session_state["backoffice_nav"] = (
            _page_from_nav_query() or initial_page or PAGE_NAMES[0]
        )

    current_spec = PAGE_MAP.get(st.session_state["backoffice_nav"], PAGE_MAP[PAGE_NAMES[0]])
    current_group = current_spec.group
    pages_by_group = {
        group: [name for name in PAGE_NAMES if PAGE_MAP[name].group == group]
        for group in PAGE_GROUPS
    }

    with st.sidebar:
        st.subheader("Navigation")
        group = st.radio(
            "Område",
            PAGE_GROUPS,
            index=PAGE_GROUPS.index(current_group) if current_group in PAGE_GROUPS else 0,
            key="backoffice_group_radio",
            horizontal=False,
        )
        group_pages = pages_by_group[group]
        current = st.session_state["backoffice_nav"]
        if current not in group_pages:
            current = group_pages[0]
        page = st.selectbox(
            "Vy",
            group_pages,
            index=group_pages.index(current),
            key="backoffice_nav_select",
            format_func=lambda name: name,
        )
        st.session_state["backoffice_nav"] = page
        st.caption(
            "`config/` · `docs/` · `.cursor/` · `scripts/` · `data/dossiers/`"
        )
        st.divider()
        st.subheader("Repo")
        st.text_area(
            "repo_path",
            value=str(ctx.repo_root),
            height=88,
            disabled=True,
            label_visibility="collapsed",
        )
        if st.button("Läs om filer från disk"):
            st.cache_data.clear()
            st.rerun()

    st.title(title)
    if legacy_source:
        st.info(
            f"Detta är den konsoliderade backoffice-appen. Du öppnade den via legacy-entrypointen `{legacy_source}`."
        )
    st.caption(f"Område: **{PAGE_MAP[page].group}**")
    page_summary = ((domain_map.get("pages") or {}).get(page) or {}).get("summary")
    if page_summary:
        st.caption(page_summary)
    st.caption(
        "En samlad Streamlit-yta för konfiguration, overhead, artifacts och driftpaneler. Kod är source of truth; panelen ska spegla runtime-sanningen."
    )

    spec = PAGE_MAP[page]
    spec.render(ctx)

