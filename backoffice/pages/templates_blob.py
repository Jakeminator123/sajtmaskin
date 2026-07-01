"""Mallar → Blob-upload — ladda upp v0-mallar (zip) till Vercel Blob från backoffice.

Operatörsflöde:
  1. Välj mappen där dina nedladdade mallar ligger (``mallar``-intag med
     ``out/downloaded.jsonl`` + ``downloads/<kategori>/<id>/*.zip``).
  2. "Skanna" kör en dry-run och visar vad som skulle laddas upp.
  3. "Ladda upp saknade + uppdatera katalog" kör
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

import json
import subprocess
from pathlib import Path

import streamlit as st

from backoffice.shared import BackofficeContext

_UPLOADER_REL = "scripts/v0-templates/upload-mallar-blob.mjs"
_MANIFEST_REL = "src/lib/templates/template-blob-manifest.json"
_TIMEOUT_S = 900


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
    st.title("Mallar → Blob-upload")
    st.caption(
        "Ladda upp v0-mallar (zip) till Vercel Blob och regenerera katalogen så att "
        "`Mallar`/Templates-galleriet på sajten visar exakt de uppladdade mallarna. "
        "Varje mall kan sedan väljas och startas som preview i Fly-VM:en."
    )

    repo_root = ctx.repo_root

    if "mallar_blob_source" not in st.session_state:
        st.session_state["mallar_blob_source"] = _default_source(repo_root)

    col_input, col_browse = st.columns([5, 1])
    with col_input:
        source = st.text_input(
            "Mapp med mallar",
            key="mallar_blob_source",
            help="Rooten som innehåller out/downloaded.jsonl och downloads/<kategori>/<id>/*.zip",
        )
    with col_browse:
        st.write("")
        st.write("")
        if st.button("Bläddra…", use_container_width=True):
            picked = _pick_folder(st.session_state.get("mallar_blob_source"))
            if picked:
                st.session_state["mallar_blob_source"] = picked
                st.rerun()
            else:
                st.info("Ingen mapp vald (eller ingen dialog tillgänglig). Skriv sökvägen manuellt.")

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
    col_scan, col_upload = st.columns(2)
    with col_scan:
        if st.button("Skanna (dry-run)", use_container_width=True):
            with st.spinner("Skannar mappen…"):
                res = _run_uploader(repo_root, source, upload=False)
            if res.get("ok"):
                st.success("Dry-run klar.")
                st.code(res.get("output") or "(ingen output)", language="text")
            else:
                st.error(res.get("error") or "Dry-run misslyckades")
                if res.get("output"):
                    st.code(res["output"], language="text")

    with col_upload:
        if st.button("Ladda upp saknade + uppdatera katalog", type="primary", use_container_width=True):
            with st.spinner("Laddar upp till Blob och regenererar katalog… (kan ta en stund)"):
                res = _run_uploader(repo_root, source, upload=True)
            if res.get("ok"):
                st.success("Uppladdning klar. Katalogen (templates.json) är uppdaterad.")
                st.code(res.get("output") or "(ingen output)", language="text")
                st.info(
                    "Committa `src/lib/templates/template-blob-manifest.json`, "
                    "`templates.json` och `template-categories.json` för att publicera."
                )
                st.cache_data.clear()
            else:
                st.error(res.get("error") or "Uppladdning misslyckades")
                if res.get("output"):
                    st.code(res["output"], language="text")

    st.divider()
    st.caption(
        "Gränser i preview-VM:en: max 2 MB/fil och 12 MB totalt per mall "
        "(`preview-host/src/validate.js`). Mallar över gränsen laddas upp men kan inte "
        "öppnas som preview — krymp assets vid behov. Kör "
        "`node scripts/v0-templates/verify-mallar-blob.mjs` för att se vilka som får plats."
    )
