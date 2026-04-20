from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel, write_json


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Core Manifest (codegen-core-manifest.json)")
    render_where_panel("Codegen core", domain_map)

    st.info(
        "Styr ordningen och urvalet av **Core Rules**-fragment som konkateneras "
        "till den statiska delen av systemprompten. Se `config/prompt-core/_READ_ME_FIRST.md`."
    )

    path = ctx.config_dir / "codegen-core-manifest.json"
    if not path.is_file():
        st.error("`config/codegen-core-manifest.json` saknas.")
        return

    data = read_json(path)

    sep = st.text_input("fragmentSeparator", value=data.get("fragmentSeparator", "\n\n"))
    notes = data.get("editorNotes")
    if isinstance(notes, dict):
        with st.expander("editorNotes (read-only i UI — redigera i JSON om du vill)"):
            st.json(notes)

    frags = list(data.get("fragments") or [])
    st.subheader("Fragment (ordning = concat-ordning)")
    rows = [{"ordning": i + 1, "sökväg": f} for i, f in enumerate(frags)]
    edited = st.data_editor(
        rows,
        num_rows="dynamic",
        column_config={
            "ordning": st.column_config.NumberColumn("Ordning", min_value=1, step=1),
            "sökväg": st.column_config.TextColumn("Sökväg (relativt config/)", width="large"),
        },
        hide_index=True,
        width="stretch",
        key="codegen_core_frag_editor",
    )

    if st.button("Spara manifest", type="primary"):
        cleaned = []
        for r in edited:
            if not isinstance(r, dict):
                continue
            pth = (r.get("sökväg") or "").strip()
            if not pth:
                continue
            ordning = r.get("ordning")
            try:
                o = int(ordning)
            except (TypeError, ValueError):
                o = 10**6
            cleaned.append({"_o": o, "sökväg": pth})
        cleaned.sort(key=lambda x: x["_o"])
        new_frags = [x["sökväg"] for x in cleaned]
        out = {**data, "fragmentSeparator": sep, "fragments": new_frags}
        write_json(path, out)
        st.success("Sparat.")
        st.rerun()

    st.caption("Tips: nya rader läggs till i tabellen; tom `sökväg` ignoreras vid spar.")
