from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_text, write_text


def render(ctx: BackofficeContext) -> None:
    st.header("user_degraded_env.txt")
    up = ctx.config_dir / "user_degraded_env.txt"
    txt = read_text(up)
    new_txt = st.text_area("Policy / kommentarer (UTF-8)", value=txt, height=520)
    if st.button("Spara user_degraded_env.txt", type="primary"):
        write_text(up, new_txt)
        st.success("Sparat.")

