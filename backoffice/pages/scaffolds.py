"""Scaffolds — dynamiska filträd, översikt, detaljer och metadata-redigering.

Konsoliderad 2026-07-21 från tre tidigare sidor: `Runtime scaffolds` (read-only
detaljvy + termguide), `Scaffolds` (tabell + manifest.ts-redigering) och
`Mental modell` (docs-rendering). CRUD (skapa/klona/radera scaffolds och
varianter) bor kvar i **Scaffold Lifecycle**; AI-guidat skapande i
**Scaffold Wizard**.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterator, Sequence

import streamlit as st
import streamlit.components.v1 as components

from backoffice.shared import (
    BackofficeContext,
    _escape_ts_string,
    extract_ts_string_array_field,
    extract_ts_string_field,
    field_label,
    read_json,
    read_text,
    render_building_blocks_nav,
    render_save_scope,
    tech_details,
    write_text,
)
from .scaffold_lifecycle_lib.constants import BUILD_INTENT_OPTIONS
from .scaffold_lifecycle_lib import client_projection
from .scaffold_lifecycle_lib.scaffold_ops import _normalize_allowed_build_intents

PAGE_NAME = "Scaffolds: titta & justera"

TREE_VIEW_PAGE_SIZE = 20


def _tree_page_count(total: int, page_size: int = TREE_VIEW_PAGE_SIZE) -> int:
    if total <= 0:
        return 1
    return (total + page_size - 1) // page_size


def _tree_page_slice(
    scaffold_ids: Sequence[str],
    page: int,
    page_size: int = TREE_VIEW_PAGE_SIZE,
) -> list[str]:
    """Ids for `page` (1-indexerad). Out-of-range faller tillbaka till sida 1."""
    page_count = _tree_page_count(len(scaffold_ids), page_size)
    safe_page = min(max(page, 1), page_count)
    start = (safe_page - 1) * page_size
    return list(scaffold_ids[start : start + page_size])


@dataclass(frozen=True)
class ScaffoldTreeSnapshot:
    """On-disk scaffold tree captured for one Streamlit render."""

    scaffold_id: str
    label: str
    site_kind: str
    complexity: str
    relative_paths: tuple[str, ...]

    @property
    def runtime_file_count(self) -> int:
        return sum(path.startswith("files/") for path in self.relative_paths)

    @property
    def route_count(self) -> int:
        return sum(
            path.endswith("/page.tsx")
            and (path.startswith("files/app/") or path.startswith("files/src/app/"))
            for path in self.relative_paths
        )

    @property
    def component_count(self) -> int:
        return sum(
            path.startswith("files/components/")
            or path.startswith("files/src/components/")
            for path in self.relative_paths
        )

    @property
    def directory_count(self) -> int:
        directories: set[str] = set()
        for relative_path in self.relative_paths:
            parts = PurePosixPath(relative_path).parts
            directories.update("/".join(parts[:index]) for index in range(1, len(parts)))
        return len(directories)


TreeNode = tuple[int, str, str, bool]


def _tree_trie(relative_paths: tuple[str, ...]) -> dict[str, dict]:
    trie: dict[str, dict] = {}
    for relative_path in relative_paths:
        cursor = trie
        for part in PurePosixPath(relative_path).parts:
            cursor = cursor.setdefault(part, {})
    return trie


def _iter_tree_nodes(relative_paths: tuple[str, ...]) -> Iterator[TreeNode]:
    """Yield depth, display name, full path and directory flag."""

    def walk(node: dict[str, dict], *, depth: int, parent: str) -> Iterator[TreeNode]:
        for name, children in node.items():
            path = f"{parent}/{name}" if parent else name
            is_directory = bool(children)
            yield depth, name, path, is_directory
            if children:
                yield from walk(children, depth=depth + 1, parent=path)

    yield from walk(_tree_trie(relative_paths), depth=0, parent="")


def _format_scaffold_tree(snapshot: ScaffoldTreeSnapshot) -> str:
    """Plain-text representation copied to the operator's clipboard."""

    def walk(node: dict[str, dict], *, prefix: str) -> list[str]:
        lines: list[str] = []
        items = list(node.items())
        for index, (name, children) in enumerate(items):
            is_last = index == len(items) - 1
            connector = "└──" if is_last else "├──"
            suffix = "/" if children else ""
            lines.append(f"{prefix}{connector} {name}{suffix}")
            if children:
                child_prefix = prefix + ("    " if is_last else "│   ")
                lines.extend(walk(children, prefix=child_prefix))
        return lines

    return "\n".join(
        [f"{snapshot.scaffold_id}/", *walk(_tree_trie(snapshot.relative_paths), prefix="")]
    )


def _discover_scaffold_trees(scaffolds_dir: Path) -> list[ScaffoldTreeSnapshot]:
    """Read every current scaffold root directly from disk, without caching."""

    snapshots: list[ScaffoldTreeSnapshot] = []
    if not scaffolds_dir.is_dir():
        return snapshots

    for scaffold_dir in sorted(path for path in scaffolds_dir.iterdir() if path.is_dir()):
        manifest_path = scaffold_dir / "manifest.ts"
        files_dir = scaffold_dir / "files"
        if not manifest_path.is_file() or not files_dir.is_dir():
            continue

        manifest_text = read_text(manifest_path)
        relative_paths = tuple(
            path.relative_to(scaffold_dir).as_posix()
            for path in sorted(scaffold_dir.rglob("*"))
            if path.is_file()
        )
        snapshots.append(
            ScaffoldTreeSnapshot(
                scaffold_id=scaffold_dir.name,
                label=extract_ts_string_field(manifest_text, "label") or scaffold_dir.name,
                site_kind=extract_ts_string_field(manifest_text, "siteKind") or "-",
                complexity=extract_ts_string_field(manifest_text, "complexity") or "-",
                relative_paths=relative_paths,
            )
        )
    return snapshots


def _render_tree_styles() -> None:
    st.markdown(
        """
<style>
  .sm-scaffold-tree {
    border: 1px solid color-mix(in srgb, var(--text-color) 16%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--secondary-background-color) 70%, transparent);
    padding: 0.55rem;
    margin: 0.35rem 0 0.55rem;
  }
  .sm-tree-node {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 1.85rem;
    border-radius: 0.42rem;
    padding-top: 0.18rem;
    padding-bottom: 0.18rem;
    color: var(--text-color);
  }
  .sm-tree-node:hover {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .sm-tree-node--directory {
    font-weight: 650;
  }
  .sm-tree-icon {
    flex: 0 0 1.15rem;
    width: 1.15rem;
    text-align: center;
    font-size: 0.88rem;
  }
  .sm-tree-name {
    overflow-wrap: anywhere;
    font-family: var(--font-monospace, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 0.79rem;
    line-height: 1.25rem;
  }
</style>
""",
        unsafe_allow_html=True,
    )


def _render_tree_graph(snapshot: ScaffoldTreeSnapshot) -> None:
    rows: list[str] = []
    for depth, name, path, is_directory in _iter_tree_nodes(snapshot.relative_paths):
        kind = "directory" if is_directory else "file"
        icon = "📁" if is_directory else "📄"
        rows.append(
            f'<div class="sm-tree-node sm-tree-node--{kind}" '
            f'role="treeitem" aria-level="{depth + 1}" '
            f'data-scaffold-path="{html.escape(path, quote=True)}" '
            f'style="padding-left:{0.45 + depth * 1.05:.2f}rem">'
            f'<span class="sm-tree-icon" aria-hidden="true">{icon}</span>'
            f'<span class="sm-tree-name">{html.escape(name)}</span>'
            "</div>"
        )
    st.markdown(
        '<div class="sm-scaffold-tree" role="tree">' + "".join(rows) + "</div>",
        unsafe_allow_html=True,
    )


def _copy_tree_button_html(snapshot: ScaffoldTreeSnapshot) -> str:
    """Self-contained browser clipboard component for one scaffold tree."""

    payload = json.dumps(_format_scaffold_tree(snapshot), ensure_ascii=False).replace("</", "<\\/")
    return f"""
<!doctype html>
<html lang="sv">
<head>
  <style>
    :root {{ color-scheme: light dark; }}
    body {{ margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    button {{
      appearance: none;
      border: 1px solid #64748b;
      border-radius: 0.5rem;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: 650;
      padding: 0.42rem 0.72rem;
    }}
    button:hover {{ border-color: #14b8a6; color: #0f766e; }}
    button:focus-visible {{ outline: 2px solid #14b8a6; outline-offset: 2px; }}
    #status {{ margin-left: 0.55rem; font-size: 0.78rem; color: #0f766e; }}
  </style>
</head>
<body>
  <button id="copy-tree" type="button">Kopiera filträd</button>
  <span id="status" role="status" aria-live="polite"></span>
  <script>
    const value = {payload};
    const button = document.getElementById("copy-tree");
    const status = document.getElementById("status");

    function fallbackCopy(text) {{
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(area);
      if (!copied) throw new Error("copy command failed");
    }}

    button.addEventListener("click", async () => {{
      try {{
        if (navigator.clipboard && window.isSecureContext) {{
          await navigator.clipboard.writeText(value);
        }} else {{
          fallbackCopy(value);
        }}
        status.textContent = "Kopierat ✓";
      }} catch (error) {{
        try {{
          fallbackCopy(value);
          status.textContent = "Kopierat ✓";
        }} catch (fallbackError) {{
          status.textContent = "Kunde inte kopiera";
        }}
      }}
    }});
  </script>
</body>
</html>
"""


def _render_copy_tree_button(snapshot: ScaffoldTreeSnapshot) -> None:
    markup = _copy_tree_button_html(snapshot)
    iframe = getattr(st, "iframe", None)
    if callable(iframe):
        iframe(markup, height=42)
    else:
        # Streamlit 1.49 compatibility. `st.iframe` replaces this API in 1.60,
        # but requirements.backoffice.txt still intentionally permits 1.49+.
        components.html(markup, height=42, scrolling=False)


def _render_scaffold_tree_view(ctx: BackofficeContext) -> None:
    snapshots = _discover_scaffold_trees(ctx.scaffolds_dir)
    if not snapshots:
        st.info("Inga kompletta scaffold-rötter med `manifest.ts` och `files/` hittades.")
        return

    _render_tree_styles()
    total_routes = sum(snapshot.route_count for snapshot in snapshots)
    metric1, metric2, metric3 = st.columns(3)
    metric1.metric("Scaffolds på disk", len(snapshots))
    metric2.metric("Runtimefiler", sum(snapshot.runtime_file_count for snapshot in snapshots))
    metric3.metric("Routefiler", total_routes)

    st.markdown(
        "Filträden läses direkt från `src/lib/gen/scaffolds/<id>/` vid varje rendering. "
        "De visar endast filer som verkligen finns i repot — runtime-tillägg som "
        "`app/icon.svg` visas därför inte här."
    )

    preferred_defaults = (
        "landing-page",
        "blog",
        "dashboard",
        "ecommerce",
        "app-shell",
    )
    by_id = {snapshot.scaffold_id: snapshot for snapshot in snapshots}
    default_ids = [scaffold_id for scaffold_id in preferred_defaults if scaffold_id in by_id]
    default_ids.extend(
        snapshot.scaffold_id for snapshot in snapshots if snapshot.scaffold_id not in default_ids
    )
    default_ids = default_ids[:TREE_VIEW_PAGE_SIZE]

    selected_ids = st.multiselect(
        f"Visa scaffolds ({TREE_VIEW_PAGE_SIZE} filträd per sida)",
        options=list(by_id),
        default=default_ids,
        format_func=lambda scaffold_id: f"{by_id[scaffold_id].label} ({scaffold_id})",
        help="Urvalet påverkar bara vyn. Filerna läses alltid från respektive scaffold-rot.",
    )
    if not selected_ids:
        st.info("Välj minst en scaffold för att visa dess filträd.")
        return

    page = 1
    page_count = _tree_page_count(len(selected_ids))
    if page_count > 1:
        page = st.radio(
            "Sida",
            options=list(range(1, page_count + 1)),
            horizontal=True,
            format_func=lambda number: (
                f"{(number - 1) * TREE_VIEW_PAGE_SIZE + 1}–"
                f"{min(number * TREE_VIEW_PAGE_SIZE, len(selected_ids))}"
            ),
            help=f"{len(selected_ids)} valda scaffolds fördelade på {page_count} sidor.",
        )

    columns = st.columns(2)
    for index, scaffold_id in enumerate(_tree_page_slice(selected_ids, page)):
        snapshot = by_id[scaffold_id]
        with columns[index % 2]:
            with st.container(border=True):
                st.markdown(f"### {snapshot.label}")
                st.caption(
                    f"`{snapshot.scaffold_id}` · {snapshot.site_kind} · {snapshot.complexity}"
                )
                st.caption(
                    f"{snapshot.runtime_file_count} runtimefiler · "
                    f"{snapshot.route_count} routes · "
                    f"{snapshot.component_count} komponentfiler · "
                    f"{snapshot.directory_count} mappar"
                )
                _render_tree_graph(snapshot)
                _render_copy_tree_button(snapshot)


def _count_variants(ctx: BackofficeContext) -> int:
    """Antal variant-JSON kopplade till scaffolds (hoppar över `_index`)."""
    if not ctx.variants_dir.is_dir():
        return 0
    return len(
        [
            path
            for path in ctx.variants_dir.glob("*/*.json")
            if not path.parent.name.startswith("_")
        ]
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


@client_projection.scaffold_mutation_locked
def _save_scaffold_metadata(
    ctx: BackofficeContext,
    *,
    scaffold_id: str,
    tags: list[str],
    allowed_build_intents: list[str],
    prompt_hints: list[str],
    quality_checklist: list[str],
) -> bool:
    """Persist canonical metadata, then regenerate its client projection."""
    intents = _normalize_allowed_build_intents(allowed_build_intents)
    manifest_path = ctx.scaffolds_dir / scaffold_id / "manifest.ts"
    client_list_path = ctx.scaffolds_dir / "scaffold-client-list.generated.ts"
    original_bytes: dict[Path, bytes | None] = {
        manifest_path: manifest_path.read_bytes(),
        client_list_path: (
            client_list_path.read_bytes() if client_list_path.is_file() else None
        ),
    }
    manifest_text = (original_bytes[manifest_path] or b"").decode("utf-8").replace(
        "\r\n", "\n"
    )

    if re.search(r"allowedBuildIntents:\s*\[", manifest_text) is None:
        raise ValueError(
            "Manifestet saknar allowedBuildIntents-fältet. Ingen fil ändrades."
        )

    updated_manifest = manifest_text
    updated_manifest = _write_ts_string_array(updated_manifest, "tags", tags)
    updated_manifest = _write_ts_string_array(
        updated_manifest, "allowedBuildIntents", intents
    )
    updated_manifest = _write_ts_multiline_string_array(
        updated_manifest, "promptHints", prompt_hints
    )
    updated_manifest = _write_ts_multiline_string_array(
        updated_manifest, "qualityChecklist", quality_checklist
    )
    if updated_manifest == manifest_text:
        return False

    try:
        write_text(manifest_path, updated_manifest)
        client_projection.regenerate_scaffold_client_projection(ctx.repo_root)
    except Exception as error:
        rollback_errors: list[str] = []
        for path, original in original_bytes.items():
            try:
                if original is None:
                    if path.exists():
                        path.unlink()
                else:
                    path.write_bytes(original)
            except Exception as rollback_error:
                rollback_errors.append(f"{path}: {rollback_error}")
        if rollback_errors:
            raise RuntimeError(
                "Sparningen och rollbacken misslyckades: " + "; ".join(rollback_errors)
            ) from error
        raise
    return True


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

    st.markdown(
        "Här justerar du hur scaffolden matchas och vad den kräver. Sparningen rör "
        "bara fyra manifestfält och håller den klientlätta intent-projektionen synkad."
    )
    render_save_scope(
        "repo",
        paths=(
            picked["manifestPath"],
            "src/lib/gen/scaffolds/scaffold-client-list.generated.ts",
        ),
    )
    manifest_text = read_text(manifest_path)

    edit_col1, edit_col2 = st.columns(2)
    with edit_col1:
        new_tags_str = st.text_area(
            field_label("tags", hint="en per rad"),
            value="\n".join(picked["tags"]),
            height=150,
            key=f"tags_{selected_id}",
            help="Matchningssignaler: orden matchern väger scaffolden mot.",
        )
        new_intents = st.multiselect(
            field_label("allowedBuildIntents"),
            options=list(BUILD_INTENT_OPTIONS),
            default=[
                intent
                for intent in picked["allowedBuildIntents"]
                if intent in BUILD_INTENT_OPTIONS
            ],
            key=f"intents_{selected_id}",
            help="Vilka byggen scaffolden får användas för.",
        )
    with edit_col2:
        new_hints_str = st.text_area(
            field_label("promptHints", hint="en per rad"),
            value="\n".join(picked["promptHints"]),
            height=150,
            key=f"hints_{selected_id}",
        )
        new_checklist_str = st.text_area(
            field_label("qualityChecklist", hint="en per rad"),
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

        try:
            changed = _save_scaffold_metadata(
                ctx,
                scaffold_id=selected_id,
                tags=new_tags,
                allowed_build_intents=new_intents,
                prompt_hints=new_hints,
                quality_checklist=new_checklist,
            )
        except (OSError, RuntimeError, ValueError) as error:
            st.error(f"Sparades inte: {error}")
            return

        if changed:
            st.success(
                f"Sparade `{picked['manifestPath']}` och synkade klientprojektionen. "
                "Föregående version finns under **Återställning**."
            )
            st.rerun()
        else:
            st.info("Inga ändringar att spara.")


def render(ctx: BackofficeContext) -> None:
    st.header("Scaffolds: titta & justera")
    render_building_blocks_nav(PAGE_NAME)
    st.markdown(
        "En **scaffold** är startpunkten som sajten byggs vidare från. Här kan du "
        "titta på alla scaffolds och finjustera hur de matchas och vad de kräver."
    )
    st.caption(
        "Skapa, klona eller ta bort gör du i **Scaffolds & varianter** — eller med "
        "AI-hjälp i **Guide**. Länkarna ligger i kedjan högst upp."
    )

    tree_tab, metadata_tab = st.tabs(["Filstruktur", "Översikt & metadata"])
    with tree_tab:
        _render_scaffold_tree_view(ctx)

    with metadata_tab:
        _render_scaffold_metadata_view(ctx)


def _render_scaffold_metadata_view(ctx: BackofficeContext) -> None:
    """Befintlig scaffold-översikt/editor, separerad från den nya trädfliken."""

    manifests = sorted(ctx.scaffolds_dir.glob("*/manifest.ts"))
    research_path = ctx.research_json
    embeddings_path = ctx.embeddings_json
    scaffold_rows = [_load_scaffold_manifest(manifest, ctx) for manifest in manifests]

    c1, c2 = st.columns(2)
    c1.metric("Scaffolds", len(manifests))
    c2.metric("Varianter kopplade till dem", _count_variants(ctx))

    with tech_details():
        st.markdown("- Manifest: `src/lib/gen/scaffolds/<id>/manifest.ts`")
        st.markdown("- Varianter: `config/scaffold-variants/<scaffold>/<variant>.json`")
        st.markdown(
            "- Genererade artefakter: "
            f"`scaffold-research.generated.json` ({'finns' if research_path.is_file() else 'saknas'}), "
            f"`scaffold-embeddings.json` ({'finns' if embeddings_path.is_file() else 'saknas'})"
        )
        st.markdown("- Validera efter ändring: `npm run scaffolds:validate`")

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
