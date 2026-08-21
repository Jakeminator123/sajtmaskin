from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from backoffice.shared import (
    BackofficeContext,
    _escape_ts_string,
    read_text,
)
from backoffice.shared import extract_ts_string_array_field as _extract_ts_string_array_field
from backoffice.shared import extract_ts_string_field as _extract_ts_string_field


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
            "  },",
            # Empty route contract by design: validateScaffoldManifest requires the
            # field, and the link-vs-contract gate then forces curation of any
            # links cloned in from the source scaffold's files/.
            "  routeContract: {",
            "    requiredRoutes: [],",
            "    optionalRoutes: [],",
            "    declaredRoutePaths: [],",
            "    dynamicRoutePatterns: [],",
            "  },",
            f'  files: loadScaffoldFiles("{_escape_ts_string(scaffold_id)}"),',
            "};",
            "",
        ]
    )
    return "\n".join(lines)




def _upsert_scaffold_union_entry(text: str, scaffold_id: str) -> str:
    marker = re.search(r"\r?\n\r?\nexport type ScaffoldMode\s*=", text)
    if marker is None:
        raise ValueError("Could not locate ScaffoldId union terminator in types.ts.")
    idx = marker.start()
    union_start_matches = list(
        re.finditer(r"^export type ScaffoldId\s*=", text[:idx], flags=re.MULTILINE)
    )
    if len(union_start_matches) != 1:
        raise ValueError("Could not locate exactly one ScaffoldId union in types.ts.")
    union_text = text[union_start_matches[0].start() : idx]
    member_pattern = re.compile(
        rf'^\s*\|\s*"{re.escape(_escape_ts_string(scaffold_id))}"\s*;?\s*$',
        flags=re.MULTILINE,
    )
    if member_pattern.search(union_text):
        return text
    prefix = text[:idx].rstrip()
    if prefix.endswith(";"):
        prefix = prefix[:-1]
    prefix = prefix + f'\n  | "{_escape_ts_string(scaffold_id)}";'
    return prefix + text[idx:]




def _normalize_scaffold_union_semicolon(text: str) -> str:
    marker = re.search(r"\r?\n\r?\nexport type ScaffoldMode\s*=", text)
    if marker is None:
        return text
    idx = marker.start()
    prefix = text[:idx].rstrip()
    if not prefix.endswith(";"):
        prefix = prefix + ";"
    return prefix + text[idx:]




def _types_path(ctx: BackofficeContext) -> Path:
    return ctx.scaffolds_dir / "types.ts"




def _client_list_path(ctx: BackofficeContext) -> Path:
    return ctx.scaffolds_dir / "scaffold-client-list.generated.ts"




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
