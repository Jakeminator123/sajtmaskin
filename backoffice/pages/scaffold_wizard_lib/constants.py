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



PAGE_NAME = "Guide: ny scaffold eller variant (AI)"



_STEPS = (
    "1. Välj mall i Blob",
    "2. Persona-analys",
    "3. Granska utkast",
    "4. Validera & skapa",
)
