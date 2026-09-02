from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import streamlit as st

from .shared_lib.backup import (
    BACKUP_DIR_PARTS,
    MAX_BACKUPS_PER_FILE,
    backup_file,
    backup_root,
    backup_tree,
    list_backup_files,
    list_backup_trees,
    list_snapshots_for,
    list_tree_snapshots_for,
    restore_backup,
    restore_tree,
)
from .shared_lib.context import (
    BackofficeContext,
    build_backoffice_context,
    ensure_utf8_stdio,
    find_repo_root,
)
from .shared_lib.danger import confirm_by_typing, danger_zone
from .shared_lib.data_loaders import (
    find_workload,
    load_fault_fix_csv,
    read_autofix_runtime_config,
)
from .shared_lib.docs import (
    first_sentence,
    read_doc_section,
    read_markdown_table_cell,
)
from .shared_lib.domain_map import load_domain_map
from .shared_lib.env_flags import read_env_flag, resolve_metrics_endpoint, write_env_flag
from .shared_lib.fields import FIELD_LABELS, field_label
from .shared_lib.io import read_json, read_text, write_json, write_text
from .shared_lib.models import (
    AVAILABLE_PHASE_MODELS,
    BUILD_PROFILE_ORDER,
    DEFAULT_PHASE_THINKING_BY_TIER,
    MODEL_LABELS,
    TIER_LABELS_SV,
    PHASE_LABELS,
    PHASE_ORDER,
    PHASE_ROUTED_WORKLOADS,
    PHASE_TOKEN_BUDGET_NOTES,
    REASONING_EFFORT_OPTIONS,
    REASONING_MODE_OPTIONS,
    ROUTE_LOCAL_WORKLOAD_MODELS,
    build_profile_defaults,
    describe_workload_model_resolution,
    human_model_label,
    phase_model_display_label,
    phase_routing_defaults,
    phase_thinking_defaults,
    phase_token_budget_entry,
    resolve_phase_models_for_dashboard,
    summarize_tier_models,
    write_phase_thinking,
)
from .shared_lib.prompt_dumps import (
    PROMPT_DUMP_SPECS,
    collect_prompt_dump_statuses,
    load_latest_prompt_size_metrics,
)
from .shared_lib.routes import ROUTE_TIMEOUT_DISPLAY, read_route_maxduration_literals
from .shared_lib.subprocess_helpers import resolve_command, run_repo_command
from .shared_lib.ts_parsing import (
    _escape_ts_string,
    extract_ts_string_array_field,
    extract_ts_string_field,
    extract_ts_union_values,
    get_all_manifests,
    normalize_nonempty_lines,
    parse_manifest_ts,
    parse_ts_default_model_id,
    unescape_ts_string,
)
from .shared_lib.ui import (
    BUILDING_BLOCK_CHAIN,
    MODE_BADGES,
    SAVE_SCOPE_MESSAGES,
    SAVE_SCOPE_PATHS,
    STATIC_REFERENCE_BADGE,
    nav_link_button,
    render_building_blocks_nav,
    render_save_scope,
    render_static_reference,
    render_where_panel,
    tech_details,
)
from .shared_lib.validation import validate_json_against_schema, validate_manifest_or_error

# Modulen har ingen egen kod — den ÄR fasaden mot ``shared_lib/`` efter den
# mekaniska splitten. ``__all__`` deklarerar därför att varje import ovan är en
# avsiktlig re-export, så `npm run lint:py` slutar rapportera dem som oanvända.
#
# Listan är den frysta ytan från före splitten, låst av
# ``test_shared_facade_contract.py`` — inklusive stdlib-namn (``os``, ``json``,
# ``pd``, ``st`` …) som gamla sidor och operatörssnuttar kan ha importerat
# härifrån. Den är alltså ett kompatibilitetslöfte, inte ett kurerat API; att
# banta den kräver att man går igenom alla importörer först.
__all__ = [
    "AVAILABLE_PHASE_MODELS",
    "Any",
    "BACKUP_DIR_PARTS",
    "BUILDING_BLOCK_CHAIN",
    "BUILD_PROFILE_ORDER",
    "BackofficeContext",
    "DEFAULT_PHASE_THINKING_BY_TIER",
    "FIELD_LABELS",
    "MAX_BACKUPS_PER_FILE",
    "MODEL_LABELS",
    "MODE_BADGES",
    "PHASE_LABELS",
    "PHASE_ORDER",
    "PHASE_ROUTED_WORKLOADS",
    "PHASE_TOKEN_BUDGET_NOTES",
    "PROMPT_DUMP_SPECS",
    "Path",
    "REASONING_EFFORT_OPTIONS",
    "REASONING_MODE_OPTIONS",
    "ROUTE_LOCAL_WORKLOAD_MODELS",
    "ROUTE_TIMEOUT_DISPLAY",
    "SAVE_SCOPE_MESSAGES",
    "SAVE_SCOPE_PATHS",
    "STATIC_REFERENCE_BADGE",
    "TIER_LABELS_SV",
    "_escape_ts_string",
    "backup_file",
    "backup_root",
    "backup_tree",
    "build_backoffice_context",
    "build_profile_defaults",
    "collect_prompt_dump_statuses",
    "confirm_by_typing",
    "danger_zone",
    "dataclass",
    "datetime",
    "describe_workload_model_resolution",
    "ensure_utf8_stdio",
    "extract_ts_string_array_field",
    "extract_ts_string_field",
    "extract_ts_union_values",
    "field_label",
    "find_repo_root",
    "find_workload",
    "first_sentence",
    "get_all_manifests",
    "human_model_label",
    "importlib",
    "json",
    "list_backup_files",
    "list_backup_trees",
    "list_snapshots_for",
    "list_tree_snapshots_for",
    "load_domain_map",
    "load_fault_fix_csv",
    "load_latest_prompt_size_metrics",
    "nav_link_button",
    "normalize_nonempty_lines",
    "os",
    "parse_manifest_ts",
    "parse_ts_default_model_id",
    "pd",
    "phase_model_display_label",
    "phase_routing_defaults",
    "phase_thinking_defaults",
    "phase_token_budget_entry",
    "re",
    "read_autofix_runtime_config",
    "read_doc_section",
    "read_env_flag",
    "read_json",
    "read_markdown_table_cell",
    "read_route_maxduration_literals",
    "read_text",
    "render_building_blocks_nav",
    "render_save_scope",
    "render_static_reference",
    "render_where_panel",
    "resolve_command",
    "resolve_metrics_endpoint",
    "resolve_phase_models_for_dashboard",
    "restore_backup",
    "restore_tree",
    "run_repo_command",
    "shutil",
    "st",
    "subprocess",
    "summarize_tier_models",
    "sys",
    "tech_details",
    "time",
    "timezone",
    "unescape_ts_string",
    "urlparse",
    "validate_json_against_schema",
    "validate_manifest_or_error",
    "write_env_flag",
    "write_json",
    "write_phase_thinking",
    "write_text",
]
