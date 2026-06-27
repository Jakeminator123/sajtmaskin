from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel


def render(ctx: BackofficeContext) -> None:
    # Lazy import: backoffice.pages.__init__ importerar denna modul innan
    # PAGE_SPECS hunnit definieras, så en top-level-import skulle bli cirkulär.
    from backoffice.pages import PAGE_SPECS

    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}, "repoSiblings": {}}

    with st.expander("Repo-roten: config (inkl. dashboard/) · docs · .cursor", expanded=False):
        for name, blurb in (domain_map.get("repoSiblings") or {}).items():
            st.markdown(f"**`{name}/`** — {blurb}")

    render_where_panel("Översikt", domain_map)

    overview_rows: list[dict[str, str]] = []
    pages_meta = domain_map.get("pages") or {}
    # Genereras direkt från PAGE_SPECS (enda sidregistret) så kartan aldrig
    # driftar från den faktiska navigationen. Tidigare fanns en hårdkodad
    # CONFIG_NAV_PAGES-lista som tyst tappade Control Plane/Env Readiness m.fl.
    for spec in PAGE_SPECS:
        if spec.name == "Översikt":
            continue
        m = pages_meta.get(spec.name) or {}
        cps = m.get("canonicalPaths") or []
        overview_rows.append(
            {
                "Vy": spec.name,
                "Grupp": spec.group,
                "Primär källa": cps[0] if cps else "—",
                "Kort": (m.get("summary") or "")[:140],
            }
        )
    if overview_rows:
        st.subheader("Karta: vy → var du redigerar / läser")
        st.caption(
            "Genererad direkt från `PAGE_SPECS` (`backoffice/pages/__init__.py`) — "
            "alltid i synk med navigationen. `Primär källa` läses ur "
            "`config/dashboard/domain-map.json`; `—` = ingen kanonisk config-källa "
            "(vyn är en lins/diagnos, inte en ägaryta)."
        )
        st.dataframe(overview_rows, width="stretch", hide_index=True)

    paths = {
        "codegen-core-manifest.json": ctx.config_dir / "codegen-core-manifest.json",
        "tier3-sdk-deny.json": ctx.config_dir / "integrations" / "tier3-sdk-deny.json",
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

    st.subheader("ai_models (dokument + manifest)")
    am = list((ctx.config_dir / "ai_models").glob("*.md")) + list(
        (ctx.config_dir / "ai_models").glob("*.txt")
    )
    st.write(f"**{len(am)}** dokument i `config/ai_models/`")

    try:
        cg = read_json(paths["codegen-core-manifest.json"])
        frags = cg.get("fragments") or []
        missing = [f for f in frags if not (ctx.config_dir / f).is_file()]
        if missing:
            st.error(
                f"Saknade fragmentfiler i `codegen-core-manifest.json` ({len(missing)}): "
                + ", ".join(missing[:8])
                + (" …" if len(missing) > 8 else "")
            )
        else:
            st.success("Alla `fragments` i `codegen-core-manifest.json` pekar på befintliga filer.")
    except Exception as e:
        st.warning(f"Kunde inte validera `codegen-core-manifest.json`: {e}")

