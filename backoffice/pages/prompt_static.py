from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, read_text, render_where_panel, write_text


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("config/prompt-static")
    render_where_panel("prompt-static", domain_map)
    ps_dir = ctx.config_dir / "prompt-static"
    files = sorted(ps_dir.glob("*.md"))
    labels = [f.name for f in files]
    if not labels:
        st.warning("Inga .md-filer hittades.")
    else:
        choice = st.selectbox("Välj fil", labels, index=0)
        fp = ps_dir / choice
        content = read_text(fp)
        new_content = st.text_area(
            f"Innehåll — {choice}",
            value=content,
            height=520,
            key=f"ps_{choice}",
        )
        b1, b2 = st.columns(2)
        with b1:
            if st.button("Spara prompt-static-fil", type="primary"):
                write_text(fp, new_content)
                st.success("Sparat (UTF-8).")
        with b2:
            st.caption(f"Full sökväg: `{fp}`")

