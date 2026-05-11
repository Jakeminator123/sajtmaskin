from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, read_text, render_where_panel


def _unescape_ts_string(value: str) -> str:
    return value.replace('\\"', '"').replace("\\\\", "\\")


def _extract_ts_string_field(text: str, field: str) -> str:
    match = re.search(rf'{field}:\s*\n?\s*"([^"]*(?:\\.[^"]*)*)"', text)
    return _unescape_ts_string(match.group(1)).strip() if match else ""


def _extract_ts_string_array_field(text: str, field: str) -> list[str]:
    match = re.search(rf"{field}:\s*\[(.*?)\]", text, re.DOTALL)
    if not match:
        return []
    values: list[str] = []
    for raw_value in re.findall(r'"([^"]*(?:\\.[^"]*)*)"', match.group(1)):
        value = _unescape_ts_string(raw_value).strip()
        if value:
            values.append(value)
    return values


def _load_scaffold_manifest(manifest_path: Path, ctx: BackofficeContext) -> dict[str, Any]:
    text = read_text(manifest_path)
    scaffold_id = manifest_path.parent.name
    files_dir = manifest_path.parent / "files"
    files_count = 0
    if files_dir.is_dir():
        files_count = sum(1 for path in files_dir.rglob("*") if path.is_file())
    return {
        "id": scaffold_id,
        "label": _extract_ts_string_field(text, "label") or scaffold_id,
        "description": _extract_ts_string_field(text, "description"),
        "siteKind": _extract_ts_string_field(text, "siteKind") or "-",
        "complexity": _extract_ts_string_field(text, "complexity") or "-",
        "structureProfile": _extract_ts_string_field(text, "structureProfile") or "-",
        "contentProfile": _extract_ts_string_field(text, "contentProfile") or "-",
        "features": _extract_ts_string_array_field(text, "features"),
        "allowedBuildIntents": _extract_ts_string_array_field(text, "allowedBuildIntents"),
        "tags": _extract_ts_string_array_field(text, "tags"),
        "promptHints": _extract_ts_string_array_field(text, "promptHints"),
        "qualityChecklist": _extract_ts_string_array_field(text, "qualityChecklist"),
        "upgradeTargets": _extract_ts_string_array_field(text, "upgradeTargets"),
        "manifestPath": str(manifest_path.relative_to(ctx.repo_root)).replace("\\", "/"),
        "filesCount": files_count,
    }


def _list_text(values: list[str], *, empty: str = "Inget angivet.") -> None:
    if not values:
        st.caption(empty)
        return
    for value in values:
        st.markdown(f"- {value}")


def _comma(values: list[str]) -> str:
    return ", ".join(values) if values else "-"


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Runtime scaffolds")
    render_where_panel("Runtime scaffolds", domain_map)
    scaffold_dir = ctx.repo_root / "src" / "lib" / "gen" / "scaffolds"
    manifests = sorted(scaffold_dir.glob("*/manifest.ts"))
    research_path = scaffold_dir / "scaffold-research.generated.json"
    embeddings_path = scaffold_dir / "scaffold-embeddings.json"
    scaffold_rows = [_load_scaffold_manifest(manifest, ctx) for manifest in manifests]

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

    with st.expander("Termguide: varför fälten inte är dubbletter", expanded=False):
        st.markdown(
            """
| Grupp | Fält | Roll |
|---|---|---|
| Identity | `id`, `label`, `description` | Stabil nyckel, UI-namn och kort beskrivning. |
| Routing | `siteKind`, `allowedBuildIntents`, `complexity` | Styr vilken typ av bygge scaffolden får användas för. |
| Shape | `structureProfile` | Beskriver layout/skelett, t.ex. sidebar-app eller one-page marketing. |
| Content | `contentProfile`, `tags`, `features` | Beskriver innehålls-/domänriktning och matchningssignaler. |
| Prompt | `promptHints`, `qualityChecklist`, `research.upgradeTargets` | Instruktioner och kvalitetskrav som påverkar own-engine. |
"""
        )

    overview_rows = [
        {
            "id": row["id"],
            "label": row["label"],
            "siteKind": row["siteKind"],
            "allowedBuildIntents": _comma(row["allowedBuildIntents"]),
            "complexity": row["complexity"],
            "structureProfile": row["structureProfile"],
            "contentProfile": row["contentProfile"],
            "files": row["filesCount"],
        }
        for row in scaffold_rows
    ]
    if overview_rows:
        st.subheader("Översikt")
        st.dataframe(overview_rows, width="stretch", hide_index=True)

    if scaffold_rows:
        st.subheader("Scaffold-detaljer")
        by_id = {row["id"]: row for row in scaffold_rows}
        picked_id = st.selectbox(
            "Välj scaffold",
            list(by_id.keys()),
            format_func=lambda scaffold_id: f"{by_id[scaffold_id]['label']} ({scaffold_id})",
        )
        picked = by_id[picked_id]

        identity_tab, routing_tab, shape_tab, content_tab, prompt_tab = st.tabs(
            ["Identity", "Routing", "Shape", "Content", "Prompt"],
        )
        with identity_tab:
            st.markdown(f"**id:** `{picked['id']}`")
            st.markdown(f"**label:** {picked['label']}")
            st.markdown(f"**manifest:** `{picked['manifestPath']}`")
            st.markdown(f"**files:** {picked['filesCount']}")
            st.write(picked["description"] or "Ingen beskrivning angiven.")
        with routing_tab:
            st.dataframe(
                [
                    {"signal": "siteKind", "value": picked["siteKind"]},
                    {"signal": "allowedBuildIntents", "value": _comma(picked["allowedBuildIntents"])},
                    {"signal": "complexity", "value": picked["complexity"]},
                ],
                width="stretch",
                hide_index=True,
            )
        with shape_tab:
            st.markdown(f"**structureProfile:** `{picked['structureProfile']}`")
            st.caption("Layout/skelett som own-engine bör bevara när innehåll och domän byts.")
        with content_tab:
            st.markdown(f"**contentProfile:** `{picked['contentProfile']}`")
            st.markdown("**features**")
            _list_text(picked["features"])
            st.markdown("**tags**")
            _list_text(picked["tags"])
        with prompt_tab:
            st.markdown("**promptHints**")
            _list_text(picked["promptHints"])
            st.markdown("**qualityChecklist**")
            _list_text(picked["qualityChecklist"])
            st.markdown("**research.upgradeTargets**")
            _list_text(picked["upgradeTargets"])

    st.info(
        "Detta är observability/översikt över runtime-scaffolds. "
        "Builderns Mallar-tab och external-template-pipelinen är separata lager."
    )

