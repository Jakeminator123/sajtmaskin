from __future__ import annotations

import re

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, read_text, render_where_panel, write_text


_DIRECTIVE_NAME_RE = re.compile(r"<!--\s*directive:\s*(.+?)\s*-->")
_CASCADE_RE = re.compile(r"<!--\s*cascade:\s*(.+?)\s*-->")
_DEFAULT_RE = re.compile(r"<!--\s*default:\s*(.+?)\s*-->")


def _parse_directive_metadata(content: str) -> dict[str, str | list[str]]:
    name_match = _DIRECTIVE_NAME_RE.search(content)
    cascade_match = _CASCADE_RE.search(content)
    defaults = _DEFAULT_RE.findall(content)
    return {
        "name": name_match.group(1) if name_match else "unknown",
        "cascade": cascade_match.group(1) if cascade_match else "N/A",
        "defaults": defaults,
    }


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Directives (config/prompt-directives)")
    render_where_panel("prompt-directives", domain_map)

    st.info(
        "**Directives** är adaptiva promptmoduler med placeholder-defaults. "
        "Varje direktiv löses genom **Directive Cascade**: "
        "EXPLICIT (brief) > INDICATED (Brief-LLM) > INFERRED (guidance-resolvers) > DEFAULT (filen)."
    )

    directives_dir = ctx.config_dir / "prompt-directives"
    if not directives_dir.is_dir():
        st.error(f"Mappen `{directives_dir.relative_to(ctx.repo_root)}` saknas.")
        return

    manifest_path = ctx.config_dir / "codegen-directives-manifest.json"
    manifest_directives: list[str] = []
    if manifest_path.is_file():
        manifest = read_json(manifest_path)
        manifest_directives = list(manifest.get("directives") or [])

    files = sorted(f for f in directives_dir.glob("*.md") if f.name != "_READ_ME_FIRST.md")
    labels = [f.name for f in files]

    if not labels:
        st.warning("Inga direktiv-filer hittades.")
        return

    choice = st.selectbox("Välj direktiv", labels, index=0)
    fp = directives_dir / choice
    content = read_text(fp)

    meta = _parse_directive_metadata(content)
    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Direktivnamn", str(meta["name"]))
    with c2:
        st.metric("Cascade", str(meta["cascade"]))
    with c3:
        defaults = meta.get("defaults", [])
        st.metric("Antal defaults", len(defaults) if isinstance(defaults, list) else 0)

    rel_path = f"prompt-directives/{choice}"
    in_manifest = rel_path in manifest_directives
    if in_manifest:
        st.success(f"✅ Registrerad i manifest (position {manifest_directives.index(rel_path) + 1})")
    else:
        st.warning(f"⚠️ Ej registrerad i `codegen-directives-manifest.json` — lägg till `{rel_path}`.")

    if isinstance(defaults, list) and defaults:
        with st.expander("Registrerade defaults"):
            for i, d in enumerate(defaults):
                st.code(d, language=None)

    new_content = st.text_area(
        f"Innehåll — {choice}",
        value=content,
        height=520,
        key=f"pd_{choice}",
    )
    b1, b2 = st.columns(2)
    with b1:
        if st.button("Spara direktiv", type="primary"):
            write_text(fp, new_content)
            st.success("Sparat (UTF-8).")
    with b2:
        st.caption(f"Full sökväg: `{fp}`")
