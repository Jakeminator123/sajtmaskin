from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from . import (
    ai_models,
    artifacts_pipeline,
    autofix,
    codegen_static,
    cursor_agents,
    env_policy,
    eval_page,
    llm_config,
    mental_model,
    orchestration,
    overview,
    pipeline,
    preview,
    prompt_static,
    research,
    runtime_scaffolds,
    scaffolds,
    shadcn_audit,
    template_pipeline,
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
    PageSpec("Codegen static", "Konfiguration", codegen_static.render),
    PageSpec("prompt-static", "Konfiguration", prompt_static.render),
    PageSpec("ai_models", "Konfiguration", ai_models.render),
    PageSpec("Runtime scaffolds", "Konfiguration", runtime_scaffolds.render),
    PageSpec("Template pipeline", "Konfiguration", template_pipeline.render),
    PageSpec("Preview och versioner", "Konfiguration", preview.render),
    PageSpec("env-policy", "Konfiguration", env_policy.render),
    PageSpec("shadcn-audit", "Konfiguration", shadcn_audit.render),
    PageSpec("user_degraded_env", "Konfiguration", user_degraded_env.render),
    PageSpec("Cursor-agenter", "Konfiguration", cursor_agents.render),
    PageSpec("Scaffolds", "Overhead", scaffolds.render),
    PageSpec("Research & Dossiers", "Overhead", research.render),
    PageSpec("Pipeline", "Overhead", pipeline.render),
    PageSpec("Eval", "Overhead", eval_page.render),
    PageSpec("Orchestration Map", "Overhead", orchestration.render),
    PageSpec("Autofix & Kvalitet", "Overhead", autofix.render),
    PageSpec("Mental modell", "Overhead", mental_model.render),
    PageSpec("Artifacts pipeline", "Pipelines", artifacts_pipeline.render),
)

PAGE_MAP = {spec.name: spec for spec in PAGE_SPECS}
PAGE_NAMES = tuple(spec.name for spec in PAGE_SPECS)
PAGE_GROUPS = ("Konfiguration", "Overhead", "Pipelines")
PAGE_QUERY_ALIASES = {
    "llm": "LLM-faser & runtime-sanning",
    "artifacts": "Artifacts pipeline",
}

