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




def _lines(values: Any) -> str:
    if isinstance(values, list):
        return "\n".join(str(v).strip() for v in values if str(v).strip())
    return ""




def _font_lines(values: Any) -> str:
    if not isinstance(values, list):
        return ""
    rows = []
    for entry in values:
        if isinstance(entry, dict) and entry.get("heading") and entry.get("body"):
            rows.append(f"{entry['heading']} | {entry['body']}")
    return "\n".join(rows)




def _token_lines(tokens: Any) -> str:
    if not isinstance(tokens, dict):
        return ""
    return "\n".join(f"{key} = {value}" for key, value in tokens.items() if str(value).strip())
