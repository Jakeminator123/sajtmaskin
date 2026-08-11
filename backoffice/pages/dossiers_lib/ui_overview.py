from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import (
    backup_file,
    backup_tree,
    confirm_by_typing,
    danger_zone,
    field_label,
    render_building_blocks_nav,
    render_save_scope,
    run_repo_command,
    tech_details,
    validate_json_against_schema,
)


def _facade():
    from backoffice.pages import dossiers as page
    return page


from .constants import (
    PAGE_NAME,
    REPO_ROOT,
    DOSSIER_ROOT,
    HARD_ROOT,
    SOFT_ROOT,
    INDEX_ROOT,
    CAPABILITY_MAP_PATH,
    STRICT_SCHEMA_PATH,
    TEMPLATE_REFS_ROOT,
    CAPABILITY_TIERS_PATH,
    REQUIRED_FIELDS,
    VALIDATE_MANIFEST_TS_PATH,
    _KEBAB_RE,
    CLASS_LABELS,
    MOCK_LABELS,
    _MOCKLESS_FALLBACK,
    _COMPLEXITY_FALLBACK,
    _MOCK_FALLBACK,
    _ALLOWED_ENFORCEMENT,
    _NORMALIZE_MODELS,
    _INSTRUCTIONS_STUB,
)

from .labels import (
    class_label,
    mock_label,
    requires_f3,
    is_default_for_capability,
)

from .io import (
    _load_mockless_capability_exceptions,
    _schema_enum,
    _COMPLEXITY_OPTIONS,
    _MOCK_OPTIONS,
    _existing_default_for_capability,
    _load_json,
    _save_json,
    _list_dossier_dirs,
    _walk_all_dossiers,
    _validate_manifest,
    _summarize_enforcement,
    _load_group_view,
    _group_label_for_capability,
    _groups_view_is_stale,
    _run_capability_map_write,
    _rebuild_capability_map,
    _extract_ts_union_values,
    _apply_manifest_field_edits,
    _is_link_like,
    _delete_dossier_dir,
    _list_template_refs,
    _run_curate,
    _apply_capability_override,
    _describe_capability_group_hint,
    _npm_binary,
    _prospect_root,
    _load_prospect_plan,
    _load_prospect_report,
    _read_prospect_verdict_files,
    _run_normalize,
    _promote_prospect,
    _create_dossier_skeleton,
    _run_sdk_version_check,
)



def _section_overview(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Översikt")
    hard = [d for d in dossiers if d["_class"] == "hard"]
    soft = [d for d in dossiers if d["_class"] == "soft"]
    cols = st.columns(4)
    cols[0].metric("Totalt", len(dossiers))
    cols[1].metric("Kopplade (hard)", len(hard))
    cols[2].metric("Fristående (soft)", len(soft))
    caps = {d.get("capability", "?") for d in dossiers}
    cols[3].metric("Funktioner (capabilities)", len(caps))
    st.caption(
        "**Kopplad** = kräver en extern tjänst/nycklar (Stripe, databas …). "
        "**Fristående** = behöver bara npm-paket. Varje byggblock hör till "
        "exakt en **funktion** (capability) — det är funktionen briefen ber "
        "om som styr vilket byggblock som väljs."
    )




def _section_list(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Alla byggblock")
    if not dossiers:
        st.info(
            "Inga byggblock ännu. Skapa ett i Skapa-tabben (från grunden eller "
            "via AI-kuration), eller lägg en katalog under `data/dossiers/hard/` "
            "eller `soft/` för hand."
        )
        return
    rows: list[dict[str, Any]] = []
    for d in dossiers:
        rows.append({
            "id": d.get("id"),
            "Klass": class_label(d["_class"]),
            "Funktion": d.get("capability"),
            "Standardval": "✓" if is_default_for_capability(d) else "",
            "Demoläge": mock_label(d.get("mock")) if d["_class"] == "hard" else "—",
            "Kräver F3": "✓" if requires_f3(d) else "",
            "Kodtrohet": d.get("codeFidelity"),
            "Komplexitet": d.get("complexity"),
            "Nycklar": len(d.get("envVars") or []),
            "Senast verifierad": d.get("lastVerified"),
            # Bara för sortering/gruppering — visas inte som egen kolumn.
            "_class": d["_class"],
            "_enforcement": _summarize_enforcement(d),
            "_deps": len(d.get("dependencies") or []),
            "_files": len(d.get("files") or []),
        })

    st.caption(
        "**Standardval** = vinner när flera byggblock delar samma funktion. "
        "**Demoläge** = hur ett Kopplat byggblock ser ut i preview utan riktig "
        "nyckel. **Kräver F3** = den riktiga integrationen byggs i ett eget "
        "steg (byggnödvändig nyckel eller serverfil) — det följer *inte* av "
        "Kopplad/Fristående, och ett Kopplat byggblock kan mycket väl vara "
        "klart redan i designläget. Leverantörssyskon = flera byggblock under "
        "samma funktion."
    )

    groups = _load_group_view()
    grouped_view = st.checkbox(
        "Visa grupperad per dossier-grupp (kategori)",
        key="dossier_list_grouped",
        help=(
            "Grupperar listan efter dossier-grupp — läst från "
            "capability-map.json:s genererade `groups`-fält (kanonisk källa: "
            "src/lib/builder/dossier-groups.ts). Kör 'Bygg om' i "
            "Kontroller-tabben om grupperna saknas/är inaktuella."
        ),
    )
    if grouped_view and not groups:
        st.warning(
            "`capability-map.json` saknar `groups`-fältet ännu — kör 'Bygg om' "
            "i Kontroller-tabben (eller `npm run dossiers:capability-map:write`) "
            "för att aktivera gruppvyn."
        )
        grouped_view = False
    elif grouped_view and _groups_view_is_stale(groups, dossiers):
        st.warning(
            "`groups`-vyn täcker inte alla funktioner i live-poolen (inaktuell) "
            "— rader kan hamna under Övrigt. Kör 'Bygg om' i Kontroller-tabben."
        )

    def _display(row: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in row.items() if not k.startswith("_")}

    if not grouped_view:
        rows.sort(key=lambda r: (r["_class"], r["Funktion"] or "", r["id"]))
        st.dataframe([_display(r) for r in rows], width="stretch", hide_index=True)
    else:
        rows_by_label: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            label = _group_label_for_capability(row["Funktion"], groups)
            rows_by_label.setdefault(label, []).append(row)

        ordered_labels = [info.get("label") or "Övrigt" for info in groups.values()]
        for label in ordered_labels:
            group_rows = rows_by_label.pop(label, None)
            if not group_rows:
                continue
            group_rows.sort(key=lambda r: (r["Funktion"] or "", r["_class"], r["id"]))
            st.markdown(f"**{label}** ({len(group_rows)})")
            st.dataframe([_display(r) for r in group_rows], width="stretch", hide_index=True)
        # Safety net: any label not present in the generated view (should not
        # happen once regenerated, but never silently drop rows).
        for label, group_rows in rows_by_label.items():
            group_rows.sort(key=lambda r: (r["Funktion"] or "", r["_class"], r["id"]))
            st.markdown(f"**{label}** ({len(group_rows)})")
            st.dataframe([_display(r) for r in group_rows], width="stretch", hide_index=True)

    # Teknisk kolumnvy (C3): enforcement-profilen är kuratorsjargong och bor i
    # teknik-expandern i stället för i default-listan.
    with tech_details("Visa teknisk kolumnvy (enforcement, deps, filer)"):
        st.caption(
            "Enforcement-kolumn: B=build (blockerar F3), F=feature-runtime "
            "(UI-banner / popup vid runtime), W=warn-only (komponent self-disablar). "
            "Saknat tag på en envVar tolkas som B."
        )
        tech_rows = [
            {
                "id": r["id"],
                "class": r["_class"],
                "capability": r["Funktion"],
                "enforcement": r["_enforcement"],
                "envVars": r["Nycklar"],
                "deps": r["_deps"],
                "files": r["_files"],
            }
            for r in rows
        ]
        tech_rows.sort(key=lambda r: (r["class"], r["capability"] or "", r["id"]))
        st.dataframe(tech_rows, width="stretch", hide_index=True)




def _section_enforcement_overview(dossiers: list[dict[str, Any]]) -> None:
    """Per-envVar enforcement overview so curators can spot dossiers that
    over-use `feature-runtime` (UI must actually render a banner) or
    `warn-only` (component must actually self-disable). The F3 readiness
    gate trusts these tags — getting them wrong either blocks deploy or
    lets a deploy succeed with broken integrations."""
    st.subheader("EnvVar enforcement (P31)")
    st.caption(
        "`build` = real value krävs vid F3-build. "
        "`feature-runtime` = SDK importerad men UI visar konfigurations-banner när nyckel saknas. "
        "`warn-only` = koden self-disablar (`if (!domain) return null`). "
        "Saknad tag tolkas som `build`."
    )
    rows: list[dict[str, Any]] = []
    for d in dossiers:
        env_vars = d.get("envVars") or []
        if not isinstance(env_vars, list) or not env_vars:
            continue
        for ev in env_vars:
            if not isinstance(ev, dict):
                continue
            rows.append({
                "dossier": d.get("id"),
                "class": d["_class"],
                "key": ev.get("key"),
                "required": "✓" if ev.get("required") else "",
                "enforcement": ev.get("enforcement", "build (default)"),
            })
    if not rows:
        st.info("Inga dossiers med envVars hittade.")
        return
    rows.sort(key=lambda r: (r["enforcement"], r["dossier"] or "", r["key"] or ""))
    st.dataframe(rows, width="stretch", hide_index=True)




def _section_capability_tiers() -> None:
    st.subheader("Capability tiers (plan 06)")
    tiers = _extract_ts_union_values(_facade().CAPABILITY_TIERS_PATH, "CapabilitySpecificityTier")
    if not tiers:
        st.warning(
            "Kunde inte läsa CapabilitySpecificityTier från "
            "`src/lib/builder/follow-up-capability-detection.ts`."
        )
        return
    st.caption(
        "Tier-signalerna sätts i follow-up-detektionen och lagras i "
        "`requestedCapabilityTiers` i orchestration-signalen."
    )
    st.dataframe(
        [{"tier": tier} for tier in tiers],
        width="stretch",
        hide_index=True,
    )




def _section_capability_map(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Capability map")
    st.caption(
        "Översikt över vilka dossiers som är registrerade per capability, plus "
        "en genererad gruppvy (dossier-grupp/kategori — presentations-lager, "
        "kanonisk källa `src/lib/builder/dossier-groups.ts`). Brief-LLM:n "
        "deklarerar `requestedCapabilities` och varje capability matchar mot "
        "exakt en dossier (eller ingen om kapabiliteten saknas)."
    )
    current = _load_json(_facade().CAPABILITY_MAP_PATH) or {}
    fresh = _rebuild_capability_map(dossiers)
    diff = current.get("capabilities") != fresh["capabilities"]
    current_groups = current.get("groups") if isinstance(current.get("groups"), dict) else {}
    groups_stale = _groups_view_is_stale(current_groups, dossiers)
    if diff:
        st.warning("`capability-map.json` är inte i synk med manifests. Klicka för att bygga om.")
    elif groups_stale:
        st.warning(
            "`groups`-vyn saknas eller täcker inte poolens capabilities — bygg om. "
            "(Label-/bucket-drift mot `dossier-groups.ts` fångas av TS-checkens "
            "check-läge, inte här.)"
        )
    if st.button("Bygg om capability-map.json (inkl. grupper)"):
        with st.spinner("Kör `npm run dossiers:capability-map:write`…"):
            ok, output = _run_capability_map_write()
        if ok:
            st.success(f"Skrev {_facade().CAPABILITY_MAP_PATH.relative_to(_facade().REPO_ROOT)} (capabilities + grupper).")
            st.cache_data.clear()
            current = _load_json(_facade().CAPABILITY_MAP_PATH) or {}
        else:
            st.error("Kunde inte köra regenerate-skriptet:\n" + output[-3000:])
    st.caption(
        "Regenereringen körs via TS-skriptet (`npm run dossiers:capability-map:write`, "
        "`scripts/dossiers/regenerate-capability-map.ts`) i stället för en egen "
        "Python-implementation, så `groups`-fältet aldrig kan hamna i otakt med "
        "`dossier-groups.ts`."
    )
    st.json((current.get("capabilities") if current else None) or fresh["capabilities"])

    st.markdown("**Dossier-grupper (kategorier)**")
    groups = current.get("groups") if isinstance(current.get("groups"), dict) else {}
    if not groups:
        st.info(
            "Ingen `groups`-vy hittad ännu i capability-map.json — klicka "
            "'Bygg om' ovan för att generera den."
        )
    else:
        group_rows = [
            {
                "grupp": group_id,
                "label": info.get("label"),
                "capabilities": ", ".join(info.get("capabilities") or []) or "—",
            }
            for group_id, info in groups.items()
        ]
        st.dataframe(group_rows, width="stretch", hide_index=True)




def _section_health() -> None:
    st.subheader("Hälsokoll: SDK-versioner")
    st.caption(
        "Går igenom ALLA dossiers och jämför pinnade SDK-`apiVersion`-literaler "
        "(t.ex. Stripe) mot den installerade SDK:ns förväntade version. En stale "
        "pin gör att varje generering som injicerar dossiern failar typecheck "
        "(TS2322). Read-only. Kommando: `npm run dossiers:check-sdk`."
    )
    if st.button("Kör SDK-versionskoll"):
        st.session_state["dossier_sdk_check"] = _run_sdk_version_check()
    res = st.session_state.get("dossier_sdk_check")
    if res is not None:
        if res.get("error"):
            st.error(res["error"])
        else:
            drifts = res.get("drifts", [])
            checked = res.get("checked", [])
            unreadable = res.get("unreadable", [])
            skipped = res.get("skipped", [])
            if drifts:
                st.error(f"{len(drifts)} SDK-versionsdrift(er) hittades:")
                st.dataframe(drifts, use_container_width=True, hide_index=True)
            if unreadable:
                st.error(
                    f"{len(unreadable)} pinnad SDK installerad men versionen kunde inte läsas "
                    "(kan ej verifiera — fail-closed):"
                )
                st.dataframe(unreadable, use_container_width=True, hide_index=True)
            if not drifts and not unreadable:
                if checked:
                    st.success(
                        f"Alla {len(checked)} pinnade SDK-apiVersion(er) matchar installerade SDK:er."
                    )
                else:
                    # Nothing verified is NOT the same as healthy — don't show green.
                    st.info(
                        "Inga pinnade SDK-apiVersion(er) kunde kontrolleras "
                        "(inga kända pins, eller SDK:erna är inte installerade i detta repo)."
                    )
            if checked:
                st.caption("Kontrollerade pins:")
                st.dataframe(checked, use_container_width=True, hide_index=True)
            if skipped:
                st.caption("Överhoppade (okänd/ej installerad SDK):")
                st.dataframe(skipped, use_container_width=True, hide_index=True)
