from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from backoffice.shared import (
    BackofficeContext,
    _escape_ts_string,
    backup_tree,
    read_json,
    read_text,
    write_json,
    write_text,
)

from .constants import BUILD_INTENT_OPTIONS
from .formatting import _unique_preserving_order

from .variants import _prune_variant_embeddings, _neutral_variant_payload

from .scaffold_text import (
    _scaffold_dir,
    _files_dir,
    _scaffold_export_name,
    _render_manifest_ts,
    _upsert_scaffold_union_entry,
    _normalize_scaffold_union_semicolon,
    _types_path,
    _registry_path,
    _embedding_locale_path,
    _remove_locale_block,
    _variant_schema_path,
)


def _normalize_allowed_build_intents(values: list[str]) -> list[str]:
    """Validate and normalize the manifest/client projection intent contract."""
    normalized = _unique_preserving_order(
        [str(value).strip() for value in values if str(value).strip()]
    )
    if not normalized:
        raise ValueError("allowedBuildIntents måste innehålla minst ett värde.")
    invalid = [value for value in normalized if value not in BUILD_INTENT_OPTIONS]
    if invalid:
        raise ValueError(
            "allowedBuildIntents innehåller ogiltiga värden: "
            + ", ".join(f"`{value}`" for value in invalid)
            + ". Tillåtna värden är: "
            + ", ".join(f"`{value}`" for value in BUILD_INTENT_OPTIONS)
            + "."
        )
    return normalized


def _inline_ts_string_array(values: list[str]) -> str:
    return "[" + ", ".join(f'"{_escape_ts_string(value)}"' for value in values) + "]"


def _scaffold_projection_conflicts(
    *,
    scaffold_id: str,
    types_text: str,
    registry_text: str,
    locale_text: str,
) -> list[str]:
    """Return stale projections that make a create operation unsafe."""
    escaped_id = re.escape(scaffold_id)
    export_name = _scaffold_export_name(scaffold_id)
    conflicts: list[str] = []
    if re.search(
        rf'^\s*\|\s*"{escaped_id}"\s*;?\s*$', types_text, flags=re.MULTILINE
    ):
        conflicts.append("ScaffoldId")
    if re.search(rf'\bid:\s*"{escaped_id}"', types_text):
        conflicts.append("SCAFFOLD_CLIENT_LIST")
    if (
        re.search(rf'from\s+"\./{escaped_id}/manifest"', registry_text)
        or re.search(rf"\b{re.escape(export_name)}\b", registry_text)
    ):
        conflicts.append("registry.ts")
    if re.search(rf'"{escaped_id}"\s*:', locale_text):
        conflicts.append("scaffold-embedding-locale.ts")
    return conflicts


def _insert_client_list_entry_text(text: str, client_entry: str) -> str:
    """Insert one row into the exact SCAFFOLD_CLIENT_LIST array or fail closed."""
    start_pattern = re.compile(
        r"export const SCAFFOLD_CLIENT_LIST:\s*ReadonlyArray<.*?>\s*=\s*\[\r?\n",
        flags=re.DOTALL,
    )
    starts = list(start_pattern.finditer(text))
    if len(starts) != 1:
        raise ValueError(
            "Kunde inte hitta exakt en SCAFFOLD_CLIENT_LIST i types.ts. "
            "Ingen fil ändrades."
        )
    end_match = re.compile(
        r"^\s*\](?:\s+as const)?;\s*$", flags=re.MULTILINE
    ).search(text, starts[0].end())
    if end_match is None or end_match.group(0).strip() != "] as const;":
        raise ValueError(
            "Kunde inte hitta exakt ett giltigt SCAFFOLD_CLIENT_LIST-slut i types.ts. "
            "Ingen fil ändrades."
        )
    return (
        text[: end_match.start()]
        + client_entry
        + text[end_match.start() :]
    )


def _update_client_list_allowed_build_intents_text(
    text: str,
    scaffold_id: str,
    allowed_build_intents: list[str],
) -> str:
    """Update one existing SCAFFOLD_CLIENT_LIST row or fail before writing."""
    intents = _normalize_allowed_build_intents(allowed_build_intents)
    pattern = re.compile(
        rf'^(?P<prefix>\s*\{{\s*id:\s*"{re.escape(scaffold_id)}"\s*,.*?'
        rf'allowedBuildIntents:\s*)\[[^\]]*\](?P<suffix>\s*\}},\s*)$',
        flags=re.MULTILINE,
    )
    updated, count = pattern.subn(
        lambda match: (
            f"{match.group('prefix')}{_inline_ts_string_array(intents)}"
            f"{match.group('suffix')}"
        ),
        text,
    )
    if count != 1:
        raise ValueError(
            "Kunde inte hitta exakt en SCAFFOLD_CLIENT_LIST-post för "
            f"`{scaffold_id}` i types.ts. Ingen fil ändrades."
        )
    return updated



def _update_types_for_created_scaffold(
    ctx: BackofficeContext,
    *,
    scaffold_id: str,
    label: str,
    description: str,
    allowed_build_intents: list[str],
) -> None:
    intents = _normalize_allowed_build_intents(allowed_build_intents)
    path = _types_path(ctx)
    text = read_text(path)
    conflicts = _scaffold_projection_conflicts(
        scaffold_id=scaffold_id,
        types_text=text,
        registry_text="",
        locale_text="",
    )
    if conflicts:
        raise ValueError(
            f"Scaffold `{scaffold_id}` finns redan i "
            + ", ".join(conflicts)
            + ". Ingen fil ändrades."
        )
    updated = _upsert_scaffold_union_entry(text, scaffold_id)
    client_entry = (
        f'  {{ id: "{_escape_ts_string(scaffold_id)}", '
        f'label: "{_escape_ts_string(label)}", '
        f'description: "{_escape_ts_string(description)}", '
        f'allowedBuildIntents: {_inline_ts_string_array(intents)} }},\n'
    )
    updated = _insert_client_list_entry_text(updated, client_entry)
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
    allowed_build_intents = _normalize_allowed_build_intents(allowed_build_intents)
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

    projection_conflicts = _scaffold_projection_conflicts(
        scaffold_id=scaffold_id,
        types_text=originals[_types_path(ctx)],
        registry_text=originals[_registry_path(ctx)],
        locale_text=originals[_embedding_locale_path(ctx)],
    )
    if projection_conflicts:
        raise ValueError(
            f"Scaffold `{scaffold_id}` har kvar en projektion i "
            + ", ".join(projection_conflicts)
            + ". Rensa den gamla projektionen innan scaffolden skapas. Ingen fil ändrades."
        )
    _insert_client_list_entry_text(originals[_types_path(ctx)], "")

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
            allowed_build_intents=allowed_build_intents,
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
    except Exception as error:
        rollback_errors: list[str] = []
        for path, original in originals.items():
            try:
                write_text(path, original)
            except Exception as rollback_error:
                rollback_errors.append(f"restore {path}: {rollback_error}")
        if variant_dir.is_dir():
            try:
                shutil.rmtree(variant_dir)
            except Exception as rollback_error:
                rollback_errors.append(f"remove {variant_dir}: {rollback_error}")
        if scaffold_dir.is_dir():
            try:
                shutil.rmtree(scaffold_dir)
            except Exception as rollback_error:
                rollback_errors.append(f"remove {scaffold_dir}: {rollback_error}")
        if rollback_errors:
            raise RuntimeError(
                f"Scaffold-skapandet misslyckades ({error}). "
                "Rollbacken fick dessutom fel: "
                + "; ".join(rollback_errors)
            ) from error
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
