from __future__ import annotations

import json
import re
from pathlib import Path

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel, write_json


def _count_component_entries(components_ts: Path) -> int:
    if not components_ts.is_file():
        return 0
    text = components_ts.read_text(encoding="utf-8", errors="replace")
    return len(re.findall(r"^\s+\w+:\s*\"", text, re.MULTILINE))


def _count_local_ui_files(repo_root: Path) -> int:
    ui_dirs = [repo_root / "src" / "components" / "ui", repo_root / "components" / "ui"]
    count = 0
    for d in ui_dirs:
        if d.is_dir():
            count += sum(1 for f in d.iterdir() if f.suffix in (".tsx", ".ts", ".jsx", ".js"))
    return count


def _count_example_files(repo_root: Path) -> int:
    examples_dir = repo_root / "data" / "shadcn-examples"
    if not examples_dir.is_dir():
        return 0
    return sum(1 for f in examples_dir.iterdir() if f.suffix == ".json")


def _check_leaked_registry_imports(repo_root: Path) -> list[str]:
    examples_dir = repo_root / "data" / "shadcn-examples"
    if not examples_dir.is_dir():
        return []
    leaked: list[str] = []
    for f in sorted(examples_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            code = data.get("code", "")
            if "@/registry/" in code:
                leaked.append(f.name)
        except (json.JSONDecodeError, OSError):
            leaked.append(f"{f.name} (unreadable)")
    return leaked


def _read_components_json(repo_root: Path) -> dict:
    cj = repo_root / "components.json"
    if not cj.is_file():
        return {}
    try:
        return json.loads(cj.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _render_sync_status(ctx: BackofficeContext) -> None:
    st.subheader("Registry sync status")

    components_ts = ctx.repo_root / "src" / "lib" / "gen" / "data" / "shadcn-components.ts"
    entry_count = _count_component_entries(components_ts)
    ui_file_count = _count_local_ui_files(ctx.repo_root)
    example_count = _count_example_files(ctx.repo_root)
    leaked = _check_leaked_registry_imports(ctx.repo_root)
    cj = _read_components_json(ctx.repo_root)

    col1, col2, col3 = st.columns(3)
    col1.metric("SHADCN_COMPONENTS entries", entry_count)
    col2.metric("Local UI files", ui_file_count)
    col3.metric("Example cache files", example_count)

    registries = cj.get("registries", {})
    style = cj.get("style", "?")
    hooks_alias = cj.get("aliases", {}).get("hooks", "?")

    st.markdown(f"**components.json:** style `{style}` · hooks alias `{hooks_alias}` · registries: {', '.join(f'`{k}`' for k in registries) or '(inga)'}")

    if leaked:
        st.error(f"Läckta `@/registry/` importer i exempelcachen: {', '.join(leaked)}")
        st.caption("Kör `npm run shadcn:sync-examples` för att rewritea.")
    else:
        st.success("Exempelcachen: inga läckta registry-importer.")

    with st.expander("Sync-kommandon"):
        st.code(
            "npm run shadcn:sync          # Jämför mot upstream (warn-only)\n"
            "npm run shadcn:sync:write    # Uppdatera shadcn-components.ts\n"
            "npm run shadcn:sync-examples # Uppdatera data/shadcn-examples/",
            language="bash",
        )


def _render_community_registries(ctx: BackofficeContext) -> None:
    st.subheader("Community registries")
    cr_path = ctx.config_dir / "community-registries.json"
    if not cr_path.is_file():
        st.info("Ingen `config/community-registries.json` hittad.")
        return
    try:
        registries = json.loads(cr_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        st.error("Kunde inte läsa community-registries.json")
        return

    for reg in registries:
        ns = reg.get("namespace", "?")
        desc = reg.get("description", "")
        mappings = reg.get("sectionMappings", {})
        total_items = sum(len(v) for v in mappings.values())
        max_gen = reg.get("maxPerGeneration", "?")
        st.markdown(f"**{ns}** — {desc}")
        st.caption(f"{len(mappings)} sektionstyper · {total_items} mappade items · max {max_gen} per generation")


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("shadcn Ecosystem")

    _render_sync_status(ctx)

    st.divider()
    _render_community_registries(ctx)

    st.divider()
    st.subheader("shadcn-mirror-audit-policy.json")
    render_where_panel("shadcn-audit", domain_map)
    sp = ctx.config_dir / "shadcn-mirror-audit-policy.json"
    sh = read_json(sp)
    st.json(sh)
    raw_s = st.text_area(
        "Redigera JSON",
        value=json.dumps(sh, indent=2, ensure_ascii=False),
        height=360,
    )
    if st.button("Spara shadcn-policy"):
        try:
            parsed = json.loads(raw_s)
            write_json(sp, parsed)
            st.success("Sparat.")
            st.rerun()
        except json.JSONDecodeError as e:
            st.error(f"Ogiltig JSON: {e}")
