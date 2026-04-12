# -*- coding: utf-8 -*-
"""
Sajtmaskin Backoffice — scaffold & pipeline management dashboard (Streamlit).

Run from repo root:
  pip install -r requirements.backoffice.txt
  python sajtmaskin_backoffice.py
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (OSError, ValueError):
        pass
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

REPO_ROOT = Path(__file__).resolve().parent


def _running_under_streamlit() -> bool:
    try:
        from streamlit.runtime.scriptrunner_utils.script_run_context import get_script_run_ctx
        return get_script_run_ctx() is not None
    except Exception:
        return False


if not _running_under_streamlit():
    _app = Path(__file__).resolve()
    raise SystemExit(subprocess.call(
        [sys.executable, "-m", "streamlit", "run", str(_app), *sys.argv[1:]],
    ))

import streamlit as st
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCAFFOLDS_DIR = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds"
RESEARCH_JSON = SCAFFOLDS_DIR / "scaffold-research.generated.json"
EMBEDDINGS_JSON = SCAFFOLDS_DIR / "scaffold-embeddings.json"
CATALOG_JSON = REPO_ROOT / "data" / "external-template-pipeline" / "reference-library" / "catalog.json"
TEMPLATE_LIB_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
EVAL_LATEST = REPO_ROOT / "data" / "scaffold-eval" / "reports" / "scaffold-selection-latest.json"
SCHEMA_MD = REPO_ROOT / "struktur_scarf" / "schema.md"
SCAFFOLD_CLI = REPO_ROOT / "scripts" / "scaffolds" / "scaffold_cli.py"

NAV_PAGES = (
    "Scaffolds",
    "Research & Dossiers",
    "Pipeline",
    "Eval",
    "Mental modell",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_json(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def parse_manifest_ts(manifest_path: Path) -> dict[str, Any] | None:
    """Extract key metadata from a scaffold manifest.ts by regex."""
    if not manifest_path.exists():
        return None
    text = manifest_path.read_text(encoding="utf-8")
    result: dict[str, Any] = {"_path": str(manifest_path)}

    m = re.search(r'id:\s*"([^"]+)"', text)
    if m:
        result["id"] = m.group(1)

    m = re.search(r'label:\s*"([^"]+)"', text)
    if m:
        result["label"] = m.group(1)

    m = re.search(r'description:\s*\n?\s*"([^"]*(?:\\.[^"]*)*)"', text)
    if not m:
        m = re.search(r'description:\s*"([^"]*)"', text)
    if m:
        result["description"] = m.group(1)[:120]

    intents = re.findall(r'"(website|app|template)"', text.split("allowedBuildIntents")[1] if "allowedBuildIntents" in text else "")
    if intents:
        result["allowedBuildIntents"] = intents

    tags = re.findall(r'"([^"]+)"', text.split("tags:")[1].split("],")[0]) if "tags:" in text else []
    result["tags"] = tags[:10]

    hints = text.count("promptHints")
    result["has_promptHints"] = hints > 0

    checklist = text.count("qualityChecklist")
    result["has_qualityChecklist"] = checklist > 0

    research = "research:" in text
    result["has_research"] = research

    file_count = text.count('path: "')
    result["file_count"] = file_count

    for key in ("siteKind", "complexity", "structureProfile", "contentProfile"):
        m = re.search(rf'{key}:\s*"([^"]+)"', text)
        if m:
            result[key] = m.group(1)

    if "features:" in text:
        feat_block = text.split("features:")[1].split("],")[0]
        result["features"] = re.findall(r'"([^"]+)"', feat_block)

    return result


def get_all_manifests() -> list[dict[str, Any]]:
    manifests = []
    for d in sorted(SCAFFOLDS_DIR.iterdir()):
        mf = d / "manifest.ts"
        if mf.exists():
            parsed = parse_manifest_ts(mf)
            if parsed:
                manifests.append(parsed)
    return manifests


def run_scaffold_cli(cmd: str, extra_args: list[str] | None = None) -> str:
    args = [sys.executable, str(SCAFFOLD_CLI), cmd]
    if extra_args:
        args.extend(extra_args)
    try:
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=300, cwd=str(REPO_ROOT),
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        return result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return "Timeout after 300s"
    except Exception as e:
        return f"Error: {e}"


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

st.set_page_config(page_title="Sajtmaskin Backoffice", page_icon="⚙", layout="wide")
st.title("Sajtmaskin Backoffice")

page = st.sidebar.radio("Navigation", NAV_PAGES)


# ===== PAGE: Scaffolds =====
if page == "Scaffolds":
    st.header("Runtime Scaffolds")

    manifests = get_all_manifests()

    research_data = read_json(RESEARCH_JSON)
    has_embeddings = EMBEDDINGS_JSON.exists()

    col1, col2, col3 = st.columns(3)
    col1.metric("Scaffolds", len(manifests))
    col2.metric("Research JSON", "finns" if research_data else "saknas")
    col3.metric("Embeddings JSON", "finns" if has_embeddings else "saknas")

    rows = []
    for m in manifests:
        sid = m.get("id", "?")
        rows.append({
            "id": sid,
            "label": m.get("label", ""),
            "siteKind": m.get("siteKind", ""),
            "complexity": m.get("complexity", ""),
            "structureProfile": m.get("structureProfile", ""),
            "contentProfile": m.get("contentProfile", ""),
            "features": ", ".join(m.get("features", [])),
            "intents": ", ".join(m.get("allowedBuildIntents", [])),
            "files": m.get("file_count", 0),
            "tags": len(m.get("tags", [])),
            "hints": m.get("has_promptHints", False),
            "checklist": m.get("has_qualityChecklist", False),
            "research": m.get("has_research", False),
        })

    df = pd.DataFrame(rows)
    st.dataframe(df, width="stretch", hide_index=True)

    st.subheader("Scaffold-detaljer")
    selected_id = st.selectbox("Välj scaffold", [m.get("id", "") for m in manifests])
    if selected_id:
        sel_manifest = next((m for m in manifests if m.get("id") == selected_id), None)

        if sel_manifest:
            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("**Manifest-metadata**")
                st.json({
                    "id": sel_manifest.get("id"),
                    "label": sel_manifest.get("label"),
                    "description": sel_manifest.get("description", ""),
                    "allowedBuildIntents": sel_manifest.get("allowedBuildIntents", []),
                    "tags": sel_manifest.get("tags", []),
                    "file_count": sel_manifest.get("file_count", 0),
                })
            with col_b:
                st.markdown("**Traits**")
                st.json({k: sel_manifest.get(k) for k in ("siteKind", "complexity", "structureProfile", "contentProfile", "features") if sel_manifest.get(k)})

            if research_data and isinstance(research_data, dict):
                scaffolds_research = research_data.get("scaffolds", {})
                if selected_id in scaffolds_research:
                    st.markdown("**Research overrides**")
                    st.json(scaffolds_research[selected_id])

        manifest_path = SCAFFOLDS_DIR / selected_id / "manifest.ts"
        if manifest_path.exists():
            with st.expander("Rå manifest.ts (read-only)"):
                st.code(manifest_path.read_text(encoding="utf-8")[:8000], language="typescript")


# ===== PAGE: Research & Dossiers =====
elif page == "Research & Dossiers":
    st.header("Research & Dossiers")

    catalog = read_json(CATALOG_JSON)
    template_lib = read_json(TEMPLATE_LIB_JSON)

    col1, col2 = st.columns(2)

    if catalog and isinstance(catalog, dict):
        entries = catalog.get("entries", [])
        col1.metric("Catalog entries", len(entries))

        curated = [e for e in entries if e.get("verdict") == "valid"]
        st.subheader(f"Kuraterade templates ({len(curated)})")

        cat_rows = []
        for e in curated[:100]:
            cat_rows.append({
                "title": e.get("title", ""),
                "category": e.get("categorySlug", ""),
                "score": e.get("qualityScore", 0),
                "scaffoldIds": ", ".join(e.get("recommendedScaffoldIds", [])),
                "verdict": e.get("verdict", ""),
            })
        if cat_rows:
            st.dataframe(pd.DataFrame(cat_rows), width="stretch", hide_index=True)
    else:
        col1.metric("Catalog", "saknas")
        st.info("catalog.json hittades inte. Kör pipeline: `npm run template-library:build`")

    if template_lib and isinstance(template_lib, dict):
        tl_entries = template_lib.get("entries", [])
        col2.metric("Template-library entries", len(tl_entries))
    else:
        col2.metric("Template-library", "saknas")

    research_data = read_json(RESEARCH_JSON)
    if research_data and isinstance(research_data, dict):
        scaffolds_research = research_data.get("scaffolds", {})
        st.subheader(f"Scaffold research overrides ({len(scaffolds_research)} scaffolds)")
        for sid, data in sorted(scaffolds_research.items()):
            with st.expander(sid):
                st.json(data)
    else:
        st.info("scaffold-research.generated.json saknas. Kör `npm run template-library:build`.")


# ===== PAGE: Pipeline =====
elif page == "Pipeline":
    st.header("Scaffold & Template Pipeline")

    st.markdown("""
Kör pipeline-steg via scaffold_cli.py. Varje knapp delegerar till samma kommandon som `npm run scaffolds:*`.
    """)

    status_col, action_col = st.columns([2, 1])

    with status_col:
        st.subheader("Status")
        if st.button("Hämta status", key="pipeline_status"):
            with st.spinner("Kör scaffold_cli.py status..."):
                output = run_scaffold_cli("status", ["--json"])
            try:
                status_data = json.loads(output)
                st.json(status_data)
            except (json.JSONDecodeError, ValueError):
                st.code(output)

    with action_col:
        st.subheader("Kör steg")

        steps = [
            ("import", "Import scrape → raw discovery"),
            ("hydrate", "Hydrate repo-cache"),
            ("build", "Build template-library + research"),
            ("embeddings", "Generate scaffold embeddings"),
            ("eval", "Kör scaffold selection eval"),
            ("verify", "Verifiera artefakter + manifests"),
        ]

        for cmd, label in steps:
            if st.button(label, key=f"pipeline_{cmd}"):
                with st.spinner(f"Kör {cmd}..."):
                    extra = ["--include-template-library"] if cmd == "embeddings" else []
                    output = run_scaffold_cli(cmd, extra if extra else None)
                st.code(output[-3000:] if len(output) > 3000 else output)

        st.divider()
        if st.button("Kör ALLT (import → verify)", key="pipeline_all", type="primary"):
            with st.spinner("Kör full pipeline... (kan ta flera minuter)"):
                output = run_scaffold_cli("all", ["--include-template-library"])
            st.code(output[-5000:] if len(output) > 5000 else output)

    st.subheader("Artifact-status (snabbvy)")
    artifacts = {
        "scaffold-research.generated.json": RESEARCH_JSON.exists(),
        "scaffold-embeddings.json": EMBEDDINGS_JSON.exists(),
        "template-library.generated.json": TEMPLATE_LIB_JSON.exists() if TEMPLATE_LIB_JSON else False,
        "catalog.json": CATALOG_JSON.exists(),
    }
    for name, exists in artifacts.items():
        icon = "✅" if exists else "❌"
        st.text(f"  {icon}  {name}")


# ===== PAGE: Eval =====
elif page == "Eval":
    st.header("Scaffold Selection Eval")

    eval_data = read_json(EVAL_LATEST)

    if eval_data and isinstance(eval_data, dict):
        results = eval_data.get("results", [])
        summary = eval_data.get("summary", {})

        col1, col2, col3 = st.columns(3)
        col1.metric("Total cases", summary.get("totalCases", len(results)))
        col2.metric("Correct", summary.get("correct", "?"))
        col3.metric("Accuracy", f"{summary.get('accuracy', 0):.0%}" if isinstance(summary.get("accuracy"), (int, float)) else "?")

        if results:
            eval_rows = []
            for r in results:
                eval_rows.append({
                    "prompt": r.get("prompt", "")[:80],
                    "expected": r.get("expected", ""),
                    "actual": r.get("actual", ""),
                    "correct": r.get("correct", False),
                    "method": r.get("method", ""),
                    "confidence": r.get("confidence", ""),
                })
            st.dataframe(pd.DataFrame(eval_rows), width="stretch", hide_index=True)

        per_scaffold = summary.get("perScaffold", {})
        if per_scaffold:
            st.subheader("Per scaffold")
            ps_rows = []
            for sid, data in sorted(per_scaffold.items()):
                ps_rows.append({
                    "scaffold": sid,
                    "total": data.get("total", 0),
                    "correct": data.get("correct", 0),
                    "accuracy": f"{data.get('accuracy', 0):.0%}" if isinstance(data.get("accuracy"), (int, float)) else "?",
                })
            st.dataframe(pd.DataFrame(ps_rows), width="stretch", hide_index=True)
    else:
        st.info("Ingen eval-rapport hittades. Kör `npm run scaffolds:eval` eller tryck nedan.")

    if st.button("Kör ny eval", key="run_eval"):
        with st.spinner("Kör scaffold selection eval..."):
            output = run_scaffold_cli("eval")
        st.code(output[-3000:] if len(output) > 3000 else output)
        st.rerun()


# ===== PAGE: Mental modell =====
elif page == "Mental modell":
    st.header("Mental modell — schema.md")

    if SCHEMA_MD.exists():
        content = SCHEMA_MD.read_text(encoding="utf-8")
        st.markdown(content)
    else:
        st.warning(f"Filen {SCHEMA_MD} hittades inte.")

    st.divider()
    st.subheader("Snabbfakta")
    manifests = get_all_manifests()

    st.markdown(f"- **Antal scaffolds:** {len(manifests)}")
    st.markdown(f"- **Scaffold-IDs:** {', '.join(m.get('id', '?') for m in manifests)}")

    site_kinds = set(m.get("siteKind", "?") for m in manifests if m.get("siteKind"))
    st.markdown(f"- **Site kinds:** {', '.join(sorted(site_kinds))}")

    complexities = set(m.get("complexity", "?") for m in manifests if m.get("complexity"))
    st.markdown(f"- **Complexities:** {', '.join(sorted(complexities))}")
