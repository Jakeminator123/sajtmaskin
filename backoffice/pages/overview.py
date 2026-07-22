"""Översikt — pedagogisk startsida: vad backoffice är, vad som är säkert att röra."""

from __future__ import annotations

import streamlit as st

from backoffice.shared import (
    MODE_BADGES,
    BackofficeContext,
    nav_link_button,
    read_json,
    render_where_panel,
)


def render(ctx: BackofficeContext) -> None:
    # Lazy import: backoffice.pages.__init__ importerar denna modul innan
    # PAGE_SPECS hunnit definieras, så en top-level-import skulle bli cirkulär.
    from backoffice.pages import PAGE_GROUPS, PAGE_SPECS

    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}, "repoSiblings": {}}

    st.header("Välkommen till Sajtmaskin Backoffice")
    st.markdown(
        "Det här är verktygsytan för att **inspektera och styra** Sajtmaskins "
        "generierings-pipeline: scaffolds (startpunkter), dossiers (byggblock), "
        "LLM-modeller/prompts, miljöpolicy, drift och telemetri. "
        "Koden är alltid source of truth — panelen speglar och redigerar de "
        "kanoniska filerna under `config/`, `src/lib/gen/scaffolds/` och `data/dossiers/`."
    )
    st.success(
        "**Tryggt att experimentera:** de vanliga redigeringsvyerna säkerhetskopierar "
        "den gamla filversionen före en sparning, och git är alltid det yttersta "
        "skyddsnätet för spårade filer. Blev något fel — öppna **Återställning** och "
        "rulla tillbaka. Redigerbara vyer validerar dessutom mot schema före skrivning "
        "där schema finns."
    )
    nav_link_button("→ Öppna Återställning", "Återställning", key="overview_goto_restore")

    st.subheader("Karta: alla vyer per område")
    st.caption(
        "🟢 läser bara · ✏️ redigerar filer (säkerhetskopieras) · ⚙️ kör skript · "
        "🔴 innehåller destruktiva åtgärder. Klicka **Öppna** för att gå direkt till en vy."
    )
    pages_meta = domain_map.get("pages") or {}
    for group in PAGE_GROUPS:
        group_specs = [s for s in PAGE_SPECS if s.group == group and s.name != "Översikt"]
        if not group_specs:
            continue
        with st.expander(f"**{group}** ({len(group_specs)} vyer)", expanded=(group == "Start")):
            for spec in group_specs:
                icon, _ = MODE_BADGES.get(spec.mode, ("", ""))
                meta = pages_meta.get(spec.name) or {}
                cps = meta.get("canonicalPaths") or []
                col_open, col_text = st.columns([1, 5])
                with col_open:
                    nav_link_button("Öppna", spec.name, key=f"overview_open_{spec.name}")
                with col_text:
                    st.markdown(f"{icon} **{spec.name}** — {spec.blurb}")
                    if cps:
                        st.caption(f"Primär källa: `{cps[0]}`")

    st.subheader("Snabb hälsokoll på nyckelfiler")
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

    with st.expander("Repo-roten: config (inkl. dashboard/) · docs · .cursor", expanded=False):
        for name, blurb in (domain_map.get("repoSiblings") or {}).items():
            st.markdown(f"**`{name}/`** — {blurb}")

    render_where_panel("Översikt", domain_map)
