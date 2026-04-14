from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Runtime scaffolds")
    render_where_panel("Runtime scaffolds", domain_map)
    scaffold_dir = ctx.repo_root / "src" / "lib" / "gen" / "scaffolds"
    manifests = sorted(scaffold_dir.glob("*/manifest.ts"))
    research_path = scaffold_dir / "scaffold-research.generated.json"
    embeddings_path = scaffold_dir / "scaffold-embeddings.json"

    c1, c2, c3 = st.columns(3)
    c1.metric("Scaffold-familjer", len(manifests))
    c2.metric("Research JSON", "finns" if research_path.is_file() else "saknas")
    c3.metric("Embeddings JSON", "finns" if embeddings_path.is_file() else "saknas")

    if research_path.is_file():
        try:
            research = read_json(research_path)
            scaffolds = (research.get("scaffolds") or {}) if isinstance(research, dict) else {}
            landing_refs = (
                ((scaffolds.get("landing-page") or {}).get("research") or {}).get("referenceTemplates")
                if isinstance(scaffolds, dict)
                else []
            ) or []
            st.caption(
                f"`scaffold-research.generated.json` innehåller {len(scaffolds)} scaffold-poster. "
                f"`landing-page` har {len(landing_refs)} referenstemplates."
            )
        except Exception as e:
            st.warning(f"Kunde inte läsa scaffold-research.generated.json: {e}")

    rows = [
        {
            "Scaffold": manifest.parent.name,
            "Manifest": str(manifest.relative_to(ctx.repo_root)).replace("\\", "/"),
            "Senast ändrad": manifest.stat().st_mtime,
        }
        for manifest in manifests
    ]
    if rows:
        st.dataframe(rows, width="stretch", hide_index=True)

    st.info(
        "Detta är observability/översikt över runtime-scaffolds. "
        "Builderns Mallar-tab och external-template-pipelinen är separata lager."
    )

