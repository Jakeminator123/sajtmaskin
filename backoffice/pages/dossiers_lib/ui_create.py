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

from backoffice.ai_workloads import WORKLOAD_DOSSIER_CURATION, resolve_model_choices
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
    _COMPLEXITY_FALLBACK,
    _MOCK_FALLBACK,
    _ALLOWED_ENFORCEMENT,
    _NORMALIZE_MODELS,
    _INSTRUCTIONS_STUB,
)

from .labels import (
    class_label,
    mock_label,
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
    _rerun_after_dossier_mutation,
)



def _section_create_from_scratch() -> None:
    st.divider()
    st.subheader("Skapa byggblock från grunden")
    st.caption(
        "Skapar ett manifest-skelett + `instructions.md`-stub under "
        "`data/dossiers/<klass>/<id>/`. Strict-schemat måste vara grönt innan "
        "något skrivs, och en befintlig katalog skrivs aldrig över. Kod, filer "
        "och env-nycklar lägger du till efteråt via Redigera-tabben."
    )
    # Klassvalet ligger utanför formuläret så demoläges-fältet kan reagera på
    # det direkt (widgets inne i ett st.form uppdateras först vid submit).
    target_class = st.radio(
        "Klass",
        ["soft", "hard"],
        horizontal=True,
        key="create_scratch_class",
        format_func=class_label,
        help=(
            "Fristående (soft) = bara npm-paket. Kopplad (hard) = kräver en "
            "extern tjänst/nycklar och måste därför deklarera ett demoläge."
        ),
    )
    with st.form("create_dossier_scratch_form", clear_on_submit=False):
        target_id = st.text_input(
            field_label("id", hint="kebab-case, blir katalognamnet"),
            key="create_scratch_id",
        )
        new_label = st.text_input(field_label("label"), key="create_scratch_label")
        capability = st.text_input(
            field_label("capability", hint="kebab-case, t.ex. `payments` — återanvänd hellre en befintlig"),
            key="create_scratch_capability",
        )
        cols = st.columns(2)
        with cols[0]:
            complexity = st.selectbox(
                field_label("complexity"),
                list(_facade()._COMPLEXITY_OPTIONS),
                index=1 if len(_facade()._COMPLEXITY_OPTIONS) > 1 else 0,
            )
        with cols[1]:
            code_fidelity = st.selectbox(
                field_label("codeFidelity", hint="verbatim = LLM:en får inte skriva om filerna"),
                ["rewritable", "verbatim"],
            )
        summary = st.text_area(
            field_label("summary", hint="engelska, 30-600 tecken — går till codegen-prompten"),
            height=80,
            key="create_scratch_summary",
        )
        summary_sv = st.text_area(
            field_label("summarySv", hint="valfri, minst 20 tecken — visas för användare"),
            height=80,
            key="create_scratch_summary_sv",
        )
        default_flag = st.checkbox(
            field_label("defaultForCapability", hint="vinner när flera byggblock delar funktion"),
            key="create_scratch_default",
        )
        provider_ids: list[str] | None = None
        mock_choice: str | None = None
        if target_class == "hard":
            provider_text = st.text_input(
                field_label(
                    "providers",
                    hint="obligatoriska provider-id:n, kommaseparerade; t.ex. `stripe`",
                ),
                key="create_scratch_providers",
            )
            provider_ids = [
                value.strip()
                for value in re.split(r"[,\n]", provider_text)
                if value.strip()
            ]
            mock_choice = st.selectbox(
                field_label("mock", hint="obligatoriskt för Kopplade byggblock"),
                list(_facade()._MOCK_OPTIONS),
                # Enum:arna kommer från schemat, så "visual" kan inte antas finnas.
                index=_facade()._MOCK_OPTIONS.index("visual") if "visual" in _facade()._MOCK_OPTIONS else 0,
                format_func=mock_label,
            )
            st.caption(
                "`none` godtas bara för funktioner på undantagslistan "
                f"(`{'`, `'.join(sorted(_load_mockless_capability_exceptions()))}`) "
                "— annars stoppar både formuläret och `dossiers:validate-all`."
            )
        submitted = st.form_submit_button("Skapa byggblock", type="primary")

    if submitted:
        ok, msg = _create_dossier_skeleton(
            target_class,
            target_id.strip(),
            label=new_label,
            capability=capability.strip(),
            providers=provider_ids,
            summary=summary,
            complexity=complexity,
            code_fidelity=code_fidelity,
            mock=mock_choice,
            summary_sv=summary_sv,
            default_for_capability=default_flag,
        )
        if not ok:
            st.error(msg)
        else:
            st.session_state["create_scratch_created"] = (
                f"data/dossiers/{target_class}/{target_id.strip()}"
            )
            _rerun_after_dossier_mutation(msg)

    created = st.session_state.get("create_scratch_created")
    if created:
        st.info(f"Senast skapat härifrån: `{created}`.")
        # Tungt subprocess-anrop — ligger bakom knapp, aldrig i default-vyn.
        if st.button("Kör `npm run dossiers:validate-all`", key="create_scratch_validate"):
            with st.spinner("Kör dossiers:validate-all…"):
                result = run_repo_command(
                    _facade().REPO_ROOT, ("npm", "run", "dossiers:validate-all"), timeout=300
                )
            output = (result["stdoutTail"] + "\n" + result["stderrTail"]).strip()
            (st.success if result["ok"] else st.error)(output[-3000:] or "Ingen output.")




def _section_curate() -> None:
    st.subheader("AI-kuration från template-references")
    st.caption(
        "Pekar på en klonad mapp under `data/template-references/repos/` och låter "
        "GPT producera ett **utkast** till dossier-manifest + `instructions.md`. "
        "Granska och spara via Redigera-tabben innan dossiern går live."
    )
    refs = _list_template_refs()
    if not refs:
        st.info(
            "Inga template-references hittade. Klona ett repo manuellt till "
            f"`{_facade().TEMPLATE_REFS_ROOT.relative_to(_facade().REPO_ROOT)}/<id>/` eller kör "
            "`git clone <url> data/template-references/repos/<id>` från terminalen."
        )
        return

    st.markdown("**Skapa inom kategori (valfritt)**")
    groups = _load_group_view()
    if not groups:
        st.info(
            "Ingen `groups`-vy hittad i capability-map.json ännu — kör 'Bygg om' "
            "i Kontroller-tabben för att välja kategori här. Du kan ändå "
            "skriva en capability fritt nedan."
        )
    group_ids = list(groups.keys())
    group_labels = {gid: (groups[gid].get("label") or gid) for gid in group_ids}
    group_cols = st.columns(2)
    with group_cols[0]:
        chosen_group_id = st.selectbox(
            "Dossier-grupp (kategori)",
            group_ids,
            format_func=lambda gid: group_labels.get(gid, gid),
            key="curate_group_id",
        ) if group_ids else None
    group_capabilities = groups.get(chosen_group_id, {}).get("capabilities") or [] if chosen_group_id else []
    with group_cols[1]:
        capability_choice = st.selectbox(
            "Capability i gruppen",
            ["(ingen — se fritt fält)"] + group_capabilities,
            key="curate_capability_choice",
        )
    free_capability = st.text_input(
        "…eller ny capability (fritt fält, kebab-case, tar över valet ovan)",
        key="curate_capability_free",
    ).strip()
    decided_capability = free_capability or (
        capability_choice if capability_choice != "(ingen — se fritt fält)" else ""
    )
    if decided_capability:
        st.caption(
            _describe_capability_group_hint(decided_capability, chosen_group_id, groups)
        )
    st.caption(
        "Påminnelse: **varje** hard-dossier måste ha `mock` ≠ `none` — om inte "
        "capabilityn står på undantagslistan "
        "(`MOCKLESS_CAPABILITY_EXCEPTIONS` i `src/lib/gen/dossiers/validate-manifest.ts`, "
        "dokumenterad i `docs/contracts/dossier-system.md`). Annars stoppar "
        "`npm run dossiers:validate-all`."
    )

    cols = st.columns(3)
    with cols[0]:
        ref_id = st.selectbox("Referens-repo", refs)
    with cols[1]:
        target_class = st.radio("Klass", ["hard", "soft"], horizontal=True)
    with cols[2]:
        suggested = ref_id.replace("_", "-").replace(" ", "-").lower() if ref_id else ""
        target_id = st.text_input("Ny dossier-id", value=suggested)
    # Modellvalen ägs av manifestet (workload `backoffice_dossier_curation`),
    # inte av den här sidan och inte av en hårdkodad rad i skriptet.
    curation_models = resolve_model_choices(_facade().REPO_ROOT, WORKLOAD_DOSSIER_CURATION)
    curation_model = st.selectbox(
        "Modell för kurationen",
        list(curation_models),
        key="curate_model",
        help=(
            "Kommer ur `config/ai_models/manifest.json` → workload "
            f"`{WORKLOAD_DOSSIER_CURATION}`: första valet är dess `defaultModel`, "
            "resten dess `fallbackModels`. Skickas som `--model=` till "
            "`scripts/dossiers/curate-from-reference.ts`."
        ),
    )
    if st.button("🤖 Kurera utkast", type="primary"):
        if not target_id:
            st.error("Ange ett ID för den nya dossiern.")
            return
        # Validate the picked capability BEFORE the expensive LLM run — a typo
        # in the free field must not cost a ~5 min curation first. Mirror the
        # strict schema fully: kebab-case pattern + 2-60 tecken.
        if decided_capability and (
            not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", decided_capability)
            or not (2 <= len(decided_capability) <= 60)
        ):
            st.error(
                f"Ogiltig capability (kebab-case, 2-60 tecken, t.ex. `image-generation`): "
                f"`{decided_capability}` — kurationen startades inte."
            )
            return
        with st.spinner("Kör kurations-skriptet…"):
            ok, output = _run_curate(ref_id, target_class, target_id, curation_model)
        override_failed = False
        if ok and decided_capability:
            override_ok, override_msg = _apply_capability_override(target_class, target_id, decided_capability)
            if override_ok:
                output += f"\n[backoffice] satte capability={decided_capability!r} enligt vald kategori."
            else:
                override_failed = True
                output += f"\n[backoffice] KUNDE INTE sätta vald capability: {override_msg}"
        (st.success if ok else st.error)(output[-3000:])
        if ok and override_failed:
            st.warning(
                "Kurationen lyckades men den valda capabilityn kunde INTE sättas "
                "— utkastet har kvar LLM:ns egen capability. Rätta manuellt i "
                "Redigera-tabben innan dossiern används."
            )
        if ok:
            st.info(
                f"Granska och redigera `data/dossiers/{target_class}/{target_id}/` i Redigera-tabben "
                f"innan dossiern är produktionsklar."
            )




def _section_legacy_prospect(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Legacy-import (prospect → v2-utkast)")
    root = _prospect_root()
    st.caption(
        "Kör den strikta LLM-normaliseraren "
        "(`scripts/dossiers/normalize-legacy-prospect.ts`) som läser gamla "
        "legacy-dossiers och skriver **v2-utkast** (aldrig direkt till live-poolen). "
        f"Materialet ligger utanför repot: `{root}` "
        "(ändras via env `DOSSIER_PROSPECT_ROOT`)."
    )

    if not (root / "prospects.json").exists():
        st.info(
            f"Ingen `prospects.json` i `{root}`.\n\n"
            "Seed-mappen skapas genom att kopiera valda legacy-dossiers dit och "
            "lägga en kurationsplan (`prospects.json`). Se README i "
            "`scripts/dossiers/normalize-legacy-prospect.ts` för formatet."
        )
        return

    plan = _load_prospect_plan(root)
    report = _load_prospect_report(root)
    live_ids = {(d.get("_class"), d.get("id")) for d in dossiers}

    rows: list[dict[str, Any]] = []
    for entry in plan:
        legacy_id = str(entry.get("legacyId") or "")
        row_report = report.get(legacy_id) or {}
        draft_exists = (root / legacy_id / "_v2-draft" / "manifest.json").exists()
        in_live = (entry.get("targetClass"), entry.get("targetId")) in live_ids
        rows.append(
            {
                "legacy": legacy_id,
                "→ id": entry.get("targetId"),
                "class": entry.get("targetClass"),
                "capability": entry.get("targetCapability"),
                "verdict": row_report.get("verdict") or "—",
                "concerns": len(row_report.get("concerns") or []),
                "fixar": len(row_report.get("requiredCodeChanges") or []),
                "utkast": "✓" if draft_exists else "",
                "i live-pool": "✓" if in_live else "",
            }
        )
    if rows:
        st.dataframe(rows, width="stretch", hide_index=True)
        accepts = sum(1 for r in rows if r["verdict"] == "accept")
        rejects = sum(1 for r in rows if r["verdict"] == "reject")
        invalids = sum(1 for r in rows if r["verdict"] == "invalid")
        st.caption(
            f"{len(rows)} prospects · accept: {accepts} · reject: {rejects} · "
            f"invalid: {invalids}. 'fixar' = obligatoriska kodändringar innan promotion."
        )

    model = st.selectbox("Modell för normalisering", _facade()._NORMALIZE_MODELS, key="prospect_model")
    st.caption(
        "`gpt-5.5` = bäst omdöme (default). `gpt-5.4-mini` = billigare/snabbare. "
        "Körningen blockerar UI:t tills den är klar."
    )
    batch_cols = st.columns(2)
    with batch_cols[0]:
        if st.button("Normalisera saknade", key="prospect_run_missing"):
            with st.spinner("Kör normaliseraren (hoppar över redan behandlade)…"):
                ok, output = _run_normalize(None, run_all=True, force=False, model=model)
            (st.success if ok else st.error)(output[-3000:])
    with batch_cols[1]:
        if st.button("Kör om alla (force)", key="prospect_run_all_force"):
            with st.spinner("Kör om ALLA prospects…"):
                ok, output = _run_normalize(None, run_all=True, force=True, model=model)
            (st.success if ok else st.error)(output[-3000:])

    st.divider()
    st.markdown("**Enskild prospect**")
    ids = [str(p.get("legacyId") or "") for p in plan if p.get("legacyId")]
    if not ids:
        return
    pick = st.selectbox("Välj prospect", ids, key="prospect_pick")
    entry = next((p for p in plan if p.get("legacyId") == pick), None)
    if not entry:
        return

    st.caption(
        f"Mål: `{entry.get('targetClass')}/{entry.get('targetId')}` · "
        f"capability `{entry.get('targetCapability')}`"
        + (f" · {entry.get('notes')}" if entry.get("notes") else "")
    )

    single_cols = st.columns(2)
    with single_cols[0]:
        if st.button("Normalisera denna", key="prospect_run_one"):
            with st.spinner(f"Normaliserar {pick}…"):
                ok, output = _run_normalize(pick, run_all=False, force=True, model=model)
            (st.success if ok else st.error)(output[-3000:])

    # Promotion trusts the REPORT verdict (canonical outcome of the latest run),
    # not merely the presence of a REVIEW.md — a stale draft from an older run
    # must never enable promote after the latest run went invalid/reject.
    kind, text = _read_prospect_verdict_files(root, pick)
    row_report = report.get(pick) or {}
    report_verdict = row_report.get("verdict")
    draft_exists = (root / pick / "_v2-draft" / "manifest.json").exists()

    if report_verdict == "accept" and draft_exists:
        st.success("Utkast finns (accepterat i senaste körningen).")
        if text:
            with st.expander("REVIEW.md — concerns + obligatoriska kodfixar", expanded=False):
                st.markdown(text)
        # Block promotion while REVIEW lists required code changes — the draft's
        # manifest shape can be valid while the integration code still needs the
        # fixes (lazy SDK-init, real schema, …). Require an explicit ack so a
        # maintainer can't one-click known-unfinished code into the live pool.
        required_changes = row_report.get("requiredCodeChanges") or []
        fixes_ack = True
        if required_changes:
            st.warning(
                f"{len(required_changes)} obligatorisk(a) kodfix(ar) enligt REVIEW "
                "innan denna dossier är säker i live-poolen."
            )
            fixes_ack = st.checkbox(
                "Jag har applicerat kodfixarna (eller tar ansvar för att promota ändå)",
                key="prospect_fixes_ack",
            )
        with single_cols[1]:
            force_overwrite = st.checkbox("Skriv över befintlig", key="prospect_promote_force")
        if st.button(
            "Promota utkast → live-pool",
            type="primary",
            key="prospect_promote",
            disabled=not fixes_ack,
        ):
            ok, msg = _promote_prospect(root, entry, force=force_overwrite)
            if not ok:
                st.error(msg)
                return
            _rerun_after_dossier_mutation(msg)
    elif report_verdict == "invalid":
        st.error(
            "Senaste körningen blev **invalid** — LLM:en accepterade men utkastet "
            "föll på schema-/mekanikvalidering. Inget utkast att promota."
        )
        val_errors = row_report.get("validationErrors") or []
        if val_errors:
            st.markdown("\n".join(f"- {e}" for e in val_errors))
        st.caption("Kör 'Normalisera denna' igen (ev. efter promptjustering).")
    elif report_verdict == "reject" or kind == "reject":
        st.error("Normaliseraren avvisade denna prospect.")
        if text:
            with st.expander("REJECTED.md — motivering", expanded=True):
                st.markdown(text)
        elif row_report.get("reason"):
            st.markdown(f"> {row_report['reason']}")
    elif draft_exists:
        st.warning(
            "Ett utkast finns men senaste verdict är inte 'accept' — kör om "
            "normaliseringen innan du promotar."
        )
    else:
        st.info("Inte behandlad ännu. Klicka 'Normalisera denna' för att skapa ett utkast.")
