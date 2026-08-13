from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    backup_file,
    confirm_by_typing,
    field_label,
)

from .constants import BASELINE_TAG, BASELINE_PATHS
from .formatting import _exception_message

from .variants import (
    _handoff_default_variant,
    _prune_variant_embeddings,
    _would_leave_no_default_variant,
)

from .scaffold_ops import _scan_scaffold_dependencies, _delete_scaffold

from .flash import _flash_note
from .index_gate import queue_index_after_create

from .baseline import (
    _run_git,
    _baseline_tag_exists,
    _baseline_drift,
    _baseline_head_delta,
    _factory_reset_to_baseline,
)



def _render_delete_variant(
    ctx: BackofficeContext,
    scaffold_ids: list[str],
    variants_by_scaffold: dict[str, list[dict[str, Any]]],
) -> None:
    scaffold_choices = [scaffold_id for scaffold_id in scaffold_ids if variants_by_scaffold.get(scaffold_id)]
    if not scaffold_choices:
        st.info("Det finns inga varianter att radera.")
        return

    selected_scaffold = st.selectbox(
        field_label("scaffoldId"),
        scaffold_choices,
        key="delete_variant_scaffold_selector",
    )
    variants = variants_by_scaffold.get(selected_scaffold, [])
    variant_labels = [f"{variant.get('label', variant.get('id', '?'))} ({variant.get('id', '?')})" for variant in variants]
    selected_label = st.selectbox(
        "Variant",
        variant_labels,
        key="delete_variant_selector",
    )
    selected_variant = variants[variant_labels.index(selected_label)]
    variant_path = selected_variant.get("_path")
    if not isinstance(variant_path, Path):
        st.error("Den valda varianten saknar filpath och kan inte raderas.")
        return

    if len(variants) <= 1:
        st.error(
            "Det här är scaffoldens **sista** variant. En scaffold utan varianter är "
            "ogiltig — radera hela scaffolden längre ned i **Farlig zon** i stället, "
            "eller skapa en ersättningsvariant först."
        )
        return

    remaining_defaults = [
        variant
        for variant in variants
        if variant is not selected_variant and variant.get("default") is True
    ]
    if len(remaining_defaults) > 1:
        st.error(
            "Raderingen skulle lämna flera default-varianter. Reparera scaffoldens "
            "defaultmarkeringar till exakt en innan du raderar fler varianter."
        )
        return

    successor_variant: dict[str, Any] | None = None
    if _would_leave_no_default_variant(selected_variant, variants):
        successor_candidates = [
            variant
            for variant in variants
            if variant is not selected_variant
            and isinstance(variant.get("_path"), Path)
            and not variant.get("_error")
        ]
        if not successor_candidates:
            st.error("Ingen läsbar syskonvariant kan ta över som default.")
            return
        successor_labels = [
            f"{variant.get('label', variant.get('id', '?'))} "
            f"({variant.get('id', '?')})"
            for variant in successor_candidates
        ]
        successor_label = st.selectbox(
            "Ny default-variant efter raderingen",
            successor_labels,
            key=f"delete_variant_successor_{selected_scaffold}_{variant_path.stem}",
        )
        successor_variant = successor_candidates[successor_labels.index(successor_label)]
        st.info(
            "Defaultmarkeringen flyttas och den valda varianten raderas i en "
            "byte-säker transaktion."
        )

    variant_id = str(selected_variant.get("id", "")) or variant_path.stem
    st.caption(f"Fil: `{variant_path.relative_to(ctx.repo_root).as_posix()}`")

    # Bekräftelsen ligger i ett formulär, precis som scaffold-raderingen: ett
    # fritextfält utanför formulär skickar sitt värde först vid blur/Enter, och
    # en knapp som är `disabled` tills dess går inte att klicka fram värdet med.
    with st.form(f"delete_variant_form_{selected_scaffold}_{variant_id}"):
        confirmed = confirm_by_typing(
            variant_id,
            f"delete_variant_confirm_{selected_scaffold}_{variant_id}",
            label="Bekräfta genom att skriva variantens ID",
        )
        submitted = st.form_submit_button("Radera variant", type="primary")

    if not submitted:
        return
    if not confirmed:
        st.error(f"Bekräftelsetexten måste vara exakt `{variant_id}`.")
        return

    # Fail-closed: radera inte om snapshoten (Återställning) inte kunde tas.
    snapshot_paths = [variant_path]
    successor_path: Path | None = None
    if successor_variant is not None:
        candidate_path = successor_variant.get("_path")
        if not isinstance(candidate_path, Path):
            st.error("Efterträdaren saknar filpath; inget togs bort.")
            return
        successor_path = candidate_path
        snapshot_paths.append(successor_path)
    for snapshot_path in snapshot_paths:
        if snapshot_path.is_file() and backup_file(snapshot_path, ctx.repo_root) is None:
            st.error(
                "Kunde inte ta snapshot av alla berörda variantfiler — "
                "avbröt raderingen, inget togs bort."
            )
            return

    try:
        if successor_path is not None:
            _handoff_default_variant(
                ctx,
                scaffold_id=selected_scaffold,
                current_path=variant_path,
                successor_path=successor_path,
                delete_current=True,
            )
        else:
            variant_path.unlink(missing_ok=True)
    except Exception as error:
        st.error(
            "Raderingen avbröts – default-transaktionen misslyckades: "
            + _exception_message(error)
        )
        return

    removed = _prune_variant_embeddings(ctx, selected_scaffold, [variant_id])
    rel = variant_path.relative_to(ctx.repo_root).as_posix()
    handoff_note = (
        f" Default flyttades till `{successor_variant.get('id', '')}`."
        if successor_variant is not None
        else ""
    )
    if removed:
        note = (
            f"Raderade `{rel}` och rensade {removed} post ur den lokala cachen"
            f"{handoff_note}. Publicera till Blob med knapparna ovan — "
            "best-effort-push räcker inte, Auto-match kan annars välja den raderade "
            "varianten. En snapshot ligger kvar under **Återställning**."
        )
    else:
        note = (
            f"Raderade `{rel}` (ingen matchande post i den lokala cachen)"
            f"{handoff_note}. Publicera variant-indexet till Blob med knapparna ovan. "
            "En snapshot ligger kvar under **Återställning**."
        )
    queue_index_after_create(new_scaffold=False, scaffold_id=selected_scaffold)
    _flash_note(note, level="warning")
    st.rerun()




def _render_dependency_report(report: dict[str, Any]) -> None:
    def _status_text(value: Any) -> str:
        if isinstance(value, bool):
            return "ja" if value else "nej"
        return str(value)

    rows = [
        {
            "dependency": "Variant JSON files",
            "status": _status_text(len(report["variantFiles"])),
            "action": "Rensas automatiskt",
        },
        {
            "dependency": "Scaffold directory",
            "status": _status_text(report["scaffoldDirExists"]),
            "action": "Rensas automatiskt",
        },
        {
            "dependency": "types.ts-union + genererad klientlista",
            "status": _status_text(report["typesUnionPresent"] or report["clientListPresent"]),
            "action": (
                "Uppdateras automatiskt"
                if report.get("clientListStatus", "ok") == "ok"
                else "Klientprojektionen regenereras vid radering "
                f"(nu: {report.get('clientListStatus')})"
            ),
        },
        {
            "dependency": "registry.ts imports + registry list",
            "status": _status_text(report["registryImportPresent"] or report["registryArrayPresent"]),
            "action": "Uppdateras automatiskt",
        },
        {
            "dependency": "scaffold-embedding-locale.ts",
            "status": _status_text(report["embeddingLocalePresent"]),
            "action": "Uppdateras automatiskt",
        },
        {
            "dependency": "referenceScaffoldIds in other variants",
            "status": _status_text(len(report["referenceHits"])),
            "action": "Varnas, men rensas inte automatiskt",
        },
        {
            "dependency": "Generated research entry",
            "status": _status_text(report["researchEntryPresent"]),
            "action": "Tas bort direkt om den finns, annars rebuild vid behov",
        },
        {
            "dependency": "Generated embeddings entry",
            "status": _status_text(report["embeddingsEntryPresent"]),
            "action": "Tas bort direkt om den finns, annars rebuild vid behov",
        },
        {
            "dependency": "Manual code references",
            "status": _status_text(len(report["manualCodeReferences"])),
            "action": "Måste rensas manuellt",
        },
    ]
    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

    if report["variantFiles"]:
        with st.expander(f"Variantfiler ({len(report['variantFiles'])})", expanded=False):
            for path in report["variantFiles"]:
                st.markdown(f"- `{path}`")

    if report["referenceHits"]:
        with st.expander(
            f"referenceScaffoldIds-pekare ({len(report['referenceHits'])})",
            expanded=False,
        ):
            for hit in report["referenceHits"]:
                st.markdown(
                    f"- `{hit['variantId']}` i `{hit['path']}` (scaffold `{hit['scaffoldId']}`)"
                )

    if report["manualCodeReferences"]:
        with st.expander(
            f"Manuella kodreferenser ({len(report['manualCodeReferences'])})",
            expanded=False,
        ):
            for ref in report["manualCodeReferences"]:
                line_preview = ", ".join(str(line) for line in ref["lines"])
                st.markdown(
                    f"- `{ref['path']}` — {ref['count']} träffar (rader {line_preview})"
                )




def _render_delete_scaffold(
    ctx: BackofficeContext,
    scaffold_ids: list[str],
    variants: list[dict[str, Any]],
) -> None:
    if not scaffold_ids:
        st.info("Inga scaffolds hittades.")
        return

    scaffold_selector_key = (
        f"delete_scaffold_selector_{len(scaffold_ids)}_{scaffold_ids[-1] if scaffold_ids else 'none'}"
    )
    selected_scaffold = st.selectbox(
        "Scaffold att radera",
        scaffold_ids,
        key=scaffold_selector_key,
    )
    report = _scan_scaffold_dependencies(ctx, selected_scaffold, variants)
    _render_dependency_report(report)

    st.warning(
        "Radering tar bort scaffold/variant-mappar, registry-länkar och embedding-locale. "
        "Direkta generated poster i scaffold research/embeddings tvättas också bort om de finns. "
        "Andra kodreferenser och `referenceScaffoldIds` måste fortfarande rensas manuellt."
    )
    st.caption(f"Aktuell scaffold för radering: `{selected_scaffold}`")

    with st.form(f"delete_scaffold_form_{selected_scaffold}"):
        acknowledge_manual = st.checkbox(
            "Jag förstår att manuella kodreferenser och andra variantspekare inte rensas automatiskt.",
            key=f"delete_scaffold_acknowledge_{selected_scaffold}",
        )
        confirm_cleanup = st.checkbox(
            "Jag vill rensa den valda scaffolden och dess variantmapp.",
            key=f"delete_scaffold_confirm_{selected_scaffold}",
        )
        typed_ok = confirm_by_typing(
            selected_scaffold,
            f"delete_scaffold_type_{selected_scaffold}",
            label="Bekräfta genom att skriva scaffold-ID",
        )
        submitted = st.form_submit_button("Radera scaffold", type="primary")

    if not submitted:
        return

    if not acknowledge_manual:
        st.error("Du måste bekräfta att manuella kodreferenser inte rensas automatiskt.")
        return
    if not confirm_cleanup:
        st.error("Du måste bekräfta att scaffolden och variantmappen ska rensas.")
        return
    if not typed_ok:
        st.error(f"Bekräftelsetexten måste vara exakt `{selected_scaffold}`.")
        return

    try:
        _delete_scaffold(ctx, selected_scaffold)
    except Exception as error:
        st.error(str(error))
        return
    queue_index_after_create(new_scaffold=True, scaffold_id=selected_scaffold)
    _flash_note(
        f"Raderade `{selected_scaffold}`. Indexera om till Blob så Auto-match "
        "inte pekar på den raderade posten.",
        level="warning",
    )
    st.rerun()




def _render_baseline_tab(ctx: BackofficeContext) -> None:
    st.caption(
        "**Version 1 — standard.** Baselinen är en git-tag "
        f"(`{BASELINE_TAG}`) som fryser scaffold-ytorna: "
        + ", ".join(f"`{path}`" for path in BASELINE_PATHS)
        + ". Fabriksåterställning återställer exakt dessa ytor till taggen — "
        "experimentera fritt i wizarden och backa hit om något blir fel."
    )

    if not _baseline_tag_exists(ctx):
        st.warning(f"Taggen `{BASELINE_TAG}` finns inte ännu.")
        if st.button("Skapa baseline-tag av nuvarande läge", type="primary"):
            code, output = _run_git(ctx, ["tag", BASELINE_TAG])
            if code == 0:
                st.success(f"Skapade `{BASELINE_TAG}`.")
                st.rerun()
            else:
                st.error(output)
        return

    drift = _baseline_drift(ctx)
    total_drift = len(drift["changed"]) + len(drift["untracked"])
    c1, c2, c3 = st.columns(3)
    c1.metric("Ändrade/raderade vs baseline", len(drift["changed"]))
    c2.metric("Nya ospårade filer", len(drift["untracked"]))
    c3.metric("Totalt avvikande", total_drift)

    head_delta = _baseline_head_delta(ctx)
    if head_delta:
        st.warning(
            f"⚠ {len(head_delta)} commit(ar) i scaffold-ytorna ligger EFTER baselinen. "
            "Fabriksåterställningen ändrar bara arbetskopian/indexet till taggen — HEAD "
            "flyttas inte. Ändringarna finns kvar i git-historiken, men en efterföljande "
            "commit från det återställda läget skulle backa dem från branch-tippen. Vill "
            'du behålla nuvarande läge som standard: använd "Uppdatera baselinen" nedan.'
        )
        with st.expander(
            f"Commits efter baselinen i scaffold-ytorna ({len(head_delta)})", expanded=False
        ):
            for line in head_delta:
                st.markdown(f"- `{line}`")

    if total_drift == 0:
        st.success("Scaffold-ytorna är identiska med baselinen. Inget att återställa.")
    else:
        with st.expander(f"Avvikande filer ({total_drift})", expanded=False):
            for line in drift["changed"]:
                st.markdown(f"- `{line}`")
            for line in drift["untracked"]:
                st.markdown(f"- `?? {line}` (ospårad)")

        st.error(
            "Fabriksåterställningen raderar filer som tillkommit efter baselinen och "
            "återställer alla ändringar i scaffold-ytorna — även sådant andra "
            "agenter/personer inte hunnit committa. Åtgärden återställer även git-indexet "
            "(staging) för dessa ytor i den checkout backoffice körs i. Dubbelkolla listan "
            "ovan först."
        )
        st.info(
            "Filerna som raderas säkerhetskopieras först och kan rullas tillbaka från "
            "sidan **Återställning**. Kan en säkerhetskopia inte tas avbryts hela "
            "åtgärden utan att något raderas."
        )
        with st.form("baseline_reset_form"):
            acknowledge = st.checkbox(
                "Jag har läst listan och förstår att avvikelserna ovan försvinner."
            )
            typed_ok = confirm_by_typing(
                BASELINE_TAG,
                "baseline_reset_confirm",
                label="Bekräfta genom att skriva taggens namn",
            )
            submitted = st.form_submit_button("Fabriksåterställ scaffold-ytorna", type="primary")
        if submitted:
            if not acknowledge:
                st.error("Du måste bekräfta att du läst listan.")
                return
            if not typed_ok:
                st.error(f"Bekräftelsetexten måste vara exakt `{BASELINE_TAG}`.")
                return
            try:
                log = _factory_reset_to_baseline(ctx)
            except RuntimeError as error:
                st.error(str(error))
                return
            queue_index_after_create(new_scaffold=True, scaffold_id=BASELINE_TAG)
            preview = "; ".join(log[:8])
            _flash_note(
                "Återställt till baselinen. Indexera om till Blob så Auto-match "
                f"speglar fabriksfilerna. {preview}",
                level="warning",
            )
            st.rerun()

    st.divider()
    with st.expander("Uppdatera baselinen (gör nuvarande läge till nya 'standard')", expanded=False):
        st.caption(
            "Flyttar taggen till nuvarande commit (`git tag -f`). Gör detta när ett "
            "experiment blivit godkänt och committat och ska bli den nya fabriksinställningen."
        )
        confirm_move = st.checkbox("Jag vill flytta baselinen till nuvarande läge.")
        if st.button("Flytta baseline-taggen", disabled=not confirm_move):
            code, output = _run_git(ctx, ["tag", "-f", BASELINE_TAG])
            if code == 0:
                st.success(f"`{BASELINE_TAG}` pekar nu på nuvarande commit.")
                st.rerun()
            else:
                st.error(output)
