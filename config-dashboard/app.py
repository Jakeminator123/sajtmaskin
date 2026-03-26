# -*- coding: utf-8 -*-
"""
Sajtmaskin — konfigurationsdashboard (Streamlit).

Kör från repo-root (PowerShell, UTF-8):
  cd config-dashboard
  $env:PYTHONUTF8 = "1"
  python -m pip install -r requirements.txt
  python app.py

Samma som: streamlit run app.py  (eller python -X utf8 -m streamlit run app.py)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

# Windows-konsol / felströmmar: tvinga UTF-8 när möjligt (Streamlit-UI är ändå UTF-8 i webbläsaren)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (OSError, ValueError):
        pass

os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def _running_under_streamlit() -> bool:
    """True när koden körs av Streamlit (inte vid `python app.py` utan server)."""
    try:
        from streamlit.runtime.scriptrunner_utils.script_run_context import (
            get_script_run_ctx,
        )

        return get_script_run_ctx() is not None
    except Exception:
        return False


if not _running_under_streamlit():
    _app = Path(__file__).resolve()
    raise SystemExit(
        subprocess.call(
            [sys.executable, "-m", "streamlit", "run", str(_app), *sys.argv[1:]],
        )
    )

import streamlit as st

# --- repo root -----------------------------------------------------------------


def find_repo_root() -> Path:
    here = Path(__file__).resolve().parent
    for p in [here, *here.parents]:
        marker = p / "config" / "codegen-static-prompt.json"
        if marker.is_file():
            return p
    raise FileNotFoundError(
        "Hittade inte repo-root (saknar config/codegen-static-prompt.json). "
        "Kör appen från sajtmaskin-repot."
    )


def cfg() -> Path:
    return st.session_state["repo"] / "config"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


DASHBOARD_DIR = Path(__file__).resolve().parent


@st.cache_data
def load_domain_map() -> dict[str, Any]:
    p = DASHBOARD_DIR / "domain-map.json"
    if not p.is_file():
        return {"pages": {}, "repoSiblings": {}}
    with p.open(encoding="utf-8") as f:
        return json.load(f)


def render_where_panel(page: str, dm: dict[str, Any]) -> None:
    """Visar var källfiler, docs och läsande kod finns (domain-map.json)."""
    meta = (dm.get("pages") or {}).get(page)
    if not meta:
        st.info(
            f"Saknar post för **{page}** i `config-dashboard/domain-map.json`. "
            "Lägg till en `pages`-nyckel som matchar vynamnet."
        )
        return
    with st.expander("Var ligger detta? · config (sparbar) · docs (förklaring) · kod", expanded=False):
        if meta.get("summary"):
            st.markdown(meta["summary"])
        st.markdown("**Källfiler** (dashboarden skriver under `config/` där det är relevant)")
        for line in meta.get("canonicalPaths") or []:
            st.markdown(f"- `{line}`")
        st.markdown("**Dokumentation** (syskonmapp `docs/` eller README i `config/` — uppdateras manuellt)")
        docs = meta.get("docsPaths") or []
        if docs:
            for line in docs:
                st.markdown(f"- `{line}`")
        else:
            st.caption("Ingen doc-sökväg listad.")
        readers = meta.get("codeReaders") or []
        if readers:
            st.markdown("**Kod som läser / använder detta**")
            for line in readers:
                st.markdown(f"- `{line}`")


# Cursor-agentfiler (relativa sökvägar från repo-root, label i UI)
CURSOR_AGENT_DOCUMENTS: tuple[tuple[str, str], ...] = (
    (
        ".cursor/rules/terminology.mdc",
        "terminology.mdc — produkt, builder, lanes (Cursor-regel)",
    ),
    (
        "docs/architecture/repository-and-platform.md",
        "repository-and-platform.md — mappar, integrationer, repo (översikt)",
    ),
)


# --- Streamlit -----------------------------------------------------------------

st.set_page_config(
    page_title="Sajtmaskin · Konfiguration",
    page_icon="⚙",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
<style>
    div[data-testid="stMetricValue"] { font-size: 1.1rem; }
</style>
""",
    unsafe_allow_html=True,
)

if "repo" not in st.session_state:
    st.session_state["repo"] = find_repo_root()

repo = st.session_state["repo"]
config_dir = cfg()
domain_map = load_domain_map()

NAV_PAGES = (
    "Översikt",
    "Codegen static",
    "prompt-static",
    "ai_models",
    "env-policy",
    "shadcn-audit",
    "user_degraded_env",
    "Cursor-agenter",
)

with st.sidebar:
    st.subheader("Navigation")
    page = st.radio("Vy", NAV_PAGES, label_visibility="collapsed")
    st.caption(
        "`config/` · `docs/` · `config-dashboard/` · sist: **Cursor-agenter** → `.cursor/` + docs"
    )
    st.divider()
    st.subheader("Repo")
    st.text_area(
        "repo_path",
        value=str(repo),
        height=88,
        disabled=True,
        label_visibility="collapsed",
    )
    if st.button("Läs om filer från disk"):
        st.cache_data.clear()
        st.rerun()

st.title("Konfigurationsdashboard")
st.caption(
    "Välj vy i sidopanelen. Svenska tecken (åäö) sparas som UTF-8; JSON skrivs med ensure_ascii=False."
)

# -- Översikt -------------------------------------------------------------------

if page == "Översikt":
    with st.expander("Repo-roten: config · docs · config-dashboard · .cursor", expanded=False):
        for name, blurb in (domain_map.get("repoSiblings") or {}).items():
            st.markdown(f"**`{name}/`** — {blurb}")

    render_where_panel("Översikt", domain_map)

    overview_rows: list[dict[str, str]] = []
    pages_meta = domain_map.get("pages") or {}
    for nav in NAV_PAGES:
        if nav == "Översikt":
            continue
        m = pages_meta.get(nav) or {}
        cps = m.get("canonicalPaths") or []
        overview_rows.append(
            {
                "Vy": nav,
                "Primär källa": cps[0] if cps else "—",
                "Kort": (m.get("summary") or "")[:140],
            }
        )
    if overview_rows:
        st.subheader("Karta: vy → var du redigerar / läser")
        st.dataframe(overview_rows, width="stretch", hide_index=True)

    paths = {
        "codegen-static-prompt.json": config_dir / "codegen-static-prompt.json",
        "env-policy.json": config_dir / "env-policy.json",
        "shadcn-mirror-audit-policy.json": config_dir / "shadcn-mirror-audit-policy.json",
        "user_degraded_env.txt": config_dir / "user_degraded_env.txt",
        "ai_models/manifest.json": config_dir / "ai_models" / "manifest.json",
    }

    items = list(paths.items())
    cols = st.columns(len(items), gap="small")
    for col, (label, p) in zip(cols, items):
        with col:
            exists = p.is_file()
            short = label.replace(".json", "").replace(".txt", "")
            st.metric(short, "finns" if exists else "saknas")

    st.subheader("prompt-static (markdown-fragment)")
    ps = sorted((config_dir / "prompt-static").glob("*.md"))
    st.write(f"**{len(ps)}** `.md`-filer i `config/prompt-static/`")

    st.subheader("ai_models (dokument + manifest)")
    am = list((config_dir / "ai_models").glob("*.md")) + list(
        (config_dir / "ai_models").glob("*.txt")
    )
    st.write(f"**{len(am)}** dokument i `config/ai_models/`")

    # Snabb validering: codegen-fragment finns på disk
    try:
        cg = read_json(paths["codegen-static-prompt.json"])
        frags = cg.get("fragments") or []
        missing = [
            f for f in frags if not (config_dir / f).is_file()
        ]
        if missing:
            st.error(f"Saknade fragmentfiler ({len(missing)}): " + ", ".join(missing[:8]) + (" …" if len(missing) > 8 else ""))
        else:
            st.success("Alla `fragments` i codegen-static-prompt.json pekar på befintliga filer.")
    except Exception as e:
        st.warning(f"Kunde inte validera codegen JSON: {e}")


# -- Codegen static -------------------------------------------------------------

elif page == "Codegen static":
    st.header("codegen-static-prompt.json")
    render_where_panel("Codegen static", domain_map)
    path = config_dir / "codegen-static-prompt.json"
    data = read_json(path)

    sep = st.text_input("fragmentSeparator", value=data.get("fragmentSeparator", "\n\n"))
    notes = data.get("editorNotes")
    if isinstance(notes, dict):
        with st.expander("editorNotes (read-only i UI — redigera i JSON om du vill)"):
            st.json(notes)

    frags = list(data.get("fragments") or [])
    st.subheader("Fragment (ordning = concat-ordning)")
    rows = [{"ordning": i + 1, "sökväg": f} for i, f in enumerate(frags)]
    edited = st.data_editor(
        rows,
        num_rows="dynamic",
        column_config={
            "ordning": st.column_config.NumberColumn("Ordning", min_value=1, step=1),
            "sökväg": st.column_config.TextColumn("Sökväg (relativt config/)", width="large"),
        },
        hide_index=True,
        width="stretch",
        key="codegen_frag_editor",
    )

    if st.button("Spara codegen-static-prompt.json", type="primary"):
        # Sortera på ordning, ta bort tomma rader
        cleaned: list[dict[str, Any]] = []
        for r in edited:
            if not isinstance(r, dict):
                continue
            pth = (r.get("sökväg") or "").strip()
            if not pth:
                continue
            ordning = r.get("ordning")
            try:
                o = int(ordning)
            except (TypeError, ValueError):
                o = 10**6
            cleaned.append({"_o": o, "sökväg": pth})
        cleaned.sort(key=lambda x: x["_o"])
        new_frags = [x["sökväg"] for x in cleaned]
        out = {**data, "fragmentSeparator": sep, "fragments": new_frags}
        write_json(path, out)
        st.success("Sparat.")
        st.rerun()

    st.caption("Tips: nya rader läggs till i tabellen; tom `sökväg` ignoreras vid spar.")


# -- prompt-static --------------------------------------------------------------

elif page == "prompt-static":
    st.header("config/prompt-static")
    render_where_panel("prompt-static", domain_map)
    ps_dir = config_dir / "prompt-static"
    files = sorted(ps_dir.glob("*.md"))
    labels = [f.name for f in files]
    if not labels:
        st.warning("Inga .md-filer hittades.")
    else:
        choice = st.selectbox("Välj fil", labels, index=0)
        fp = ps_dir / choice
        content = read_text(fp)
        new_content = st.text_area(
            f"Innehåll — {choice}",
            value=content,
            height=520,
            key=f"ps_{choice}",
        )
        b1, b2 = st.columns(2)
        with b1:
            if st.button("Spara prompt-static-fil", type="primary"):
                write_text(fp, new_content)
                st.success("Sparat (UTF-8).")
        with b2:
            st.caption(f"Full sökväg: `{fp}`")


# -- ai_models ------------------------------------------------------------------

elif page == "ai_models":
    st.header("config/ai_models")
    render_where_panel("ai_models", domain_map)
    man_path = config_dir / "ai_models" / "manifest.json"
    models_part = st.radio(
        "Del",
        ["manifest.json", "Markdown / .txt", "Överblick"],
        horizontal=True,
        key="ai_models_part",
    )

    if models_part == "manifest.json":
        raw = read_text(man_path)
        edited = st.text_area("manifest.json", value=raw, height=480, key="manifest_edit")
        if st.button("Spara manifest.json", type="primary"):
            try:
                parsed = json.loads(edited)
                write_json(man_path, parsed)
                st.success("Sparat (validerad JSON).")
                st.rerun()
            except json.JSONDecodeError as e:
                st.error(f"Ogiltig JSON: {e}")

    elif models_part == "Markdown / .txt":
        am_dir = config_dir / "ai_models"
        docs = sorted(am_dir.glob("*.md")) + sorted(am_dir.glob("*.txt"))
        names = [d.name for d in docs]
        pick = st.selectbox("Dokument", names, index=0) if names else None
        if pick:
            dp = am_dir / pick
            body = read_text(dp)
            body_e = st.text_area(pick, value=body, height=460, key=f"am_doc_{pick}")
            if st.button("Spara ai_models-dokument"):
                write_text(dp, body_e)
                st.success("Sparat.")

    else:
        try:
            m = read_json(man_path)
            st.write("**Titel:**", m.get("title", "—"))
            st.write("**Beskrivning:**", m.get("description", "—"))
            gip = m.get("generatedSiteIntegrationPlaceholders")
            if gip:
                st.info(
                    f"`generatedSiteIntegrationPlaceholders`: {gip} — se placeholders-filen som manifestet pekar på."
                )
        except Exception as e:
            st.error(str(e))


# -- env-policy -----------------------------------------------------------------

elif page == "env-policy":
    st.header("env-policy.json")
    render_where_panel("env-policy", domain_map)
    ep = config_dir / "env-policy.json"
    env_data = read_json(ep)

    k_empty = len(env_data.get("knownEmptyOk") or [])
    k_rt = len(env_data.get("runtimeOnlyKeys") or [])
    k_extra = len(env_data.get("extraKnownKeys") or [])
    rules = env_data.get("rules") or []
    st.metric("Regler (rules)", len(rules))
    c1, c2, c3 = st.columns(3)
    c1.metric("knownEmptyOk", k_empty)
    c2.metric("runtimeOnlyKeys", k_rt)
    c3.metric("extraKnownKeys", k_extra)

    q = st.text_input("Sök regel (nyckel eller anteckning)", "")
    if q.strip():
        ql = q.strip().lower()
        filtered = [
            r
            for r in rules
            if ql in (r.get("key") or "").lower()
            or ql in (r.get("notes") or "").lower()
            or ql in (r.get("classification") or "").lower()
        ]
        st.write(f"**{len(filtered)}** träffar")
        st.dataframe(filtered, width="stretch", height=320)
    else:
        st.dataframe(rules[:80], width="stretch", height=280)
        if len(rules) > 80:
            st.caption(f"Visar första 80 av {len(rules)} regler — använd sök för att filtrera.")

    with st.expander("Redigera hela JSON (avancerat)"):
        raw_e = st.text_area("env-policy.json", value=json.dumps(env_data, indent=2, ensure_ascii=False), height=400)
        if st.button("Spara env-policy.json"):
            try:
                parsed = json.loads(raw_e)
                write_json(ep, parsed)
                st.success("Sparat.")
                st.rerun()
            except json.JSONDecodeError as e:
                st.error(f"Ogiltig JSON: {e}")


# -- shadcn ---------------------------------------------------------------------

elif page == "shadcn-audit":
    st.header("shadcn-mirror-audit-policy.json")
    render_where_panel("shadcn-audit", domain_map)
    sp = config_dir / "shadcn-mirror-audit-policy.json"
    sh = read_json(sp)
    st.json(sh)
    raw_s = st.text_area(
        "Redigera JSON",
        value=json.dumps(sh, indent=2, ensure_ascii=False),
        height=360,
    )
    if st.button("Spara shadcn-policy"):
        try:
            parsed = json.loads(raw_s)
            write_json(sp, parsed)
            st.success("Sparat.")
            st.rerun()
        except json.JSONDecodeError as e:
            st.error(f"Ogiltig JSON: {e}")


# -- user degraded --------------------------------------------------------------

elif page == "user_degraded_env":
    st.header("user_degraded_env.txt")
    render_where_panel("user_degraded_env", domain_map)
    up = config_dir / "user_degraded_env.txt"
    txt = read_text(up)
    new_txt = st.text_area("Policy / kommentarer (UTF-8)", value=txt, height=520)
    if st.button("Spara user_degraded_env.txt", type="primary"):
        write_text(up, new_txt)
        st.success("Sparat.")


# -- Cursor-agenter (terminologi, separat från config/) -------------------------

elif page == "Cursor-agenter":
    st.header("Cursor-agenter — terminologi")
    st.markdown(
        "Här redigerar du **samma filer** som Cursor använder som ordlista och kontext för agenter "
        "(`terminology.mdc` som projektregel, `repository-and-platform.md` för mappar/repo-översikt). "
        "Spara skriver direkt till disk (UTF-8)."
    )
    render_where_panel("Cursor-agenter", domain_map)

    labels = [pair[1] for pair in CURSOR_AGENT_DOCUMENTS]
    picked = st.radio("Välj dokument", labels, horizontal=True, key="cursor_agent_doc")
    label_to_rel = {lab: r for r, lab in CURSOR_AGENT_DOCUMENTS}
    rel = label_to_rel[picked]
    cursor_fp = repo / rel
    _key_safe = rel.replace("/", "_").replace("\\", "_")

    st.caption(f"Aktuell fil: `{rel}`")

    if rel.endswith(".mdc"):
        st.warning(
            "Behåll YAML-blocket överst (`---` … `description` / `alwaysApply`) "
            "så att Cursor fortfarande tolkar filen som projektregel."
        )

    if not cursor_fp.is_file():
        st.error(f"Filen finns inte: `{cursor_fp}`")
    else:
        body = read_text(cursor_fp)
        edited = st.text_area(
            "Innehåll (samma fil som Cursor/agenter använder)",
            value=body,
            height=620,
            key=f"cursor_body_{_key_safe}",
        )
        if st.button("Spara till fil", type="primary"):
            write_text(cursor_fp, edited)
            st.success(f"Sparat: `{rel}` — nya chattar laddar uppdaterad text.")
            st.rerun()
