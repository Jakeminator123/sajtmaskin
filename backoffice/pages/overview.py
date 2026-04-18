from __future__ import annotations

from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel

CONFIG_NAV_PAGES = (
    "Översikt",
    "LLM-faser & runtime-sanning",
    "Codegen core",
    "prompt-core",
    "Codegen directives",
    "prompt-directives",
    "ai_models",
    "Runtime scaffolds",
    "Preview och versioner",
    "env-policy",
    "shadcn-audit",
    "user_degraded_env",
    "Cursor-agenter",
    "Scaffolds",
    "Research & Dossiers",
    "Pipeline",
    "Eval",
    "Orchestration Map",
    "Autofix & Kvalitet",
    "Mental modell",
)


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}, "repoSiblings": {}}

    with st.expander("Repo-roten: config (inkl. dashboard/) · docs · .cursor", expanded=False):
        for name, blurb in (domain_map.get("repoSiblings") or {}).items():
            st.markdown(f"**`{name}/`** — {blurb}")

    render_where_panel("Översikt", domain_map)

    overview_rows: list[dict[str, str]] = []
    pages_meta = domain_map.get("pages") or {}
    for nav in CONFIG_NAV_PAGES:
        if nav == "Översikt":
            continue
        m = pages_meta.get(nav) or {}
        cps = m.get("canonicalPaths") or []
        overview_rows.append(
            {
                "Vy": nav,
                "Primär källa": cps[0] if cps else "—",
                "Kort": (m.get("summary") or "")[:140],
            }
        )
    if overview_rows:
        st.subheader("Karta: vy → var du redigerar / läser")
        st.dataframe(overview_rows, width="stretch", hide_index=True)

    paths = {
        "codegen-core-manifest.json": ctx.config_dir / "codegen-core-manifest.json",
        "codegen-directives-manifest.json": ctx.config_dir / "codegen-directives-manifest.json",
        "env-policy.json": ctx.config_dir / "env-policy.json",
        "shadcn-mirror-audit-policy.json": ctx.config_dir / "shadcn-mirror-audit-policy.json",
        "user_degraded_env.txt": ctx.config_dir / "user_degraded_env.txt",
        "ai_models/manifest.json": ctx.config_dir / "ai_models" / "manifest.json",
    }

    items = list(paths.items())
    cols = st.columns(len(items), gap="small")
    for col, (label, p) in zip(cols, items):
        with col:
            exists = p.is_file()
            short = label.replace(".json", "").replace(".txt", "")
            st.metric(short, "finns" if exists else "saknas")

    st.subheader("prompt-core (Core Rules)")
    pc = sorted((ctx.config_dir / "prompt-core").glob("*.md"))
    st.write(f"**{len(pc)}** `.md`-filer i `config/prompt-core/`")

    st.subheader("prompt-directives (Directives)")
    pd = sorted((ctx.config_dir / "prompt-directives").glob("*.md"))
    st.write(f"**{len(pd)}** `.md`-filer i `config/prompt-directives/`")

    st.subheader("ai_models (dokument + manifest)")
    am = list((ctx.config_dir / "ai_models").glob("*.md")) + list(
        (ctx.config_dir / "ai_models").glob("*.txt")
    )
    st.write(f"**{len(am)}** dokument i `config/ai_models/`")

    for manifest_key in ("codegen-core-manifest.json", "codegen-directives-manifest.json"):
        try:
            cg = read_json(paths[manifest_key])
            frags = cg.get("fragments") or []
            missing = [f for f in frags if not (ctx.config_dir / f).is_file()]
            if missing:
                st.error(
                    f"Saknade fragmentfiler i `{manifest_key}` ({len(missing)}): "
                    + ", ".join(missing[:8])
                    + (" …" if len(missing) > 8 else "")
                )
            else:
                st.success(f"Alla `fragments` i `{manifest_key}` pekar på befintliga filer.")
        except Exception as e:
            st.warning(f"Kunde inte validera `{manifest_key}`: {e}")

