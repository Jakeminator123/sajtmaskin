# -*- coding: utf-8 -*-
"""
Sajtmaskin — konfigurationsdashboard (Streamlit).

Kör från repo-root (PowerShell, UTF-8):
  cd config/dashboard
  $env:PYTHONUTF8 = "1"
  python -m pip install -r requirements.txt
  python app.py

Samma som: streamlit run app.py  (eller python -X utf8 -m streamlit run app.py)
"""
from __future__ import annotations

import json
import os
import re
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


def normalize_nonempty_lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def find_workload(manifest: dict[str, Any], workload_id: str) -> dict[str, Any] | None:
    for workload in manifest.get("workloads") or []:
        if isinstance(workload, dict) and workload.get("id") == workload_id:
            return workload
    return None


MODEL_LABELS = {
    "openai/gpt-5.4": "OpenAI GPT-5.4",
    "openai/gpt-5.3-codex": "OpenAI GPT-5.3 Codex",
    "openai/gpt-5.2": "OpenAI GPT-5.2",
    "openai/gpt-5-mini": "OpenAI GPT-5 mini",
    "gpt-4o-mini": "GPT-4o mini",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 mini",
    "gpt-5.1-codex-max": "GPT-5.1 Codex Max",
    "claude-sonnet-4.6": "Claude Sonnet 4.6",
    "claude-opus-4.6": "Claude Opus 4.6",
    "anthropic/claude-sonnet-4.6": "Anthropic Claude Sonnet 4.6",
    "anthropic/claude-opus-4.6": "Anthropic Claude Opus 4.6",
    "anthropic-direct/claude-haiku-4-5-20251001": "Anthropic Claude Haiku 4.5 (direct)",
    "anthropic-direct/claude-sonnet-4-6": "Anthropic Claude Sonnet 4.6 (direct)",
    "anthropic-direct/claude-opus-4-6": "Anthropic Claude Opus 4.6 (direct)",
    "selected_build_model": "Följ vald byggprofil (`selected_build_model`)",
}


def human_model_label(model: str) -> str:
    model = (model or "").strip()
    if not model:
        return "—"
    if model in MODEL_LABELS:
        return MODEL_LABELS[model]
    return model


def sync_route_timeout_literals(
    repo_root: Path, engine_seconds: int, assist_seconds: int
) -> int:
    route_targets = {
        "src/app/api/engine/chats/stream/route.ts": engine_seconds,
        "src/app/api/v0/chats/stream/route.ts": engine_seconds,
        "src/app/api/engine/chats/[chatId]/stream/route.ts": engine_seconds,
        "src/app/api/v0/chats/[chatId]/stream/route.ts": engine_seconds,
        "src/app/api/ai/chat/route.ts": assist_seconds,
        "src/app/api/ai/brief/route.ts": assist_seconds,
    }
    changed = 0
    for rel, seconds in route_targets.items():
        fp = repo_root / rel
        if not fp.is_file():
            continue
        before = read_text(fp)
        after = re.sub(
            r"export const maxDuration = \d+;",
            f"export const maxDuration = {int(seconds)};",
            before,
            count=1,
        )
        if after != before:
            write_text(fp, after)
            changed += 1
    return changed


def render_where_panel(page: str, dm: dict[str, Any]) -> None:
    """Visar var källfiler, docs och läsande kod finns (domain-map.json)."""
    meta = (dm.get("pages") or {}).get(page)
    if not meta:
        st.info(
            f"Saknar post för **{page}** i `config/dashboard/domain-map.json`. "
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
        human_schemas = meta.get("humanSchemaPaths") or []
        if human_schemas:
            st.markdown("**Human schemas** (mänskligt läsbara kontrakt)")
            for line in human_schemas:
                st.markdown(f"- `{line}`")
        strict_schemas = meta.get("strictSchemaPaths") or []
        if strict_schemas:
            st.markdown("**Strict schemas** (maskinorienterade kontrakt)")
            for line in strict_schemas:
                st.markdown(f"- `{line}`")
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
        "`config/` · `config/dashboard/` (Streamlit) · `docs/` · sist: **Cursor-agenter** → `.cursor/` + docs"
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
    with st.expander("Repo-roten: config (inkl. dashboard/) · docs · .cursor", expanded=False):
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
    manifest = read_json(man_path)
    st.info(
        "Här styr du **LLM-kedjan** för buildern: första prompten, deep brief, planläge, själva byggmodellen, fixer/repair och några separata analysrutter. "
        "Tanken är att samma `manifest.json` ska vara navet som både dashboarden och runtime-koden läser."
    )
    models_part = st.radio(
        "Del",
        [
            "Generator-kedja",
            "Assist / brief / polish",
            "Första prompten / orkestrering",
            "Provider / kontrakt",
            "Repair / budget / timeout",
            "Övriga route-modeller",
            "Workloads",
            "manifest.json",
            "Markdown / .txt",
        ],
        horizontal=True,
        key="ai_models_part",
    )

    if models_part == "Generator-kedja":
        build_profiles = (
            manifest.setdefault("buildProfiles", {}).setdefault("defaults", {})
        )
        quality_map = manifest.setdefault("qualityToOwnEngineModel", {})
        phase_routing = (
            manifest.setdefault("phaseRouting", {}).setdefault("defaultByTier", {})
        )

        codegen = find_workload(manifest, "own_engine_codegen") or {}
        planner = find_workload(manifest, "plan_mode_planner") or {}
        brief = find_workload(manifest, "brief_structured") or {}
        verifier = find_workload(manifest, "post_generation_verifier") or {}
        polish = find_workload(manifest, "post_generation_polish") or {}
        manual_repair = find_workload(manifest, "manual_repair_route_llm") or {}
        server_repair = find_workload(manifest, "server_verify_repair_llm") or {}

        st.markdown("### Kedjan i klarspråk")
        st.markdown(
            f"1. **Första fritextprompten** kan först gå via **brief** ({human_model_label(brief.get('defaultModel', ''))}) om klienten eller servern behöver struktur.\n"
            f"2. Därefter går den in i **själva byggmodellen** ({human_model_label(build_profiles.get('max', ''))} när profilen är `max`).\n"
            f"3. Om du väljer **planläge** används planner-fasen ({planner.get('notes') or 'styrs av phase routing'}).\n"
            f"4. Efter syntax körs **verifier** ({verifier.get('notes') or 'styrs av phase routing'}) och därefter ev. **polish** ({polish.get('title', 'post-generation polish')}).\n"
            f"5. Om kvaliteten fortfarande faller kan **fixer/repair** försöka laga fel — både i explicit repair-route och i background verify."
        )
        st.caption(
            "Begrepp: `planner` = tänk/plan före kod, `generator` = bygger sajten, `fixer` = försöker laga syntax/kvalitetsfel, "
            "`verifier` = efterkontroll i bakgrunden."
        )

        st.markdown("### Byggprofiler (själva kodgeneratorn)")
        profile_labels = {
            "fast": "Fast / Snabb",
            "pro": "Pro / Lagom",
            "max": "Max / Tanker",
            "codex": "Codex / Kod Max",
            "anthropic": "Anthropic",
        }
        profile_inputs: dict[str, str] = {}
        cols = st.columns(5, gap="small")
        for col, key in zip(cols, ["fast", "pro", "max", "codex", "anthropic"]):
            with col:
                profile_inputs[key] = st.text_input(
                    profile_labels[key],
                    value=str(build_profiles.get(key, "")),
                    help="Konkret modell-ID som används när denna byggprofil väljs i buildern.",
                    key=f"bp_{key}",
                )

        st.markdown("### Kvalitetsnivå → modell")
        st.caption(
            "`qualityTarget` används internt för att välja hur tung modellnivå en viss typ av generation bör motsvara."
        )
        quality_inputs: dict[str, str] = {}
        quality_cols = st.columns(5, gap="small")
        for col, key in zip(quality_cols, ["light", "standard", "pro", "premium", "max"]):
            with col:
                quality_inputs[key] = st.text_input(
                    key,
                    value=str(quality_map.get(key, "")),
                    key=f"quality_{key}",
                )

        st.markdown("### Phase routing (vem gör vad i kedjan)")
        st.caption(
            "Sätt `selected_build_model` om fasen ska följa användarens valda byggprofil. "
            "Sätt ett konkret modell-ID om fasen ska ha en egen modell."
        )
        routing_rows: list[dict[str, str]] = []
        for tier in ["fast", "pro", "max", "codex", "anthropic"]:
            tier_cfg = phase_routing.get(tier) or {}
            routing_rows.append(
                {
                    "tier": tier,
                    "planner": str(tier_cfg.get("planner", "selected_build_model")),
                    "generator": str(tier_cfg.get("generator", "selected_build_model")),
                    "fixer": str(tier_cfg.get("fixer", "selected_build_model")),
                    "verifier": str(tier_cfg.get("verifier", "selected_build_model")),
                    "deploy-assistant": str(
                        tier_cfg.get("deploy-assistant", "selected_build_model")
                    ),
                }
            )
        edited_routing = st.data_editor(
            routing_rows,
            hide_index=True,
            width="stretch",
            key="phase_routing_editor",
            column_config={
                "tier": st.column_config.TextColumn("Profil", disabled=True),
                "planner": st.column_config.TextColumn("Planner"),
                "generator": st.column_config.TextColumn("Generator"),
                "fixer": st.column_config.TextColumn("Fixer"),
                "verifier": st.column_config.TextColumn("Verifier"),
                "deploy-assistant": st.column_config.TextColumn("Deploy-assistant"),
            },
        )

        st.markdown("### Repair-kedjor som påverkas av samma routing")
        st.markdown(
            f"- **Manuell repair-route:** {manual_repair.get('title', '—')}  \n"
            f"- **Server verify repair:** {server_repair.get('title', '—')}"
        )

        if st.button("Spara generator-kedja", type="primary"):
            for key, value in profile_inputs.items():
                build_profiles[key] = value.strip()
            for key, value in quality_inputs.items():
                quality_map[key] = value.strip()
            new_routing: dict[str, dict[str, str]] = {}
            for row in edited_routing:
                tier = str(row.get("tier", "")).strip()
                if not tier:
                    continue
                new_routing[tier] = {
                    "planner": str(row.get("planner", "")).strip() or "selected_build_model",
                    "generator": str(row.get("generator", "")).strip() or "selected_build_model",
                    "fixer": str(row.get("fixer", "")).strip() or "selected_build_model",
                    "verifier": str(row.get("verifier", "")).strip() or "selected_build_model",
                    "deploy-assistant": str(
                        row.get("deploy-assistant", "")
                    ).strip()
                    or "selected_build_model",
                }
            manifest.setdefault("phaseRouting", {})["defaultByTier"] = new_routing
            write_json(man_path, manifest)
            st.success("Sparat generator-kedjan.")
            st.rerun()

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

    elif models_part == "Assist / brief / polish":
        prompt_assist = manifest.setdefault("promptAssist", {})
        prompt_defaults = prompt_assist.setdefault("defaults", {})
        prompt_allowed = prompt_assist.setdefault("allowed", {})
        briefing = manifest.setdefault("briefing", {}).setdefault("defaults", {})

        st.markdown("### Förklaring")
        st.markdown(
            "- **Prompt assist** = omskrivning/förbättring av prompt innan build (`Förbättra`).\n"
            "- **Deep brief** = strukturerad specifikation som kan skapas före första riktiga builden.\n"
            "- **Polish** = lätt språkrättning eller liten omformulering (`Skriv om`), inte full brief."
        )

        assist_default = st.text_input(
            "Standard: Prompt assist-modell",
            value=str(prompt_defaults.get("assist", "")),
            help="Standardmodell för `Förbättra` i buildern.",
            key="assist_default_model",
        )
        polish_default = st.text_input(
            "Standard: Prompt polish-modell",
            value=str(prompt_defaults.get("polish", "")),
            help="Lätt copy-editor för 'Skriv om'. Ska normalt vara billigare/mer konservativ än deep brief.",
            key="polish_default_model",
        )
        st.caption(
            "Detta är **prompt-polish före build**. Det är inte samma sak som den separata post-generation `polish pass` som kan köras på genererade filer efter codegen."
        )

        st.markdown("### Deep brief / structured brief")
        request_model = st.text_input(
            "API `/api/ai/brief` (förvald modell)",
            value=str(briefing.get("requestModel", "")),
            help="Förvald modell när en structured brief körs direkt.",
            key="brief_request_model",
        )
        auto_openai = st.text_input(
            "Server auto-brief: OpenAI-standard",
            value=str(briefing.get("serverAutoOpenAI", "")),
            help="Används när servern själv behöver skapa brief och OpenAI-klassad assist-lane finns tillgänglig.",
            key="brief_auto_openai",
        )
        auto_anthropic = st.text_input(
            "Server auto-brief: Anthropic-standard",
            value=str(briefing.get("serverAutoAnthropic", "")),
            help="Fallback när servern behöver skapa brief och Anthropic är den användbara vägen.",
            key="brief_auto_anthropic",
        )
        spec_model = st.text_input(
            "Äldre spec-first helper",
            value=str(briefing.get("specModel", "")),
            help="Äldre hjälparmodell för spec-first-flöde. Ingår inte i normal create-chat-kedja men hålls synkad här.",
            key="brief_spec_model",
        )

        st.markdown("### Tillåtna assist-modeller")
        gateway_text = st.text_area(
            "User-facing assistmodeller (en per rad)",
            value="\n".join(prompt_allowed.get("gatewayClassModels") or []),
            height=140,
            help="Detta är modeller som normalt ska kunna väljas i UI för prompt assist.",
            key="assist_gateway_models",
        )
        anthropic_direct_text = st.text_area(
            "Anthropic direct-lista (en per rad)",
            value="\n".join(prompt_allowed.get("anthropicDirectModels") or []),
            height=120,
            help="Teknisk allowlist för direkta Anthropic-ID:n. Mindre relevant för icke-utvecklare.",
            key="assist_anthropic_direct_models",
        )

        if st.button("Spara assist / brief / polish", type="primary"):
            prompt_defaults["assist"] = assist_default.strip()
            prompt_defaults["polish"] = polish_default.strip()
            prompt_allowed["gatewayClassModels"] = normalize_nonempty_lines(gateway_text)
            prompt_allowed["anthropicDirectModels"] = normalize_nonempty_lines(
                anthropic_direct_text
            )
            briefing["requestModel"] = request_model.strip()
            briefing["serverAutoOpenAI"] = auto_openai.strip()
            briefing["serverAutoAnthropic"] = auto_anthropic.strip()
            briefing["specModel"] = spec_model.strip()
            write_json(man_path, manifest)
            st.success("Sparat assist / brief / polish.")
            st.rerun()

    elif models_part == "Första prompten / orkestrering":
        orchestration = manifest.setdefault("promptOrchestration", {})
        hard_caps = orchestration.setdefault("hardCaps", {})
        soft_targets = orchestration.setdefault("softTargets", {})
        phase_thresholds = orchestration.setdefault("phaseThresholds", {})

        st.markdown("### Vad detta styr")
        st.markdown(
            "- **Hard caps** = absoluta gränser för hur mycket prompt/systemtext som får skickas.\n"
            "- **Soft targets** = när servern börjar fundera på att komprimera långa promptar.\n"
            "- **Phase thresholds** = när servern går över till tydligare plan-bygg-polish-läge för mycket stora promptar."
        )
        st.caption(
            "Det här styr den deterministiska orkestratorn före build. Det är inte en egen LLM, utan regler för när prompten ska skickas direkt, kondenseras eller delas upp."
        )

        st.markdown("### Hard caps")
        max_chat_message = st.number_input(
            "Max längd: användarens prompt till build-route",
            value=int((hard_caps.get("maxChatMessageChars") or {}).get("default", 800000)),
            step=5000,
            key="po_max_chat_message",
        )
        warn_chat_message = st.number_input(
            "Varningsnivå: lång användarprompt",
            value=int((hard_caps.get("warnChatMessageChars") or {}).get("default", 500000)),
            step=5000,
            key="po_warn_chat_message",
        )
        max_chat_system = st.number_input(
            "Max längd: systemprompt / instruktioner",
            value=int((hard_caps.get("maxChatSystemChars") or {}).get("default", 600000)),
            step=5000,
            key="po_max_chat_system",
        )
        warn_chat_system = st.number_input(
            "Varningsnivå: lång systemprompt / instruktioner",
            value=int((hard_caps.get("warnChatSystemChars") or {}).get("default", 350000)),
            step=5000,
            key="po_warn_chat_system",
        )
        max_handoff = st.number_input(
            "Max längd: prompt-handoff mellan steg",
            value=int((hard_caps.get("maxPromptHandoffChars") or {}).get("default", 800000)),
            step=5000,
            key="po_max_handoff",
        )
        max_brief_prompt = st.number_input(
            "Max längd: prompt till structured brief",
            value=int((hard_caps.get("maxAiBriefPromptChars") or {}).get("default", 800000)),
            step=5000,
            key="po_max_brief",
        )
        max_ai_chat = st.number_input(
            "Max längd: prompt till assist-chat",
            value=int((hard_caps.get("maxAiChatMessageChars") or {}).get("default", 600000)),
            step=5000,
            key="po_max_ai_chat",
        )
        max_ai_spec = st.number_input(
            "Max längd: prompt till spec-first helper",
            value=int((hard_caps.get("maxAiSpecPromptChars") or {}).get("default", 800000)),
            step=5000,
            key="po_max_ai_spec",
        )

        st.markdown("### Soft targets")
        c1, c2, c3 = st.columns(3)
        with c1:
            soft_freeform = st.number_input(
                "Fritext",
                value=int((soft_targets.get("freeformChars") or {}).get("default", 75000)),
                step=1000,
                key="po_soft_freeform",
            )
            soft_template = st.number_input(
                "Template / kategori",
                value=int((soft_targets.get("templateChars") or {}).get("default", 50000)),
                step=1000,
                key="po_soft_template",
            )
            soft_followup = st.number_input(
                "Uppföljning",
                value=int((soft_targets.get("followupChars") or {}).get("default", 70000)),
                step=1000,
                key="po_soft_followup",
            )
        with c2:
            soft_wizard = st.number_input(
                "Wizard",
                value=int((soft_targets.get("wizardChars") or {}).get("default", 85000)),
                step=1000,
                key="po_soft_wizard",
            )
            soft_audit = st.number_input(
                "Audit",
                value=int((soft_targets.get("auditChars") or {}).get("default", 110000)),
                step=1000,
                key="po_soft_audit",
            )
        with c3:
            soft_technical = st.number_input(
                "Teknisk follow-up",
                value=int((soft_targets.get("technicalChars") or {}).get("default", 95000)),
                step=1000,
                key="po_soft_technical",
            )
            soft_app = st.number_input(
                "App",
                value=int((soft_targets.get("appChars") or {}).get("default", 90000)),
                step=1000,
                key="po_soft_app",
            )

        st.markdown("### Fas-trösklar")
        phase_default = st.number_input(
            "Stor prompt: plan-build-polish-tröskel",
            value=int((phase_thresholds.get("defaultChars") or {}).get("default", 180000)),
            step=2000,
            key="po_phase_default",
        )
        phase_audit = st.number_input(
            "Stor audit: plan-build-polish-tröskel",
            value=int((phase_thresholds.get("auditChars") or {}).get("default", 140000)),
            step=2000,
            key="po_phase_audit",
        )

        if st.button("Spara första prompten / orkestrering", type="primary"):
            hard_caps.setdefault("maxChatMessageChars", {})["default"] = int(max_chat_message)
            hard_caps.setdefault("warnChatMessageChars", {})["default"] = int(
                warn_chat_message
            )
            hard_caps.setdefault("maxChatSystemChars", {})["default"] = int(max_chat_system)
            hard_caps.setdefault("warnChatSystemChars", {})["default"] = int(
                warn_chat_system
            )
            hard_caps.setdefault("maxPromptHandoffChars", {})["default"] = int(max_handoff)
            hard_caps.setdefault("maxAiBriefPromptChars", {})["default"] = int(
                max_brief_prompt
            )
            hard_caps.setdefault("maxAiChatMessageChars", {})["default"] = int(max_ai_chat)
            hard_caps.setdefault("maxAiSpecPromptChars", {})["default"] = int(max_ai_spec)
            soft_targets.setdefault("freeformChars", {})["default"] = int(soft_freeform)
            soft_targets.setdefault("templateChars", {})["default"] = int(soft_template)
            soft_targets.setdefault("followupChars", {})["default"] = int(soft_followup)
            soft_targets.setdefault("wizardChars", {})["default"] = int(soft_wizard)
            soft_targets.setdefault("auditChars", {})["default"] = int(soft_audit)
            soft_targets.setdefault("technicalChars", {})["default"] = int(soft_technical)
            soft_targets.setdefault("appChars", {})["default"] = int(soft_app)
            phase_thresholds.setdefault("defaultChars", {})["default"] = int(phase_default)
            phase_thresholds.setdefault("auditChars", {})["default"] = int(phase_audit)
            write_json(man_path, manifest)
            st.success("Sparat orkestreringsgränserna.")
            st.rerun()

    elif models_part == "Provider / kontrakt":
        contracts_cfg = manifest.setdefault("preGenerationContracts", {})
        contract_defaults = contracts_cfg.setdefault("defaults", {})
        provider_rules = contracts_cfg.setdefault("providerRules", [])

        st.markdown("### Vad detta styr")
        st.markdown(
            "Detta styr **pre-generation contracts**: vilka providers, env-nycklar och trigger-regler som buildern använder när den försöker förstå om en sajt behöver databas, auth, betalning eller externa integrationer."
        )
        st.caption(
            "Detta är mer tekniskt än modellval. Om du är osäker: justera främst provider-namn, env-nycklar och fallback-val. Låt regex-mönstren vara om du inte vet exakt varför de ändras."
        )

        fallback_db = st.text_input(
            "Fallback-databas när prompten kräver persistens men ingen provider nämns",
            value=str(contract_defaults.get("fallbackDatabaseProvider", "SQLite")),
            key="contracts_fallback_db",
        )
        fallback_auth = st.text_input(
            "Fallback-auth när prompten kräver inloggning men ingen provider nämns",
            value=str(
                contract_defaults.get("fallbackAuthProvider", "NextAuth / Auth.js")
            ),
            key="contracts_fallback_auth",
        )
        fallback_payment = st.text_input(
            "Fallback-betalprovider när prompten kräver checkout men ingen provider nämns",
            value=str(contract_defaults.get("fallbackPaymentProvider", "Stripe")),
            key="contracts_fallback_payment",
        )

        rows: list[dict[str, str]] = []
        for rule in provider_rules:
            if not isinstance(rule, dict):
                continue
            rows.append(
                {
                    "kind": str(rule.get("kind", "")),
                    "provider": str(rule.get("provider", "")),
                    "name": str(rule.get("name", "")),
                    "envVars": ", ".join(rule.get("envVars") or []),
                    "matchPatterns": " | ".join(rule.get("matchPatterns") or []),
                    "status": str(rule.get("status", "")),
                    "reason": str(rule.get("reason", "")),
                }
            )

        edited_rules = st.data_editor(
            rows,
            num_rows="dynamic",
            hide_index=True,
            width="stretch",
            key="contract_rules_editor",
            column_config={
                "kind": st.column_config.SelectboxColumn(
                    "Typ",
                    options=["database", "auth", "payment", "integration"],
                    required=True,
                ),
                "provider": st.column_config.TextColumn("Provider"),
                "name": st.column_config.TextColumn("Namn"),
                "envVars": st.column_config.TextColumn("Env-nycklar (kommaseparerat)"),
                "matchPatterns": st.column_config.TextColumn(
                    "Träffmönster / regex (separerade med |)"
                ),
                "status": st.column_config.SelectboxColumn(
                    "Status", options=["", "chosen", "optional"]
                ),
                "reason": st.column_config.TextColumn("Varför"),
            },
        )

        if st.button("Spara provider / kontrakt", type="primary"):
            contract_defaults["fallbackDatabaseProvider"] = fallback_db.strip()
            contract_defaults["fallbackAuthProvider"] = fallback_auth.strip()
            contract_defaults["fallbackPaymentProvider"] = fallback_payment.strip()
            cleaned_rules: list[dict[str, Any]] = []
            for row in edited_rules:
                provider = str(row.get("provider", "")).strip()
                kind = str(row.get("kind", "")).strip()
                if not provider or not kind:
                    continue
                env_vars = [
                    item.strip()
                    for item in str(row.get("envVars", "")).split(",")
                    if item.strip()
                ]
                match_patterns = [
                    item.strip()
                    for item in str(row.get("matchPatterns", "")).split("|")
                    if item.strip()
                ]
                payload: dict[str, Any] = {
                    "kind": kind,
                    "provider": provider,
                    "name": str(row.get("name", "")).strip() or provider,
                    "envVars": env_vars,
                    "matchPatterns": match_patterns,
                    "reason": str(row.get("reason", "")).strip(),
                }
                status = str(row.get("status", "")).strip()
                if status:
                    payload["status"] = status
                cleaned_rules.append(payload)
            contracts_cfg["providerRules"] = cleaned_rules
            write_json(man_path, manifest)
            st.success("Sparat provider-/kontraktsregler.")
            st.rerun()

    elif models_part == "Repair / budget / timeout":
        tb = manifest.setdefault("tokenBudgets", {})
        rt = manifest.setdefault("routeTimeouts", {})
        rp = manifest.setdefault("repairPolicies", {})

        st.markdown("### Tokenbudgetar")
        st.caption(
            "Högre värden kan ge rikare svar men kostar mer och kan dra ut på tiden."
        )
        engine_tokens = st.number_input(
            "Build/generator max output tokens",
            value=int((tb.get("engineMaxOutputTokens") or {}).get("default", 82768)),
            step=1024,
            key="tb_engine",
        )
        autofix_tokens = st.number_input(
            "Autofix / fixer max output tokens",
            value=int((tb.get("autofixMaxOutputTokens") or {}).get("default", 12288)),
            step=512,
            key="tb_autofix",
        )
        assist_tokens = st.number_input(
            "Assist / brief max output tokens",
            value=int((tb.get("assistMaxOutputTokens") or {}).get("default", 82768)),
            step=1024,
            key="tb_assist",
        )

        st.markdown("### Timeouts")
        st.caption(
            "OBS: Next.js route-filer kräver statiska literalvärden för `maxDuration`. "
            "När du sparar här uppdateras både `manifest.json` och de berörda route-filerna så att de hålls synkade."
        )
        engine_timeout = st.number_input(
            "Build-route maxDuration (sekunder)",
            value=int((rt.get("engineRouteMaxDurationSeconds") or {}).get("default", 800)),
            step=10,
            key="rt_engine",
        )
        assist_timeout = st.number_input(
            "Assist/brief-route maxDuration (sekunder)",
            value=int((rt.get("assistRouteMaxDurationSeconds") or {}).get("default", 600)),
            step=10,
            key="rt_assist",
        )
        stream_timeout = st.number_input(
            "Klientens stream-safety-timeout (millisekunder)",
            value=int((rt.get("streamSafetyTimeoutMs") or {}).get("default", 720000)),
            step=1000,
            key="rt_stream",
        )

        st.markdown("### Post-generation (verifier + polish)")
        st.caption(
            "Styr `runVerifierPass` och `runPolishPass` efter syntax i finalize. "
            "Verifiern följer `phaseRouting.verifier`, och polish använder verifierns "
            "`polishCandidates` när de finns."
        )
        pgp = manifest.setdefault("postGenerationPasses", {})
        p_polish_tok = pgp.setdefault("polishMaxOutputTokens", {})
        p_polish_ms = pgp.setdefault("polishTimeoutMs", {})
        p_polish_files = pgp.setdefault("polishMaxFilesWhenUnscoped", {})
        p_ver_tok = pgp.setdefault("verifierMaxOutputTokens", {})
        p_ver_ms = pgp.setdefault("verifierTimeoutMs", {})
        p_ver_snip = pgp.setdefault("verifierSnippetCharsPerFile", {})

        polish_out = st.number_input(
            "Polish: max output tokens",
            value=int(p_polish_tok.get("default", 16000)),
            step=512,
            key="pgp_polish_out",
        )
        polish_ms = st.number_input(
            "Polish: timeout (ms)",
            value=int(p_polish_ms.get("default", 45000)),
            step=1000,
            key="pgp_polish_ms",
        )
        polish_files = st.number_input(
            "Polish: max filer utan verifier-scope",
            value=int(p_polish_files.get("default", 14)),
            min_value=4,
            max_value=40,
            step=1,
            key="pgp_polish_files",
        )
        ver_out = st.number_input(
            "Verifier: max output tokens",
            value=int(p_ver_tok.get("default", 8192)),
            step=256,
            key="pgp_ver_out",
        )
        ver_ms = st.number_input(
            "Verifier: timeout (ms)",
            value=int(p_ver_ms.get("default", 60000)),
            step=1000,
            key="pgp_ver_ms",
        )
        ver_snip = st.number_input(
            "Verifier: snippet-tecken per fil",
            value=int(p_ver_snip.get("default", 14000)),
            step=500,
            key="pgp_ver_snip",
        )

        st.markdown("### Repair-pass")
        deterministic_passes = st.number_input(
            "Deterministiska autofix-pass före LLM",
            value=int(rp.get("deterministicAutofixPasses", 2)),
            min_value=1,
            max_value=10,
            step=1,
            key="repair_deterministic",
            help="Hur många gånger de mekaniska fixarna får loopa innan systemet går vidare.",
        )
        syntax_passes = st.number_input(
            "Syntax-fix-pass efter generering",
            value=int(rp.get("syntaxFixPasses", 3)),
            min_value=1,
            max_value=10,
            step=1,
            key="repair_syntax",
            help="Hur många fixer-rundor `validate-and-fix` får försöka innan den ger upp.",
        )
        manual_passes = st.number_input(
            "Manuell repair-route: max LLM-pass",
            value=int(rp.get("manualRepairRouteLlmPasses", 2)),
            min_value=1,
            max_value=10,
            step=1,
            key="repair_manual",
        )
        server_passes = st.number_input(
            "Background server verify: max repair-pass",
            value=int(rp.get("serverRepairPasses", 2)),
            min_value=1,
            max_value=10,
            step=1,
            key="repair_server",
        )

        if st.button("Spara repair / budget / timeout", type="primary"):
            tb.setdefault("engineMaxOutputTokens", {})["default"] = int(engine_tokens)
            tb.setdefault("autofixMaxOutputTokens", {})["default"] = int(autofix_tokens)
            tb.setdefault("assistMaxOutputTokens", {})["default"] = int(assist_tokens)
            rt.setdefault("engineRouteMaxDurationSeconds", {})["default"] = int(
                engine_timeout
            )
            rt.setdefault("assistRouteMaxDurationSeconds", {})["default"] = int(
                assist_timeout
            )
            rt.setdefault("streamSafetyTimeoutMs", {})["default"] = int(stream_timeout)
            p_polish_tok["default"] = int(polish_out)
            p_polish_ms["default"] = int(polish_ms)
            p_polish_files["default"] = int(polish_files)
            p_ver_tok["default"] = int(ver_out)
            p_ver_ms["default"] = int(ver_ms)
            p_ver_snip["default"] = int(ver_snip)
            rp["deterministicAutofixPasses"] = int(deterministic_passes)
            rp["syntaxFixPasses"] = int(syntax_passes)
            rp["manualRepairRouteLlmPasses"] = int(manual_passes)
            rp["serverRepairPasses"] = int(server_passes)
            write_json(man_path, manifest)
            changed = sync_route_timeout_literals(
                repo, int(engine_timeout), int(assist_timeout)
            )
            st.success(
                f"Sparat repair / budget / timeout. Synkade {changed} statiska route-filer."
            )
            st.rerun()

    elif models_part == "Övriga route-modeller":
        st.markdown("### Route-specifika modeller")
        st.caption(
            "Det här är separata AI-rutter utanför den vanliga create-chat/follow-up-kedjan, men de hålls ändå i samma manifest för överblick och synk."
        )
        route_specs = [
            (
                "audit_structured",
                "Audit (strukturerad webbgranskning)",
                "Styrs av `/api/audit`. Här kan du sätta primary model och fallback-kedja.",
            ),
            (
                "project_analyze",
                "Projektanalys",
                "Gratis kodöversikt för projekt via direkt OpenAI-anrop.",
            ),
            (
                "inspector_ai_match",
                "Inspector AI match",
                "Pekar ut vilken fil/koddel som matchar ett visuellt område.",
            ),
            (
                "analyze_presentation",
                "Presentation analysis",
                "Separat analysrutt för presentationsmaterial.",
            ),
        ]

        route_values: dict[str, tuple[str, str]] = {}
        for workload_id, title, blurb in route_specs:
            workload = find_workload(manifest, workload_id)
            if not workload:
                st.warning(f"Saknar workload `{workload_id}` i manifestet.")
                continue
            st.markdown(f"#### {title}")
            st.caption(blurb)
            default_value = st.text_input(
                f"{title} · defaultModel",
                value=str(workload.get("defaultModel", "")),
                key=f"route_model_{workload_id}",
            )
            fallback_value = st.text_area(
                f"{title} · fallbackModels (en per rad)",
                value="\n".join(workload.get("fallbackModels") or []),
                height=80,
                key=f"route_fallback_{workload_id}",
            )
            route_values[workload_id] = (default_value, fallback_value)

        if st.button("Spara route-modeller", type="primary"):
            for workload_id, (default_value, fallback_value) in route_values.items():
                workload = find_workload(manifest, workload_id)
                if not workload:
                    continue
                workload["defaultModel"] = default_value.strip()
                fallback_models = normalize_nonempty_lines(fallback_value)
                if fallback_models:
                    workload["fallbackModels"] = fallback_models
                else:
                    workload.pop("fallbackModels", None)
            write_json(man_path, manifest)
            st.success("Sparat route-modeller.")
            st.rerun()

    elif models_part == "Workloads":
        st.markdown("### Alla katalogiserade LLM-/AI-anrop")
        workloads = manifest.get("workloads") or []
        rows = []
        for workload in workloads:
            if not isinstance(workload, dict):
                continue
            rows.append(
                {
                    "id": workload.get("id", ""),
                    "titel": workload.get("title", ""),
                    "provider": workload.get("provider", ""),
                    "invocation": workload.get("invocation", ""),
                    "defaultModel": workload.get("defaultModel", ""),
                    "fallbackModels": ", ".join(workload.get("fallbackModels") or []),
                    "authEnv": ", ".join(workload.get("authEnv") or []),
                }
            )
        st.dataframe(rows, width="stretch", hide_index=True, height=420)
        st.caption(
            "Detta är katalog/överblick. De viktigaste redigerbara delarna ovan uppdaterar samma `manifest.json`."
        )

    elif models_part == "manifest.json":
        st.warning(
            "Om du ändrar `routeTimeouts` direkt här måste motsvarande route-filer också hållas i synk. "
            "Använd helst vyn **Repair / budget / timeout** för timeout-ändringar."
        )
        raw = read_text(man_path)
        edited = st.text_area("manifest.json", value=raw, height=520, key="manifest_edit")
        if st.button("Spara manifest.json", type="primary"):
            try:
                parsed = json.loads(edited)
                write_json(man_path, parsed)
                route_timeouts = parsed.get("routeTimeouts") or {}
                engine_timeout = int(
                    (route_timeouts.get("engineRouteMaxDurationSeconds") or {}).get(
                        "default", 800
                    )
                )
                assist_timeout = int(
                    (route_timeouts.get("assistRouteMaxDurationSeconds") or {}).get(
                        "default", 600
                    )
                )
                changed = sync_route_timeout_literals(repo, engine_timeout, assist_timeout)
                st.success(
                    f"Sparat (validerad JSON). Synkade {changed} statiska route-filer."
                )
                st.rerun()
            except json.JSONDecodeError as e:
                st.error(f"Ogiltig JSON: {e}")


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
