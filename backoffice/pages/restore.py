"""Återställning — bläddra och rulla tillbaka säkerhetskopior av redigerade filer.

Varje sparning som går genom backoffice (``shared.write_text`` /
``shared.write_json``) säkerhetskopierar först den befintliga filen till
``data/backoffice/backups/files/<relativ-sökväg>/<UTC-tid>.bak`` (gitignorerad,
max :data:`backoffice.shared.MAX_BACKUPS_PER_FILE` snapshots per fil). Den här
sidan listar snapshotsen, visar diff mot nuvarande innehåll och kan återställa.
En återställning säkerhetskopierar i sin tur det nuvarande innehållet, så den
är själv ångringsbar. Git är alltid det yttersta skyddsnätet.
"""

from __future__ import annotations

import difflib

import streamlit as st

from backoffice.shared import (
    MAX_BACKUPS_PER_FILE,
    BackofficeContext,
    list_backup_files,
    list_backup_trees,
    list_snapshots_for,
    list_tree_snapshots_for,
    read_json,
    render_where_panel,
    restore_backup,
    restore_tree,
)


def _snapshot_label(name: str) -> str:
    # "2026-07-21T10-30-00-123456Z.bak" → "2026-07-21 10:30:00 UTC"
    stem = name.removesuffix(".bak").removesuffix(".zip")
    if "T" in stem:
        date_part, _, time_part = stem.partition("T")
        hms = time_part.split("-")[:3]
        if len(hms) == 3:
            return f"{date_part} {':'.join(hms)} UTC"
    return stem


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Återställning")
    render_where_panel("Återställning", domain_map)

    st.info(
        "**Så funkar skyddet:** varje gång du sparar en fil i backoffice tas först en "
        "säkerhetskopia av den gamla versionen. Blev något fel — välj filen nedan, "
        "jämför och klicka *Återställ*. Återställningen säkerhetskopierar i sin tur det "
        "nuvarande innehållet, så du kan ångra även den. "
        f"Max {MAX_BACKUPS_PER_FILE} snapshots sparas per fil (äldst rensas först). "
        "Git-historiken är alltid det yttersta skyddsnätet för committade filer."
    )

    entries = list_backup_files(ctx.repo_root)
    tree_entries = list_backup_trees(ctx.repo_root)
    if not entries and not tree_entries:
        st.success(
            "Inga säkerhetskopior ännu — de skapas automatiskt vid första sparningen "
            "eller raderingen från någon redigerbar vy."
        )
        return

    c1, c2, c3 = st.columns(3)
    c1.metric("Filer med snapshots", len(entries))
    c2.metric("Fil-snapshots totalt", sum(int(e["snapshots"]) for e in entries))
    c3.metric("Katalog-snapshots (zip)", sum(int(e["snapshots"]) for e in tree_entries))

    if not entries:
        st.info("Inga fil-snapshots ännu — hoppa till katalogsektionen nedan.")
        _render_tree_section(ctx, tree_entries)
        return

    st.subheader("Filer med säkerhetskopior")
    st.dataframe(
        [
            {
                "fil": e["file"],
                "snapshots": e["snapshots"],
                "senaste (UTC)": _snapshot_label(str(e["latest"])),
            }
            for e in entries
        ],
        width="stretch",
        hide_index=True,
    )

    st.subheader("Återställ en fil")
    files = [str(e["file"]) for e in entries]
    picked_file = st.selectbox("Fil", files, key="restore_file_pick")
    snapshots = list_snapshots_for(picked_file, ctx.repo_root)
    if not snapshots:
        st.warning("Inga snapshots kvar för den valda filen.")
        return

    picked_snapshot = st.selectbox(
        "Snapshot (nyast först)",
        snapshots,
        format_func=lambda p: _snapshot_label(p.name),
        key="restore_snapshot_pick",
    )

    current_path = ctx.repo_root / picked_file
    try:
        snapshot_text = picked_snapshot.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        st.error(f"Kunde inte läsa snapshoten: {exc}")
        return
    current_text = (
        current_path.read_text(encoding="utf-8", errors="replace")
        if current_path.is_file()
        else ""
    )

    if snapshot_text == current_text:
        st.success("Snapshoten är identisk med filens nuvarande innehåll — inget att återställa.")
    else:
        diff_lines = list(
            difflib.unified_diff(
                current_text.splitlines(),
                snapshot_text.splitlines(),
                fromfile=f"nuvarande: {picked_file}",
                tofile=f"snapshot: {_snapshot_label(picked_snapshot.name)}",
                lineterm="",
                n=3,
            )
        )
        with st.expander("Diff: nuvarande → snapshot", expanded=True):
            body = "\n".join(diff_lines[:400])
            if len(diff_lines) > 400:
                body += f"\n… ({len(diff_lines) - 400} rader till)"
            st.code(body or "(ingen textdiff)", language="diff")

        confirm = st.checkbox(
            f"Jag vill ersätta `{picked_file}` med snapshoten från "
            f"{_snapshot_label(picked_snapshot.name)}",
            key="restore_confirm",
        )
        if st.button("Återställ", type="primary", disabled=not confirm, key="restore_apply"):
            ok, message = restore_backup(picked_file, picked_snapshot, ctx.repo_root)
            if ok:
                st.success(message + " Det tidigare innehållet snapshotades också, så detta går att ångra.")
                st.rerun()
            else:
                st.error(message)

    _render_tree_section(ctx, tree_entries)


def _render_tree_section(ctx: BackofficeContext, tree_entries: list[dict]) -> None:
    st.divider()
    st.subheader("Raderade kataloger (zip-snapshots)")
    st.caption(
        "När en hel katalog raderas (t.ex. en dossier eller scaffold) zippas den "
        "först hit. Återställning packar upp zipen på ursprungsplatsen. "
        "Kör relevanta valideringar efteråt (`npm run dossiers:validate-all` / "
        "`npm run scaffolds:validate`) — registerfiler kan behöva synkas om."
    )
    if not tree_entries:
        st.caption("Inga katalog-snapshots ännu.")
        return

    st.dataframe(
        [
            {
                "katalog": e["dir"],
                "snapshots": e["snapshots"],
                "senaste (UTC)": _snapshot_label(str(e["latest"])),
            }
            for e in tree_entries
        ],
        width="stretch",
        hide_index=True,
    )
    dirs = [str(e["dir"]) for e in tree_entries]
    picked_dir = st.selectbox("Katalog", dirs, key="restore_tree_pick")
    zips = list_tree_snapshots_for(picked_dir, ctx.repo_root)
    if not zips:
        st.warning("Inga zip-snapshots kvar för den valda katalogen.")
        return
    picked_zip = st.selectbox(
        "Zip-snapshot (nyast först)",
        zips,
        format_func=lambda p: _snapshot_label(p.name),
        key="restore_tree_zip_pick",
    )
    target_exists = (ctx.repo_root / picked_dir).is_dir()
    if target_exists:
        st.warning(
            f"Katalogen `{picked_dir}` finns redan — en återställning zippar först "
            "nuvarande innehåll och ersätter det sedan med snapshoten."
        )
    confirm_tree = st.checkbox(
        f"Jag vill återställa katalogen `{picked_dir}` från zip-snapshoten",
        key="restore_tree_confirm",
    )
    if st.button(
        "Återställ katalog",
        type="primary",
        disabled=not confirm_tree,
        key="restore_tree_apply",
    ):
        ok, message = restore_tree(picked_dir, picked_zip, ctx.repo_root)
        if ok:
            st.success(message)
            st.rerun()
        else:
            st.error(message)
