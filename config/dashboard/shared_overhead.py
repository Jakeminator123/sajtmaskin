from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd


def find_workload(manifest: dict[str, Any], workload_id: str) -> dict[str, Any] | None:
    for workload in manifest.get("workloads") or []:
        if isinstance(workload, dict) and workload.get("id") == workload_id:
            return workload
    return None


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


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

    m_soft = re.search(r"const SOFT_ONLY_AUTOFIX_REASONS = new Set\(\[(.*?)\]\);", text, re.DOTALL)
    if m_soft:
        payload["softOnlyReasons"] = re.findall(r'"([^"]+)"', m_soft.group(1))

    return payload


MODEL_LABELS = {
    "openai/gpt-5.4": "OpenAI GPT-5.4",
    "openai/gpt-5.3-codex": "OpenAI GPT-5.3 Codex",
    "openai/gpt-5.2": "OpenAI GPT-5.2",
    "openai/gpt-5-mini": "OpenAI GPT-5 mini",
    "gpt-4o-mini": "GPT-4o mini (legacy)",
    "gpt-4.1": "GPT-4.1",
    "gpt-5-mini": "GPT-5 mini",
    "gpt-5-nano": "GPT-5 nano",
    "gpt-5.3-codex-max": "GPT-5.3 Codex Max",
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


def resolve_phase_models_for_dashboard(
    manifest: dict[str, Any], phase: str
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
    workload: dict[str, Any], manifest: dict[str, Any]
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
