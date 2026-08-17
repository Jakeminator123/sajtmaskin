"""Streamlit renderer for the runtime-backed dossier Systemkarta."""

from __future__ import annotations

from typing import Any

import streamlit as st

from .io import _ensure_capability_map_current, _load_json
from .labels import class_hint, class_label, mock_label
from .truth_map import (
    build_system_map_dot,
    build_system_map_rows,
    filter_system_map_rows,
    index_dossiers_by_class_and_id,
)
from .ui_edit import (
    _render_capability_change_action,
    _render_delete_action,
    _render_manifest_edit_controls,
)


def _facade():
    from backoffice.pages import dossiers as page

    return page


_F2_LABELS = {
    "available": "Tillgänglig",
    "deferred": "Planerad / uppskjuten",
}

_F2_REASON_LABELS = {
    "available": "Tillgänglig enligt F2-policy",
    "build-server": "Build/server-kontrakt",
    "policy-only": "Separat F2-policy",
}

_BUILD_REASON_LABELS = {
    "build-env": "build-env",
    "server-file": "serverfil",
}


def _join_or_dash(values: list[str]) -> str:
    return ", ".join(values) if values else "—"


def _env_contract(row: dict[str, Any]) -> str:
    labels = {
        "build": "B",
        "feature-runtime": "F",
        "warn-only": "W",
    }
    parts = []
    for enforcement in ("build", "feature-runtime", "warn-only"):
        keys = row["env_by_enforcement"].get(enforcement) or []
        if keys:
            parts.append(f"{labels[enforcement]}: {', '.join(keys)}")
    return "; ".join(parts) or "—"


def _file_roles(row: dict[str, Any]) -> str:
    return ", ".join(
        f"{role}: {count}" for role, count in sorted(row["file_roles"].items())
    ) or "—"


def _render_system_map_row_detail(
    row: dict[str, Any], chosen: dict[str, Any] | None
) -> None:
    """Alla fält för EN rad: projektionens härledda axlar (`row`, alltid
    tillgängliga) plus rå-manifestets fulla `envVars`/`files` (`chosen`, kan
    saknas om projektionen hunnit bli inaktuell mot disk-poolen)."""
    cols = st.columns(2)
    with cols[0]:
        st.markdown(f"**Providers:** {_join_or_dash(row['providers'])}")
        st.markdown(f"**Dependencies:** {_join_or_dash(row['dependencies'])}")
        st.markdown("**Standardval för capability:** " + ("Ja" if row["default"] else "Nej"))
        if row["class"] == "hard":
            st.markdown(f"**Demoläge när byggt:** {mock_label(row['mock'])}")
    with cols[1]:
        st.markdown(
            f"**F2:** {_F2_LABELS.get(row['f2_disposition'], row['f2_disposition'])} "
            f"({_F2_REASON_LABELS.get(row['f2_reason'], row['f2_reason'])})"
        )
        build_reasons = _join_or_dash(
            [_BUILD_REASON_LABELS.get(value, value) for value in row["build_server_reasons"]]
        )
        st.markdown(
            "**Build/server-krav:** "
            + ("Ja" if row["build_server_requirement"] else "Nej")
            + f" — {build_reasons}"
        )
        st.markdown(
            f"**Verifiering:** {row['verification_status']} · "
            f"**Senast verifierad:** {row['last_verified'] or '—'}"
        )
    st.markdown(f"**Env-kontrakt:** {_env_contract(row)}")
    st.markdown(f"**Filroller:** {_file_roles(row)}")
    if row["summary_sv"]:
        st.caption(row["summary_sv"])

    if chosen is None:
        return

    detail_cols = st.columns(2)
    detail_cols[0].markdown(f"**Komplexitet:** {chosen.get('complexity', '—')}")
    detail_cols[1].markdown(f"**Kodfidelitet:** {chosen.get('codeFidelity', '—')}")

    env_vars = [env for env in (chosen.get("envVars") or []) if isinstance(env, dict)]
    if env_vars:
        lines = []
        for env in env_vars:
            required = "obligatorisk" if env.get("required") else "valfri"
            purpose = f" — {env['purpose']}" if env.get("purpose") else ""
            lines.append(
                f"- `{env.get('key', '?')}` ({env.get('enforcement', 'build')}, {required}){purpose}"
            )
        st.markdown("**Env-nycklar (fullständigt):**\n" + "\n".join(lines))

    files = [f for f in (chosen.get("files") or []) if isinstance(f, dict)]
    if files:
        lines = [
            f"- `{f.get('path', '?')}` ({f.get('role', '?')}, {f.get('injectionMode', '?')})"
            for f in files
        ]
        st.markdown("**Filer:**\n" + "\n".join(lines))

    if chosen.get("sourceRepoUrl"):
        st.caption(f"Källa: {chosen['sourceRepoUrl']}")


def _section_system_map(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Systemkarta: kategori → capability → dossier → provider")
    st.caption(
        "Kartan läser en automatiskt synkad projektion av det schema-validerade "
        "runtime-registret. **F2 planerad/uppskjuten** och **Build/server-krav i "
        "F3** är separata axlar. Analytics är kontrollfallet: planerad i F2, "
        "men utan build-env eller serverfil."
    )

    projection, sync_warning = _ensure_capability_map_current()
    if sync_warning:
        st.warning(sync_warning)
    rows = build_system_map_rows(projection)
    if not rows:
        st.error(
            "Ingen validerad dossierprojektion kunde läsas. Kör "
            "`npm run dossiers:capability-map:write` och ladda om sidan."
        )
        return

    # Pool-räknare från live-disk (samma sanning som gamla Översikt). F2-
    # och build/server-axlarna finns bara i projektionen — vid sync_warning
    # syns det redan ovan, så de markeras inte gröna som "säkra".
    pool = dossiers if dossiers else []
    metrics = st.columns(6)
    metrics[0].metric("Dossierer", len(pool) if pool else len(rows))
    metrics[1].metric(
        "Capabilities",
        len({str(d.get("capability") or "") for d in pool})
        if pool
        else len({row["capability"] for row in rows}),
    )
    metrics[2].metric(
        "Kopplade",
        sum(d.get("_class") == "hard" for d in pool)
        if pool
        else sum(row["class"] == "hard" for row in rows),
    )
    metrics[3].metric(
        "Fristående",
        sum(d.get("_class") == "soft" for d in pool)
        if pool
        else sum(row["class"] == "soft" for row in rows),
    )
    metrics[4].metric(
        "Planerade i F2", sum(row["f2_disposition"] == "deferred" for row in rows)
    )
    metrics[5].metric(
        "Build/server-krav", sum(row["build_server_requirement"] for row in rows)
    )
    # Från gamla Översikt-fliken (konsoliderad hit, inte duplicerad).
    hard_label = class_label("hard", projection=projection)
    hard_hint = class_hint("hard", projection=projection)
    soft_label = class_label("soft", projection=projection)
    soft_hint = class_hint("soft", projection=projection)
    hard_description = f"**{hard_label}**" + (f": {hard_hint}" if hard_hint else "")
    soft_description = f"**{soft_label}**" + (f": {soft_hint}" if soft_hint else "")
    st.caption(
        f"{hard_description} {soft_description} "
        "Varje byggblock hör till "
        "exakt en **funktion** (capability) — det är funktionen briefen ber "
        "om som styr vilket byggblock som väljs."
    )

    all_groups = sorted({(row["group_id"], row["group_label"]) for row in rows})
    all_classes = sorted({row["class"] for row in rows})
    all_f2 = sorted({row["f2_disposition"] for row in rows})
    filter_cols = st.columns(4)
    selected_groups = filter_cols[0].multiselect(
        "Kategorier",
        [group_id for group_id, _ in all_groups],
        default=[group_id for group_id, _ in all_groups],
        format_func=dict(all_groups).get,
        key="dossier_system_map_groups",
    )
    selected_classes = filter_cols[1].multiselect(
        "Klasser",
        all_classes,
        default=all_classes,
        format_func=class_label,
        key="dossier_system_map_classes",
    )
    selected_f2 = filter_cols[2].multiselect(
        "F2-status",
        all_f2,
        default=all_f2,
        format_func=lambda value: _F2_LABELS.get(value, value),
        key="dossier_system_map_f2",
    )
    selected_build = filter_cols[3].multiselect(
        "Build/server-krav",
        ["Ja", "Nej"],
        default=["Ja", "Nej"],
        key="dossier_system_map_build",
    )
    query = st.text_input(
        "Sök i capability, dossier, provider eller dependency",
        key="dossier_system_map_query",
    )
    build_values = {value == "Ja" for value in selected_build}
    filtered = filter_system_map_rows(
        rows,
        groups=set(selected_groups),
        classes=set(selected_classes),
        f2_dispositions=set(selected_f2),
        build_server_values=build_values,
        query=query,
    )
    st.caption(f"Visar {len(filtered)} av {len(rows)} dossierer.")
    if not filtered:
        st.info("Inga dossierer matchar filtren.")
        return

    st.graphviz_chart(build_system_map_dot(filtered), use_container_width=True)

    table_rows = []
    for row in filtered:
        table_rows.append(
            {
                "Kategori": row["group_label"],
                "Capability": row["capability"],
                "Dossier": row["id"],
                "Klass": class_label(row["class"]),
                "Provider": _join_or_dash(row["providers"]),
                "Standardval": "✓" if row["default"] else "",
                "F2": _F2_LABELS.get(row["f2_disposition"], row["f2_disposition"]),
                "F2-orsak": _F2_REASON_LABELS.get(row["f2_reason"], row["f2_reason"]),
                "Demoläge när byggt": mock_label(row["mock"])
                if row["class"] == "hard"
                else "—",
                "Build/server-krav": "Ja" if row["build_server_requirement"] else "Nej",
                "Trigger": _join_or_dash(
                    [_BUILD_REASON_LABELS.get(value, value) for value in row["build_server_reasons"]]
                ),
                "Env-kontrakt": _env_contract(row),
                "Filroller": _file_roles(row),
                "Dependencies": _join_or_dash(row["dependencies"]),
                "Verifiering": row["verification_status"],
                "Senast verifierad": row["last_verified"],
                "Livscykelnotis": row["summary_sv"],
            }
        )
    st.dataframe(table_rows, width="stretch", hide_index=True)

    st.divider()
    st.markdown("**Rad → detalj → handling**")
    st.caption(
        "Öppna en rad för alla fält, filer, env-nycklar och verifieringsstatus "
        "— och Redigera/Byt capability/Radera direkt härifrån via samma "
        "validerade flöden som Redigera-tabben, med byggblocket redan valt."
    )
    groups_full = projection.get("groups") if isinstance(projection.get("groups"), dict) else {}
    dossiers_by_key = index_dossiers_by_class_and_id(dossiers)
    for row in filtered:
        default_mark = " · ✓ Standardval" if row["default"] else ""
        header = (
            f"{row['id']} — {class_label(row['class'])} · {row['group_label']} / "
            f"{row['capability']}{default_mark}"
        )
        with st.expander(header):
            chosen = dossiers_by_key.get((row["class"], row["id"]))
            _render_system_map_row_detail(row, chosen)
            if chosen is None:
                st.warning(
                    "Hittades inte i disk-poolen (projektionen kan vara inaktuell) "
                    "— bygg om capability-map.json i Kontroller-tabben före "
                    "redigering, byte eller radering."
                )
                continue
            key_ns = f"sysmap_{row['class']}_{row['id']}"
            action = st.radio(
                "Redigera",
                ["Ingen", "Redigera", "Byt capability", "Radera"],
                key=f"{key_ns}_action",
                horizontal=True,
                label_visibility="collapsed",
            )
            manifest_path = _facade().REPO_ROOT / chosen["_path"] / "manifest.json"
            if action == "Redigera":
                manifest = _load_json(manifest_path)
                _render_manifest_edit_controls(
                    chosen,
                    manifest_path,
                    manifest,
                    key_prefix=f"{key_ns}_edit",
                    show_raw_json=False,
                )
            elif action == "Byt capability":
                _render_capability_change_action(
                    chosen, groups_full, key_prefix=f"{key_ns}_cap"
                )
            elif action == "Radera":
                _render_delete_action(chosen, dossiers, key_prefix=f"{key_ns}_delete")

    with st.expander("Så läses axlarna"):
        # Samma vokabulär som buildern: `labelsSv` speglar dossier-axes.ts.
        labels_sv = (
            projection.get("labelsSv") if isinstance(projection.get("labelsSv"), dict) else {}
        )
        class_vocab = labels_sv.get("class") if isinstance(labels_sv.get("class"), dict) else {}
        f3_vocab = (
            labels_sv.get("requiresF3") if isinstance(labels_sv.get("requiresF3"), dict) else {}
        )

        def _sv_label(entry: Any, fallback: str) -> str:
            if isinstance(entry, dict):
                value = str(entry.get("label") or "").strip()
                if value:
                    return value
            return fallback

        hard = _sv_label(class_vocab.get("hard"), "Kopplad")
        soft = _sv_label(class_vocab.get("soft"), "Fristående")
        requires_f3 = _sv_label(f3_vocab.get("true"), "Kräver integrationsbygge")
        clear_in_f2 = _sv_label(f3_vocab.get("false"), "Klar i designläget")
        st.markdown(
            f"- **Klass** (`{hard}` / `{soft}`) kommer från mappen `hard/` eller `soft/`; "
            "den avgör inte F2-status.\n"
            "- **F2** kommer från `getF2MutedIntegrationCapabilities()` (projekterat som "
            "`f2Disposition`). Planerad betyder att normal F2 bygger en lokal yta och "
            "skjuter provider-dossiern till integrationssteget.\n"
            "- **Demoläge när byggt** är manifestets fallback efter materialisering utan "
            "livekonfiguration; det betyder inte att hard-dossiern injiceras i normal F2. "
            "Etiketter läses ur projektionens `labelsSv.mock` (samma som buildern).\n"
            f"- **Build/server-krav** (`{requires_f3}` / `{clear_in_f2}`) kommer från "
            "`dossierRequiresF3()`: build-env eller serverfil. En kataloggodkänd "
            "placeholder kan ge ett demo/advisory-bygge; den räknas aldrig som live."
        )
