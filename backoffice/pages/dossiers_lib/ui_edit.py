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
    _save_raw_manifest,
    _summarize_enforcement,
    _load_group_view,
    _group_label_for_capability,
    _groups_view_is_stale,
    _run_capability_map_write,
    _rebuild_capability_map,
    _extract_ts_union_values,
    _default_handoff_candidates,
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



def _render_manifest_edit_controls(
    chosen: dict[str, Any],
    manifest_path: Path,
    manifest: dict[str, Any] | None,
    *,
    key_prefix: str,
    show_raw_json: bool = True,
) -> None:
    """Fält-formulär (+ valfri rå-JSON-editor) för ETT redan valt byggblock.
    Samma validerade skrivväg (`_apply_manifest_field_edits`/`_save_raw_manifest`)
    oavsett anropande yta — Redigera-tabbens väljare eller Systemkartans
    radvy (med byggblocket redan förvalt) — ingen ny skrivväg.

    `show_raw_json=False` från en yta som redan sitter inuti en `st.expander`
    (Systemkartans rad): en `st.expander` får inte nästlas i en annan, så
    rå-JSON-editorn (byggd på `tech_details()` → `st.expander`) hoppas då
    över; den nås ändå via Redigera-tabben för samma byggblock."""
    if manifest:
        st.caption(
            f"{field_label('capability')}: `{manifest.get('capability')}` · "
            f"Klass: {class_label(chosen['_class'])} — funktion byts via "
            "\"Byt capability\" nedan, klass via rå JSON."
        )
        current_mock = str(manifest.get("mock") or "none")
        mock_index = (
            _facade()._MOCK_OPTIONS.index(current_mock) if current_mock in _facade()._MOCK_OPTIONS else len(_facade()._MOCK_OPTIONS) - 1
        )
        current_complexity = str(manifest.get("complexity") or "medium")
        complexity_index = (
            _facade()._COMPLEXITY_OPTIONS.index(current_complexity)
            if current_complexity in _facade()._COMPLEXITY_OPTIONS
            else 1
        )
        handoff_candidates = (
            _default_handoff_candidates(
                manifest_path, dossier_class=str(chosen.get("_class") or "")
            )
            if is_default_for_capability(manifest)
            else []
        )
        handoff_options = {dossier_id: path for dossier_id, path in handoff_candidates}
        with st.form(f"{key_prefix}_field_form"):
            edited_label = st.text_input(
                field_label("label"), value=str(manifest.get("label") or "")
            )
            edited_summary_sv = st.text_area(
                field_label("summarySv", hint="visas för användare, aldrig i prompten"),
                value=str(manifest.get("summarySv") or ""),
                height=80,
                help="Minst 20 tecken, eller tomt för att ta bort fältet (UI faller då tillbaka på engelska `summary`).",
            )
            edited_complexity = st.selectbox(
                field_label("complexity"), list(_facade()._COMPLEXITY_OPTIONS), index=complexity_index
            )
            edited_default = st.checkbox(
                field_label("defaultForCapability", hint="vinner när flera byggblock delar funktion"),
                value=is_default_for_capability(manifest),
            )
            replacement_choice = None
            if handoff_options:
                replacement_choice = st.selectbox(
                    "Nytt Standardval om kryssrutan avmarkeras",
                    ["(välj syskon)", *handoff_options.keys()],
                    key=f"{key_prefix}_replacement_default",
                    help=(
                        "Båda manifesten valideras och sparas som en atomisk flytt. "
                        "Valet används bara när nuvarande Standardval avmarkeras."
                    ),
                )
            edited_mock = st.selectbox(
                field_label("mock", hint="hur ytan fungerar i preview utan riktig nyckel"),
                list(_facade()._MOCK_OPTIONS),
                index=mock_index,
                format_func=mock_label,
            )
            if chosen["_class"] == "hard":
                st.caption(
                    "`none` godtas bara för funktioner på undantagslistan "
                    f"(`{'`, `'.join(sorted(_load_mockless_capability_exceptions()))}`) "
                    "— annars vägrar sparningen, precis som i skapa-formuläret."
                )
            submitted = st.form_submit_button("Spara fält", type="primary")
        if submitted:
            if not edited_label.strip():
                st.error(f"{field_label('label')} krävs.")
            else:
                updates: dict[str, Any] = {
                    "label": edited_label.strip(),
                    "complexity": edited_complexity,
                    "summarySv": edited_summary_sv.strip() or None,
                    # `none` är samma sak som utelämnat fält — skriv inte in det.
                    "mock": edited_mock if edited_mock != "none" else None,
                    # Sätt bara False explicit om fältet redan finns i filen.
                    "defaultForCapability": True
                    if edited_default
                    else (False if "defaultForCapability" in manifest else None),
                }
                ok, msg = _apply_manifest_field_edits(
                    manifest_path,
                    updates,
                    dossier_class=chosen["_class"],
                    replacement_default_path=(
                        handoff_options.get(str(replacement_choice))
                        if not edited_default
                        else None
                    ),
                )
                if ok:
                    _rerun_after_dossier_mutation(
                        f"Sparat {manifest_path.relative_to(_facade().REPO_ROOT)}"
                    )
                else:
                    st.error(msg)
    else:
        st.warning(
            "Manifestet kunde inte läsas som JSON — rätta det via rå-JSON-editorn nedan."
            if show_raw_json
            else "Manifestet kunde inte läsas som JSON — rätta det via rå-JSON-editorn i Redigera-tabben."
        )

    if not show_raw_json:
        return

    # Rå JSON = full kontroll över alla schemafält (envVars, files, exposes …),
    # men samma klassregel + strict-schema som runtime måste vara gröna före
    # backup/skrivning.
    with tech_details("Rå JSON (full kontroll över alla fält)"):
        raw = manifest_path.read_text(encoding="utf-8")
        edited = st.text_area("manifest.json", value=raw, height=400, key=f"{key_prefix}_raw_json")
        if st.button("Spara rå JSON", type="primary", key=f"{key_prefix}_raw_json_save"):
            try:
                parsed = json.loads(edited)
            except json.JSONDecodeError as exc:
                st.error(f"Ogiltig JSON: {exc}")
                return
            ok, msg = _save_raw_manifest(
                manifest_path, parsed, dossier_class=chosen["_class"]
            )
            if not ok:
                st.error(msg)
                return
            _rerun_after_dossier_mutation(
                f"Sparat {manifest_path.relative_to(_facade().REPO_ROOT)}"
            )




def _render_capability_change_action(
    chosen: dict[str, Any],
    groups: dict[str, Any],
    *,
    key_prefix: str,
) -> None:
    """Byt capability (= flytta familj) för ett REDAN LIVE byggblock. Gruppen
    följer automatiskt med — den lagras aldrig per dossier, bara härledd från
    capabilityn (`dossier-groups.ts`). Samma validerade skrivväg som
    AI-kurationens override (`_apply_capability_override`); det här är bara
    en ny ingång till den för byggblock som redan finns i live-poolen,
    inte en ny skrivväg."""
    current_capability = str(chosen.get("capability") or "")
    current_group_label = _group_label_for_capability(current_capability, groups)
    st.caption(
        f"Nuvarande funktion: `{current_capability}` (grupp: {current_group_label}). "
        "Ett byte flyttar byggblocket till en annan familj — gruppen följer "
        "automatiskt med den nya funktionen; den lagras inte separat."
    )
    group_ids = list(groups.keys())
    group_labels = {gid: (groups[gid].get("label") or gid) for gid in group_ids}
    cols = st.columns(2)
    with cols[0]:
        target_group_id = (
            st.selectbox(
                "Ny dossier-grupp (kategori)",
                group_ids,
                format_func=lambda gid: group_labels.get(gid, gid),
                key=f"{key_prefix}_group",
            )
            if group_ids
            else None
        )
    target_group_capabilities = (
        groups.get(target_group_id, {}).get("capabilities") or [] if target_group_id else []
    )
    none_choice = "(ingen — se fritt fält)"
    with cols[1]:
        capability_choice = st.selectbox(
            "Funktion i gruppen",
            [none_choice] + list(target_group_capabilities),
            key=f"{key_prefix}_choice",
        )
    free_capability = st.text_input(
        "…eller ny funktion (fritt fält, kebab-case, tar över valet ovan)",
        key=f"{key_prefix}_free",
    ).strip()
    decided_capability = free_capability or (
        capability_choice if capability_choice != none_choice else ""
    )
    manifest_path = (
        _facade().DOSSIER_ROOT
        / str(chosen.get("_class") or "")
        / str(chosen.get("id") or "")
        / "manifest.json"
    )
    handoff_candidates = (
        _default_handoff_candidates(
            manifest_path, dossier_class=str(chosen.get("_class") or "")
        )
        if is_default_for_capability(chosen)
        else []
    )
    handoff_options = {dossier_id: path for dossier_id, path in handoff_candidates}
    replacement_choice = None
    if len(handoff_options) >= 2:
        replacement_choice = st.selectbox(
            "Nytt Standardval i den gamla funktionen",
            ["(välj syskon)", *handoff_options.keys()],
            key=f"{key_prefix}_replacement_default",
            help=(
                "Krävs när flytten annars lämnar flera hard-syskon utan explicit "
                "Standardval. Båda manifesten sparas eller rullas tillbaka tillsammans."
            ),
        )
    if decided_capability and decided_capability != current_capability:
        st.caption(_describe_capability_group_hint(decided_capability, target_group_id, groups))
    if st.button("Byt capability", key=f"{key_prefix}_submit"):
        if not decided_capability:
            st.error("Ange en funktion (fritt fält eller från listan) — inget byttes.")
        elif decided_capability == current_capability:
            st.info("Samma funktion som idag — inget byttes.")
        else:
            ok, msg = _apply_capability_override(
                chosen["_class"],
                chosen["id"],
                decided_capability,
                replacement_default_path=handoff_options.get(str(replacement_choice)),
            )
            if ok:
                _rerun_after_dossier_mutation(
                    f"Bytte funktion för `{chosen['id']}`: "
                    f"`{current_capability}` → `{decided_capability}`."
                )
            else:
                st.error(msg)




def _section_edit(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Redigera byggblock")
    if not dossiers:
        return
    options = {f"{d['_class']}/{d['id']}": d for d in dossiers}
    pick_key = st.selectbox(
        "Välj byggblock",
        list(options.keys()),
        format_func=lambda k: f"{options[k]['id']} — {class_label(options[k]['_class'])}",
    )
    if not pick_key:
        return
    chosen = options[pick_key]
    manifest_path = _facade().REPO_ROOT / chosen["_path"] / "manifest.json"
    manifest = _load_json(manifest_path)
    _render_manifest_edit_controls(
        chosen, manifest_path, manifest, key_prefix=f"edit_{pick_key}"
    )

    st.markdown("**Byt capability**")
    _render_capability_change_action(
        chosen, _load_group_view(), key_prefix=f"edit_{pick_key}_cap"
    )




def _section_delete(dossiers: list[dict[str, Any]]) -> None:
    """Radera ett byggblock ur live-poolen med checklistan från
    `.cursor/rules/dossier-rules.mdc` (capability, defaultForCapability,
    envVars, dependencies, capability-map) renderad som konkret läges-info
    för just det valda byggblocket. Farlig zon-mönstret från Fas B:
    `danger_zone` + kryssad checklista + `confirm_by_typing` i ett formulär."""
    st.divider()
    if not dossiers:
        return
    zone = danger_zone(
        "Radera byggblock",
        help_text=(
            "Tar bort byggblockets katalog ur live-poolen. En zip-snapshot tas "
            "först (se Återställning) — kan den inte tas händer ingenting."
        ),
    )
    with zone:
        _render_delete_body(dossiers)




def _render_delete_action(
    chosen: dict[str, Any],
    dossiers: list[dict[str, Any]],
    *,
    key_prefix: str,
    extra_state_keys: tuple[str, ...] = (),
) -> None:
    """Checklista + `confirm_by_typing` + radering för ETT redan valt
    byggblock. Samma validerade skrivväg (`_delete_dossier_dir`) oavsett
    anropande yta — Redigera-tabbens väljare eller Systemkartans radvy.
    `dossiers` är den fulla live-poolen — bara så leverantörssyskon under
    samma capability kan listas i checklistan.

    `extra_state_keys` rensas också vid lyckad radering (t.ex. den
    anropande väljarens selectbox-nyckel, som annars pekar på ett värde
    som inte längre finns i dess `options` och kraschar nästa rerun)."""
    capability = chosen.get("capability") or ""
    # Normalized comparison (trim + lowercase) — mirrors resolveDossierGroup
    # and the TS capability-map script, so a manifest edited with stray
    # casing/whitespace still counts as a sibling in the checklist.
    cap_norm = str(capability).strip().lower()
    siblings = [
        d
        for d in dossiers
        if str(d.get("capability") or "").strip().lower() == cap_norm
        and d.get("id") != chosen.get("id")
    ]
    env_keys = [
        str(ev.get("key")) for ev in (chosen.get("envVars") or []) if isinstance(ev, dict)
    ]
    deps = [str(dep) for dep in (chosen.get("dependencies") or [])]

    if siblings:
        cap_line = (
            f"{len(siblings)} leverantörssyskon kvar under `{capability}`: "
            + ", ".join(sorted(str(d.get("id")) for d in siblings))
            + "."
        )
    else:
        cap_line = (
            f"detta är ENDA byggblocket under `{capability}` — funktionen försvinner "
            "ur poolen; kontrollera referenser (brief-prompt, follow-up-vokabulär, "
            "capability-inference)."
        )
    if is_default_for_capability(chosen) and siblings:
        default_line = (
            "detta är funktionens **Standardval** — välj vid behov ett syskon "
            "som nytt Standardval i formuläret nedan. Flytten och raderingen "
            "genomförs tillsammans; inget mellanläge behöver sparas manuellt."
        )
    elif is_default_for_capability(chosen):
        default_line = "detta är Standardval, men hela funktionen försvinner med det."
    else:
        default_line = "ingen standardvals-flytt behövs (byggblocket är inte Standardval)."

    st.markdown(
        "**Checklista före radering** (per `dossier-rules.mdc`):\n"
        f"- **capability**: {cap_line}\n"
        f"- **defaultForCapability**: {default_line}\n"
        f"- **envVars**: {', '.join(env_keys) if env_keys else 'inga'} — städa ev. lagrade projekt-env/placeholder-flöden.\n"
        f"- **dependencies**: {', '.join(deps) if deps else 'inga'}.\n"
        "- **capability-map**: bygg om efter radering (Kontroller-tabben) och kör `npm run dossiers:validate-all`."
    )

    # Bekräftelsen ligger i ett formulär, samma mönster som scaffold-/variant-
    # raderingen i Fas B: fritextfältet skickar sitt värde först vid submit, så
    # ingen halvskriven bekräftelse kan råka gälla.
    ack_key = f"{key_prefix}_ack"
    confirm_key = f"{key_prefix}_confirm"
    manifest_path = _facade().REPO_ROOT / str(chosen.get("_path") or "") / "manifest.json"
    handoff_candidates = (
        _default_handoff_candidates(
            manifest_path, dossier_class=str(chosen.get("_class") or "")
        )
        if is_default_for_capability(chosen)
        else []
    )
    handoff_options = {dossier_id: path for dossier_id, path in handoff_candidates}
    with st.form(f"{key_prefix}_dossier_form"):
        ack = st.checkbox("Jag har gått igenom checklistan ovan", key=ack_key)
        replacement_choice = None
        if len(handoff_options) >= 2:
            replacement_choice = st.selectbox(
                "Nytt Standardval efter raderingen",
                ["(välj syskon)", *handoff_options.keys()],
                key=f"{key_prefix}_replacement_default",
                help="Standardvals-flytten görs atomiskt med raderingen.",
            )
        confirmed = confirm_by_typing(
            str(chosen.get("id") or ""),
            confirm_key,
            label="Bekräfta genom att skriva byggblockets id",
        )
        submitted = st.form_submit_button("Radera från live-poolen", type="primary")
    if submitted:
        if not ack:
            st.error("Du måste gå igenom checklistan ovan först — inget raderades.")
            return
        if not confirmed:
            st.error(
                f"Bekräftelsetexten måste vara exakt `{chosen.get('id')}` — inget raderades."
            )
            return
        ok, msg = _delete_dossier_dir(
            chosen,
            replacement_default_path=handoff_options.get(str(replacement_choice)),
        )
        if not ok:
            st.error(msg)
            return
        # Drop widget state that points at the now-deleted dossier —
        # otherwise the next rerun's selectbox/text_input restore a value
        # that no longer exists in options (StreamlitAPIException). Always
        # clear Redigera-flikens `delete_pick` too: Systemkartan och
        # Redigera delar poolen, så en radering från Systemkartan får inte
        # lämna selectboxen där med ett borttaget värde.
        for state_key in (ack_key, confirm_key, "delete_pick", *extra_state_keys):
            st.session_state.pop(state_key, None)
        _rerun_after_dossier_mutation(msg)




def _render_delete_body(dossiers: list[dict[str, Any]]) -> None:
    options = {f"{d['_class']}/{d['id']}": d for d in dossiers}
    pick_key = st.selectbox(
        "Välj byggblock att radera",
        list(options.keys()),
        key="delete_pick",
        format_func=lambda k: f"{options[k]['id']} — {class_label(options[k]['_class'])}",
    )
    if not pick_key:
        return
    chosen = options[pick_key]
    _render_delete_action(
        chosen, dossiers, key_prefix="delete", extra_state_keys=("delete_pick",)
    )
