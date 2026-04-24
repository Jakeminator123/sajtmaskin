"""Runtime Scaffolds — översiktstabell + per-scaffold-redigering av manifest.ts."""

from __future__ import annotations

import re

import pandas as pd
import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    _escape_ts_string,
    get_all_manifests,
    read_json,
)


def _parse_ts_string_array(text: str, field: str) -> list[str]:
    pattern = rf"{field}:\s*\[(.*?)\]"
    m = re.search(pattern, text, re.DOTALL)
    if not m:
        return []
    return re.findall(r'"([^"]*)"', m.group(1))


def _write_ts_string_array(text: str, field: str, values: list[str]) -> str:
    items = ", ".join(f'"{_escape_ts_string(v)}"' for v in values)
    pattern = rf"({field}:\s*)\[.*?\]"
    return re.sub(pattern, rf"\g<1>[{items}]", text, count=1, flags=re.DOTALL)


def _parse_ts_multiline_string_array(text: str, field: str) -> list[str]:
    pattern = rf"{field}:\s*\[(.*?)\]"
    m = re.search(pattern, text, re.DOTALL)
    if not m:
        return []
    return re.findall(r'"([^"]*(?:\\.[^"]*)*)"', m.group(1))


def _write_ts_multiline_string_array(text: str, field: str, values: list[str]) -> str:
    if not values:
        pattern = rf"({field}:\s*)\[.*?\]"
        return re.sub(pattern, rf"\g<1>[]", text, count=1, flags=re.DOTALL)
    items = "\n".join(f'    "{_escape_ts_string(v)}",' for v in values)
    pattern = rf"({field}:\s*)\[.*?\]"
    return re.sub(pattern, rf"\g<1>[\n{items}\n  ]", text, count=1, flags=re.DOTALL)


def render(ctx: BackofficeContext) -> None:
    st.header("Runtime Scaffolds")

    manifests = get_all_manifests(ctx)
    research_data = read_json(ctx.research_json) if ctx.research_json.is_file() else None
    has_embeddings = ctx.embeddings_json.exists()

    col1, col2, col3 = st.columns(3)
    col1.metric("Scaffolds", len(manifests))
    col2.metric("Research JSON", "finns" if research_data else "saknas")
    col3.metric("Embeddings JSON", "finns" if has_embeddings else "saknas")

    rows = []
    for m in manifests:
        sid = m.get("id", "?")
        rows.append(
            {
                "id": sid,
                "label": m.get("label", ""),
                "siteKind": m.get("siteKind", ""),
                "complexity": m.get("complexity", ""),
                "structureProfile": m.get("structureProfile", ""),
                "contentProfile": m.get("contentProfile", ""),
                "features": ", ".join(m.get("features", [])),
                "intents": ", ".join(m.get("allowedBuildIntents", [])),
                "files": m.get("file_count", 0),
                "tags": len(m.get("tags", [])),
                "hints": m.get("has_promptHints", False),
                "checklist": m.get("has_qualityChecklist", False),
                "research": m.get("has_research", False),
            }
        )

    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

    st.subheader("Scaffold-detaljer")
    selected_id = st.selectbox("Välj scaffold", [m.get("id", "") for m in manifests])
    if not selected_id:
        return

    sel_manifest = next((m for m in manifests if m.get("id") == selected_id), None)

    if sel_manifest:
        col_a, col_b = st.columns(2)
        with col_a:
            st.markdown("**Manifest-metadata**")
            st.json(
                {
                    "id": sel_manifest.get("id"),
                    "label": sel_manifest.get("label"),
                    "description": sel_manifest.get("description", ""),
                    "allowedBuildIntents": sel_manifest.get("allowedBuildIntents", []),
                    "tags": sel_manifest.get("tags", []),
                    "file_count": sel_manifest.get("file_count", 0),
                }
            )
        with col_b:
            st.markdown("**Traits**")
            st.json(
                {
                    k: sel_manifest.get(k)
                    for k in (
                        "siteKind",
                        "complexity",
                        "structureProfile",
                        "contentProfile",
                        "features",
                    )
                    if sel_manifest.get(k)
                }
            )

        if research_data and isinstance(research_data, dict):
            scaffolds_research = research_data.get("scaffolds", {})
            if selected_id in scaffolds_research:
                st.markdown("**Research overrides**")
                st.json(scaffolds_research[selected_id])

    manifest_path = ctx.scaffolds_dir / selected_id / "manifest.ts"
    if not manifest_path.exists():
        return

    with st.expander("Rå manifest.ts (read-only)"):
        st.code(
            manifest_path.read_text(encoding="utf-8")[:8000],
            language="typescript",
        )

    st.divider()
    st.subheader("Redigera scaffold-metadata")
    manifest_text = manifest_path.read_text(encoding="utf-8")

    current_tags = _parse_ts_string_array(manifest_text, "tags")
    current_intents = _parse_ts_string_array(manifest_text, "allowedBuildIntents")
    current_hints = _parse_ts_multiline_string_array(manifest_text, "promptHints")
    current_checklist = _parse_ts_multiline_string_array(
        manifest_text,
        "qualityChecklist",
    )

    edit_col1, edit_col2 = st.columns(2)
    with edit_col1:
        new_tags_str = st.text_area(
            "Tags (en per rad)",
            value="\n".join(current_tags),
            height=150,
            key=f"tags_{selected_id}",
        )
        all_intents = ["website", "app", "template"]
        new_intents = st.multiselect(
            "Allowed Build Intents",
            options=all_intents,
            default=[i for i in current_intents if i in all_intents],
            key=f"intents_{selected_id}",
        )

    with edit_col2:
        new_hints_str = st.text_area(
            "Prompt Hints (en per rad)",
            value="\n".join(current_hints),
            height=150,
            key=f"hints_{selected_id}",
        )
        new_checklist_str = st.text_area(
            "Quality Checklist (en per rad)",
            value="\n".join(current_checklist),
            height=150,
            key=f"checklist_{selected_id}",
        )

    if st.button("Spara ändringar", key=f"save_{selected_id}", type="primary"):
        new_tags = [t.strip() for t in new_tags_str.strip().splitlines() if t.strip()]
        new_hints = [h.strip() for h in new_hints_str.strip().splitlines() if h.strip()]
        new_checklist = [
            c.strip() for c in new_checklist_str.strip().splitlines() if c.strip()
        ]

        updated = manifest_text
        updated = _write_ts_string_array(updated, "tags", new_tags)
        updated = _write_ts_string_array(
            updated,
            "allowedBuildIntents",
            new_intents,
        )
        updated = _write_ts_multiline_string_array(updated, "promptHints", new_hints)
        updated = _write_ts_multiline_string_array(
            updated,
            "qualityChecklist",
            new_checklist,
        )

        if updated != manifest_text:
            manifest_path.write_text(updated, encoding="utf-8")
            st.success(f"Sparade ändringar till {manifest_path.name}")
            st.rerun()
        else:
            st.info("Inga ändringar att spara.")
