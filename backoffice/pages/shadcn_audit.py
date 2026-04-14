from __future__ import annotations

import json

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel, write_json


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("shadcn-mirror-audit-policy.json")
    render_where_panel("shadcn-audit", domain_map)
    sp = ctx.config_dir / "shadcn-mirror-audit-policy.json"
    sh = read_json(sp)
    st.json(sh)
    raw_s = st.text_area(
        "Redigera JSON",
        value=json.dumps(sh, indent=2, ensure_ascii=False),
        height=360,
    )
    if st.button("Spara shadcn-policy"):
        try:
            parsed = json.loads(raw_s)
            write_json(sp, parsed)
            st.success("Sparat.")
            st.rerun()
        except json.JSONDecodeError as e:
            st.error(f"Ogiltig JSON: {e}")

