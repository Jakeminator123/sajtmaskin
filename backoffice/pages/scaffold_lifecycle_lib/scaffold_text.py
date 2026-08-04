from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    _escape_ts_string,
    backup_file,
    backup_tree,
    confirm_by_typing,
    danger_zone,
    field_label,
    get_all_manifests,
    nav_link_button,
    read_json,
    read_text,
    render_building_blocks_nav,
    render_save_scope,
    tech_details,
    validate_json_against_schema,
    write_json,
    write_text,
)
from backoffice.shared import extract_ts_string_array_field as _extract_ts_string_array_field
from backoffice.shared import extract_ts_string_field as _extract_ts_string_field


from .constants import (
    PAGE_NAME,
    THEME_TOKEN_KEYS,
    SITE_KIND_OPTIONS,
    COMPLEXITY_OPTIONS,
    BUILD_INTENT_OPTIONS,
    _SIG_MIN_LAYOUTS,
    _SIG_MIN_MOTIFS,
    _SIG_MIN_ANTI,
    _POST_ACTION_NOTE_KEY,
    _REBUILD_EMBEDDINGS_HINT,
    BLOB_MANIFEST_REL,
    BASELINE_TAG,
    BASELINE_PATHS,
)

from .formatting import (
    _unique_preserving_order,
    _normalize_lines,
    _slugify,
    _format_string_list,
    _format_font_pairings,
    _parse_font_pairings,
    _format_theme_tokens,
    _parse_theme_tokens,
)



def _source_defaults_from_manifest(manifest_path: Path) -> dict[str, Any]:
    text = read_text(manifest_path)
    return {
        "label": _extract_ts_string_field(text, "label"),
        "description": _extract_ts_string_field(text, "description"),
        "siteKind": _extract_ts_string_field(text, "siteKind"),
        "complexity": _extract_ts_string_field(text, "complexity"),
        "structureProfile": _extract_ts_string_field(text, "structureProfile"),
        "contentProfile": _extract_ts_string_field(text, "contentProfile"),
        "features": _extract_ts_string_array_field(text, "features"),
        "allowedBuildIntents": _extract_ts_string_array_field(text, "allowedBuildIntents"),
        "tags": _extract_ts_string_array_field(text, "tags"),
        "promptHints": _extract_ts_string_array_field(text, "promptHints"),
        "qualityChecklist": _extract_ts_string_array_field(text, "qualityChecklist"),
        "upgradeTargets": _extract_ts_string_array_field(text, "upgradeTargets"),
    }





def _render_ts_string_array(values: list[str], *, indent: str = "  ") -> str:
    if not values:
        return "[]"
    inner_indent = f"{indent}  "
    lines = [f'{inner_indent}"{_escape_ts_string(value)}",' for value in values]
    return "[\n" + "\n".join(lines) + f"\n{indent}]"




def _scaffold_dir(ctx: BackofficeContext, scaffold_id: str) -> Path:
    return ctx.scaffolds_dir / scaffold_id




def _manifest_path(ctx: BackofficeContext, scaffold_id: str) -> Path:
    return _scaffold_dir(ctx, scaffold_id) / "manifest.ts"




def _files_dir(ctx: BackofficeContext, scaffold_id: str) -> Path:
    return _scaffold_dir(ctx, scaffold_id) / "files"




def _scaffold_export_name(scaffold_id: str) -> str:
    parts = [part for part in scaffold_id.split("-") if part]
    if not parts:
        raise ValueError("scaffold_id must not be empty")
    base = parts[0] + "".join(part.capitalize() for part in parts[1:])
    return f"{base}Manifest"




def _default_prompt_hints(label: str) -> list[str]:
    return [
        f"Preserve the {label} scaffold shell while adapting content, routes, and terminology to the user's domain.",
        "Keep the starter shape coherent and extend it deliberately instead of scattering unrelated sections.",
    ]




def _default_quality_checklist(label: str) -> list[str]:
    return [
        f"Keep the {label} scaffold structurally coherent and easy to extend safely.",
        "Preserve App Router basics, layout continuity, and reusable section rhythm.",
        "Final output should feel purposeful for the requested domain rather than like a renamed starter.",
    ]




def _default_upgrade_targets(label: str) -> list[str]:
    return [
        f"Richer domain-specific patterns for {label}",
        "Better reusable route and section coverage",
    ]




def _render_manifest_ts(
    *,
    scaffold_id: str,
    label: str,
    description: str,
    site_kind: str,
    complexity: str,
    structure_profile: str,
    content_profile: str,
    features: list[str],
    allowed_build_intents: list[str],
    tags: list[str],
    prompt_hints: list[str],
    quality_checklist: list[str],
    upgrade_targets: list[str],
) -> str:
    export_name = _scaffold_export_name(scaffold_id)
    lines = [
        'import type { ScaffoldManifest } from "../types";',
        'import { loadScaffoldFiles } from "../load-scaffold-files";',
        "",
        f"export const {export_name}: ScaffoldManifest = {{",
        f'  id: "{_escape_ts_string(scaffold_id)}",',
        f'  label: "{_escape_ts_string(label)}",',
        "  description:",
        f'    "{_escape_ts_string(description)}",',
    ]
    if site_kind:
        lines.append(f'  siteKind: "{_escape_ts_string(site_kind)}",')
    if complexity:
        lines.append(f'  complexity: "{_escape_ts_string(complexity)}",')
    if structure_profile:
        lines.append(f'  structureProfile: "{_escape_ts_string(structure_profile)}",')
    if content_profile:
        lines.append(f'  contentProfile: "{_escape_ts_string(content_profile)}",')
    if features:
        lines.append(f"  features: {_render_ts_string_array(features)},")
    lines.append(f"  allowedBuildIntents: {_render_ts_string_array(allowed_build_intents)},")
    lines.append(f"  tags: {_render_ts_string_array(tags)},")
    lines.append(f"  promptHints: {_render_ts_string_array(prompt_hints)},")
    lines.append(f"  qualityChecklist: {_render_ts_string_array(quality_checklist)},")
    lines.extend(
        [
            "  research: {",
            f"    upgradeTargets: {_render_ts_string_array(upgrade_targets, indent='    ')},",
            "    referenceTemplates: [],",
            "  },",
            f'  files: loadScaffoldFiles("{_escape_ts_string(scaffold_id)}"),',
            "};",
            "",
        ]
    )
    return "\n".join(lines)




def _upsert_scaffold_union_entry(text: str, scaffold_id: str) -> str:
    if f'"{scaffold_id}"' in text:
        return text
    marker = "\n\nexport type ScaffoldMode ="
    idx = text.find(marker)
    if idx < 0:
        raise ValueError("Could not locate ScaffoldId union terminator in types.ts.")
    prefix = text[:idx].rstrip()
    if prefix.endswith(";"):
        prefix = prefix[:-1]
    prefix = prefix + f'\n  | "{_escape_ts_string(scaffold_id)}";'
    return prefix + text[idx:]




def _normalize_scaffold_union_semicolon(text: str) -> str:
    marker = "\n\nexport type ScaffoldMode ="
    idx = text.find(marker)
    if idx < 0:
        return text
    prefix = text[:idx].rstrip()
    if not prefix.endswith(";"):
        prefix = prefix + ";"
    return prefix + text[idx:]




def _types_path(ctx: BackofficeContext) -> Path:
    return ctx.scaffolds_dir / "types.ts"




def _registry_path(ctx: BackofficeContext) -> Path:
    return ctx.scaffolds_dir / "registry.ts"




def _embedding_locale_path(ctx: BackofficeContext) -> Path:
    return ctx.scaffolds_dir / "scaffold-embedding-locale.ts"




def _remove_locale_block(text: str, scaffold_id: str) -> str:
    lines = text.splitlines(keepends=True)
    key_pattern = re.compile(rf'^\s*(?:"{re.escape(scaffold_id)}"|{re.escape(scaffold_id)}):\s*\{{\s*$')
    start = None
    end = None
    depth = 0
    for idx, line in enumerate(lines):
        if start is None and key_pattern.match(line):
            start = idx
            depth = line.count("{") - line.count("}")
            continue
        if start is not None:
            depth += line.count("{") - line.count("}")
            if depth <= 0:
                end = idx
                break
    if start is None or end is None:
        return text
    del lines[start : end + 1]
    return "".join(lines)




def _variant_schema_path(ctx: BackofficeContext) -> Path:
    return ctx.repo_root / "docs" / "schemas" / "strict" / "scaffold-variant.schema.json"
