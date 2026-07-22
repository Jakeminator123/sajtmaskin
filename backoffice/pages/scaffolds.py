"""Scaffolds — samlad vy: översikt, termguide, detaljer och metadata-redigering.

Konsoliderad 2026-07-21 från tre tidigare sidor: `Runtime scaffolds` (read-only
detaljvy + termguide), `Scaffolds` (tabell + manifest.ts-redigering) och
`Mental modell` (docs-rendering). CRUD (skapa/klona/radera scaffolds och
varianter) bor kvar i **Scaffold Lifecycle**; AI-guidat skapande i
**Scaffold Wizard**.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    _escape_ts_string,
    extract_ts_string_array_field,
    extract_ts_string_field,
    nav_link_button,
    read_json,
    read_text,
    render_where_panel,
    write_text,
)


def _load_scaffold_manifest(manifest_path: Path, ctx: BackofficeContext) -> dict[str, Any]:
    text = read_text(manifest_path)
    scaffold_id = manifest_path.parent.name
    files_dir = manifest_path.parent / "files"
    files_count = 0
    if files_dir.is_dir():
        files_count = sum(1 for path in files_dir.rglob("*") if path.is_file())
    return {
        "id": scaffold_id,
        "label": extract_ts_string_field(text, "label") or scaffold_id,
        "description": extract_ts_string_field(text, "description"),
        "siteKind": extract_ts_string_field(text, "siteKind") or "-",
        "complexity": extract_ts_string_field(text, "complexity") or "-",
        "structureProfile": extract_ts_string_field(text, "structureProfile") or "-",
        "contentProfile": extract_ts_string_field(text, "contentProfile") or "-",
        "features": extract_ts_string_array_field(text, "features"),
        "allowedBuildIntents": extract_ts_string_array_field(text, "allowedBuildIntents"),
        "tags": extract_ts_string_array_field(text, "tags"),
        "promptHints": extract_ts_string_array_field(text, "promptHints"),
        "qualityChecklist": extract_ts_string_array_field(text, "qualityChecklist"),
        "upgradeTargets": extract_ts_string_array_field(text, "upgradeTargets"),
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


def _write_ts_string_array(text: str, field: str, values: list[str]) -> str:
    items = ", ".join(f'"{_escape_ts_string(v)}"' for v in values)
    pattern = rf"({field}:\s*)\[.*?\]"
    return re.sub(pattern, rf"\g<1>[{items}]", text, count=1, flags=re.DOTALL)


def _write_ts_multiline_string_array(text: str, field: str, values: list[str]) -> str:
    if not values:
        pattern = rf"({field}:\s*)\[.*?\]"
        return re.sub(pattern, r"\g<1>[]", text, count=1, flags=re.DOTALL)
    items = "\n".join(f'    "{_escape_ts_string(v)}",' for v in values)
    pattern = rf"({field}:\s*)\[.*?\]"
    return re.sub(pattern, rf"\g<1>[\n{items}\n  ]", text, count=1, flags=re.DOTALL)


def _render_termguide() -> None:
    with st.expander("Termguide: vad betyder fälten?", expanded=False):
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
        st.info(
            "En **scaffold** är en runtime-startpunkt (filshell + manifest) som own-engine "
            "bygger vidare på. **Varianter** är visuella uttryck inom en scaffold "
            "(redigeras i Scaffold Lifecycle). Builderns Mallar-tab (v0-mallar i Blob) "
            "är ett separat system."
        )


def _render_mental_model(ctx: BackofficeContext) -> None:
    with st.expander("Fördjupning: scaffold-systemets mentala modell (docs)", expanded=False):
        if ctx.schema_md.exists():
            st.caption(f"Källa: `{ctx.schema_md.relative_to(ctx.repo_root).as_posix()}`")
            st.markdown(ctx.schema_md.read_text(encoding="utf-8"))
        else:
            st.warning(f"Filen {ctx.schema_md} hittades inte.")


def _render_details(picked: dict[str, Any]) -> None:
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


def _render_editor(ctx: BackofficeContext, picked: dict[str, Any]) -> None:
    selected_id = picked["id"]
    manifest_path = ctx.scaffolds_dir / selected_id / "manifest.ts"
    if not manifest_path.exists():
        st.warning(f"`{selected_id}/manifest.ts` saknas — inget att redigera.")
        return

    st.caption(
        "Här kan du tryggt justera matchningssignaler och promptkrav för en befintlig "
        "scaffold. Sparningen skriver bara dessa fyra fält i `manifest.ts` — och den "
        "gamla versionen säkerhetskopieras automatiskt (se sidan **Återställning**)."
    )
    manifest_text = read_text(manifest_path)

    edit_col1, edit_col2 = st.columns(2)
    with edit_col1:
        new_tags_str = st.text_area(
            "Tags (en per rad) — matchningssignaler",
            value="\n".join(picked["tags"]),
            height=150,
            key=f"tags_{selected_id}",
        )
        all_intents = ["website", "app", "template"]
        new_intents = st.multiselect(
            "Allowed Build Intents — vilka byggen scaffolden får användas för",
            options=all_intents,
            default=[i for i in picked["allowedBuildIntents"] if i in all_intents],
            key=f"intents_{selected_id}",
        )
    with edit_col2:
        new_hints_str = st.text_area(
            "Prompt Hints (en per rad) — instruktioner till own-engine",
            value="\n".join(picked["promptHints"]),
            height=150,
            key=f"hints_{selected_id}",
        )
        new_checklist_str = st.text_area(
            "Quality Checklist (en per rad) — kvalitetskrav",
            value="\n".join(picked["qualityChecklist"]),
            height=150,
            key=f"checklist_{selected_id}",
        )

    with st.expander("Rå manifest.ts (read-only)"):
        st.code(manifest_text[:8000], language="typescript")

    if st.button("Spara ändringar", key=f"save_{selected_id}", type="primary"):
        new_tags = [t.strip() for t in new_tags_str.strip().splitlines() if t.strip()]
        new_hints = [h.strip() for h in new_hints_str.strip().splitlines() if h.strip()]
        new_checklist = [
            c.strip() for c in new_checklist_str.strip().splitlines() if c.strip()
        ]

        updated = manifest_text
        updated = _write_ts_string_array(updated, "tags", new_tags)
        updated = _write_ts_string_array(updated, "allowedBuildIntents", new_intents)
        updated = _write_ts_multiline_string_array(updated, "promptHints", new_hints)
        updated = _write_ts_multiline_string_array(updated, "qualityChecklist", new_checklist)

        if updated != manifest_text:
            write_text(manifest_path, updated)
            st.success(
                f"Sparade ändringar till `{picked['manifestPath']}`. "
                "Föregående version finns under **Återställning**."
            )
            st.rerun()
        else:
            st.info("Inga ändringar att spara.")


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Scaffolds")
    render_where_panel("Scaffolds", domain_map)
    st.caption(
        "Runtime-scaffolds är own-engines startpunkter. Den här vyn visar allt och kan "
        "redigera metadata. Vill du **skapa/klona/radera** scaffolds eller varianter: "
        "använd Scaffold Lifecycle. Vill du bygga en ny variant med AI-hjälp: Scaffold Wizard."
    )
    link_col1, link_col2, _spacer = st.columns([1, 1, 2])
    with link_col1:
        nav_link_button("→ Scaffold Lifecycle", "Scaffold Lifecycle", key="scaffolds_goto_lifecycle")
    with link_col2:
        nav_link_button("→ Scaffold Wizard", "Scaffold Wizard", key="scaffolds_goto_wizard")

    manifests = sorted(ctx.scaffolds_dir.glob("*/manifest.ts"))
    research_path = ctx.research_json
    embeddings_path = ctx.embeddings_json
    scaffold_rows = [_load_scaffold_manifest(manifest, ctx) for manifest in manifests]

    c1, c2, c3 = st.columns(3)
    c1.metric("Scaffold-familjer", len(manifests))
    c2.metric("Research JSON", "finns" if research_path.is_file() else "saknas")
    c3.metric("Embeddings JSON", "finns" if embeddings_path.is_file() else "saknas")

    _render_termguide()
    _render_mental_model(ctx)

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

    if not scaffold_rows:
        st.info("Inga scaffolds hittades under `src/lib/gen/scaffolds/`.")
        return

    st.subheader("Detaljer & redigering")
    by_id = {row["id"]: row for row in scaffold_rows}
    picked_id = st.selectbox(
        "Välj scaffold",
        list(by_id.keys()),
        format_func=lambda scaffold_id: f"{by_id[scaffold_id]['label']} ({scaffold_id})",
    )
    picked = by_id[picked_id]

    research_data = read_json(research_path) if research_path.is_file() else None
    if isinstance(research_data, dict):
        scaffolds_research = research_data.get("scaffolds", {})
        if picked_id in scaffolds_research:
            with st.expander("Research overrides (genererade)", expanded=False):
                st.json(scaffolds_research[picked_id])

    _render_details(picked)

    st.divider()
    st.subheader("Redigera scaffold-metadata")
    _render_editor(ctx, picked)
