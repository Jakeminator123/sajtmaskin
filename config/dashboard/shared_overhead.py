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
    "gpt-5.3-codex",
    "gpt-5.3-codex-max",
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
            default_cfg = tier_defaults.get(phase, {"thinking": False, "reasoningEffort": "medium"})
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
