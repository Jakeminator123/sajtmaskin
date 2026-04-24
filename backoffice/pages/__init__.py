from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from . import (
    ai_models,
    autofix,
    codegen_core,
    cursor_agents,
    database_health,
    dossiers,
    env_policy,
    error_log_rag,
    eval_page,
    fixer_registry,
    llm_config,
    mental_model,
    observability,
    orchestration,
    overview,
    pipeline_health,
    preview,
    projects_admin,
    prompt_core,
    redis_health,
    repair_loop,
    runtime_scaffolds,
    scaffold_lifecycle,
    scaffold_performance,
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
    PageSpec("Scaffold Performance", "Overhead", scaffold_performance.render),
    PageSpec("Dossiers (legoklossar)", "Overhead", dossiers.render),
    PageSpec("Eval", "Overhead", eval_page.render),
    PageSpec("Orchestration Map", "Overhead", orchestration.render),
    PageSpec("Autofix & Kvalitet", "Overhead", autofix.render),
    PageSpec("Fixer Registry", "Overhead", fixer_registry.render),
    PageSpec("Repair Loop (hardening)", "Overhead", repair_loop.render),
    PageSpec("Error-log RAG", "Overhead", error_log_rag.render),
    PageSpec("Pipeline Health", "Overhead", pipeline_health.render),
    PageSpec("Observability", "Overhead", observability.render),
    PageSpec("Databashälsa", "Overhead", database_health.render),
    PageSpec("Redis-hälsa", "Overhead", redis_health.render),
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
    "db": "Databashälsa",
    "database": "Databashälsa",
    "redis": "Redis-hälsa",
}

