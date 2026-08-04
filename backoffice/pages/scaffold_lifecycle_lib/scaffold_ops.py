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
    _normalize_lines,
    _slugify,
    _format_string_list,
    _format_font_pairings,
    _parse_font_pairings,
    _format_theme_tokens,
    _parse_theme_tokens,
    _unique_preserving_order,
)

from .variants import (
    _variant_payload,
    _dead_source_template_ids,
    _dead_source_template_ids_message,
    _validate_variant_payload,
    _signature_patterns_ok,
    _sibling_default_variant_ids,
    _variant_integrity_errors,
    _variant_embeddings_index_path,
    _prune_variant_embeddings,
    _load_variants,
    _variants_by_scaffold,
    _load_inspiration_lookup,
    _count_runtime_dossiers,
    _neutral_starter_signature_patterns,
    _neutral_variant_payload,
)

from .scaffold_text import (
    _source_defaults_from_manifest,
    _render_ts_string_array,
    _scaffold_dir,
    _manifest_path,
    _files_dir,
    _scaffold_export_name,
    _default_prompt_hints,
    _default_quality_checklist,
    _default_upgrade_targets,
    _render_manifest_ts,
    _upsert_scaffold_union_entry,
    _normalize_scaffold_union_semicolon,
    _types_path,
    _registry_path,
    _embedding_locale_path,
    _remove_locale_block,
    _variant_schema_path,
)



def _update_types_for_created_scaffold(
    ctx: BackofficeContext,
    *,
    scaffold_id: str,
    label: str,
    description: str,
) -> None:
    path = _types_path(ctx)
    text = read_text(path)
    updated = _upsert_scaffold_union_entry(text, scaffold_id)
    client_entry = (
        f'  {{ id: "{_escape_ts_string(scaffold_id)}", '
        f'label: "{_escape_ts_string(label)}", '
        f'description: "{_escape_ts_string(description)}" }},\n'
    )
    if f'id: "{scaffold_id}"' not in updated:
        updated = updated.replace("] as const;", f"{client_entry}] as const;", 1)
    if updated != text:
        write_text(path, updated)




def _update_registry_for_created_scaffold(ctx: BackofficeContext, scaffold_id: str) -> None:
    path = _registry_path(ctx)
    text = read_text(path)
    export_name = _scaffold_export_name(scaffold_id)
    import_line = f'import {{ {export_name} }} from "./{scaffold_id}/manifest";\n'
    updated = text
    if import_line not in updated:
        marker = 'import { getScaffoldResearchOverrides } from "./scaffold-research";\n'
        if marker not in updated:
            raise ValueError("Could not locate import insertion point in registry.ts.")
        updated = updated.replace(marker, import_line + marker, 1)
    if re.search(rf"^\s*{re.escape(export_name)},$", updated, flags=re.MULTILINE) is None:
        updated = updated.replace("];", f"  {export_name},\n];", 1)
    if updated != text:
        write_text(path, updated)




def _update_embedding_locale_for_created_scaffold(
    ctx: BackofficeContext,
    *,
    scaffold_id: str,
    label: str,
    description: str,
    tags: list[str],
) -> None:
    path = _embedding_locale_path(ctx)
    text = read_text(path)
    if f'"{scaffold_id}"' in text or f"{scaffold_id}:" in text:
        return
    keywords = _unique_preserving_order(
        tags
        + scaffold_id.split("-")
        + [word.lower() for word in re.findall(r"[a-z0-9]+", label.lower())]
        + ["scaffold", "startpunkt", "grundstruktur"]
    )
    entry = "\n".join(
        [
            f'  "{_escape_ts_string(scaffold_id)}": {{',
            f'    labelSv: "{_escape_ts_string(label)}",',
            "    descriptionSv:",
            f'      "{_escape_ts_string(f"{description} Skapad som ny runtime-scaffold och kan vidarekureras med egna matcher-, research- och variantval.")}",',
            "    keywordsSv: [",
            *[f'      "{_escape_ts_string(keyword)}",' for keyword in keywords[:10]],
            "    ],",
            "  },",
        ]
    )
    marker = "export const SCAFFOLD_EMBEDDING_LOCALE: Record<ScaffoldId, ScaffoldEmbeddingLocale> = {"
    start = text.find(marker)
    if start < 0:
        raise ValueError("Could not locate SCAFFOLD_EMBEDDING_LOCALE in scaffold-embedding-locale.ts.")
    body_end = text.find("\n};", start)
    if body_end < 0:
        raise ValueError("Could not locate end of SCAFFOLD_EMBEDDING_LOCALE.")
    updated = text[: body_end + 1] + entry + "\n" + text[body_end + 1 :]
    if updated != text:
        write_text(path, updated)




def _update_variant_schema_enum(ctx: BackofficeContext, scaffold_id: str, *, add: bool) -> None:
    """Keep the strict variant schema's ``scaffoldId`` enum in sync when a
    scaffold is created/deleted. Without this, variants of a new scaffold fail
    schema validation (both in backoffice validate-on-save and in
    ``test_validate_matching_config``) even though the scaffold is valid.

    Uses a targeted text edit (not full JSON re-serialization) so the rest of
    the schema file keeps its committed formatting.
    """
    path = _variant_schema_path(ctx)
    if not path.is_file():
        return
    text = read_text(path)
    anchor = text.find('"scaffoldId": {')
    if anchor < 0:
        return
    enum_start = text.find('"enum": [', anchor)
    enum_end = text.find("]", enum_start)
    if enum_start < 0 or enum_end < 0:
        return
    block = text[enum_start:enum_end]
    entry = f'"{scaffold_id}"'

    if add:
        if entry in block:
            return
        trimmed = block.rstrip()
        updated_block = f"{trimmed},\n        {entry}\n      "
    else:
        if entry not in block:
            return
        lines = [line for line in block.split("\n") if entry not in line]
        updated_block = re.sub(r",(\s*)$", r"\1", "\n".join(lines))

    write_text(path, text[:enum_start] + updated_block + text[enum_end:])




def _create_scaffold(
    ctx: BackofficeContext,
    *,
    source_scaffold_id: str,
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
    create_start_variant: bool,
) -> None:
    scaffold_dir = _scaffold_dir(ctx, scaffold_id)
    variant_dir = ctx.variants_dir / scaffold_id
    if scaffold_dir.exists():
        raise ValueError(f"Scaffold `{scaffold_id}` finns redan.")
    if variant_dir.exists():
        raise ValueError(f"Variantmappen för `{scaffold_id}` finns redan.")

    source_files_dir = _files_dir(ctx, source_scaffold_id)
    if not source_files_dir.is_dir():
        raise ValueError(f"Källscaffolden `{source_scaffold_id}` saknar `files/`.")

    originals = {
        _types_path(ctx): read_text(_types_path(ctx)),
        _registry_path(ctx): read_text(_registry_path(ctx)),
        _embedding_locale_path(ctx): read_text(_embedding_locale_path(ctx)),
    }
    schema_path = _variant_schema_path(ctx)
    if schema_path.is_file():
        originals[schema_path] = read_text(schema_path)

    try:
        scaffold_dir.mkdir(parents=True, exist_ok=False)
        shutil.copytree(source_files_dir, scaffold_dir / "files")
        write_text(
            scaffold_dir / "manifest.ts",
            _render_manifest_ts(
                scaffold_id=scaffold_id,
                label=label,
                description=description,
                site_kind=site_kind,
                complexity=complexity,
                structure_profile=structure_profile,
                content_profile=content_profile,
                features=features,
                allowed_build_intents=allowed_build_intents,
                tags=tags,
                prompt_hints=prompt_hints,
                quality_checklist=quality_checklist,
                upgrade_targets=upgrade_targets,
            ),
        )

        _update_types_for_created_scaffold(
            ctx,
            scaffold_id=scaffold_id,
            label=label,
            description=description,
        )
        _update_registry_for_created_scaffold(ctx, scaffold_id)
        _update_embedding_locale_for_created_scaffold(
            ctx,
            scaffold_id=scaffold_id,
            label=label,
            description=description,
            tags=tags,
        )
        _update_variant_schema_enum(ctx, scaffold_id, add=True)

        if create_start_variant:
            variant_dir.mkdir(parents=True, exist_ok=False)
            write_json(
                variant_dir / "neutral-core.json",
                _neutral_variant_payload(
                    ctx,
                    scaffold_id=scaffold_id,
                    label=label,
                    description=description,
                    tags=tags,
                ),
            )
    except Exception:
        for path, original in originals.items():
            write_text(path, original)
        if variant_dir.is_dir():
            shutil.rmtree(variant_dir)
        if scaffold_dir.is_dir():
            shutil.rmtree(scaffold_dir)
        raise




def _update_types_for_deleted_scaffold(ctx: BackofficeContext, scaffold_id: str) -> None:
    path = _types_path(ctx)
    text = read_text(path)
    updated = re.sub(
        rf'^\s*\|\s*"{re.escape(scaffold_id)}";?\n',
        "",
        text,
        count=1,
        flags=re.MULTILINE,
    )
    updated = re.sub(
        rf'^\s*\{{ id: "{re.escape(scaffold_id)}".*?\}},\n',
        "",
        updated,
        count=1,
        flags=re.MULTILINE,
    )
    updated = _normalize_scaffold_union_semicolon(updated)
    if updated != text:
        write_text(path, updated)




def _update_registry_for_deleted_scaffold(ctx: BackofficeContext, scaffold_id: str) -> None:
    path = _registry_path(ctx)
    text = read_text(path)
    match = re.search(
        rf'^import \{{ (?P<alias>\w+) \}} from "\./{re.escape(scaffold_id)}/manifest";\n',
        text,
        flags=re.MULTILINE,
    )
    updated = text
    alias = match.group("alias") if match else None
    if match:
        updated = updated[: match.start()] + updated[match.end() :]
    if alias:
        updated = re.sub(
            rf"^\s*{re.escape(alias)},\n",
            "",
            updated,
            count=1,
            flags=re.MULTILINE,
        )
    if updated != text:
        write_text(path, updated)




def _update_embedding_locale_for_deleted_scaffold(ctx: BackofficeContext, scaffold_id: str) -> None:
    path = _embedding_locale_path(ctx)
    text = read_text(path)
    updated = _remove_locale_block(text, scaffold_id)
    if updated != text:
        write_text(path, updated)




def _scan_manual_code_references(ctx: BackofficeContext, scaffold_id: str) -> list[dict[str, Any]]:
    ignored = {
        _types_path(ctx).resolve(),
        _registry_path(ctx).resolve(),
        _embedding_locale_path(ctx).resolve(),
    }
    results: list[dict[str, Any]] = []
    for root in (ctx.repo_root / "src", ctx.repo_root / "scripts", ctx.repo_root / "backoffice"):
        if not root.exists():
            continue
        for pattern in ("*.ts", "*.tsx", "*.py"):
            for file_path in sorted(root.rglob(pattern)):
                resolved = file_path.resolve()
                if resolved in ignored:
                    continue
                if file_path.parent.name == scaffold_id:
                    continue
                try:
                    lines = file_path.read_text(encoding="utf-8").splitlines()
                except OSError:
                    continue
                hits = [idx for idx, line in enumerate(lines, start=1) if scaffold_id in line]
                if hits:
                    results.append(
                        {
                            "path": file_path.relative_to(ctx.repo_root).as_posix(),
                            "lines": hits[:5],
                            "count": len(hits),
                        }
                    )
    return results




def _scan_scaffold_dependencies(
    ctx: BackofficeContext,
    scaffold_id: str,
    variants: list[dict[str, Any]],
) -> dict[str, Any]:
    variant_dir = ctx.variants_dir / scaffold_id
    scaffold_dir = ctx.scaffolds_dir / scaffold_id
    reference_hits = []
    for variant in variants:
        if str(variant.get("scaffoldId", "")).strip() == scaffold_id:
            continue
        reference_ids = [
            str(value).strip()
            for value in (variant.get("referenceScaffoldIds") or [])
            if str(value).strip()
        ]
        if scaffold_id in reference_ids:
            path = variant.get("_path")
            reference_hits.append(
                {
                    "variantId": variant.get("id", ""),
                    "scaffoldId": variant.get("scaffoldId", ""),
                    "path": path.relative_to(ctx.repo_root).as_posix()
                    if isinstance(path, Path)
                    else "",
                }
            )

    research_entry_present = False
    if ctx.research_json.is_file():
        try:
            payload = read_json(ctx.research_json)
            research_entry_present = (
                isinstance(payload, dict)
                and isinstance(payload.get("scaffolds"), dict)
                and scaffold_id in payload.get("scaffolds", {})
            )
        except Exception:
            research_entry_present = False

    embeddings_entry_present = False
    if ctx.embeddings_json.is_file():
        try:
            payload = read_json(ctx.embeddings_json)
            embeddings_entry_present = any(
                isinstance(entry, dict) and entry.get("id") == scaffold_id
                for entry in (payload.get("embeddings") if isinstance(payload, dict) else [])
            )
        except Exception:
            embeddings_entry_present = False

    types_text = read_text(_types_path(ctx))
    registry_text = read_text(_registry_path(ctx))
    locale_text = read_text(_embedding_locale_path(ctx))

    registry_import_match = re.search(
        rf'^import \{{ (?P<alias>\w+) \}} from "\./{re.escape(scaffold_id)}/manifest";$',
        registry_text,
        flags=re.MULTILINE,
    )
    registry_alias = registry_import_match.group("alias") if registry_import_match else None

    return {
        "variantFiles": sorted(path.relative_to(ctx.repo_root).as_posix() for path in variant_dir.glob("*.json"))
        if variant_dir.is_dir()
        else [],
        "scaffoldDirExists": scaffold_dir.is_dir(),
        "referenceHits": reference_hits,
        "typesUnionPresent": f'"{scaffold_id}"' in types_text,
        "clientListPresent": f'id: "{scaffold_id}"' in types_text,
        "registryImportPresent": bool(registry_import_match),
        "registryArrayPresent": bool(
            registry_alias
            and re.search(rf"^\s*{re.escape(registry_alias)},$", registry_text, flags=re.MULTILINE)
        ),
        "embeddingLocalePresent": f'"{scaffold_id}"' in locale_text or f"{scaffold_id}:" in locale_text,
        "researchEntryPresent": research_entry_present,
        "embeddingsEntryPresent": embeddings_entry_present,
        "manualCodeReferences": _scan_manual_code_references(ctx, scaffold_id),
    }




def _clean_generated_scaffold_artifacts(ctx: BackofficeContext, scaffold_id: str) -> None:
    if ctx.research_json.is_file():
        try:
            payload = read_json(ctx.research_json)
            if isinstance(payload, dict) and isinstance(payload.get("scaffolds"), dict):
                if scaffold_id in payload["scaffolds"]:
                    payload["scaffolds"].pop(scaffold_id, None)
                    write_json(ctx.research_json, payload)
        except Exception:
            pass

    if ctx.embeddings_json.is_file():
        try:
            payload = read_json(ctx.embeddings_json)
            if isinstance(payload, dict) and isinstance(payload.get("embeddings"), list):
                original = payload.get("embeddings", [])
                filtered = [
                    entry
                    for entry in original
                    if not (isinstance(entry, dict) and entry.get("id") == scaffold_id)
                ]
                if len(filtered) != len(original):
                    payload["embeddings"] = filtered
                    write_json(ctx.embeddings_json, payload)
        except Exception:
            pass




def _delete_scaffold(
    ctx: BackofficeContext, scaffold_id: str, *, snapshot: bool = True
) -> None:
    variant_dir = ctx.variants_dir / scaffold_id
    scaffold_dir = ctx.scaffolds_dir / scaffold_id

    # Fail-closed: ta zip-snapshots (Återställning) FÖRE någon radering.
    # Misslyckas en snapshot avbryts hela raderingen utan att röra disken.
    # `snapshot=False` används vid rollback av en NYSS skapad scaffold (t.ex.
    # Scaffold Wizard när variant-skrivningen failar): tidigare tillstånd är
    # "fanns inte", så en undo-snapshot är meningslös och får inte blockera
    # städningen eller maskera ursprungsfelet.
    if snapshot:
        for directory in (variant_dir, scaffold_dir):
            if directory.is_dir() and backup_tree(directory, ctx.repo_root) is None:
                raise RuntimeError(
                    f"Kunde inte ta zip-snapshot av `{directory}` — "
                    "avbröt raderingen, inget togs bort."
                )
    if variant_dir.is_dir():
        shutil.rmtree(variant_dir)
    if scaffold_dir.is_dir():
        shutil.rmtree(scaffold_dir)

    _update_types_for_deleted_scaffold(ctx, scaffold_id)
    _update_registry_for_deleted_scaffold(ctx, scaffold_id)
    _update_embedding_locale_for_deleted_scaffold(ctx, scaffold_id)
    _update_variant_schema_enum(ctx, scaffold_id, add=False)
    _clean_generated_scaffold_artifacts(ctx, scaffold_id)
    # Prune the deleted scaffold's variant-embeddings entries too, otherwise the
    # integrity gate (variant-integrity.test.ts) fails on stale index rows.
    _prune_variant_embeddings(ctx, scaffold_id)
