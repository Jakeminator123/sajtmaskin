from __future__ import annotations

import json
import re
import shutil
import tempfile
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
from . import client_projection

from .variants import (
    _prune_variant_embeddings,
    _neutral_variant_payload,
    _validate_variant_payload,
    _variant_integrity_errors,
)

from .scaffold_text import (
    _scaffold_dir,
    _files_dir,
    _scaffold_export_name,
    _render_manifest_ts,
    _upsert_scaffold_union_entry,
    _normalize_scaffold_union_semicolon,
    _types_path,
    _client_list_path,
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
    if (
        re.search(rf'from\s+"\./{escaped_id}/manifest"', registry_text)
        or re.search(rf"\b{re.escape(export_name)}\b", registry_text)
    ):
        conflicts.append("registry.ts")
    if re.search(rf'"{escaped_id}"\s*:', locale_text):
        conflicts.append("scaffold-embedding-locale.ts")
    return conflicts


def _update_types_for_created_scaffold(
    ctx: BackofficeContext,
    *,
    scaffold_id: str,
    allowed_build_intents: list[str],
) -> None:
    _normalize_allowed_build_intents(allowed_build_intents)
    types_path = _types_path(ctx)
    types_text = read_text(types_path)
    conflicts = _scaffold_projection_conflicts(
        scaffold_id=scaffold_id,
        types_text=types_text,
        registry_text="",
        locale_text="",
    )
    if conflicts:
        raise ValueError(
            f"Scaffold `{scaffold_id}` finns redan i "
            + ", ".join(conflicts)
            + ". Ingen fil ändrades."
        )
    updated_types = _upsert_scaffold_union_entry(types_text, scaffold_id)
    if updated_types != types_text:
        write_text(types_path, updated_types)




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




@client_projection.scaffold_mutation_locked
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
    starter_variant_payload: dict[str, Any] | None = None,
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
    if starter_variant_payload is not None and not create_start_variant:
        raise ValueError("En angiven startvariant måste skapas i samma transaktion.")

    # Rollback is byte-preserving. A text snapshot would normalize CRLF/BOM on
    # Windows and leave a diff even though the logical content was restored.
    originals: dict[Path, bytes | None] = {
        _types_path(ctx): _types_path(ctx).read_bytes(),
        _registry_path(ctx): _registry_path(ctx).read_bytes(),
        _embedding_locale_path(ctx): _embedding_locale_path(ctx).read_bytes(),
    }
    client_list_path = _client_list_path(ctx)
    originals[client_list_path] = (
        client_list_path.read_bytes() if client_list_path.is_file() else None
    )
    schema_path = _variant_schema_path(ctx)
    if schema_path.is_file():
        originals[schema_path] = schema_path.read_bytes()

    projection_conflicts = _scaffold_projection_conflicts(
        scaffold_id=scaffold_id,
        types_text=(originals[_types_path(ctx)] or b"").decode("utf-8"),
        registry_text=(originals[_registry_path(ctx)] or b"").decode("utf-8"),
        locale_text=(originals[_embedding_locale_path(ctx)] or b"").decode("utf-8"),
    )
    if projection_conflicts:
        raise ValueError(
            f"Scaffold `{scaffold_id}` har kvar en projektion i "
            + ", ".join(projection_conflicts)
            + ". Rensa den gamla projektionen innan scaffolden skapas. Ingen fil ändrades."
        )
    created_scaffold_dir = False
    created_variant_dir = False
    try:
        scaffold_dir.mkdir(parents=True, exist_ok=False)
        created_scaffold_dir = True
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
            starter_payload = (
                dict(starter_variant_payload)
                if starter_variant_payload is not None
                else _neutral_variant_payload(
                    ctx,
                    scaffold_id=scaffold_id,
                    label=label,
                    description=description,
                    tags=tags,
                )
            )
            if str(starter_payload.get("scaffoldId", "")).strip() != scaffold_id:
                raise ValueError(
                    "Startvariantens `scaffoldId` måste matcha scaffolden som skapas."
                )
            starter_errors = _validate_variant_payload(ctx, starter_payload)
            # Wizard starters omit signaturePatterns until post-create
            # `scaffolds:variant-patterns`. Neutral auto-starters already ship
            # curated patterns, so keep that gate fail-closed for them.
            starter_errors.extend(
                _variant_integrity_errors(
                    ctx,
                    starter_payload,
                    sibling_defaults=[],
                    require_signature_patterns=starter_variant_payload is None,
                )
            )
            if starter_errors:
                raise ValueError(
                    "Startvarianten klarar inte integritetsgrinden:\n- "
                    + "\n- ".join(starter_errors)
                )
            starter_variant_id = str(starter_payload.get("id", "")).strip()
            if not starter_variant_id:
                raise ValueError("Startvarianten saknar `id`.")
            variant_dir.mkdir(parents=True, exist_ok=False)
            created_variant_dir = True
            write_json(
                variant_dir / f"{starter_variant_id}.json",
                starter_payload,
            )
        client_projection.regenerate_scaffold_client_projection(ctx.repo_root)
    except Exception as error:
        rollback_errors: list[str] = []
        cleanup_retries: list[tuple[Path, str]] = []

        if created_variant_dir:
            try:
                shutil.rmtree(variant_dir)
            except Exception:
                cleanup_retries.append((variant_dir, "variantmappen"))

        for path, original in reversed(list(originals.items())):
            try:
                if original is None:
                    if path.exists():
                        path.unlink()
                else:
                    path.write_bytes(original)
            except Exception as rollback_error:
                rollback_errors.append(f"{path}: {rollback_error}")

        if created_scaffold_dir:
            try:
                shutil.rmtree(scaffold_dir)
            except Exception:
                cleanup_retries.append((scaffold_dir, "scaffoldmappen"))

        # A transient Windows file lock must not strand one of the owned dirs.
        # Retry failed cleanup only after every other rollback target was tried.
        for directory, label_name in cleanup_retries:
            if not directory.exists():
                continue
            try:
                shutil.rmtree(directory)
            except Exception as rollback_error:
                rollback_errors.append(f"{label_name}: {rollback_error}")

        if rollback_errors:
            error.add_note(
                "Rollback blev ofullständig efter originalfelet: "
                + "; ".join(rollback_errors)
            )
        raise




def _remove_exact_union_member_text(text: str, scaffold_id: str) -> str:
    marker = re.search(r"\r?\n\r?\nexport type ScaffoldMode\s*=", text)
    if marker is None:
        raise ValueError("Kunde inte hitta ScaffoldId-unionens slut i types.ts.")
    union_end = marker.start()
    union_starts = list(
        re.finditer(r"^export type ScaffoldId\s*=", text[:union_end], flags=re.MULTILINE)
    )
    if len(union_starts) != 1:
        raise ValueError("Kunde inte hitta exakt en ScaffoldId-union i types.ts.")
    member_pattern = re.compile(
        rf'^\s*\|\s*"{re.escape(_escape_ts_string(scaffold_id))}"\s*;?\s*\r?\n?',
        flags=re.MULTILINE,
    )
    union_start = union_starts[0].start()
    union_text = text[union_start:union_end]
    matches = list(member_pattern.finditer(union_text))
    if len(matches) != 1:
        raise ValueError(
            f"Scaffold `{scaffold_id}` måste finnas exakt en gång i ScaffoldId-unionen. "
            "Ingen fil eller mapp ändrades."
        )
    match = matches[0]
    updated_union = union_text[: match.start()] + union_text[match.end() :]
    return _normalize_scaffold_union_semicolon(
        text[:union_start] + updated_union + text[union_end:]
    )


def _remove_exact_registry_projection_text(text: str, scaffold_id: str) -> str:
    escaped_id = re.escape(_escape_ts_string(scaffold_id))
    import_pattern = re.compile(
        rf'^import\s+\{{\s*(?P<alias>\w+)\s*\}}\s+from\s+"\./{escaped_id}/manifest";\r?\n',
        flags=re.MULTILINE,
    )
    imports = list(import_pattern.finditer(text))
    if len(imports) != 1:
        raise ValueError(
            f"Scaffold `{scaffold_id}` måste ha exakt en manifest-import i registry.ts. "
            "Ingen fil eller mapp ändrades."
        )
    alias = imports[0].group("alias")
    registry_blocks = list(
        re.finditer(
            r"const BASE_SCAFFOLDS(?:\s*:\s*[^=]+)?\s*=\s*\[(?P<body>.*?)^\];",
            text,
            flags=re.DOTALL | re.MULTILINE,
        )
    )
    if len(registry_blocks) != 1:
        raise ValueError(
            "Kunde inte hitta exakt en BASE_SCAFFOLDS-lista i registry.ts. "
            "Ingen fil eller mapp ändrades."
        )
    block = registry_blocks[0]
    alias_pattern = re.compile(
        rf"^\s*{re.escape(alias)},\s*\r?\n?", flags=re.MULTILINE
    )
    alias_rows = list(alias_pattern.finditer(block.group("body")))
    if len(alias_rows) != 1:
        raise ValueError(
            f"Scaffold `{scaffold_id}` måste finnas exakt en gång i BASE_SCAFFOLDS. "
            "Ingen fil eller mapp ändrades."
        )
    import_match = imports[0]
    without_import = text[: import_match.start()] + text[import_match.end() :]
    return alias_pattern.sub("", without_import, count=1)


def _remove_exact_locale_projection_text(text: str, scaffold_id: str) -> str:
    key_pattern = re.compile(
        rf'^\s*(?:"{re.escape(_escape_ts_string(scaffold_id))}"|'
        rf"{re.escape(scaffold_id)}):\s*\{{\s*\r?$",
        flags=re.MULTILINE,
    )
    if len(list(key_pattern.finditer(text))) != 1:
        raise ValueError(
            f"Scaffold `{scaffold_id}` måste ha exakt en locale-post. "
            "Ingen fil eller mapp ändrades."
        )
    updated = _remove_locale_block(text, scaffold_id)
    if updated == text:
        raise ValueError(
            f"Locale-posten för scaffold `{scaffold_id}` är malformed. "
            "Ingen fil eller mapp ändrades."
        )
    return updated


def _remove_exact_schema_projection_text(text: str, scaffold_id: str) -> str:
    anchor_matches = list(re.finditer(r'^\s*"scaffoldId"\s*:\s*\{', text, re.MULTILINE))
    if len(anchor_matches) != 1:
        raise ValueError(
            "Kunde inte hitta exakt ett scaffoldId-schema. Ingen fil eller mapp ändrades."
        )
    enum_start = text.find('"enum": [', anchor_matches[0].end())
    enum_end = text.find("]", enum_start)
    if enum_start < 0 or enum_end < 0:
        raise ValueError(
            "Kunde inte hitta scaffoldId-enumen. Ingen fil eller mapp ändrades."
        )
    block = text[enum_start:enum_end]
    entry_pattern = re.compile(
        rf'^\s*"{re.escape(_escape_ts_string(scaffold_id))}"\s*,?\s*\r?\n?',
        flags=re.MULTILINE,
    )
    entries = list(entry_pattern.finditer(block))
    if len(entries) != 1:
        raise ValueError(
            f"Scaffold `{scaffold_id}` måste finnas exakt en gång i scaffoldId-enumen. "
            "Ingen fil eller mapp ändrades."
        )
    entry = entries[0]
    updated_block = block[: entry.start()] + block[entry.end() :]
    updated_block = re.sub(r",(\s*)$", r"\1", updated_block)
    updated = text[:enum_start] + updated_block + text[enum_end:]
    try:
        json.loads(updated)
    except json.JSONDecodeError as error:
        raise ValueError(
            "Scaffold-schemat blev ogiltigt under delete-preflight. "
            "Ingen fil eller mapp ändrades."
        ) from error
    return updated


def _remove_research_entry_text(text: str, scaffold_id: str) -> str:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError(
            "Scaffold research-filen är inte giltig JSON. Ingen fil eller mapp ändrades."
        ) from error
    if not isinstance(payload, dict) or not isinstance(payload.get("scaffolds"), dict):
        raise ValueError(
            "Scaffold research-filen måste innehålla ett `scaffolds`-objekt. "
            "Ingen fil eller mapp ändrades."
        )
    # Newly created scaffolds legitimately have no legacy research snapshot,
    # so a missing exact key is a validated no-op rather than a delete blocker.
    if scaffold_id not in payload["scaffolds"]:
        return text
    payload["scaffolds"].pop(scaffold_id)
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def _plan_scaffold_delete_file_updates(
    ctx: BackofficeContext, scaffold_id: str
) -> tuple[dict[Path, bytes], dict[Path, str]]:
    paths = (
        _types_path(ctx),
        _registry_path(ctx),
        _embedding_locale_path(ctx),
        _variant_schema_path(ctx),
        ctx.research_json,
    )
    missing = [path for path in paths if not path.is_file()]
    if missing:
        raise ValueError(
            "Delete-preflight saknar ägarfiler: "
            + ", ".join(path.relative_to(ctx.repo_root).as_posix() for path in missing)
            + ". Ingen fil eller mapp ändrades."
        )
    originals = {path: path.read_bytes() for path in paths}
    texts = {path: original.decode("utf-8") for path, original in originals.items()}
    updates = {
        paths[0]: _remove_exact_union_member_text(texts[paths[0]], scaffold_id),
        paths[1]: _remove_exact_registry_projection_text(texts[paths[1]], scaffold_id),
        paths[2]: _remove_exact_locale_projection_text(texts[paths[2]], scaffold_id),
        paths[3]: _remove_exact_schema_projection_text(texts[paths[3]], scaffold_id),
        paths[4]: _remove_research_entry_text(texts[paths[4]], scaffold_id),
    }
    return originals, updates




def _scan_manual_code_references(ctx: BackofficeContext, scaffold_id: str) -> list[dict[str, Any]]:
    ignored = {
        _types_path(ctx).resolve(),
        _client_list_path(ctx).resolve(),
        _registry_path(ctx).resolve(),
        _embedding_locale_path(ctx).resolve(),
    }
    results: list[dict[str, Any]] = []
    for root in (ctx.repo_root / "src", ctx.repo_root / "scripts", ctx.repo_root / "backoffice"):
        if not root.exists():
            continue
        for pattern in ("*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.py"):
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
    client_list_present = False
    client_list_status = "ok"
    try:
        client_list_text = read_text(_client_list_path(ctx))
        client_list_present = f'id: "{scaffold_id}"' in client_list_text
    except FileNotFoundError:
        client_list_status = "missing"
    except (OSError, UnicodeError):
        client_list_status = "unreadable"
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
        "clientListPresent": client_list_present,
        "clientListStatus": client_list_status,
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




@client_projection.scaffold_mutation_locked
def _delete_scaffold(
    ctx: BackofficeContext, scaffold_id: str, *, snapshot: bool = True
) -> None:
    variant_dir = ctx.variants_dir / scaffold_id
    scaffold_dir = ctx.scaffolds_dir / scaffold_id

    # Every owned projection is parsed and transformed in memory before the
    # first directory or file is touched. A stale/malformed projection must not
    # turn a delete into an unrecoverable half-delete.
    planned_originals, updates = _plan_scaffold_delete_file_updates(ctx, scaffold_id)
    originals: dict[Path, bytes | None] = dict(planned_originals)
    client_list_path = _client_list_path(ctx)
    originals[client_list_path] = (
        client_list_path.read_bytes() if client_list_path.is_file() else None
    )

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

    with tempfile.TemporaryDirectory(prefix="sajtmaskin-scaffold-delete-") as temp_raw:
        temp_root = Path(temp_raw)
        directory_backups: list[tuple[Path, Path]] = []
        for label, directory in (
            ("variant", variant_dir),
            ("scaffold", scaffold_dir),
        ):
            if directory.is_dir():
                backup = temp_root / label
                shutil.copytree(directory, backup)
                directory_backups.append((directory, backup))

        try:
            if variant_dir.is_dir():
                shutil.rmtree(variant_dir)
            if scaffold_dir.is_dir():
                shutil.rmtree(scaffold_dir)
            for path, updated in updates.items():
                if planned_originals[path] != updated.encode("utf-8"):
                    write_text(path, updated)
            client_projection.regenerate_scaffold_client_projection(ctx.repo_root)
        except Exception as error:
            rollback_errors: list[str] = []
            for path, original in reversed(list(originals.items())):
                try:
                    if original is None:
                        if path.exists():
                            path.unlink()
                    else:
                        path.write_bytes(original)
                except Exception as rollback_error:
                    rollback_errors.append(f"{path}: {rollback_error}")
            for directory, backup in directory_backups:
                try:
                    if directory.exists():
                        shutil.rmtree(directory)
                    shutil.copytree(backup, directory)
                except Exception as rollback_error:
                    rollback_errors.append(f"{directory}: {rollback_error}")
            if rollback_errors:
                error.add_note(
                    "Delete-rollback blev ofullständig efter originalfelet: "
                    + "; ".join(rollback_errors)
                )
            raise

    _clean_generated_scaffold_artifacts(ctx, scaffold_id)
    # Prune the deleted scaffold's variant-embeddings entries too, otherwise the
    # integrity gate (variant-integrity.test.ts) fails on stale index rows.
    try:
        _prune_variant_embeddings(ctx, scaffold_id)
    except Exception:
        # This cache/prune helper is explicitly best-effort and must not turn a
        # committed repo transaction into an apparent failed delete.
        pass
