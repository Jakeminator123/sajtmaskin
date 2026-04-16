from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel, write_json


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Directives Manifest (codegen-directives-manifest.json)")
    render_where_panel("Codegen directives", domain_map)

    st.info(
        "Styr ordningen och urvalet av **Directive**-filer som laddas av `directive-loader.ts`. "
        "Se `config/prompt-directives/_READ_ME_FIRST.md`."
    )

    path = ctx.config_dir / "codegen-directives-manifest.json"
    if not path.is_file():
        st.error(f"Manifestfilen `{path.relative_to(ctx.repo_root)}` saknas.")
        return

    data = read_json(path)

    sep = st.text_input("fragmentSeparator", value=data.get("fragmentSeparator", "\n\n"))
    notes = data.get("editorNotes")
    if isinstance(notes, dict):
        with st.expander("editorNotes (read-only i UI — redigera i JSON om du vill)"):
            st.json(notes)

    directives = list(data.get("directives") or [])
    st.subheader("Direktiv (ordning = prioritetsordning)")
    rows = [{"ordning": i + 1, "sökväg": d} for i, d in enumerate(directives)]
    edited = st.data_editor(
        rows,
        num_rows="dynamic",
        column_config={
            "ordning": st.column_config.NumberColumn("Ordning", min_value=1, step=1),
            "sökväg": st.column_config.TextColumn("Sökväg (relativt config/)", width="large"),
        },
        hide_index=True,
        width="stretch",
        key="codegen_directives_editor",
    )

    directives_dir = ctx.config_dir / "prompt-directives"
    if directives_dir.is_dir():
        existing = {f"prompt-directives/{f.name}" for f in directives_dir.glob("*.md") if f.name != "_READ_ME_FIRST.md"}
        registered = {(r.get("sökväg") or "").strip() for r in edited if isinstance(r, dict)}
        unregistered = existing - registered
        if unregistered:
            st.warning(f"Filer utan manifest-registrering: {', '.join(sorted(unregistered))}")

    if st.button("Spara directives-manifest", type="primary"):
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
        new_directives = [x["sökväg"] for x in cleaned]
        out = {**data, "fragmentSeparator": sep, "directives": new_directives}
        write_json(path, out)
        st.success("Sparat.")
        st.rerun()

    st.caption("Tips: nya rader läggs till i tabellen; tom `sökväg` ignoreras vid spar.")
