"""Compatibility contract for the split ``backoffice.shared`` facade."""

from __future__ import annotations

import unittest
from typing import Any, get_type_hints

from backoffice import shared


# Frozen from master@eb7b1cc before the mechanical split.  Keeping the whole
# surface avoids silently breaking old pages, scripts or operator snippets that
# still import through the canonical ``backoffice.shared`` module.
EXPECTED_PUBLIC_NAMES = {
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
    "annotations",
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
}


class SharedFacadeContractTests(unittest.TestCase):
    def test_public_surface_matches_pre_split_module(self) -> None:
        actual = {name for name in dir(shared) if not name.startswith("_")}
        self.assertEqual(actual, EXPECTED_PUBLIC_NAMES)

    def test_all_matches_the_frozen_surface(self) -> None:
        """``__all__`` finns för lintern (`npm run lint:py`) och får inte glida.

        Glider den blir konsekvensen tyst: ruff börjar rapportera riktiga
        re-exporter som oanvända, och den som "städar" dem bryter fasaden.
        ``annotations`` hör inte i ``__all__`` (``__future__``-import), medan
        ``_escape_ts_string`` måste med — den är privat men re-exporteras.
        """
        expected = (EXPECTED_PUBLIC_NAMES - {"annotations"}) | {"_escape_ts_string"}
        self.assertEqual(set(shared.__all__), expected)

    def test_compat_private_export_used_by_scaffold_lifecycle_remains(self) -> None:
        self.assertTrue(callable(shared._escape_ts_string))

    def test_moved_annotations_resolve_at_runtime(self) -> None:
        hints = get_type_hints(shared.load_domain_map)
        self.assertEqual(hints, {"path_str": str, "return": dict[str, Any]})


if __name__ == "__main__":
    unittest.main()
