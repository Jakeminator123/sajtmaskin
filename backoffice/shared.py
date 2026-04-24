from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st


@dataclass(frozen=True)
class BackofficeContext:
    repo_root: Path
    dashboard_dir: Path
    config_dir: Path
    variants_dir: Path
    scripts_dir: Path
    domain_map_json: Path
    manifest_json: Path
    env_local: Path
    manage_env_script: Path
    scaffolds_dir: Path
    research_json: Path
    embeddings_json: Path
    catalog_json: Path
    eval_latest: Path
    schema_md: Path
    error_log_csv: Path
    autofix_hook_ts: Path


def ensure_utf8_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def running_under_streamlit() -> bool:
    try:
        from streamlit.runtime.scriptrunner_utils.script_run_context import (
            get_script_run_ctx,
        )

        return get_script_run_ctx() is not None
    except Exception:
        return False


def launch_streamlit_if_needed(app_path: Path, argv: list[str] | None = None) -> None:
    if running_under_streamlit():
        return
    raise SystemExit(
        subprocess.call(
            [sys.executable, "-m", "streamlit", "run", str(app_path), *((argv or []))],
        )
    )


def find_repo_root(start: Path | None = None) -> Path:
    here = (start or Path(__file__).resolve()).resolve()
    candidates = [here.parent] if here.is_file() else [here]
    base = candidates[0]
    for p in [base, *base.parents]:
        marker = p / "config" / "codegen-core-manifest.json"
        if marker.is_file():
            return p
    raise FileNotFoundError(
        "Hittade inte repo-root (saknar config/codegen-core-manifest.json). "
        "Kör appen från sajtmaskin-repot."
    )


def build_backoffice_context(repo_root: Path | None = None) -> BackofficeContext:
    root = (repo_root or find_repo_root()).resolve()
    dashboard_dir = root / "config" / "dashboard"
    config_dir = root / "config"
    variants_dir = config_dir / "scaffold-variants"
    scripts_dir = root / "scripts"
    scaffolds_dir = root / "src" / "lib" / "gen" / "scaffolds"
    return BackofficeContext(
        repo_root=root,
        dashboard_dir=dashboard_dir,
        config_dir=config_dir,
        variants_dir=variants_dir,
        scripts_dir=scripts_dir,
        domain_map_json=dashboard_dir / "domain-map.json",
        manifest_json=config_dir / "ai_models" / "manifest.json",
        env_local=root / ".env.local",
        manage_env_script=scripts_dir / "env" / "manage_env.py",
        scaffolds_dir=scaffolds_dir,
        research_json=scaffolds_dir / "scaffold-research.generated.json",
        embeddings_json=scaffolds_dir / "scaffold-embeddings.json",
        catalog_json=root
        / "data"
        / "external-template-pipeline"
        / "reference-library"
        / "catalog.json",
        eval_latest=root / "data" / "scaffold-eval" / "reports" / "scaffold-selection-latest.json",
        schema_md=root / "docs" / "architecture" / "scaffold-system.md",
        error_log_csv=root / "logs" / "llm-segmentts-and-index" / "error-log.csv",
        autofix_hook_ts=root / "src" / "lib" / "hooks" / "chat" / "useAutoFix.ts",
    )


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


@st.cache_data
def load_domain_map(path_str: str) -> dict[str, Any]:
    path = Path(path_str)
    if not path.is_file():
        return {"pages": {}, "repoSiblings": {}}
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def normalize_nonempty_lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def parse_ts_default_model_id(catalog_path: Path) -> str | None:
    if not catalog_path.is_file():
        return None
    text = catalog_path.read_text(encoding="utf-8")
    m = re.search(
        r'export const DEFAULT_MODEL_ID(?::\s*[^\s=]+)?\s*=\s*"([^"]+)"',
        text,
    )
    return m.group(1).strip() if m else None


def sync_route_timeout_literals(
    repo_root: Path,
    engine_seconds: int,
    assist_seconds: int,
) -> int:
    # /api/v0/chats/** removed in P29 Fas 1B (2026-04-20). Only the engine
    # chat routes carry timeouts now; assist routes remain unchanged.
    route_targets = {
        "src/app/api/engine/chats/stream/route.ts": engine_seconds,
        "src/app/api/engine/chats/[chatId]/stream/route.ts": engine_seconds,
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
    meta = (dm.get("pages") or {}).get(page)
    if not meta:
        st.info(
            f"Saknar post för **{page}** i `config/dashboard/domain-map.json`. "
            "Lägg till en `pages`-nyckel som matchar vynamnet."
        )
        return
    with st.expander(
        "Var ligger detta? · config (sparbar) · docs (förklaring) · kod",
        expanded=False,
    ):
        if meta.get("summary"):
            st.markdown(meta["summary"])
        st.markdown("**Källfiler** (dashboarden skriver under `config/` där det är relevant)")
        for line in meta.get("canonicalPaths") or []:
            st.markdown(f"- `{line}`")
        st.markdown(
            "**Dokumentation** (syskonmapp `docs/` eller README i `config/` — uppdateras manuellt)"
        )
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


def find_workload(manifest: dict[str, Any], workload_id: str) -> dict[str, Any] | None:
    for workload in manifest.get("workloads") or []:
        if isinstance(workload, dict) and workload.get("id") == workload_id:
            return workload
    return None


def load_fault_fix_csv(path: Path) -> tuple[pd.DataFrame, str | None]:
    if not path.is_file():
        return pd.DataFrame(), f"Filen `{path.as_posix()}` saknas."
    try:
        return pd.read_csv(path, encoding="utf-8"), None
    except Exception as exc:  # pragma: no cover - defensive UI helper
        return pd.DataFrame(), f"Kunde inte läsa error-log.csv: {exc}"


def read_autofix_runtime_config(path: Path) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "maxAttemptsPerReason": None,
        "maxAutofixPerChat": None,
        "softOnlyReasons": [],
    }
    if not path.exists():
        return payload
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return payload

    m_attempts = re.search(r"const MAX_ATTEMPTS_PER_REASON = (\d+);", text)
    if m_attempts:
        payload["maxAttemptsPerReason"] = int(m_attempts.group(1))

    m_chat = re.search(r"const MAX_AUTOFIX_PER_CHAT = (\d+);", text)
    if m_chat:
        payload["maxAutofixPerChat"] = int(m_chat.group(1))

    m_soft = re.search(
        r"const SOFT_ONLY_AUTOFIX_REASONS = new Set\(\[(.*?)\]\);",
        text,
        re.DOTALL,
    )
    if m_soft:
        payload["softOnlyReasons"] = re.findall(r'"([^"]+)"', m_soft.group(1))

    return payload


def _escape_ts_string(value: str) -> str:
    """Escape a Python string for safe inlining into a TypeScript string literal.

    Used by `backoffice/pages/scaffolds.py` and `backoffice/pages/scaffold_lifecycle.py`
    when rewriting `manifest.ts` files from the backoffice UI. Both files used to
    keep their own identical copy — consolidated here so the two surfaces don't
    drift apart.
    """
    return value.replace("\\", "\\\\").replace('"', '\\"')


MODEL_LABELS = {
    "openai/gpt-5.4": "OpenAI GPT-5.4",
    "openai/gpt-5.3-codex": "OpenAI GPT-5.3 Codex",
    "openai/gpt-5.2": "OpenAI GPT-5.2",
    "openai/gpt-5-mini": "OpenAI GPT-5 mini",
    "gpt-4o-mini": "GPT-4o mini (legacy)",
    "gpt-4.1": "GPT-4.1",
    "gpt-5-mini": "GPT-5 mini",
    "gpt-5-nano": "GPT-5 nano",
    "gpt-5.3-codex-max": "GPT-5.3 Codex Max (deprecated id — use gpt-5.3-codex)",
    "text-embedding-3-small": "OpenAI text-embedding-3-small",
    "whisper-1": "OpenAI Whisper-1",
    "claude-sonnet-4.6": "Claude Sonnet 4.6",
    "claude-opus-4.6": "Claude Opus 4.6",
    "anthropic/claude-sonnet-4.6": "Anthropic Claude Sonnet 4.6",
    "anthropic/claude-opus-4.6": "Anthropic Claude Opus 4.6",
    "anthropic-direct/claude-haiku-4-5-20251001": "Anthropic Claude Haiku 4.5 (direct)",
    "anthropic-direct/claude-sonnet-4-6": "Anthropic Claude Sonnet 4.6 (direct)",
    "anthropic-direct/claude-opus-4-6": "Anthropic Claude Opus 4.6 (direct)",
    "selected_build_model": "Följ vald byggprofil (`selected_build_model`)",
}

BUILD_PROFILE_ORDER = ("fast", "pro", "max", "codex", "anthropic")
PHASE_ORDER = (
    "planner",
    "generator",
    "fixer",
    "verifier",
    "deploy-assistant",
)
REASONING_EFFORT_OPTIONS = ("none", "low", "medium", "high", "xhigh")
AVAILABLE_PHASE_MODELS = (
    "selected_build_model",
    "gpt-4.1",
    "gpt-5.2",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "claude-sonnet-4.6",
    "claude-opus-4.6",
)
PHASE_LABELS = {
    "planner": "Planner",
    "generator": "Generator",
    "fixer": "Fixer",
    "verifier": "Verifier",
    "deploy-assistant": "Deploy-assistant",
}
DEFAULT_PHASE_THINKING_BY_TIER: dict[str, dict[str, dict[str, Any]]] = {
    "fast": {
        "planner": {"thinking": True, "reasoningEffort": "medium"},
        "generator": {"thinking": True, "reasoningEffort": "medium"},
        "fixer": {"thinking": False, "reasoningEffort": "medium"},
        "verifier": {"thinking": False, "reasoningEffort": "medium"},
        "deploy-assistant": {"thinking": False, "reasoningEffort": "medium"},
    },
    "pro": {
        "planner": {"thinking": True, "reasoningEffort": "medium"},
        "generator": {"thinking": True, "reasoningEffort": "medium"},
        "fixer": {"thinking": False, "reasoningEffort": "medium"},
        "verifier": {"thinking": False, "reasoningEffort": "medium"},
        "deploy-assistant": {"thinking": False, "reasoningEffort": "medium"},
    },
    "max": {
        "planner": {"thinking": True, "reasoningEffort": "high"},
        "generator": {"thinking": True, "reasoningEffort": "high"},
        "fixer": {"thinking": False, "reasoningEffort": "medium"},
        "verifier": {"thinking": False, "reasoningEffort": "medium"},
        "deploy-assistant": {"thinking": False, "reasoningEffort": "medium"},
    },
    "codex": {
        "planner": {"thinking": True, "reasoningEffort": "high"},
        "generator": {"thinking": True, "reasoningEffort": "high"},
        "fixer": {"thinking": False, "reasoningEffort": "medium"},
        "verifier": {"thinking": False, "reasoningEffort": "medium"},
        "deploy-assistant": {"thinking": False, "reasoningEffort": "medium"},
    },
    "anthropic": {
        "planner": {"thinking": True, "reasoningEffort": "high"},
        "generator": {"thinking": True, "reasoningEffort": "high"},
        "fixer": {"thinking": False, "reasoningEffort": "medium"},
        "verifier": {"thinking": False, "reasoningEffort": "medium"},
        "deploy-assistant": {"thinking": False, "reasoningEffort": "medium"},
    },
}
PHASE_TOKEN_BUDGET_NOTES = {
    "planner": ("tokenBudgets", "engineMaxOutputTokens", "Shares the engine token budget."),
    "generator": ("tokenBudgets", "engineMaxOutputTokens", "Shares the engine token budget."),
    "fixer": ("tokenBudgets", "autofixMaxOutputTokens", "Uses the autofix token budget."),
    "verifier": (
        "postGenerationPasses",
        "verifierMaxOutputTokens",
        "Uses the verifier token budget.",
    ),
    "deploy-assistant": (
        "tokenBudgets",
        "engineMaxOutputTokens",
        "Currently shares the engine token budget.",
    ),
}
PHASE_ROUTED_WORKLOADS = {
    "manual_repair_route_llm": "fixer",
    "server_verify_repair_llm": "fixer",
    "plan_mode_planner": "planner",
    "post_generation_verifier": "verifier",
}
ROUTE_LOCAL_WORKLOAD_MODELS = {
    "runtime_embeddings_query": (
        "text-embedding-3-small",
        "route-local constant",
        "Embeddings-modell för semantiska query-vektorer.",
    ),
    "text_analyze": (
        "gpt-5-nano",
        "route-local constant",
        "Hårdkodad responses-modell i `/api/text/analyze`.",
    ),
    "wizard_enrich_competitors": (
        "openai/gpt-5-mini",
        "route-local constant",
        "Hårdkodad wizard-modell i `/api/wizard/enrich`.",
    ),
    "transcribe": (
        "whisper-1",
        "route-local constant",
        "Transkriptionsmodell, inte vanlig textmodell.",
    ),
}


def human_model_label(model: str) -> str:
    model = (model or "").strip()
    if not model:
        return "—"
    if model in MODEL_LABELS:
        return MODEL_LABELS[model]
    return model


def build_profile_defaults(manifest: dict[str, Any]) -> dict[str, str]:
    defaults = ((manifest.get("buildProfiles") or {}).get("defaults") or {})
    return {str(key): str(value or "").strip() for key, value in defaults.items()}


def phase_routing_defaults(manifest: dict[str, Any]) -> dict[str, dict[str, str]]:
    routing = ((manifest.get("phaseRouting") or {}).get("defaultByTier") or {})
    out: dict[str, dict[str, str]] = {}
    for tier, cfg in routing.items():
        if not isinstance(cfg, dict):
            continue
        out[str(tier)] = {str(key): str(value or "").strip() for key, value in cfg.items()}
    return out


def summarize_tier_models(models_by_tier: dict[str, str]) -> str:
    parts: list[str] = []
    for tier in BUILD_PROFILE_ORDER:
        model = models_by_tier.get(tier, "").strip()
        if model:
            parts.append(f"{tier}: {human_model_label(model)}")
    return " | ".join(parts) if parts else "—"


def phase_model_display_label(
    model_id: str,
    tier: str,
    build_defaults: dict[str, str],
) -> str:
    model_id = (model_id or "").strip()
    if model_id == "selected_build_model":
        tier_model = build_defaults.get(tier, "").strip()
        if tier_model:
            return f"Tier model ({human_model_label(tier_model)})"
        return "Tier model"
    return human_model_label(model_id)


def phase_thinking_defaults(manifest: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    stored = ((manifest.get("phaseRouting") or {}).get("thinkingByTier") or {})
    result: dict[str, dict[str, dict[str, Any]]] = {}
    for tier in BUILD_PROFILE_ORDER:
        tier_defaults = DEFAULT_PHASE_THINKING_BY_TIER.get(tier, {})
        tier_stored = stored.get(tier) if isinstance(stored, dict) else {}
        normalized: dict[str, dict[str, Any]] = {}
        for phase in PHASE_ORDER:
            default_cfg = tier_defaults.get(
                phase,
                {"thinking": False, "reasoningEffort": "medium"},
            )
            phase_cfg = tier_stored.get(phase) if isinstance(tier_stored, dict) else {}
            normalized[phase] = {
                "thinking": bool(phase_cfg.get("thinking", default_cfg["thinking"])),
                "reasoningEffort": str(
                    phase_cfg.get("reasoningEffort", default_cfg["reasoningEffort"])
                ).strip()
                or str(default_cfg["reasoningEffort"]),
            }
        result[tier] = normalized
    return result


def write_phase_thinking(
    manifest: dict[str, Any],
    tier: str,
    phase: str,
    thinking: bool,
    effort: str,
) -> None:
    phase_routing = manifest.setdefault("phaseRouting", {})
    thinking_by_tier = phase_routing.setdefault("thinkingByTier", {})
    tier_cfg = thinking_by_tier.setdefault(tier, {})
    tier_cfg[phase] = {
        "thinking": bool(thinking),
        "reasoningEffort": (effort or "medium").strip() or "medium",
    }


def phase_token_budget_entry(manifest: dict[str, Any], phase: str) -> dict[str, Any]:
    group_name, key, note = PHASE_TOKEN_BUDGET_NOTES.get(
        phase,
        ("tokenBudgets", "engineMaxOutputTokens", "Shares the engine token budget."),
    )
    group = manifest.get(group_name) or {}
    entry = group.get(key) or {}
    return {
        "label": key,
        "default": entry.get("default"),
        "min": entry.get("min"),
        "max": entry.get("max"),
        "envKey": entry.get("envKey", ""),
        "note": note,
    }


def resolve_phase_models_for_dashboard(
    manifest: dict[str, Any],
    phase: str,
) -> dict[str, str]:
    build_defaults = build_profile_defaults(manifest)
    routing = phase_routing_defaults(manifest)
    resolved: dict[str, str] = {}
    for tier in BUILD_PROFILE_ORDER:
        phase_ref = routing.get(tier, {}).get(phase, "selected_build_model").strip()
        resolved[tier] = (
            build_defaults.get(tier, "").strip()
            if phase_ref == "selected_build_model"
            else phase_ref
        )
    return resolved


def describe_workload_model_resolution(
    workload: dict[str, Any],
    manifest: dict[str, Any],
) -> tuple[str, str, str]:
    workload_id = str(workload.get("id", "")).strip()
    explicit_default = str(workload.get("defaultModel", "")).strip()
    if explicit_default:
        return (
            human_model_label(explicit_default),
            "manifest.defaultModel",
            "Workloaden har ett eget explicit standardmodellval i manifestet.",
        )

    if workload_id == "own_engine_codegen":
        return (
            summarize_tier_models(build_profile_defaults(manifest)),
            "buildProfiles.defaults",
            "Generatorn följer vald byggprofil; varje profil har eget standardmodellval.",
        )

    if workload_id == "autofix_llm":
        fixer_models = summarize_tier_models(
            resolve_phase_models_for_dashboard(manifest, "fixer")
        )
        pro_default = build_profile_defaults(manifest).get("pro", "").strip()
        suffix = (
            f" Fallback när tier saknas: {human_model_label(pro_default)}."
            if pro_default
            else ""
        )
        return (
            fixer_models,
            "phaseRouting.fixer + pro fallback",
            "Autofix följer fixer-fasen när tier är känd." + suffix,
        )

    phase = PHASE_ROUTED_WORKLOADS.get(workload_id)
    if phase:
        return (
            summarize_tier_models(resolve_phase_models_for_dashboard(manifest, phase)),
            f"phaseRouting.{phase}",
            f"Workloaden följer {phase}-fasen för aktuell byggprofil/tier.",
        )

    if workload_id in ROUTE_LOCAL_WORKLOAD_MODELS:
        model_id, source, note = ROUTE_LOCAL_WORKLOAD_MODELS[workload_id]
        return (human_model_label(model_id), source, note)

    notes = str(workload.get("notes", "")).strip()
    if notes:
        return ("—", "notes / codeEntry", notes)

    return (
        "—",
        "inspect codeEntry",
        "Ingen explicit defaultModel i manifestet. Se codeEntry för faktisk källkod.",
    )


PROMPT_DUMP_SPECS: dict[str, dict[str, Any]] = {
    "orchestration-dynamic": {
        "label": "Orchestration dynamic",
        "expected_files": ("latest.md", "generation-input-package.json", "meta.json"),
    },
    "own-engine-codegen": {
        "label": "Own-engine codegen",
        "expected_files": ("full-system.md", "dynamic-context.md", "meta.json"),
    },
    "plan-mode-planner": {
        "label": "Plan mode planner",
        "expected_files": (
            "planner-preamble.md",
            "dynamic-context.md",
            "full-system.md",
            "meta.json",
        ),
    },
}


def _load_json_file(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _normalize_bool_env(raw: str | None) -> bool:
    value = (raw or "").strip().lower()
    return value in {"1", "true", "yes"}


# --- Env-driven endpoint resolvers --------------------------------------------
# Helpers that turn environment variables into ready-to-use endpoint config for
# Streamlit pages. Keep them small and side-effect-free; the UI layer decides
# how to react when a value is missing.

def resolve_metrics_endpoint() -> tuple[str, str | None]:
    """Returns ``(base_url, token)`` for the ``/api/metrics`` endpoint.

    Base URL preference order:
      1. ``SAJTMASKIN_METRICS_BASE_URL``
      2. ``SAJTMASKIN_BASE_URL``
      3. ``http://localhost:3000`` (dev fallback)

    Token comes from ``SAJTMASKIN_METRICS_TOKEN``. Returns ``token=None`` when
    the env var is unset or empty so the caller can render its own UX.
    """

    base_url = (
        os.environ.get("SAJTMASKIN_METRICS_BASE_URL", "").strip()
        or os.environ.get("SAJTMASKIN_BASE_URL", "").strip()
        or "http://localhost:3000"
    )
    base_url = base_url.rstrip("/")
    token = os.environ.get("SAJTMASKIN_METRICS_TOKEN", "").strip() or None
    return base_url, token


def _parse_iso8601(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def collect_prompt_dump_statuses(
    repo_root: Path,
    env_value: str | None = None,
    fresh_hours: int = 6,
) -> list[dict[str, Any]]:
    base_dir = repo_root / "data" / "prompt-dumps"
    env_enabled = _normalize_bool_env(
        env_value if env_value is not None else os.environ.get("SAJTMASKIN_PROMPT_DUMP")
    )

    statuses: list[dict[str, Any]] = []
    for category, spec in PROMPT_DUMP_SPECS.items():
        dump_dir = base_dir / category
        meta_path = dump_dir / "meta.json"
        meta = _load_json_file(meta_path) or {}

        expected_files = list(spec["expected_files"])
        present_files = [name for name in expected_files if (dump_dir / name).is_file()]
        missing_files = [name for name in expected_files if name not in present_files]
        payload_files_present = [name for name in present_files if name != "meta.json"]

        dumped_at = str(meta.get("dumpedAt", "")).strip() or None
        status_updated_at = str(meta.get("statusUpdatedAt", "")).strip() or None
        meta_enabled = meta.get("dumpingEnabled")
        dumping_enabled = meta_enabled if isinstance(meta_enabled, bool) else env_enabled

        dumped_at_dt = _parse_iso8601(dumped_at)
        age_hours = (
            None
            if dumped_at_dt is None
            else (datetime.now(timezone.utc) - dumped_at_dt).total_seconds() / 3600
        )

        if not dumping_enabled:
            status = "disabled"
            note = (
                "Dumpning är avstängd; befintliga payloadfiler kan vara stale."
                if payload_files_present
                else "Dumpning är avstängd; inga aktuella payloadfiler hittades."
            )
        elif dumped_at is None:
            status = "missing-meta"
            note = "Dumpning verkar aktiv, men dumpedAt saknas."
        elif dumped_at_dt is None:
            status = "invalid-meta"
            note = "dumpedAt kunde inte tolkas."
        elif age_hours is not None and age_hours <= fresh_hours:
            status = "fresh"
            note = "Senaste dump är färsk nog för felsökning."
        else:
            status = "stale-risk"
            note = (
                "Senaste dump ser gammal ut; kontrollera tidsstämpeln innan du litar på latest-filerna."
            )

        statuses.append(
            {
                "category": category,
                "label": spec["label"],
                "status": status,
                "dumpingEnabled": dumping_enabled,
                "dumpedAt": dumped_at,
                "statusUpdatedAt": status_updated_at,
                "ageHours": age_hours,
                "presentFiles": present_files,
                "missingFiles": missing_files,
                "note": note,
                "metaPath": str(meta_path),
            }
        )

    return statuses


def format_prompt_dump_status_lines(
    repo_root: Path,
    env_value: str | None = None,
) -> list[str]:
    statuses = collect_prompt_dump_statuses(repo_root, env_value=env_value)
    env_display = (
        env_value
        if env_value is not None
        else os.environ.get("SAJTMASKIN_PROMPT_DUMP", "(unset)")
    )

    lines = [
        "Prompt-dumps",
        f"  SAJTMASKIN_PROMPT_DUMP: {env_display}",
    ]
    for item in statuses:
        lines.append(f"  {item['category']}: {item['status']}")
        lines.append(f"    dumpedAt: {item['dumpedAt'] or 'missing'}")
        if item["statusUpdatedAt"]:
            lines.append(f"    statusUpdatedAt: {item['statusUpdatedAt']}")
        lines.append(
            "    files: "
            + (", ".join(item["presentFiles"]) if item["presentFiles"] else "none")
        )
        if item["missingFiles"]:
            lines.append("    missing: " + ", ".join(item["missingFiles"]))
        lines.append(f"    note: {item['note']}")
    return lines


def _load_manage_env_helpers(manage_env_script: Path):
    spec = importlib.util.spec_from_file_location("manage_env", str(manage_env_script))
    if spec is None or spec.loader is None:
        return None, None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception:
        return None, None
    return getattr(mod, "parse_env_file", None), getattr(mod, "set_in_env_file", None)


def read_env_flag(ctx: BackofficeContext, key: str) -> bool:
    parse_env_file, _ = _load_manage_env_helpers(ctx.manage_env_script)
    if parse_env_file is None:
        return False
    env_data = parse_env_file(ctx.env_local)
    val = env_data.get(key, "").strip().lower()
    return val in ("true", "1")


def write_env_flag(ctx: BackofficeContext, key: str, enabled: bool) -> bool:
    _, set_in_env_file = _load_manage_env_helpers(ctx.manage_env_script)
    if set_in_env_file is None:
        return False
    try:
        set_in_env_file(ctx.env_local, key, "true" if enabled else "false")
        return True
    except Exception:
        return False


def parse_manifest_ts(manifest_path: Path) -> dict[str, Any] | None:
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
        m_intents = re.search(r"allowedBuildIntents:\s*\[(.*?)\]", text, re.DOTALL)
        if m_intents:
            intents_block = m_intents.group(1)
    intents = re.findall(r'"(website|app|template)"', intents_block)
    if intents:
        result["allowedBuildIntents"] = intents

    tags_block = ""
    if "tags:" in text:
        m_tags = re.search(r"tags:\s*\[(.*?)\]", text, re.DOTALL)
        if m_tags:
            tags_block = m_tags.group(1)
    tags = re.findall(r'"([^"]+)"', tags_block)
    result["tags"] = tags[:10]

    result["has_promptHints"] = text.count("promptHints") > 0
    result["has_qualityChecklist"] = text.count("qualityChecklist") > 0
    result["has_research"] = "research:" in text

    files_dir = manifest_path.parent / "files"
    file_count = sum(1 for _ in files_dir.rglob("*") if _.is_file()) if files_dir.is_dir() else 0
    result["file_count"] = file_count

    for key in ("siteKind", "complexity", "structureProfile", "contentProfile"):
        m = re.search(rf'{key}:\s*"([^"]+)"', text)
        if m:
            result[key] = m.group(1)

    if "features:" in text:
        m_feat = re.search(r"features:\s*\[(.*?)\]", text, re.DOTALL)
        if m_feat:
            result["features"] = re.findall(r'"([^"]+)"', m_feat.group(1))

    return result


def get_all_manifests(ctx: BackofficeContext) -> list[dict[str, Any]]:
    manifests = []
    for d in sorted(ctx.scaffolds_dir.iterdir()):
        mf = d / "manifest.ts"
        if mf.exists():
            parsed = parse_manifest_ts(mf)
            if parsed:
                manifests.append(parsed)
    return manifests


def extract_ts_union_values(text: str, type_name: str) -> list[str] | None:
    pattern = rf'(?:export\s+)?type\s+{re.escape(type_name)}\s*=\s*([\s\S]*?);'
    m = re.search(pattern, text)
    if not m:
        return None
    return re.findall(r'"([^"]+)"', m.group(1))

