from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, read_text, render_where_panel, write_text


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Core Rules (config/prompt-core)")
    render_where_panel("prompt-core", domain_map)

    st.info(
        "**Core Rules** är oföränderliga produktregler som aldrig varierar per request. "
        "De definierar stack, output-format, komponentkontrakt, beteenderegler och importkonventioner. "
        "Adaptiva promptmoduler finns under **prompt-directives**."
    )

    core_dir = ctx.config_dir / "prompt-core"
    legacy_dir = ctx.config_dir / "prompt-static"

    if core_dir.is_dir():
        active_dir = core_dir
        st.caption(f"Aktiv mapp: `{core_dir.relative_to(ctx.repo_root)}`")
    elif legacy_dir.is_dir():
        active_dir = legacy_dir
        st.warning(
            f"Använder legacy-mapp `{legacy_dir.relative_to(ctx.repo_root)}`. "
            "Migrera till `config/prompt-core/` för nya konventionen."
        )
    else:
        st.error("Varken `config/prompt-core/` eller `config/prompt-static/` hittades.")
        return

    files = sorted(f for f in active_dir.glob("*.md") if f.name != "_READ_ME_FIRST.md")
    labels = [f.name for f in files]
    if not labels:
        st.warning("Inga .md-filer hittades.")
    else:
        choice = st.selectbox("Välj fil", labels, index=0)
        fp = active_dir / choice
        content = read_text(fp)
        new_content = st.text_area(
            f"Innehåll — {choice}",
            value=content,
            height=520,
            key=f"pc_{choice}",
        )
        b1, b2 = st.columns(2)
        with b1:
            if st.button("Spara Core-fil", type="primary"):
                write_text(fp, new_content)
                st.success("Sparat (UTF-8).")
        with b2:
            st.caption(f"Full sökväg: `{fp}`")
