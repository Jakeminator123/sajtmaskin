"""Mental modell — schema.md + snabbfakta om scaffolds."""

from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, get_all_manifests


def render(ctx: BackofficeContext) -> None:
    st.header("Mental modell — schema.md")
    if ctx.schema_md.exists():
        st.markdown(ctx.schema_md.read_text(encoding="utf-8"))
    else:
        st.warning(f"Filen {ctx.schema_md} hittades inte.")

    st.divider()
    st.subheader("Snabbfakta")
    manifests = get_all_manifests(ctx)
    st.markdown(f"- **Antal scaffolds:** {len(manifests)}")
    st.markdown(f"- **Scaffold-IDs:** {', '.join(m.get('id', '?') for m in manifests)}")
    site_kinds = {m.get("siteKind", "?") for m in manifests if m.get("siteKind")}
    st.markdown(f"- **Site kinds:** {', '.join(sorted(site_kinds))}")
    complexities = {m.get("complexity", "?") for m in manifests if m.get("complexity")}
    st.markdown(f"- **Complexities:** {', '.join(sorted(complexities))}")
