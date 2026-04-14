from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, read_text, render_where_panel, write_text


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("user_degraded_env.txt")
    render_where_panel("user_degraded_env", domain_map)
    up = ctx.config_dir / "user_degraded_env.txt"
    txt = read_text(up)
    new_txt = st.text_area("Policy / kommentarer (UTF-8)", value=txt, height=520)
    if st.button("Spara user_degraded_env.txt", type="primary"):
        write_text(up, new_txt)
        st.success("Sparat.")

