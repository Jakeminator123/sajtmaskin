"""Modellval för backoffice-ytor som anropar en LLM — läst ur manifestet.

``config/ai_models/manifest.json`` är kanonisk ägare av vilken modell en
workload får använda. Den här modulen är den enda vägen dit från Python, så
ingen backoffice-sida hårdkodar ett modell-id och ingen sida får sin egen
tolkning av manifestet.

Tre poster hör hit (Fas D). Att de är **tre** och inte en är själva beslutet:

============================================  =============================
Post                                          Varför egen
============================================  =============================
``backoffice_scaffold_wizard_persona``        behöver vision (stillbild)
``backoffice_scaffold_wizard_guide``          ren text, billig modell räcker
``backoffice_dossier_curation``               eget skript, egen kostnadsbild
============================================  =============================

Wizarden läser **aldrig** ``analyze_presentation_vision``: den posten hör till
kroppsspråksanalysen i ``src/app/api/analyze-presentation/route.ts``. En delad
post skulle knyta två orelaterade features till samma modellbeslut, så att den
ena ändras av misstag när någon rör den andra.

Modulen är medvetet stdlib-only (``json`` + ``pathlib``) så både
``wizard_support.py`` och sidorna kan importera den utan att dra in Streamlit.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

MANIFEST_REL = "config/ai_models/manifest.json"

WORKLOAD_SCAFFOLD_WIZARD_PERSONA = "backoffice_scaffold_wizard_persona"
WORKLOAD_SCAFFOLD_WIZARD_GUIDE = "backoffice_scaffold_wizard_guide"
WORKLOAD_DOSSIER_CURATION = "backoffice_dossier_curation"

# Dokumenterad fallback när manifestet saknas eller inte går att tolka —
# backoffice ska inte krascha på en manifestfil, och en trasig fil ska inte
# tyst göra vision-gatingen mer tillåtande än manifestet. Paritet mot
# manifestet grindas i `backoffice/test_wizard_support_models.py`, så tuplarna
# kan inte drifta från posterna.
MODEL_FALLBACKS: dict[str, tuple[str, ...]] = {
    WORKLOAD_SCAFFOLD_WIZARD_PERSONA: ("gpt-4o", "gpt-5.5"),
    WORKLOAD_SCAFFOLD_WIZARD_GUIDE: ("gpt-5.4-mini", "gpt-5.5", "gpt-4o"),
    WORKLOAD_DOSSIER_CURATION: ("gpt-5.5", "gpt-5.4-mini"),
}
VISION_FALLBACKS: dict[str, frozenset[str]] = {
    WORKLOAD_SCAFFOLD_WIZARD_PERSONA: frozenset({"gpt-4o", "gpt-5.5"}),
}


def load_workload(repo_root: Path, workload_id: str) -> dict[str, Any] | None:
    """En ``workloads``-post ur AI-modellmanifestet, eller ``None``.

    ``None`` betyder "manifestet saknas, går inte att tolka, eller har inte
    posten" — anroparen faller då tillbaka på tabellerna ovan.
    """
    try:
        data = json.loads((repo_root / MANIFEST_REL).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    workloads = data.get("workloads") if isinstance(data, dict) else None
    if not isinstance(workloads, list):
        return None
    for entry in workloads:
        if isinstance(entry, dict) and entry.get("id") == workload_id:
            return entry
    return None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def resolve_model_choices(repo_root: Path, workload_id: str) -> tuple[str, ...]:
    """Operatörens modellval för en workload: ``defaultModel`` först, sedan
    ``fallbackModels``. Dubbletter tas bort, ordningen behålls."""
    fallback = MODEL_FALLBACKS.get(workload_id, ())
    workload = load_workload(repo_root, workload_id)
    if workload is None:
        return fallback
    default_model = workload.get("defaultModel")
    ordered = (
        [default_model.strip()]
        if isinstance(default_model, str) and default_model.strip()
        else []
    )
    ordered += _string_list(workload.get("fallbackModels"))
    deduped = tuple(dict.fromkeys(ordered))
    return deduped or fallback


def resolve_default_model(repo_root: Path, workload_id: str) -> str:
    """Manifestets förstaval för workloaden. Tom sträng om varken manifestet
    eller fallback-tabellen har något — anroparen får då inte gissa ett id."""
    choices = resolve_model_choices(repo_root, workload_id)
    return choices[0] if choices else ""


def resolve_vision_models(repo_root: Path, workload_id: str) -> frozenset[str]:
    """Vilka av workloadens modeller som får ta emot bilder.

    En post utan ``visionModels`` har ingen vision-väg: tom mängd, och
    anroparen skickar bara text.
    """
    workload = load_workload(repo_root, workload_id)
    if workload is None:
        return VISION_FALLBACKS.get(workload_id, frozenset())
    return frozenset(_string_list(workload.get("visionModels")))


def model_supports_vision(repo_root: Path, workload_id: str, model: str) -> bool:
    """True bara när manifestet pekar ut exakt det modell-id:t som
    vision-kapabelt för workloaden."""
    return model.strip() in resolve_vision_models(repo_root, workload_id)
