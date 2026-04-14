from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, read_text, render_where_panel, write_text

CURSOR_AGENT_DOCUMENTS: tuple[tuple[str, str], ...] = (
    (
        ".cursor/rules/terminology.mdc",
        "terminology.mdc — produkt, builder, lanes (Cursor-regel)",
    ),
    (
        "docs/architecture/repository-and-platform.md",
        "repository-and-platform.md — mappar, integrationer, repo (översikt)",
    ),
)


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Cursor-agenter — terminologi")
    st.markdown(
        "Här redigerar du **samma filer** som Cursor använder som ordlista och kontext för agenter."
    )
    render_where_panel("Cursor-agenter", domain_map)

    labels = [pair[1] for pair in CURSOR_AGENT_DOCUMENTS]
    picked = st.radio("Välj dokument", labels, horizontal=True, key="cursor_agent_doc")
    label_to_rel = {lab: r for r, lab in CURSOR_AGENT_DOCUMENTS}
    rel = label_to_rel[picked]
    cursor_fp = ctx.repo_root / rel
    key_safe = rel.replace("/", "_").replace("\\", "_")

    st.caption(f"Aktuell fil: `{rel}`")
    if rel.endswith(".mdc"):
        st.warning(
            "Behåll YAML-blocket överst (`---` … `description` / `alwaysApply`) "
            "så att Cursor fortfarande tolkar filen som projektregel."
        )

    if not cursor_fp.is_file():
        st.error(f"Filen finns inte: `{cursor_fp}`")
    else:
        body = read_text(cursor_fp)
        edited = st.text_area(
            "Innehåll (samma fil som Cursor/agenter använder)",
            value=body,
            height=620,
            key=f"cursor_body_{key_safe}",
        )
        if st.button("Spara till fil", type="primary"):
            write_text(cursor_fp, edited)
            st.success(f"Sparat: `{rel}` — nya chattar laddar uppdaterad text.")
            st.rerun()

