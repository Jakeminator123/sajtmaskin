from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from . import (
    ai_models,
    autofix,
    codegen_core,
    cursor_agents,
    dossiers,
    env_policy,
    eval_page,
    llm_config,
    mental_model,
    observability,
    orchestration,
    overview,
    pipeline_health,
    preview,
    projects_admin,
    prompt_core,
    runtime_scaffolds,
    scaffold_lifecycle,
    scaffolds,
    shadcn_audit,
    user_degraded_env,
)


@dataclass(frozen=True)
class PageSpec:
    name: str
    group: str
    render: Callable


PAGE_SPECS: tuple[PageSpec, ...] = (
    PageSpec("Översikt", "Konfiguration", overview.render),
    PageSpec("LLM-faser & runtime-sanning", "Konfiguration", llm_config.render),
    PageSpec("Codegen core", "Konfiguration", codegen_core.render),
    PageSpec("prompt-core", "Konfiguration", prompt_core.render),
    PageSpec("ai_models", "Konfiguration", ai_models.render),
    PageSpec("Runtime scaffolds", "Konfiguration", runtime_scaffolds.render),
    PageSpec("Preview och versioner", "Konfiguration", preview.render),
    PageSpec("env-policy", "Konfiguration", env_policy.render),
    PageSpec("shadcn-audit", "Konfiguration", shadcn_audit.render),
    PageSpec("user_degraded_env", "Konfiguration", user_degraded_env.render),
    PageSpec("Cursor-agenter", "Konfiguration", cursor_agents.render),
    PageSpec("Scaffolds", "Overhead", scaffolds.render),
    PageSpec("Scaffold Lifecycle", "Overhead", scaffold_lifecycle.render),
    PageSpec("Dossiers (legoklossar)", "Overhead", dossiers.render),
    PageSpec("Eval", "Overhead", eval_page.render),
    PageSpec("Orchestration Map", "Overhead", orchestration.render),
    PageSpec("Autofix & Kvalitet", "Overhead", autofix.render),
    PageSpec("Pipeline Health", "Overhead", pipeline_health.render),
    PageSpec("Observability", "Overhead", observability.render),
    PageSpec("Projekt-admin (radera)", "Overhead", projects_admin.render),
    PageSpec("Mental modell", "Overhead", mental_model.render),
)

PAGE_MAP = {spec.name: spec for spec in PAGE_SPECS}
PAGE_NAMES = tuple(spec.name for spec in PAGE_SPECS)
PAGE_GROUPS = ("Konfiguration", "Overhead")
PAGE_QUERY_ALIASES = {
    "llm": "LLM-faser & runtime-sanning",
    "core": "prompt-core",
    "dossiers": "Dossiers (legoklossar)",
}

