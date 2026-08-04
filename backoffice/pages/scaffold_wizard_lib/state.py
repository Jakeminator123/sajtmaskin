from __future__ import annotations

from typing import Any

import streamlit as st

from backoffice import wizard_support as wiz
from backoffice.ai_workloads import (
    WORKLOAD_SCAFFOLD_WIZARD_GUIDE,
    WORKLOAD_SCAFFOLD_WIZARD_PERSONA,
    model_supports_vision,
    resolve_model_choices,
)
from backoffice.pages.scaffold_lifecycle import (
    BUILD_INTENT_OPTIONS,
    COMPLEXITY_OPTIONS,
    SITE_KIND_OPTIONS,
    _create_scaffold,
    _dead_source_template_ids,
    _dead_source_template_ids_message,
    _delete_scaffold,
    _slugify,
    _validate_variant_payload,
    _variant_payload,
)
from backoffice.shared import (
    BackofficeContext,
    field_label,
    get_all_manifests,
    read_json,
    render_building_blocks_nav,
    render_save_scope,
    run_repo_command,
    tech_details,
    write_json,
)


def _facade():
    from backoffice.pages import scaffold_wizard as page
    return page


from .constants import (
    PAGE_NAME,
    _STEPS,
)


def _step() -> int:
    return int(_facade().st.session_state.get("swz_step", 0))


def _goto(step: int) -> None:
    page = _facade()
    page.st.session_state["swz_step"] = max(0, min(step, len(page._STEPS) - 1))
    page.st.rerun()


def _save_scope_for_step(step: int) -> str:
    """Vilket spara-läge gäller i det här wizard-steget?

    Steg 1–3 (index 0–2) rör bara det gitignorerade utkastet i
    ``data/scaffold-wizard-drafts/``. Steg 4 (index 3) kör :func:`_apply` och
    skriver **spårade** filer under ``config/scaffold-variants/`` (och vid ny
    scaffold även ``src/lib/gen/scaffolds/``). En fast ``local``-rubrik i steg 4
    skulle alltså lova "committas inte" på just den yta som committas — därför är
    lägesvalet steg-styrt och testat (Codex P2 på PR #615).
    """
    return "repo" if step >= len(_facade()._STEPS) - 1 else "local"


def _draft() -> dict[str, Any]:
    return _facade().st.session_state.setdefault("swz_draft", {})
