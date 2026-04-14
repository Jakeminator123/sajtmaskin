from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Template pipeline och runtime-artifacts")
    render_where_panel("Template pipeline", domain_map)
    raw_dir = ctx.repo_root / "data" / "external-template-pipeline" / "raw-discovery" / "current"
    repo_cache_dir = ctx.repo_root / "data" / "external-template-pipeline" / "repo-cache"
    runtime_catalog = ctx.repo_root / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
    runtime_embeddings = ctx.repo_root / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Raw discovery", "finns" if raw_dir.is_dir() else "saknas")
    c2.metric("Repo-cache", "finns" if repo_cache_dir.is_dir() else "saknas")
    c3.metric("Runtime catalog", "finns" if runtime_catalog.is_file() else "saknas")
    c4.metric("Runtime embeddings", "finns" if runtime_embeddings.is_file() else "saknas")

    if runtime_catalog.is_file():
        try:
            catalog = read_json(runtime_catalog)
            entries = catalog.get("entries") if isinstance(catalog, dict) else None
            count = len(entries) if isinstance(entries, list) else 0
            st.caption(f"`template-library.generated.json` innehåller {count} entries.")
        except Exception as e:
            st.warning(f"Kunde inte läsa template-library.generated.json: {e}")

    if raw_dir.is_dir():
        catalog_path = raw_dir / "catalog.json"
        summary_path = raw_dir / "summary.json"
        st.markdown("**Rådata (research, inte runtime)**")
        st.markdown(f"- `{catalog_path.relative_to(ctx.repo_root).as_posix()}`")
        st.markdown(f"- `{summary_path.relative_to(ctx.repo_root).as_posix()}`")

    st.info(
        "Research-pipelinen under `data/external-template-pipeline/` är bygginput. "
        "Kondenserad extern research kan fortfarande nå modellen indirekt via scaffold-research."
    )

