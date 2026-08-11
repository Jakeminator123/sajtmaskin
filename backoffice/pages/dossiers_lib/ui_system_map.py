"""Streamlit renderer for the runtime-backed dossier Systemkarta."""

from __future__ import annotations

from typing import Any

import streamlit as st

from .io import _ensure_capability_map_current
from .labels import class_label, mock_label
from .truth_map import build_system_map_dot, build_system_map_rows, filter_system_map_rows


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


def _section_system_map() -> None:
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

    metrics = st.columns(5)
    metrics[0].metric("Dossierer", len(rows))
    metrics[1].metric("Capabilities", len({row["capability"] for row in rows}))
    metrics[2].metric("Kopplade", sum(row["class"] == "hard" for row in rows))
    metrics[3].metric(
        "Planerade i F2", sum(row["f2_disposition"] == "deferred" for row in rows)
    )
    metrics[4].metric(
        "Build/server-krav", sum(row["build_server_requirement"] for row in rows)
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

    with st.expander("Så läses axlarna"):
        st.markdown(
            "- **Klass** kommer från mappen `hard/` eller `soft/`; den avgör inte F2-status.\n"
            "- **F2** kommer från `getF2MutedIntegrationCapabilities()`. Planerad betyder "
            "att normal F2 bygger en lokal yta och skjuter provider-dossiern till integrationssteget.\n"
            "- **Demoläge när byggt** är manifestets fallback efter materialisering utan "
            "livekonfiguration; det betyder inte att hard-dossiern injiceras i normal F2.\n"
            "- **Build/server-krav** kommer från `dossierRequiresF3()`: build-env eller serverfil. "
            "En kataloggodkänd placeholder kan ge ett demo/advisory-bygge; den räknas aldrig som live."
        )
