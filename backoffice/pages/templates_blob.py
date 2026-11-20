"""Mallar → Blob-upload — ladda upp v0-mallar (zip) till Vercel Blob från backoffice.

Operatörsflöde:
  1. Välj mappen där dina nedladdade mallar ligger (``mallar``-intag med
     ``out/downloaded.jsonl`` + ``downloads/<kategori>/<id>/*.zip``).
  2. "Skanna" kör en dry-run och visar vad som skulle laddas upp.
  3. Uppladdningen kräver en lyckad dry-run för samma mapp och samma manifest,
     typad bekräftelse och ett lås så att bara en uppladdning körs åt gången.
     "Ladda upp saknade + uppdatera katalog" kör
     ``scripts/v0-templates/upload-mallar-blob.mjs --upload --write-catalog`` som:
       - laddar upp de zippar som inte redan ligger i Blob (inkrementellt, per SHA-256),
       - skriver ``template-blob-manifest.json`` (runtime-källa för preview i VM),
       - regenererar ``templates.json`` + ``template-categories.json`` så att
         "Mallar"/Templates-galleriet på sajten visar exakt de uppladdade mallarna.

Ingen databas behövs för själva mallregistret — manifestet + katalogen är källan.
Projekt/chat/version skapas först när en användare klickar på en mall
(``/api/template`` → preview-session i Fly-VM:en).
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    confirm_by_typing,
    danger_zone,
    render_building_blocks_nav,
    render_save_scope,
    tech_details,
)
from backoffice.shared_lib.repo_lock import RepoMutationLockTimeout, repo_mutation_lock

PAGE_NAME = "Mallar (v0): inspiration & uppladdning"

_UPLOADER_REL = "scripts/v0-templates/upload-mallar-blob.mjs"
_MANIFEST_REL = "src/lib/templates/template-blob-manifest.json"
_TIMEOUT_S = 900
_DRY_RUN_STATE_KEY = "mallar_blob_dry_run"
_UPLOAD_RESULT_KEY = "mallar_blob_upload_result"
_UPLOAD_CONFIRM_KEY = "mallar_blob_upload_confirm"
_UPLOAD_CONFIRM_WORD = "ladda upp"
_UPLOAD_LOCK_NAME = "template-blob-upload"


def _default_source(repo_root: Path) -> str:
    """Bästa gissning: en syskonmapp ``mallar`` bredvid repo-roten."""
    sibling = repo_root.parent / "mallar"
    if sibling.exists():
        return str(sibling)
    return "../mallar"


def _pick_folder(initial: str | None) -> str | None:
    """Öppnar en native mappväljardialog (tkinter). Best-effort — backoffice
    körs lokalt, så dialogen dyker upp på samma maskin. Returnerar None om
    tkinter saknas eller dialogen avbryts."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        chosen = filedialog.askdirectory(initialdir=initial or str(Path.home()))
        root.destroy()
        return chosen or None
    except Exception:  # noqa: BLE001 - headless env / no display
        return None


def _on_browse_click() -> None:
    """Button callback: runs BEFORE widgets are instantiated on the rerun, so it is
    safe to set the ``mallar_blob_source`` widget key here (setting it after the
    text_input is created would raise StreamlitAPIException)."""
    picked = _pick_folder(st.session_state.get("mallar_blob_source"))
    if picked:
        st.session_state["mallar_blob_source"] = picked
        st.session_state["mallar_blob_browse_msg"] = None
    else:
        st.session_state["mallar_blob_browse_msg"] = (
            "Ingen mapp vald (eller ingen dialog tillgänglig). Skriv sökvägen manuellt."
        )


def _run_uploader(repo_root: Path, source: str, *, upload: bool) -> dict:
    script = repo_root / _UPLOADER_REL
    if not script.exists():
        return {"ok": False, "error": f"Skript saknas: {script}"}
    args = ["node", str(script), f"--source={source}"]
    if upload:
        args += ["--upload", "--write-catalog"]
    try:
        result = subprocess.run(
            args,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timeout efter {_TIMEOUT_S}s"}
    except FileNotFoundError:
        return {"ok": False, "error": "`node` saknas på PATH"}
    output = (result.stdout or "") + (("\n" + result.stderr) if result.stderr else "")
    return {"ok": result.returncode == 0, "output": output.strip(), "code": result.returncode}


def _upload_binding(repo_root: Path, source: str) -> dict[str, str | None]:
    """Det en dry-run gäller för: källmappen och manifestets innehåll.

    Ändras någon av dem efter skanningen visar dry-run inte längre vad
    uppladdningen skulle göra, och då krävs en ny skanning.
    """
    try:
        digest = hashlib.sha256((repo_root / _MANIFEST_REL).read_bytes()).hexdigest()
    except OSError:
        digest = None
    return {"source": str(source).strip(), "manifestSha256": digest}


def _upload_block_reason(
    dry_run: Any, binding: Mapping[str, Any], *, confirmed: bool
) -> str | None:
    """Varför uppladdningen är spärrad, eller None när den får köras."""
    if not isinstance(dry_run, Mapping) or not dry_run.get("ok"):
        return "Kör en lyckad dry-run (Skanna) först."
    if dry_run.get("binding") != dict(binding):
        return "Mappen eller Blob-manifestet har ändrats sedan dry-run. Skanna igen."
    if not confirmed:
        return f"Skriv `{_UPLOAD_CONFIRM_WORD}` för att bekräfta uppladdningen."
    return None


def _run_upload_locked(repo_root: Path, source: str) -> dict:
    """Kör uppladdningen under ett processlås; en andra samtidig körning nekas."""
    try:
        with repo_mutation_lock(repo_root, _UPLOAD_LOCK_NAME, timeout_seconds=0):
            return _run_uploader(repo_root, source, upload=True)
    except RepoMutationLockTimeout:
        return {
            "ok": False,
            "error": "En annan uppladdning pågår redan. Vänta tills den är klar.",
        }


def _render_run_result(result: Mapping[str, Any], *, success: str, failure: str) -> None:
    if result.get("ok"):
        st.success(success)
        st.code(result.get("output") or "(ingen output)", language="text")
    else:
        st.error(result.get("error") or failure)
        if result.get("output"):
            st.code(result["output"], language="text")


def _load_manifest_summary(repo_root: Path) -> dict | None:
    path = repo_root / _MANIFEST_REL
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    templates = data.get("templates") if isinstance(data, dict) else None
    return {
        "count": len(templates) if isinstance(templates, list) else 0,
        "lastUpdated": data.get("_lastUpdated") if isinstance(data, dict) else None,
        "templates": templates if isinstance(templates, list) else [],
    }


def render(ctx: BackofficeContext) -> None:
    st.header("Mallar (v0): inspiration & uppladdning")
    render_building_blocks_nav(PAGE_NAME)
    st.markdown(
        "**Mallar är färdiga sajter** som användaren kan starta direkt — och den "
        "inspirationskälla **Guide** använder när en ny variant ska skapas. En mall "
        "är alltså varken en scaffold eller ett byggblock: den importeras ordagrant, "
        "utan AI."
    )
    render_save_scope(
        "prod",
        note="Uppladdningen lägger zip-filer i **Vercel Blob** direkt (live-lagring). "
        "Katalogfilerna som skrivs i repot syns på sajten först när de committas "
        "och mergas till `master`.",
    )
    with tech_details():
        st.markdown(f"- Uppladdare: `{_UPLOADER_REL}`")
        st.markdown(f"- Manifest (runtime-källa): `{_MANIFEST_REL}`")
        st.markdown(
            "- Katalogfiler som regenereras: `src/lib/templates/templates.json`, "
            "`template-categories.json`"
        )
        st.markdown(
            "- Intag: mappen ska innehålla `out/downloaded.jsonl` och "
            "`downloads/<kategori>/<id>/*.zip`"
        )

    repo_root = ctx.repo_root

    if "mallar_blob_source" not in st.session_state:
        st.session_state["mallar_blob_source"] = _default_source(repo_root)

    col_input, col_browse = st.columns([5, 1])
    with col_input:
        st.text_input(
            "Mapp med mallar",
            key="mallar_blob_source",
            help="Rooten som innehåller out/downloaded.jsonl och downloads/<kategori>/<id>/*.zip",
        )
    with col_browse:
        st.write("")
        st.write("")
        # on_click callback runs before widgets instantiate on the rerun, so it can
        # safely update the text_input's session_state key.
        st.button("Bläddra…", width="stretch", on_click=_on_browse_click)

    browse_msg = st.session_state.pop("mallar_blob_browse_msg", None)
    if browse_msg:
        st.info(browse_msg)

    source = st.session_state["mallar_blob_source"]
    source_path = Path(source) if source else None
    if source_path and not source_path.is_absolute():
        source_path = (repo_root / source).resolve()
    if not source_path or not source_path.exists():
        st.warning(f"Mappen finns inte: `{source}`")
    else:
        st.caption(f"Använder: `{source_path}`")

    summary = _load_manifest_summary(repo_root)
    if summary:
        st.metric("I Blob-manifestet nu", summary["count"])
        if summary["lastUpdated"]:
            st.caption(f"Manifest uppdaterat: {summary['lastUpdated']}")
    else:
        st.caption("Inget Blob-manifest ännu.")

    st.divider()
    if st.button("Skanna (dry-run)"):
        with st.spinner("Skannar mappen…"):
            res = _run_uploader(repo_root, source, upload=False)
        st.session_state[_DRY_RUN_STATE_KEY] = {
            **res,
            "binding": _upload_binding(repo_root, source),
        }
        st.session_state.pop(_UPLOAD_RESULT_KEY, None)

    dry_run = st.session_state.get(_DRY_RUN_STATE_KEY)
    if isinstance(dry_run, Mapping):
        _render_run_result(dry_run, success="Dry-run klar.", failure="Dry-run misslyckades")

    with danger_zone(
        "Ladda upp till Vercel Blob (live)",
        help_text="Skriver zip-filer och bilder till Blob och regenererar katalogfilerna i repot.",
    ):
        confirmed = confirm_by_typing(
            _UPLOAD_CONFIRM_WORD,
            _UPLOAD_CONFIRM_KEY,
            label=f"Bekräfta genom att skriva `{_UPLOAD_CONFIRM_WORD}`",
        )
        block_reason = _upload_block_reason(
            dry_run, _upload_binding(repo_root, source), confirmed=confirmed
        )
        if block_reason:
            st.caption(block_reason)
        if st.button(
            "Ladda upp saknade + uppdatera katalog",
            type="primary",
            disabled=block_reason is not None,
        ):
            with st.spinner("Laddar upp till Blob och regenererar katalog… (kan ta en stund)"):
                res = _run_upload_locked(repo_root, source)
            st.session_state[_UPLOAD_RESULT_KEY] = res
            if res.get("ok"):
                # Nästa uppladdning kräver en ny dry-run mot det nya manifestet.
                st.session_state.pop(_DRY_RUN_STATE_KEY, None)
                st.cache_data.clear()

    upload_result = st.session_state.get(_UPLOAD_RESULT_KEY)
    if isinstance(upload_result, Mapping):
        _render_run_result(
            upload_result,
            success="Uppladdning klar. Katalogen (templates.json) är uppdaterad.",
            failure="Uppladdning misslyckades",
        )
        if upload_result.get("ok"):
            st.info(
                "Committa `src/lib/templates/template-blob-manifest.json`, "
                "`templates.json` och `template-categories.json` för att publicera."
            )

    st.divider()
    st.caption(
        "Gränser i preview-VM:en: max 2 MB/fil och 12 MB totalt per mall "
        "(`preview-host/src/validate.js`). Mallar över gränsen laddas upp men kan inte "
        "öppnas som preview — krymp assets vid behov. Kör "
        "`node scripts/v0-templates/verify-mallar-blob.mjs` för att se vilka som får plats."
    )
