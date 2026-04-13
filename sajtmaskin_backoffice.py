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
DASHBOARD_DIR = REPO_ROOT / "config" / "dashboard"
if str(DASHBOARD_DIR) not in sys.path:
    sys.path.insert(0, str(DASHBOARD_DIR))


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
from shared_overhead import (
    AVAILABLE_PHASE_MODELS,
    BUILD_PROFILE_ORDER,
    PHASE_LABELS,
    PHASE_ORDER,
    REASONING_EFFORT_OPTIONS,
    build_profile_defaults,
    human_model_label,
    load_fault_fix_csv,
    phase_model_display_label,
    phase_routing_defaults,
    phase_thinking_defaults,
    phase_token_budget_entry,
    read_autofix_runtime_config,
    read_json,
    write_phase_thinking,
    write_json,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCAFFOLDS_DIR = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds"
RESEARCH_JSON = SCAFFOLDS_DIR / "scaffold-research.generated.json"
EMBEDDINGS_JSON = SCAFFOLDS_DIR / "scaffold-embeddings.json"
CATALOG_JSON = REPO_ROOT / "data" / "external-template-pipeline" / "reference-library" / "catalog.json"
TEMPLATE_LIB_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
EVAL_LATEST = REPO_ROOT / "data" / "scaffold-eval" / "reports" / "scaffold-selection-latest.json"
SCHEMA_MD = REPO_ROOT / "docs" / "architecture" / "scaffold-schema.md"
SCAFFOLD_CLI = REPO_ROOT / "scripts" / "scaffolds" / "scaffold_cli.py"
ENV_LOCAL = REPO_ROOT / ".env.local"
MANAGE_ENV_SCRIPT = REPO_ROOT / "scripts" / "env" / "manage_env.py"
MANIFEST_JSON = REPO_ROOT / "config" / "ai_models" / "manifest.json"
ERROR_LOG_CSV = REPO_ROOT / "logs" / "llm-segmentts-and-index" / "error-log.csv"
AUTOFIX_HOOK_TS = REPO_ROOT / "src" / "lib" / "hooks" / "chat" / "useAutoFix.ts"

ORCH_TS_SOURCES = {
    "ScaffoldId / ScaffoldMode": SCAFFOLDS_DIR / "types.ts",
    "BuildIntent / BuildMethod": REPO_ROOT / "src" / "lib" / "builder" / "build-intent.ts",
    "PromptType / PromptStrategy": REPO_ROOT / "src" / "lib" / "builder" / "promptOrchestration.ts",
    "SerializeMode": SCAFFOLDS_DIR / "serialize.ts",
    "BuildSpec policies": REPO_ROOT / "src" / "lib" / "gen" / "build-spec.ts",
}

NAV_PAGES = (
    "Scaffolds",
    "Research & Dossiers",
    "Pipeline",
    "Eval",
    "Orchestration Map",
    "Autofix & Kvalitet",
    "Mental modell",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_manage_env_helpers():
    """Import parse_env_file / set_in_env_file from scripts/env/manage_env.py."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("manage_env", str(MANAGE_ENV_SCRIPT))
    if spec is None or spec.loader is None:
        return None, None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception:
        return None, None
    return getattr(mod, "parse_env_file", None), getattr(mod, "set_in_env_file", None)


_parse_env_file, _set_in_env_file = _load_manage_env_helpers()


def read_env_flag(key: str) -> bool:
    """Read a boolean flag from .env.local (true/1 = on)."""
    if _parse_env_file is None:
        return False
    env_data = _parse_env_file(ENV_LOCAL)
    val = env_data.get(key, "").strip().lower()
    return val in ("true", "1")


def write_env_flag(key: str, enabled: bool) -> bool:
    """Write a boolean flag to .env.local. Returns True on success."""
    if _set_in_env_file is None:
        return False
    try:
        _set_in_env_file(ENV_LOCAL, key, "true" if enabled else "false")
        return True
    except Exception:
        return False


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

    intents_block = ""
    if "allowedBuildIntents" in text:
        m_intents = re.search(r'allowedBuildIntents:\s*\[(.*?)\]', text, re.DOTALL)
        if m_intents:
            intents_block = m_intents.group(1)
    intents = re.findall(r'"(website|app|template)"', intents_block)
    if intents:
        result["allowedBuildIntents"] = intents

    tags_block = ""
    if "tags:" in text:
        m_tags = re.search(r'tags:\s*\[(.*?)\]', text, re.DOTALL)
        if m_tags:
            tags_block = m_tags.group(1)
    tags = re.findall(r'"([^"]+)"', tags_block)
    result["tags"] = tags[:10]

    hints = text.count("promptHints")
    result["has_promptHints"] = hints > 0

    checklist = text.count("qualityChecklist")
    result["has_qualityChecklist"] = checklist > 0

    research = "research:" in text
    result["has_research"] = research

    files_dir = manifest_path.parent / "files"
    file_count = sum(1 for _ in files_dir.rglob("*") if _.is_file()) if files_dir.is_dir() else 0
    result["file_count"] = file_count

    for key in ("siteKind", "complexity", "structureProfile", "contentProfile"):
        m = re.search(rf'{key}:\s*"([^"]+)"', text)
        if m:
            result[key] = m.group(1)

    if "features:" in text:
        m_feat = re.search(r'features:\s*\[(.*?)\]', text, re.DOTALL)
        if m_feat:
            result["features"] = re.findall(r'"([^"]+)"', m_feat.group(1))

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


def extract_ts_union_values(text: str, type_name: str) -> list[str] | None:
    """Extract string literal values from a TS union type like: type Foo = "a" | "b" | "c";"""
    pattern = rf'(?:export\s+)?type\s+{re.escape(type_name)}\s*=\s*([\s\S]*?);'
    m = re.search(pattern, text)
    if not m:
        return None
    return re.findall(r'"([^"]+)"', m.group(1))


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

            st.divider()
            st.subheader("Redigera scaffold-metadata")

            manifest_text = manifest_path.read_text(encoding="utf-8")

            def _parse_ts_string_array(text: str, field: str) -> list[str]:
                pattern = rf'{field}:\s*\[(.*?)\]'
                m = re.search(pattern, text, re.DOTALL)
                if not m:
                    return []
                return re.findall(r'"([^"]*)"', m.group(1))

            def _escape_ts_string(s: str) -> str:
                return s.replace("\\", "\\\\").replace('"', '\\"')

            def _write_ts_string_array(text: str, field: str, values: list[str]) -> str:
                items = ", ".join(f'"{_escape_ts_string(v)}"' for v in values)
                pattern = rf'({field}:\s*)\[.*?\]'
                return re.sub(pattern, rf'\g<1>[{items}]', text, count=1, flags=re.DOTALL)

            def _parse_ts_multiline_string_array(text: str, field: str) -> list[str]:
                pattern = rf'{field}:\s*\[(.*?)\]'
                m = re.search(pattern, text, re.DOTALL)
                if not m:
                    return []
                return re.findall(r'"([^"]*(?:\\.[^"]*)*)"', m.group(1))

            def _write_ts_multiline_string_array(text: str, field: str, values: list[str]) -> str:
                if not values:
                    pattern = rf'({field}:\s*)\[.*?\]'
                    return re.sub(pattern, rf'\g<1>[]', text, count=1, flags=re.DOTALL)
                items = "\n".join(f'    "{_escape_ts_string(v)}",' for v in values)
                pattern = rf'({field}:\s*)\[.*?\]'
                return re.sub(pattern, rf'\g<1>[\n{items}\n  ]', text, count=1, flags=re.DOTALL)

            current_tags = _parse_ts_string_array(manifest_text, "tags")
            current_intents = _parse_ts_string_array(manifest_text, "allowedBuildIntents")
            current_hints = _parse_ts_multiline_string_array(manifest_text, "promptHints")
            current_checklist = _parse_ts_multiline_string_array(manifest_text, "qualityChecklist")

            edit_col1, edit_col2 = st.columns(2)
            with edit_col1:
                new_tags_str = st.text_area(
                    "Tags (en per rad)",
                    value="\n".join(current_tags),
                    height=150,
                    key=f"tags_{selected_id}",
                )
                all_intents = ["website", "app", "template"]
                new_intents = st.multiselect(
                    "Allowed Build Intents",
                    options=all_intents,
                    default=[i for i in current_intents if i in all_intents],
                    key=f"intents_{selected_id}",
                )

            with edit_col2:
                new_hints_str = st.text_area(
                    "Prompt Hints (en per rad)",
                    value="\n".join(current_hints),
                    height=150,
                    key=f"hints_{selected_id}",
                )
                new_checklist_str = st.text_area(
                    "Quality Checklist (en per rad)",
                    value="\n".join(current_checklist),
                    height=150,
                    key=f"checklist_{selected_id}",
                )

            if st.button("Spara ändringar", key=f"save_{selected_id}", type="primary"):
                new_tags = [t.strip() for t in new_tags_str.strip().splitlines() if t.strip()]
                new_hints = [h.strip() for h in new_hints_str.strip().splitlines() if h.strip()]
                new_checklist = [c.strip() for c in new_checklist_str.strip().splitlines() if c.strip()]

                updated = manifest_text
                updated = _write_ts_string_array(updated, "tags", new_tags)
                updated = _write_ts_string_array(updated, "allowedBuildIntents", new_intents)
                updated = _write_ts_multiline_string_array(updated, "promptHints", new_hints)
                updated = _write_ts_multiline_string_array(updated, "qualityChecklist", new_checklist)

                if updated != manifest_text:
                    manifest_path.write_text(updated, encoding="utf-8")
                    st.success(f"Sparade ändringar till {manifest_path.name}")
                    st.rerun()
                else:
                    st.info("Inga ändringar att spara.")


# ===== PAGE: Research & Dossiers =====
elif page == "Research & Dossiers":
    st.header("Research & Dossiers")

    # ── Runtime Template Guidance toggle ─────────────────────────────────
    st.subheader("Runtime Template Guidance")
    _TG_KEY = "SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE"
    _tg_current = read_env_flag(_TG_KEY)
    _tg_new = st.toggle(
        "Aktivera scaffold-ankrad template guidance (init only)",
        value=_tg_current,
        key="tg_toggle",
        help=f"Styr env-flaggan `{_TG_KEY}` i `.env.local`. När på injiceras kompakt runtimeGuidance "
             "från scaffoldens referenceTemplates i första genereringen.",
    )
    if _tg_new != _tg_current:
        if write_env_flag(_TG_KEY, _tg_new):
            st.success(f"`{_TG_KEY}` satt till `{'true' if _tg_new else 'false'}` i `.env.local`.")
            st.caption("Dev-servern kan behöva startas om för att ändringen ska gälla i runtime.")
        else:
            st.error("Kunde inte skriva till `.env.local`. Kontrollera filrättigheter.")
    else:
        st.caption(f"Nuvarande: `{_TG_KEY}={'true' if _tg_current else 'false'}`")
    st.divider()

    # ── Deferred extra init routes toggle ────────────────────────────────
    st.subheader("Deferred Extra Init Routes")
    _DEFER_KEY = "SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT"
    _defer_current = read_env_flag(_DEFER_KEY)
    _defer_new = st.toggle(
        "Aktivera plan-many/build-one för init-generering",
        value=_defer_current,
        key="defer_extra_init_routes_toggle",
        help=(
            f"Styr env-flaggan `{_DEFER_KEY}` i `.env.local`. När på får init-genereringar "
            "planera flera routes men bara fullt realisera primärrouten direkt. Extrasidor "
            "blir då shell-sidor med tydlig 'Skapa sida'-yta."
        ),
    )
    if _defer_new != _defer_current:
        if write_env_flag(_DEFER_KEY, _defer_new):
            st.success(
                f"`{_DEFER_KEY}` satt till `{'true' if _defer_new else 'false'}` i `.env.local`."
            )
            st.caption("Dev-servern kan behöva startas om för att ändringen ska gälla i runtime.")
        else:
            st.error("Kunde inte skriva till `.env.local`. Kontrollera filrättigheter.")
    else:
        st.caption(f"Nuvarande: `{_DEFER_KEY}={'true' if _defer_current else 'false'}`")
    st.info(
        "Rekommenderad kombination: ha både runtime template guidance och deferred extra init routes på samtidigt. "
        "Då kan init ha en grand plan för flera routes, men lägga största delen av budgeten på primärrouten medan extrasidor blir shells. "
        "Shells bevaras automatiskt i follow-ups om inte användaren explicit ber om att bygga ut dem."
    )
    st.divider()

    # ── Domain rules (config/domain-rules.json) — editable ────────
    st.subheader("Domänregler (domain-inference)")
    domain_rules_path = REPO_ROOT / "config" / "domain-rules.json"
    domain_rules = read_json(domain_rules_path)
    if domain_rules and isinstance(domain_rules, list):
        st.caption(
            f"{len(domain_rules)} domäner. Runtime bygger regex från keywords_sv + keywords_en per domän. "
            "Ändra i tabellen och klicka Spara. Dev-server behöver startas om."
        )
        dr_rows = []
        for rule in domain_rules:
            dr_rows.append({
                "domain": rule.get("domain", ""),
                "briefHint": rule.get("briefHint", ""),
                "keywords_sv": ", ".join(rule.get("keywords_sv", [])),
                "keywords_en": ", ".join(rule.get("keywords_en", [])),
            })
        edited_domains = st.data_editor(dr_rows, use_container_width=True, num_rows="dynamic", key="domain_editor")
        if st.button("Spara domänregler", key="save_domain_rules"):
            out = []
            for row in edited_domains:
                out.append({
                    "domain": row.get("domain", "").strip(),
                    "briefHint": row.get("briefHint", "").strip(),
                    "keywords_sv": [k.strip() for k in row.get("keywords_sv", "").split(",") if k.strip()],
                    "keywords_en": [k.strip() for k in row.get("keywords_en", "").split(",") if k.strip()],
                })
            out = [r for r in out if r["domain"]]
            domain_rules_path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            st.success(f"Sparade {len(out)} domänregler till `config/domain-rules.json`.")
    else:
        st.warning("Kunde inte läsa `config/domain-rules.json`.")
    st.divider()

    # ── Prompt heuristic tokens (config/prompt-heuristic-tokens.json) — editable ──
    st.subheader("Prompt-heuristik tokenlistor")
    heuristic_path = REPO_ROOT / "config" / "prompt-heuristic-tokens.json"
    heuristic_data = read_json(heuristic_path)
    if heuristic_data and isinstance(heuristic_data, dict):
        st.caption(
            f"{len(heuristic_data)} kategorier. Styr vilka nyckelord som matchar i promptanalys. "
            "Ändra tokens och klicka Spara. Dev-server behöver startas om."
        )
        for cat_key, cat_val in heuristic_data.items():
            desc = cat_val.get("description", "")
            tokens = cat_val.get("tokens", [])
            with st.expander(f"**{cat_key}** ({len(tokens)} tokens) — {desc}"):
                new_tokens = st.text_area(
                    f"Tokens ({cat_key})",
                    value=", ".join(tokens),
                    key=f"heuristic_{cat_key}",
                    height=80,
                )
                if st.button(f"Spara {cat_key}", key=f"save_heuristic_{cat_key}"):
                    parsed = [t.strip() for t in new_tokens.split(",") if t.strip()]
                    heuristic_data[cat_key]["tokens"] = parsed
                    heuristic_path.write_text(json.dumps(heuristic_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                    st.success(f"Sparade {len(parsed)} tokens för `{cat_key}`.")
    else:
        st.warning("Kunde inte läsa `config/prompt-heuristic-tokens.json`.")
    st.divider()

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

        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Total cases", summary.get("total", len(results)))
        col2.metric("Keyword Top-1", f"{summary.get('keywordTop1Accuracy', 0):.1f}%" if isinstance(summary.get("keywordTop1Accuracy"), (int, float)) else "?")
        col3.metric("Semantic Top-1", f"{summary.get('semanticTop1Accuracy', 0):.1f}%" if isinstance(summary.get("semanticTop1Accuracy"), (int, float)) else "?")
        col4.metric("Semantic Top-3", f"{summary.get('semanticTop3Accuracy', 0):.1f}%" if isinstance(summary.get("semanticTop3Accuracy"), (int, float)) else "?")

        if results:
            eval_rows = []
            for r in results:
                eval_rows.append({
                    "id": r.get("id", ""),
                    "expected": r.get("expected", ""),
                    "keyword": r.get("keywordTop1", ""),
                    "semantic": r.get("semanticTop1", ""),
                    "kw_ok": r.get("keywordTop1Correct", False),
                    "sem_ok": r.get("semanticTop1Correct", False),
                    "method": r.get("semanticMethod", ""),
                    "confidence": r.get("semanticConfidence", ""),
                })
            st.dataframe(pd.DataFrame(eval_rows), width="stretch", hide_index=True)

    else:
        st.info("Ingen eval-rapport hittades. Kör `npm run scaffolds:eval` eller tryck nedan.")

    if st.button("Kör ny eval", key="run_eval"):
        with st.spinner("Kör scaffold selection eval..."):
            output = run_scaffold_cli("eval")
        st.code(output[-3000:] if len(output) > 3000 else output)
        st.rerun()


# ===== PAGE: Orchestration Map =====
elif page == "Orchestration Map":
    st.header("Orchestration Map")
    st.caption("Statisk referenskarta parsad direkt ur TS-koden. Visar vilka beslutspunkter systemet har och vilka v\u00e4rden som \u00e4r m\u00f6jliga.")

    type_defs: list[dict[str, Any]] = []

    def _load_union(file_key: str, type_name: str, description: str) -> None:
        path = ORCH_TS_SOURCES.get(file_key)
        if not path or not path.exists():
            type_defs.append({"type": type_name, "values": ["(fil saknas)"], "source": str(path or "?"), "description": description})
            return
        text = path.read_text(encoding="utf-8")
        vals = extract_ts_union_values(text, type_name)
        if vals:
            type_defs.append({"type": type_name, "values": vals, "source": path.name, "description": description})

    _load_union("BuildIntent / BuildMethod", "BuildIntent", "Vad ska byggas?")
    _load_union("BuildIntent / BuildMethod", "BuildMethod", "Hur kom requesten in?")
    _load_union("PromptType / PromptStrategy", "PromptType", "Klassificerad prompttyp")
    _load_union("PromptType / PromptStrategy", "PromptStrategy", "Prompt-budget/trunkerings-strategi")
    _load_union("ScaffoldId / ScaffoldMode", "ScaffoldId", "Vilken scaffold (10 st)")
    _load_union("ScaffoldId / ScaffoldMode", "ScaffoldMode", "Hur scaffolden v\u00e4ljs")
    _load_union("ScaffoldId / ScaffoldMode", "ScaffoldSiteKind", "Scaffold site-kategori")
    _load_union("ScaffoldId / ScaffoldMode", "ScaffoldComplexity", "Scaffold komplexitetsniv\u00e5")

    serialize_path = ORCH_TS_SOURCES.get("SerializeMode")
    if serialize_path and serialize_path.exists():
        ser_text = serialize_path.read_text(encoding="utf-8")
        ser_vals = extract_ts_union_values(ser_text, "ScaffoldSerializeMode")
        if ser_vals:
            type_defs.append({"type": "ScaffoldSerializeMode", "values": ser_vals, "source": serialize_path.name, "description": "Hur mycket scaffolden styr prompten"})

    build_spec_path = ORCH_TS_SOURCES.get("BuildSpec policies")
    if build_spec_path and build_spec_path.exists():
        bs_text = build_spec_path.read_text(encoding="utf-8")
        for bs_type, bs_desc in [
            ("BuildSpecContextPolicy", "Tokenbudget-niv\u00e5 f\u00f6r scaffold"),
            ("BuildSpecQualityTarget", "Kvalitetsm\u00e5l (standard/premium/release-candidate)"),
            ("BuildSpecPreviewPolicy", "Preview-policy: fidelity2 (typecheck) eller fidelity3 (build)"),
            ("BuildSpecVerificationPolicy", "Verifieringsniv\u00e5: fast / standard / strict"),
        ]:
            bs_vals = extract_ts_union_values(bs_text, bs_type)
            if bs_vals:
                type_defs.append({"type": bs_type, "values": bs_vals, "source": build_spec_path.name, "description": bs_desc})

    st.subheader("Beslutspunkter (fr\u00e5n TS-typer)")
    for td in type_defs:
        st.markdown(f"**{td['type']}** \u2014 {td['description']}")
        st.code("  |  ".join(td["values"]), language=None)
        st.caption(f"K\u00e4lla: {td['source']}")

    st.divider()
    st.subheader("Fl\u00f6de: Prompt \u2192 Genererad kod")
    st.markdown("""
```
ANVÄNDARENS PROMPT
  │
  ├─ 1. PromptOrchestration → PromptType + PromptStrategy
  │      (klassificerar, budgeterar, trimmar)
  │
  ├─ 2. Deep Brief (kanonisk för init)
  │      (strukturerat objekt: sidor, visuell riktning, SEO,
  │       mustHave, avoid, uiNotes — rå user-text som message)
  │      (formatPrompt() enbart fallback när brief saknas)
  │      (domän/site-type matchning från config/domain-rules.json)
  │
  ├─ 3. Scaffold-val → ScaffoldId
  │      ├─ ScaffoldMode: off / auto / manual
  │      ├─ Keyword + embedding-matchning
  │      └─ Merge-policy + safety guards
  │
  ├─ 3b. Intent-koersning (app-scaffold → buildIntent=app)
  │
  ├─ 4. Capability-inferens (auth, ecommerce, forms, 3D, motion...)
  │
  ├─ 5. Route Plan (brief > scaffold > prompt)
  │
  ├─ 6. Pre-generation Contracts (preview-first defaults)
  │
  ├─ 7. BuildSpec → ContextPolicy + QualityTarget + PreviewPolicy
  │
  ├─ 8. Dynamic Context (rollbaserade block, token-prunade):
  │      Project Context · Route Plan · Pages & Sections (vid sektionsdetalj)
  │      Style Direction · Visual Identity · Contracts · Toolkit
  │      Must Have / Avoid · UX & UI Notes
  │
  ├─ 9. LLM-generering → CodeFile[]
  │
  └─10. Post-generation:
        ├─ Mekanisk autofix → Syntax validate/fix → Finalize
        ├─ Readiness-bedömning (heuristisk)
        ├─ Tier-2 verify-lane (typecheck)
        │    ├─ Env-signal (saknade nycklar → UI-hint)
        │    ├─ Server repair (mekanisk → LLM)
        │    └─ Autofix fallback
        └─ Background server verify (typecheck + lint, asynkron)
```
""")

    st.divider()
    st.subheader("Scaffold \u2194 Vercel Use Case")
    manifests = get_all_manifests()
    vercel_map = {
        "landing-page": "Marketing Sites",
        "saas-landing": "SaaS",
        "portfolio": "Portfolio",
        "blog": "Blog",
        "ecommerce": "Ecommerce",
        "dashboard": "Admin Dashboard",
        "auth-pages": "Authentication",
        "app-shell": "SaaS / Multi-Tenant",
        "content-site": "Marketing Sites / CMS",
        "base-nextjs": "Starter",
    }
    map_rows = []
    for m in manifests:
        sid = m.get("id", "?")
        map_rows.append({
            "Scaffold": sid,
            "Vercel Use Case": vercel_map.get(sid, "?"),
            "siteKind": m.get("siteKind", ""),
            "complexity": m.get("complexity", ""),
            "intents": ", ".join(m.get("allowedBuildIntents", [])),
        })
    st.dataframe(pd.DataFrame(map_rows), width="stretch", hide_index=True)


# ===== PAGE: Autofix & Kvalitet =====
elif page == "Autofix & Kvalitet":
    st.header("Autofix & Kvalitet")
    st.caption(
        "Central överblick för mekaniska fixar, LLM-fixar och kvalitetspass. "
        "Den här sidan speglar samma `config/ai_models/manifest.json` som config-dashboarden använder."
    )

    manifest = read_json(MANIFEST_JSON) if MANIFEST_JSON.exists() else None
    runtime_cfg = read_autofix_runtime_config(AUTOFIX_HOOK_TS)

    st.subheader("Pipeline-översikt")
    st.markdown("""
```
LLM-generering
     |
[Mekanisk autofix]  ← repairPolicies.deterministicAutofixPasses
     |
[Syntax validate/fix]  ← repairPolicies.syntaxFixPasses
     |
[Bildmaterialisering]
     |
[Preflight]  ← server, före DB-sparning
     |
=== SPARAS I DATABAS ===
     |
[Post-checks]  ← klient, efter DB-sparning
     |                  (kan trigga LLM autofix)
[Quality gate] ← VM, npx tsc --noEmit
     |                  (kan trigga server repair → LLM autofix)
```
""")
    st.caption(
        "Preflight kan stoppa leverans före databasen. Post-checks och quality gate körs efter att versionen "
        "har sparats, men quality gate hoppas över om post-checks redan har köat autofix."
    )

    st.divider()
    st.subheader("Runtime-gränser för LLM-autofix")
    rc1, rc2 = st.columns(2)
    rc1.metric(
        "Max autofix per chatt",
        runtime_cfg.get("maxAutofixPerChat")
        if runtime_cfg.get("maxAutofixPerChat") is not None
        else "okänd",
    )
    rc2.metric(
        "Max försök per orsak",
        runtime_cfg.get("maxAttemptsPerReason")
        if runtime_cfg.get("maxAttemptsPerReason") is not None
        else "okänd",
    )
    soft_only = runtime_cfg.get("softOnlyReasons") or []
    if soft_only:
        st.caption("Soft-only-orsaker som aldrig triggar LLM-autofix av sig själva:")
        st.code(" | ".join(soft_only), language=None)

    st.divider()
    st.subheader("Fix-statistik från error-log.csv")
    if not ERROR_LOG_CSV.is_file():
        st.info(
            f"Filen `{ERROR_LOG_CSV.relative_to(REPO_ROOT).as_posix()}` saknas. "
            "Den skapas när generationloggning är aktiv och fixar/fel börjar loggas."
        )
    else:
        error_df, error_log_message = load_fault_fix_csv(ERROR_LOG_CSV)
        if error_log_message:
            st.error(error_log_message)

        if error_df.empty:
            st.info("CSV-filen finns men innehåller inga rader ännu.")
        else:
            created_by = (
                error_df["created_by"]
                if "created_by" in error_df.columns
                else pd.Series("", index=error_df.index)
            )
            fixed_by = (
                error_df["fixed_by"]
                if "fixed_by" in error_df.columns
                else pd.Series("", index=error_df.index)
            )
            scaffold_col = (
                error_df["scaffold_id"]
                if "scaffold_id" in error_df.columns
                else pd.Series("-", index=error_df.index)
            )

            autofix_mask = fixed_by.isin(["deterministic-autofix", "llm-fixer"]) | created_by.isin(
                ["deterministic-autofix", "syntax-validator"]
            )
            fix_df = error_df[autofix_mask].copy()
            fix_df["created_by"] = created_by[autofix_mask].values
            fix_df["fixed_by"] = fixed_by[autofix_mask].values
            if "scaffold_id" not in fix_df.columns:
                fix_df["scaffold_id"] = scaffold_col[autofix_mask].values

            if fix_df.empty:
                st.info("Inga autofix-/repair-rader hittades i CSV-loggen ännu.")
            else:
                fix_df["fix_kind"] = fix_df["fixed_by"].apply(
                    lambda value: "LLM" if str(value) == "llm-fixer" else "Mekanisk"
                )
                scaffold_opts = ["Alla"] + sorted(
                    str(value)
                    for value in scaffold_col.dropna().unique().tolist()
                    if str(value).strip() and str(value).strip() != "-"
                )
                selected_scaffold = st.selectbox(
                    "Filtrera på scaffold",
                    scaffold_opts,
                    key="autofix_stats_scaffold",
                )
                if selected_scaffold != "Alla" and "scaffold_id" in fix_df.columns:
                    fix_df = fix_df[fix_df["scaffold_id"] == selected_scaffold]

                fixer_series = (
                    fix_df["fixer"]
                    if "fixer" in fix_df.columns
                    else pd.Series("-", index=fix_df.index)
                )
                fixer_df = fix_df[fixer_series.fillna("-") != "-"].copy()

                s1, s2, s3, s4 = st.columns(4)
                s1.metric("Fix-rader", len(fix_df))
                s2.metric("Mekaniska", int((fix_df["fix_kind"] == "Mekanisk").sum()))
                s3.metric("LLM-fixar", int((fix_df["fix_kind"] == "LLM").sum()))
                s4.metric(
                    "Unika fixers",
                    int(fixer_df["fixer"].nunique()) if not fixer_df.empty else 0,
                )

                if not fixer_df.empty:
                    st.markdown("### Vanligaste fixers")
                    top_fixers = (
                        fixer_df.groupby(["fix_kind", "fixer"])
                        .size()
                        .reset_index(name="antal")
                        .sort_values(["antal", "fixer"], ascending=[False, True])
                    )
                    st.dataframe(top_fixers.head(25), width="stretch", hide_index=True)

                if "scaffold_id" in fix_df.columns:
                    scaffold_fix_df = fix_df[fix_df["scaffold_id"].fillna("-") != "-"].copy()
                    if not scaffold_fix_df.empty:
                        st.markdown("### Fixer per scaffold")
                        by_scaffold = (
                            scaffold_fix_df.groupby(["scaffold_id", "fix_kind"])
                            .size()
                            .unstack(fill_value=0)
                            .reset_index()
                            .sort_values("scaffold_id")
                        )
                        st.dataframe(by_scaffold, width="stretch", hide_index=True)

                st.markdown("### Senaste fixrader")
                recent_cols = [
                    col
                    for col in [
                        "time",
                        "scaffold_id",
                        "fix_kind",
                        "fixer",
                        "problem",
                        "chat_id",
                        "version_id",
                        "file",
                    ]
                    if col in fix_df.columns
                ]
                if recent_cols:
                    st.dataframe(
                        fix_df[recent_cols].tail(50).iloc[::-1],
                        width="stretch",
                        hide_index=True,
                    )
                    st.caption(
                        "CSV-loggen lagrar nu full ISO-tid i kolumnen `time`. Vyn visar senaste rader "
                        "och kan senare utökas med riktiga dag/vecka-trender."
                    )

    st.divider()
    st.subheader("Centrala styrningar (manifest.json)")
    if not isinstance(manifest, dict):
        st.error(
            f"Kunde inte läsa `{MANIFEST_JSON.relative_to(REPO_ROOT).as_posix()}`."
        )
    else:
        rp = manifest.setdefault("repairPolicies", {})
        tb = manifest.setdefault("tokenBudgets", {})
        pgp = manifest.setdefault("postGenerationPasses", {})
        routing = phase_routing_defaults(manifest)

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Mekaniska pass", int(rp.get("deterministicAutofixPasses", 2)))
        c2.metric("Syntax-pass", int(rp.get("syntaxFixPasses", 3)))
        c3.metric("Server repair-pass", int(rp.get("serverRepairPasses", 2)))
        c4.metric("Manual repair-pass", int(rp.get("manualRepairRouteLlmPasses", 2)))

        left, right = st.columns(2)

        with left:
            st.markdown("### Repair-pass")
            deterministic_passes = st.number_input(
                "Mekaniska fix-pass före LLM",
                value=int(rp.get("deterministicAutofixPasses", 2)),
                min_value=1,
                max_value=10,
                step=1,
                key="bo_repair_deterministic",
            )
            syntax_passes = st.number_input(
                "Syntax-fix-pass efter generering",
                value=int(rp.get("syntaxFixPasses", 3)),
                min_value=1,
                max_value=10,
                step=1,
                key="bo_repair_syntax",
            )
            manual_passes = st.number_input(
                "Manuell repair-route: max LLM-pass",
                value=int(rp.get("manualRepairRouteLlmPasses", 2)),
                min_value=1,
                max_value=10,
                step=1,
                key="bo_repair_manual",
            )
            server_passes = st.number_input(
                "Background server verify: max repair-pass",
                value=int(rp.get("serverRepairPasses", 2)),
                min_value=1,
                max_value=10,
                step=1,
                key="bo_repair_server",
            )

        with right:
            st.markdown("### Tokenbudgetar")
            engine_tokens = st.number_input(
                "Build/generator max output tokens",
                value=int((tb.get("engineMaxOutputTokens") or {}).get("default", 82768)),
                step=1024,
                key="bo_tb_engine",
            )
            autofix_tokens = st.number_input(
                "Autofix / fixer max output tokens",
                value=int((tb.get("autofixMaxOutputTokens") or {}).get("default", 12288)),
                step=512,
                key="bo_tb_autofix",
            )
            verifier_tokens = st.number_input(
                "Verifier max output tokens",
                value=int((pgp.get("verifierMaxOutputTokens") or {}).get("default", 8192)),
                step=256,
                key="bo_pgp_verifier_tokens",
            )
            verifier_snippet = st.number_input(
                "Verifier: snippet-tecken per fil",
                value=int((pgp.get("verifierSnippetCharsPerFile") or {}).get("default", 14000)),
                step=500,
                key="bo_pgp_verifier_snippet",
            )

        st.markdown("### Phase routing")
        st.caption(
            "Choose a model per phase. `selected_build_model` is shown as `Tier model (...)`, "
            "and planner/generator still require the existing builder thinking toggle to be on."
        )
        build_defaults = build_profile_defaults(manifest)
        thinking_defaults = phase_thinking_defaults(manifest)
        edited_routing: dict[str, dict[str, str]] = {}
        edited_thinking: dict[str, dict[str, dict[str, Any]]] = {}
        tier_tabs = st.tabs([tier for tier in BUILD_PROFILE_ORDER])
        for idx, tier in enumerate(BUILD_PROFILE_ORDER):
            tier_routing = routing.get(tier) or {}
            tier_thinking = thinking_defaults.get(tier) or {}
            edited_routing[tier] = {}
            edited_thinking[tier] = {}
            with tier_tabs[idx]:
                for phase in PHASE_ORDER:
                    current_model = (
                        str(tier_routing.get(phase, "selected_build_model")).strip()
                        or "selected_build_model"
                    )
                    current_thinking_cfg = tier_thinking.get(phase) or {}
                    current_thinking = bool(current_thinking_cfg.get("thinking", False))
                    current_effort = (
                        str(current_thinking_cfg.get("reasoningEffort", "medium")).strip()
                        or "medium"
                    )
                    budget = phase_token_budget_entry(manifest, phase)
                    st.markdown(f"#### {PHASE_LABELS.get(phase, phase)}")
                    c1, c2, c3, c4 = st.columns([1.8, 0.9, 1.1, 1.1])
                    with c1:
                        model_value = st.selectbox(
                            "Model",
                            AVAILABLE_PHASE_MODELS,
                            index=AVAILABLE_PHASE_MODELS.index(current_model)
                            if current_model in AVAILABLE_PHASE_MODELS
                            else 0,
                            key=f"bo_phase_model_{tier}_{phase}",
                            format_func=lambda model_id, _tier=tier: phase_model_display_label(
                                model_id,
                                _tier,
                                build_defaults,
                            ),
                        )
                    with c2:
                        thinking_value = st.toggle(
                            "Thinking",
                            value=current_thinking,
                            key=f"bo_phase_thinking_{tier}_{phase}",
                        )
                    with c3:
                        effort_value = st.selectbox(
                            "Reasoning effort",
                            REASONING_EFFORT_OPTIONS,
                            index=REASONING_EFFORT_OPTIONS.index(current_effort)
                            if current_effort in REASONING_EFFORT_OPTIONS
                            else REASONING_EFFORT_OPTIONS.index("medium"),
                            key=f"bo_phase_effort_{tier}_{phase}",
                            disabled=not thinking_value,
                        )
                    with c4:
                        resolved_model_value = (
                            build_defaults.get(tier, "").strip()
                            if model_value == "selected_build_model"
                            else model_value
                        )
                        st.text_input(
                            "Resolved model",
                            value=human_model_label(resolved_model_value),
                            key=f"bo_phase_resolved_{tier}_{phase}",
                            disabled=True,
                        )
                    st.caption(
                        f"Budget: `{budget['label']}` default={budget['default']} min={budget['min']} max={budget['max']} "
                        f"env={budget['envKey'] or '—'}. {budget['note']}"
                    )
                    edited_routing[tier][phase] = model_value
                    edited_thinking[tier][phase] = {
                        "thinking": thinking_value,
                        "reasoningEffort": effort_value,
                    }

        if st.button("Spara Autofix & Kvalitet", type="primary"):
            tb.setdefault("engineMaxOutputTokens", {})["default"] = int(engine_tokens)
            tb.setdefault("autofixMaxOutputTokens", {})["default"] = int(autofix_tokens)
            pgp.setdefault("verifierMaxOutputTokens", {})["default"] = int(verifier_tokens)
            pgp.setdefault("verifierSnippetCharsPerFile", {})["default"] = int(verifier_snippet)
            rp["deterministicAutofixPasses"] = int(deterministic_passes)
            rp["syntaxFixPasses"] = int(syntax_passes)
            rp["manualRepairRouteLlmPasses"] = int(manual_passes)
            rp["serverRepairPasses"] = int(server_passes)
            phase_routing_cfg = manifest.setdefault("phaseRouting", {})
            phase_routing_cfg["defaultByTier"] = edited_routing
            for tier, phase_entries in edited_thinking.items():
                for phase, cfg in phase_entries.items():
                    write_phase_thinking(
                        manifest,
                        tier,
                        phase,
                        bool(cfg.get("thinking", False)),
                        str(cfg.get("reasoningEffort", "medium")),
                    )
            try:
                write_json(MANIFEST_JSON, manifest)
                st.success("Sparade Autofix & Kvalitet-inställningar till config/ai_models/manifest.json.")
                st.rerun()
            except Exception:
                st.error("Kunde inte spara manifest.json.")

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
