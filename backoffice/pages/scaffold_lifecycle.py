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
    get_all_manifests,
    read_json,
    read_text,
    render_where_panel,
    validate_json_against_schema,
    write_json,
    write_text,
)

THEME_TOKEN_KEYS = (
    "background",
    "foreground",
    "card",
    "cardForeground",
    "primary",
    "primaryForeground",
    "secondary",
    "secondaryForeground",
    "muted",
    "mutedForeground",
    "accent",
    "accentForeground",
    "border",
    "ring",
    "radius",
    "bodyBackgroundImage",
)

SITE_KIND_OPTIONS = ("marketing", "app", "commerce", "editorial")
COMPLEXITY_OPTIONS = ("simple", "medium", "advanced")
BUILD_INTENT_OPTIONS = ("website", "app", "template")


def _normalize_lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return slug.strip("-")


def _format_string_list(values: Any) -> str:
    if not isinstance(values, list):
        return ""
    return "\n".join(str(value).strip() for value in values if str(value).strip())


def _format_font_pairings(values: Any) -> str:
    if not isinstance(values, list):
        return ""
    lines: list[str] = []
    for entry in values:
        if not isinstance(entry, dict):
            continue
        heading = str(entry.get("heading", "")).strip()
        body = str(entry.get("body", "")).strip()
        if heading and body:
            lines.append(f"{heading} | {body}")
    return "\n".join(lines)


def _parse_font_pairings(value: str) -> list[dict[str, str]]:
    pairings: list[dict[str, str]] = []
    for idx, line in enumerate(_normalize_lines(value), start=1):
        if "|" not in line:
            raise ValueError(f"Font pairings row {idx} must use `Heading | Body`.")
        heading, body = [part.strip() for part in line.split("|", 1)]
        if not heading or not body:
            raise ValueError(f"Font pairings row {idx} needs both heading and body.")
        pairings.append({"heading": heading, "body": body})
    return pairings


def _format_theme_tokens(tokens: Any) -> str:
    if not isinstance(tokens, dict):
        return ""
    lines: list[str] = []
    for key in THEME_TOKEN_KEYS:
        value = str(tokens.get(key, "")).strip()
        if value:
            lines.append(f"{key} = {value}")
    for key, raw_value in tokens.items():
        if key in THEME_TOKEN_KEYS:
            continue
        value = str(raw_value).strip()
        if value:
            lines.append(f"{key} = {value}")
    return "\n".join(lines)


def _parse_theme_tokens(value: str) -> dict[str, str]:
    tokens: dict[str, str] = {}
    for idx, line in enumerate(_normalize_lines(value), start=1):
        if "=" in line:
            key, raw_value = [part.strip() for part in line.split("=", 1)]
        elif ":" in line:
            key, raw_value = [part.strip() for part in line.split(":", 1)]
        else:
            raise ValueError(f"Theme token row {idx} must use `token = value`.")
        if not key or not raw_value:
            raise ValueError(f"Theme token row {idx} must have both key and value.")
        tokens[key] = raw_value
    return tokens


def _variant_payload(
    *,
    existing: dict[str, Any] | None,
    scaffold_id: str,
    variant_id: str,
    label: str,
    description: str,
    signature_motif: str,
    color_mode: str,
    default_variant: bool,
    keywords_text: str,
    font_pairings_text: str,
    prompt_hints_text: str,
    theme_tokens_text: str,
    style_rules_text: str,
    section_inventory_text: str,
    avoid_patterns_text: str,
    world_class_text: str,
    source_template_ids_text: str,
    reference_scaffold_ids_text: str,
) -> dict[str, Any]:
    payload = {
        key: value
        for key, value in (existing or {}).items()
        if not str(key).startswith("_")
    }

    payload["id"] = variant_id
    payload["scaffoldId"] = scaffold_id
    payload["label"] = label
    payload["signatureMotif"] = signature_motif
    payload["colorMode"] = color_mode
    payload["keywords"] = _normalize_lines(keywords_text)
    payload["fontPairings"] = _parse_font_pairings(font_pairings_text)
    payload["promptHints"] = _normalize_lines(prompt_hints_text)
    payload["default"] = default_variant

    if description.strip():
        payload["description"] = description.strip()
    else:
        payload.pop("description", None)

    theme_tokens = _parse_theme_tokens(theme_tokens_text)
    if theme_tokens:
        payload["themeTokens"] = theme_tokens
    else:
        payload.pop("themeTokens", None)

    for key, raw_value in (
        ("styleRules", style_rules_text),
        ("sectionInventory", section_inventory_text),
        ("avoidPatterns", avoid_patterns_text),
        ("worldClassRubric", world_class_text),
        ("sourceTemplateIds", source_template_ids_text),
        ("referenceScaffoldIds", reference_scaffold_ids_text),
    ):
        values = _normalize_lines(raw_value)
        if values:
            payload[key] = values
        else:
            payload.pop(key, None)

    return payload


def _validate_variant_payload(ctx: BackofficeContext, payload: dict[str, Any]) -> list[str]:
    """Validate a variant payload against the strict scaffold-variant schema.

    Mirrors the validate-on-save guard used by the manifest editors: returns a
    list of human-readable error strings (empty == safe to write). The
    scaffold-variant create/edit forms call this before ``write_json`` so a
    schema-breaking edit is blocked with ``st.error`` instead of corrupting the
    matching config.
    """
    schema_path = (
        ctx.repo_root / "docs" / "schemas" / "strict" / "scaffold-variant.schema.json"
    )
    return validate_json_against_schema(payload, schema_path)


def _load_variants(ctx: BackofficeContext) -> list[dict[str, Any]]:
    variants: list[dict[str, Any]] = []
    if not ctx.variants_dir.is_dir():
        return variants

    for scaffold_dir in sorted(ctx.variants_dir.iterdir(), key=lambda entry: entry.name):
        if not scaffold_dir.is_dir():
            continue
        for variant_path in sorted(scaffold_dir.glob("*.json"), key=lambda entry: entry.name):
            try:
                payload = read_json(variant_path)
                if not isinstance(payload, dict):
                    raise ValueError("Variant file must contain a JSON object.")
                payload["_path"] = variant_path
                variants.append(payload)
            except Exception as error:
                variants.append(
                    {
                        "_path": variant_path,
                        "_error": str(error),
                        "id": variant_path.stem,
                        "scaffoldId": scaffold_dir.name,
                        "label": variant_path.stem,
                    }
                )
    variants.sort(
        key=lambda entry: (
            str(entry.get("scaffoldId", "")),
            str(entry.get("label", entry.get("id", ""))).lower(),
        )
    )
    return variants


def _variants_by_scaffold(variants: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for variant in variants:
        scaffold_id = str(variant.get("scaffoldId", "")).strip()
        if not scaffold_id:
            continue
        grouped.setdefault(scaffold_id, []).append(variant)
    return grouped


BLOB_MANIFEST_REL = "src/lib/templates/template-blob-manifest.json"


def _load_inspiration_lookup(
    ctx: BackofficeContext,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Resolve variants' ``sourceTemplateIds`` against the **canonical
    inspiration sources**:

    1. The committed Blob manifest (``template-blob-manifest.json``) — v0-mallar
       som ligger i Vercel Blob. Detta är den aktiva källan; Scaffold Wizard
       skriver Blob-id:n hit.
    2. The legacy external-template catalog
       (``data/external-template-pipeline/reference-library/catalog.json``) om
       den råkar finnas lokalt (gitignorerad, avvecklad pipeline). Gamla id:n
       som bara fanns där visas som *legacy-referens* — de är ofarliga
       inspirationsetiketter, inte brutna runtime-länkar.

    NOTE: Ingen av källorna är runtime-dossiers (``data/dossiers/{hard,soft}``).
    """
    lookup: dict[str, dict[str, Any]] = {}
    sources: list[str] = []

    blob_path = ctx.repo_root / BLOB_MANIFEST_REL
    if blob_path.is_file():
        try:
            payload = read_json(blob_path)
            templates = payload.get("templates") if isinstance(payload, dict) else None
            if isinstance(templates, list):
                for entry in templates:
                    if not isinstance(entry, dict):
                        continue
                    entry_id = str(entry.get("id", "")).strip()
                    if not entry_id:
                        continue
                    lookup[entry_id] = {
                        "title": entry.get("title", entry_id),
                        "categorySlug": entry.get("category", ""),
                        "qualityScore": "",
                        "_source": "blob",
                    }
                if lookup:
                    sources.append(BLOB_MANIFEST_REL)
        except Exception:
            pass

    legacy_path = ctx.catalog_json
    if legacy_path.is_file():
        try:
            payload = read_json(legacy_path)
            entries = payload.get("entries") if isinstance(payload, dict) else None
            if isinstance(entries, list):
                added_legacy = False
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    entry_id = str(entry.get("id", "")).strip()
                    if not entry_id or entry_id in lookup:
                        continue
                    lookup[entry_id] = {**entry, "_source": "katalog (legacy)"}
                    added_legacy = True
                if added_legacy:
                    sources.append(legacy_path.relative_to(ctx.repo_root).as_posix())
        except Exception:
            pass

    return lookup, sources


def _count_runtime_dossiers(ctx: BackofficeContext) -> dict[str, int]:
    """Count runtime dossier directories under ``data/dossiers/{hard,soft}``.

    Used purely for backoffice display so the operator can see at a glance
    that runtime dossiers are a different population than the template
    catalog referenced by variant ``sourceTemplateIds``.
    """
    base = ctx.repo_root / "data" / "dossiers"
    counts = {"hard": 0, "soft": 0}
    for class_name in counts:
        class_dir = base / class_name
        if not class_dir.is_dir():
            continue
        counts[class_name] = sum(
            1
            for entry in class_dir.iterdir()
            if entry.is_dir() and not entry.name.startswith("_")
        )
    return counts


def _unescape_ts_string(value: str) -> str:
    return value.replace('\\"', '"').replace("\\\\", "\\")


def _extract_ts_string_field(text: str, field: str) -> str:
    match = re.search(rf'{field}:\s*\n?\s*"([^"]*(?:\\.[^"]*)*)"', text)
    return _unescape_ts_string(match.group(1)).strip() if match else ""


def _extract_ts_string_array_field(text: str, field: str) -> list[str]:
    match = re.search(rf"{field}:\s*\[(.*?)\]", text, re.DOTALL)
    if not match:
        return []
    return [
        _unescape_ts_string(value)
        for value in re.findall(r'"([^"]*(?:\\.[^"]*)*)"', match.group(1))
        if _unescape_ts_string(value).strip()
    ]


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


def _unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw_value in values:
        value = raw_value.strip()
        if not value:
            continue
        lower = value.lower()
        if lower in seen:
            continue
        seen.add(lower)
        result.append(value)
    return result


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


def _neutral_variant_payload(
    ctx: BackofficeContext,
    *,
    scaffold_id: str,
    label: str,
    description: str,
    tags: list[str],
) -> dict[str, Any]:
    template_path = ctx.variants_dir / "base-nextjs" / "starter-neutral.json"
    base_payload: dict[str, Any] = {}
    if template_path.is_file():
        try:
            loaded = read_json(template_path)
            if isinstance(loaded, dict):
                base_payload = loaded
        except Exception:
            base_payload = {}

    keywords = _unique_preserving_order(
        tags
        + scaffold_id.split("-")
        + [word.lower() for word in re.findall(r"[a-z0-9]+", label.lower())]
        + ["neutral", "starter", "core"]
    )

    payload = {
        key: value
        for key, value in base_payload.items()
        if key
        in {
            "fontPairings",
            "themeTokens",
            "styleRules",
            "sectionInventory",
            "avoidPatterns",
            "worldClassRubric",
        }
    }
    payload.update(
        {
            "id": "neutral-core",
            "scaffoldId": scaffold_id,
            "label": f"{label} Neutral",
            "description": f"Neutral starter variant for {label}. {description}".strip(),
            "keywords": keywords[:10],
            "fontPairings": payload.get("fontPairings") or [{"heading": "Geist", "body": "Geist"}],
            "signatureMotif": "neutral starter clarity, safe extension patterns, and adaptable structure",
            "colorMode": "either",
            "promptHints": [
                f"Keep {label} flexible and extension-friendly when the prompt is underspecified.",
                "Preserve structural clarity first, then adapt the expression to the user's actual domain.",
            ],
            "sourceTemplateIds": [],
            "default": True,
        }
    )
    payload.pop("referenceScaffoldIds", None)
    return payload


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


def _render_tree_view(
    ctx: BackofficeContext,
    manifests: list[dict[str, Any]],
    variants_by_scaffold: dict[str, list[dict[str, Any]]],
    inspiration_lookup: dict[str, dict[str, Any]],
    inspiration_sources: list[str],
    runtime_dossier_counts: dict[str, int],
) -> None:
    total_links = sum(
        len(variant.get("sourceTemplateIds", []) or [])
        for variants in variants_by_scaffold.values()
        for variant in variants
        if isinstance(variant, dict)
    )
    unresolved_links = sorted(
        {
            template_id
            for variants in variants_by_scaffold.values()
            for variant in variants
            for template_id in (variant.get("sourceTemplateIds", []) or [])
            if template_id not in inspiration_lookup
        }
    )

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Scaffolds", len(manifests))
    c2.metric("Varianter", sum(len(variants) for variants in variants_by_scaffold.values()))
    c3.metric("Inspirationsreferenser (sourceTemplateIds)", total_links)
    c4.metric("Oupplösta referenser", len(unresolved_links))

    runtime_total = runtime_dossier_counts.get("hard", 0) + runtime_dossier_counts.get("soft", 0)
    st.caption(
        "**Inspirationsreferenser ≠ runtime dossiers.** Variantens `sourceTemplateIds` är "
        "inspirationsetiketter som slås upp mot Blob-manifestet "
        f"(`{BLOB_MANIFEST_REL}`, v0-mallarna i Vercel Blob). Oupplösta id:n är oftast "
        "kvarvarande etiketter från den avvecklade legacy-katalogen — ofarliga, inget "
        "injiceras från dem. Runtime-dossiers under `data/dossiers/{hard,soft}/` är en "
        f"separat pool: {runtime_total} dossiers "
        f"(hard={runtime_dossier_counts.get('hard', 0)}, soft={runtime_dossier_counts.get('soft', 0)}). "
        "Se `Dossiers` i backoffice för runtime-poolen."
    )

    if inspiration_sources:
        st.caption(
            "Referensmetadata laddas från: "
            + ", ".join(f"`{source}`" for source in inspiration_sources)
        )

    overview_rows = []
    for manifest in manifests:
        scaffold_id = str(manifest.get("id", "")).strip()
        variants = variants_by_scaffold.get(scaffold_id, [])
        linked_ids = [
            template_id
            for variant in variants
            for template_id in (variant.get("sourceTemplateIds", []) or [])
        ]
        overview_rows.append(
            {
                "scaffold": scaffold_id,
                "label": manifest.get("label", ""),
                "variants": len(variants),
                "referenser": len(linked_ids),
                "oupplösta": sum(
                    1 for template_id in linked_ids if template_id not in inspiration_lookup
                ),
            }
        )

    if overview_rows:
        st.dataframe(pd.DataFrame(overview_rows), width="stretch", hide_index=True)

    if unresolved_links:
        with st.expander(
            f"Oupplösta sourceTemplateIds ({len(unresolved_links)}) — legacy-etiketter, ofarliga",
            expanded=False,
        ):
            st.caption(
                "Id:n som varken finns i Blob-manifestet eller i en lokal legacy-katalog. "
                "De påverkar inte runtime (bara en textrad i prompten) och kan bytas ut mot "
                "Blob-id:n via Scaffold Wizard när varianten ändå uppdateras."
            )
            for template_id in unresolved_links:
                st.markdown(f"- `{template_id}`")

    for manifest in manifests:
        scaffold_id = str(manifest.get("id", "")).strip()
        variants = variants_by_scaffold.get(scaffold_id, [])
        label = manifest.get("label", scaffold_id)
        with st.expander(f"{label} (`{scaffold_id}`) — {len(variants)} varianter", expanded=False):
            if not variants:
                st.info("Inga variant-JSON hittades för den här scaffolden.")
                continue

            for variant in variants:
                variant_id = str(variant.get("id", "")).strip()
                variant_label = str(variant.get("label", variant_id)).strip()
                keyword_count = len(variant.get("keywords", []) or [])
                source_ids = variant.get("sourceTemplateIds", []) or []
                reference_ids = variant.get("referenceScaffoldIds", []) or []
                motif = str(variant.get("signatureMotif", "")).strip()
                st.markdown(f"### {variant_label} (`{variant_id}`)")
                st.markdown(f"- `colorMode`: `{variant.get('colorMode', 'either')}`")
                st.markdown(f"- `signatureMotif`: {motif or 'saknas'}")
                st.markdown(f"- `keywords`: {keyword_count}")
                st.markdown(f"- `sourceTemplateIds`: {len(source_ids)}")
                if reference_ids:
                    st.markdown(
                        f"- `referenceScaffoldIds`: {', '.join(f'`{scaffold}`' for scaffold in reference_ids)}"
                    )

                if source_ids:
                    reference_rows = []
                    for template_id in source_ids:
                        entry = inspiration_lookup.get(template_id)
                        reference_rows.append(
                            {
                                "id": template_id,
                                "title": entry.get("title", "") if entry else "oupplöst (legacy-etikett)",
                                "category": entry.get("categorySlug", "") if entry else "",
                                "källa": entry.get("_source", "") if entry else "—",
                            }
                        )
                    st.dataframe(pd.DataFrame(reference_rows), width="stretch", hide_index=True)

                with st.expander("Visa variant-JSON", expanded=False):
                    st.json(
                        {
                            key: value
                            for key, value in variant.items()
                            if not str(key).startswith("_")
                        }
                    )


def _render_create_variant(scaffold_ids: list[str], ctx: BackofficeContext) -> None:
    if not scaffold_ids:
        st.warning("Inga scaffolds hittades. Skapa eller återställ runtime-scaffolds först.")
        return

    with st.form("create_variant_form", clear_on_submit=False):
        scaffold_id = st.selectbox("Scaffold", scaffold_ids, key="create_variant_scaffold")
        label = st.text_input("Label", key="create_variant_label")
        suggested_id = _slugify(label)
        variant_id = st.text_input(
            "Variant ID",
            value=suggested_id,
            key="create_variant_id",
            help="Kebab-case rekommenderas.",
        )
        description = st.text_area("Description", height=80, key="create_variant_description")
        signature_motif = st.text_input("Signature Motif", key="create_variant_signature_motif")
        color_mode = st.selectbox(
            "Color Mode",
            ["light", "dark", "either"],
            index=2,
            key="create_variant_color_mode",
        )
        default_variant = st.checkbox("Default variant", value=False, key="create_variant_default")
        keywords_text = st.text_area(
            "Keywords (one per line)",
            height=120,
            key="create_variant_keywords",
        )
        font_pairings_text = st.text_area(
            "Font Pairings (`Heading | Body` per line)",
            height=100,
            key="create_variant_font_pairings",
        )
        prompt_hints_text = st.text_area(
            "Prompt Hints (one per line)",
            height=100,
            key="create_variant_prompt_hints",
        )
        theme_tokens_text = st.text_area(
            "Theme Tokens (`token = value` per line)",
            height=140,
            key="create_variant_theme_tokens",
        )
        with st.expander("Advanced fields", expanded=False):
            style_rules_text = st.text_area(
                "Style Rules (one per line)",
                height=100,
                key="create_variant_style_rules",
            )
            section_inventory_text = st.text_area(
                "Section Inventory (one per line)",
                height=100,
                key="create_variant_section_inventory",
            )
            avoid_patterns_text = st.text_area(
                "Avoid Patterns (one per line)",
                height=100,
                key="create_variant_avoid_patterns",
            )
            world_class_text = st.text_area(
                "World Class Rubric (one per line)",
                height=100,
                key="create_variant_world_class",
            )
            source_template_ids_text = st.text_area(
                "Source Template IDs (one per line)",
                height=100,
                key="create_variant_source_ids",
            )
            reference_scaffold_ids_text = st.text_area(
                "Reference Scaffold IDs (one per line)",
                height=80,
                key="create_variant_reference_scaffold_ids",
            )

        submitted = st.form_submit_button("Skapa variant", type="primary")

    if not submitted:
        return

    variant_id = variant_id.strip() or suggested_id
    if not variant_id:
        st.error("Variant ID krävs.")
        return
    if not label.strip():
        st.error("Label krävs.")
        return
    if not signature_motif.strip():
        st.error("Signature Motif krävs.")
        return

    target_path = ctx.variants_dir / scaffold_id / f"{variant_id}.json"
    if target_path.exists():
        st.error(f"Det finns redan en variant på `{target_path.relative_to(ctx.repo_root).as_posix()}`.")
        return

    try:
        payload = _variant_payload(
            existing=None,
            scaffold_id=scaffold_id,
            variant_id=variant_id,
            label=label.strip(),
            description=description,
            signature_motif=signature_motif.strip(),
            color_mode=color_mode,
            default_variant=default_variant,
            keywords_text=keywords_text,
            font_pairings_text=font_pairings_text,
            prompt_hints_text=prompt_hints_text,
            theme_tokens_text=theme_tokens_text,
            style_rules_text=style_rules_text,
            section_inventory_text=section_inventory_text,
            avoid_patterns_text=avoid_patterns_text,
            world_class_text=world_class_text,
            source_template_ids_text=source_template_ids_text,
            reference_scaffold_ids_text=reference_scaffold_ids_text,
        )
    except ValueError as error:
        st.error(str(error))
        return

    errors = _validate_variant_payload(ctx, payload)
    if errors:
        st.error(
            "Varianten sparades inte – schemavalideringen misslyckades:\n\n"
            + "\n".join(f"- {message}" for message in errors)
        )
        st.stop()

    target_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(target_path, payload)
    st.success(f"Skapade `{target_path.relative_to(ctx.repo_root).as_posix()}`.")
    st.rerun()


def _render_edit_variant(
    ctx: BackofficeContext,
    scaffold_ids: list[str],
    variants_by_scaffold: dict[str, list[dict[str, Any]]],
) -> None:
    scaffold_choices = [scaffold_id for scaffold_id in scaffold_ids if variants_by_scaffold.get(scaffold_id)]
    if not scaffold_choices:
        st.info("Det finns inga varianter att redigera ännu.")
        return

    selected_scaffold = st.selectbox(
        "Scaffold",
        scaffold_choices,
        key="edit_variant_scaffold_selector",
    )
    variants = variants_by_scaffold.get(selected_scaffold, [])
    variant_labels = [f"{variant.get('label', variant.get('id', '?'))} ({variant.get('id', '?')})" for variant in variants]
    selected_label = st.selectbox(
        "Variant",
        variant_labels,
        key="edit_variant_selector",
    )
    selected_variant = variants[variant_labels.index(selected_label)]

    defaults = {
        "id": str(selected_variant.get("id", "")),
        "label": str(selected_variant.get("label", "")),
        "description": str(selected_variant.get("description", "")),
        "signatureMotif": str(selected_variant.get("signatureMotif", "")),
        "colorMode": str(selected_variant.get("colorMode", "either")),
        "default": bool(selected_variant.get("default", False)),
        "keywords": _format_string_list(selected_variant.get("keywords", [])),
        "fontPairings": _format_font_pairings(selected_variant.get("fontPairings", [])),
        "promptHints": _format_string_list(selected_variant.get("promptHints", [])),
        "themeTokens": _format_theme_tokens(selected_variant.get("themeTokens", {})),
        "styleRules": _format_string_list(selected_variant.get("styleRules", [])),
        "sectionInventory": _format_string_list(selected_variant.get("sectionInventory", [])),
        "avoidPatterns": _format_string_list(selected_variant.get("avoidPatterns", [])),
        "worldClassRubric": _format_string_list(selected_variant.get("worldClassRubric", [])),
        "sourceTemplateIds": _format_string_list(selected_variant.get("sourceTemplateIds", [])),
        "referenceScaffoldIds": _format_string_list(
            selected_variant.get("referenceScaffoldIds", [])
        ),
    }
    variant_key = f"{selected_scaffold}_{defaults['id']}"
    variant_path = selected_variant.get("_path")
    if not isinstance(variant_path, Path):
        st.error("Den valda varianten saknar filpath och kan inte sparas.")
        return

    with st.form(f"edit_variant_form_{variant_key}"):
        edited_label = st.text_input("Label", value=defaults["label"], key=f"edit_label_{variant_key}")
        edited_id = st.text_input(
            "Variant ID",
            value=defaults["id"],
            key=f"edit_id_{variant_key}",
            help="Byt bara ID om du vill skriva till en ny fil och ta bort den gamla manuellt.",
            disabled=True,
        )
        edited_description = st.text_area(
            "Description",
            value=defaults["description"],
            height=80,
            key=f"edit_description_{variant_key}",
        )
        edited_signature_motif = st.text_input(
            "Signature Motif",
            value=defaults["signatureMotif"],
            key=f"edit_signature_{variant_key}",
        )
        color_options = ["light", "dark", "either"]
        edited_color_mode = st.selectbox(
            "Color Mode",
            color_options,
            index=color_options.index(defaults["colorMode"])
            if defaults["colorMode"] in color_options
            else 2,
            key=f"edit_color_{variant_key}",
        )
        edited_default = st.checkbox(
            "Default variant",
            value=defaults["default"],
            key=f"edit_default_{variant_key}",
        )
        edited_keywords = st.text_area(
            "Keywords (one per line)",
            value=defaults["keywords"],
            height=120,
            key=f"edit_keywords_{variant_key}",
        )
        edited_font_pairings = st.text_area(
            "Font Pairings (`Heading | Body` per line)",
            value=defaults["fontPairings"],
            height=100,
            key=f"edit_fonts_{variant_key}",
        )
        edited_prompt_hints = st.text_area(
            "Prompt Hints (one per line)",
            value=defaults["promptHints"],
            height=100,
            key=f"edit_prompt_hints_{variant_key}",
        )
        edited_theme_tokens = st.text_area(
            "Theme Tokens (`token = value` per line)",
            value=defaults["themeTokens"],
            height=140,
            key=f"edit_theme_tokens_{variant_key}",
        )
        with st.expander("Advanced fields", expanded=False):
            edited_style_rules = st.text_area(
                "Style Rules (one per line)",
                value=defaults["styleRules"],
                height=100,
                key=f"edit_style_rules_{variant_key}",
            )
            edited_section_inventory = st.text_area(
                "Section Inventory (one per line)",
                value=defaults["sectionInventory"],
                height=100,
                key=f"edit_section_inventory_{variant_key}",
            )
            edited_avoid_patterns = st.text_area(
                "Avoid Patterns (one per line)",
                value=defaults["avoidPatterns"],
                height=100,
                key=f"edit_avoid_patterns_{variant_key}",
            )
            edited_world_class = st.text_area(
                "World Class Rubric (one per line)",
                value=defaults["worldClassRubric"],
                height=100,
                key=f"edit_world_class_{variant_key}",
            )
            edited_source_ids = st.text_area(
                "Source Template IDs (one per line)",
                value=defaults["sourceTemplateIds"],
                height=100,
                key=f"edit_source_ids_{variant_key}",
            )
            edited_reference_scaffold_ids = st.text_area(
                "Reference Scaffold IDs (one per line)",
                value=defaults["referenceScaffoldIds"],
                height=80,
                key=f"edit_reference_scaffolds_{variant_key}",
            )

        submitted = st.form_submit_button("Spara variant", type="primary")

    if not submitted:
        return

    if not edited_label.strip():
        st.error("Label krävs.")
        return
    if not edited_signature_motif.strip():
        st.error("Signature Motif krävs.")
        return

    try:
        payload = _variant_payload(
            existing=selected_variant,
            scaffold_id=selected_scaffold,
            variant_id=defaults["id"],
            label=edited_label.strip(),
            description=edited_description,
            signature_motif=edited_signature_motif.strip(),
            color_mode=edited_color_mode,
            default_variant=edited_default,
            keywords_text=edited_keywords,
            font_pairings_text=edited_font_pairings,
            prompt_hints_text=edited_prompt_hints,
            theme_tokens_text=edited_theme_tokens,
            style_rules_text=edited_style_rules,
            section_inventory_text=edited_section_inventory,
            avoid_patterns_text=edited_avoid_patterns,
            world_class_text=edited_world_class,
            source_template_ids_text=edited_source_ids,
            reference_scaffold_ids_text=edited_reference_scaffold_ids,
        )
    except ValueError as error:
        st.error(str(error))
        return

    errors = _validate_variant_payload(ctx, payload)
    if errors:
        st.error(
            "Varianten sparades inte – schemavalideringen misslyckades:\n\n"
            + "\n".join(f"- {message}" for message in errors)
        )
        st.stop()

    write_json(variant_path, payload)
    st.success(f"Sparade `{variant_path.relative_to(ctx.repo_root).as_posix()}`.")
    st.rerun()


def _render_delete_variant(
    ctx: BackofficeContext,
    scaffold_ids: list[str],
    variants_by_scaffold: dict[str, list[dict[str, Any]]],
) -> None:
    scaffold_choices = [scaffold_id for scaffold_id in scaffold_ids if variants_by_scaffold.get(scaffold_id)]
    if not scaffold_choices:
        st.info("Det finns inga varianter att radera.")
        return

    selected_scaffold = st.selectbox(
        "Scaffold",
        scaffold_choices,
        key="delete_variant_scaffold_selector",
    )
    variants = variants_by_scaffold.get(selected_scaffold, [])
    variant_labels = [f"{variant.get('label', variant.get('id', '?'))} ({variant.get('id', '?')})" for variant in variants]
    selected_label = st.selectbox(
        "Variant",
        variant_labels,
        key="delete_variant_selector",
    )
    selected_variant = variants[variant_labels.index(selected_label)]
    variant_path = selected_variant.get("_path")
    if not isinstance(variant_path, Path):
        st.error("Den valda varianten saknar filpath och kan inte raderas.")
        return

    if len(variants) <= 1:
        st.error(
            "Det här är scaffoldens **sista** variant. En scaffold utan varianter är "
            "ogiltig — radera hela scaffolden i fliken **Radera scaffold** i stället, "
            "eller skapa en ersättningsvariant först."
        )
        return

    if selected_variant.get("default"):
        st.warning(
            "Varianten är markerad `default`. Konventionen är exakt en default per "
            "scaffold — markera en syskonvariant som default efter raderingen."
        )

    st.caption(f"Fil: `{variant_path.relative_to(ctx.repo_root).as_posix()}`")
    confirm = st.checkbox(
        "Jag vill radera den här variant-filen",
        key=f"delete_variant_confirm_{selected_scaffold}_{selected_variant.get('id', '')}",
    )
    if st.button(
        "Radera variant",
        key=f"delete_variant_button_{selected_scaffold}_{selected_variant.get('id', '')}",
        disabled=not confirm,
    ):
        variant_path.unlink(missing_ok=True)
        st.success(
            f"Raderade `{variant_path.relative_to(ctx.repo_root).as_posix()}`. "
            "Bygg om embeddings om du vill uppdatera relaterade artefakter."
        )
        st.rerun()


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


def _variant_schema_path(ctx: BackofficeContext) -> Path:
    return ctx.repo_root / "docs" / "schemas" / "strict" / "scaffold-variant.schema.json"


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


def _render_create_scaffold(ctx: BackofficeContext, manifests: list[dict[str, Any]]) -> None:
    if not manifests:
        st.warning("Inga källscaffolds hittades att klona från.")
        return

    manifest_lookup = {
        str(manifest.get("id", "")).strip(): manifest for manifest in manifests if manifest.get("id")
    }
    source_choices = list(manifest_lookup.keys())
    source_scaffold_id = st.selectbox(
        "Källscaffold att klona filer från",
        source_choices,
        key="create_scaffold_source_selector",
    )
    source_manifest = manifest_lookup[source_scaffold_id]
    source_path_value = source_manifest.get("_path")
    source_defaults = (
        _source_defaults_from_manifest(Path(source_path_value))
        if isinstance(source_path_value, str)
        else {
            "label": source_manifest.get("label", source_scaffold_id),
            "description": source_manifest.get("description", ""),
            "siteKind": source_manifest.get("siteKind", ""),
            "complexity": source_manifest.get("complexity", ""),
            "structureProfile": source_manifest.get("structureProfile", ""),
            "contentProfile": source_manifest.get("contentProfile", ""),
            "features": source_manifest.get("features", []),
            "allowedBuildIntents": source_manifest.get("allowedBuildIntents", []),
            "tags": source_manifest.get("tags", []),
            "promptHints": _default_prompt_hints(str(source_manifest.get("label", source_scaffold_id))),
            "qualityChecklist": _default_quality_checklist(
                str(source_manifest.get("label", source_scaffold_id))
            ),
            "upgradeTargets": _default_upgrade_targets(
                str(source_manifest.get("label", source_scaffold_id))
            ),
        }
    )

    st.caption(
        f"Källan `{source_scaffold_id}` har {source_manifest.get('file_count', 0)} filer och används bara som filshell. "
        "Matcher/retry-semantik och katalogreferenser (`sourceTemplateIds`) kurateras separat. "
        "Runtime-dossiers (`data/dossiers/{hard,soft}`) är en separat pool och hanteras i sidan **Dossiers**."
    )
    with st.expander("Vad skapas automatiskt?", expanded=False):
        st.markdown("- `manifest.ts` + klonad `files/` från vald källscaffold")
        st.markdown("- `ScaffoldId` + `SCAFFOLD_CLIENT_LIST` i `types.ts`")
        st.markdown("- import + registrering i `registry.ts`")
        st.markdown("- svensk embedding-locale i `scaffold-embedding-locale.ts`")
        st.markdown("- neutral startvariant i `config/scaffold-variants/` om du lämnar checkboxen på")
        st.markdown("Det som inte autokureras här är `matcher.ts`, `scaffold-aware-retry.ts`, eval-fall och katalog-/dossier-rekommendationer.")
    form_key = f"create_scaffold_form_{source_scaffold_id}"
    default_label = str(source_defaults.get("label", "")).strip()
    default_description = str(source_defaults.get("description", "")).strip()
    source_prompt_hints = source_defaults.get("promptHints") or _default_prompt_hints(default_label)
    source_quality = source_defaults.get("qualityChecklist") or _default_quality_checklist(default_label)
    source_upgrades = source_defaults.get("upgradeTargets") or _default_upgrade_targets(default_label)

    with st.form(form_key, clear_on_submit=False):
        label = st.text_input("Label", value=default_label, key=f"create_scaffold_label_{source_scaffold_id}")
        suggested_id = _slugify(label)
        scaffold_id = st.text_input(
            "Scaffold ID",
            value=suggested_id,
            key=f"create_scaffold_id_{source_scaffold_id}",
            help="Kebab-case. Måste börja med en bokstav.",
        )
        description = st.text_area(
            "Description",
            value=default_description,
            height=90,
            key=f"create_scaffold_description_{source_scaffold_id}",
        )
        c1, c2 = st.columns(2)
        with c1:
            site_kind_options = [""] + list(SITE_KIND_OPTIONS)
            site_kind = st.selectbox(
                "Site Kind",
                site_kind_options,
                index=site_kind_options.index(str(source_defaults.get("siteKind", "")))
                if str(source_defaults.get("siteKind", "")) in site_kind_options
                else 0,
                key=f"create_scaffold_site_kind_{source_scaffold_id}",
            )
            structure_profile = st.text_input(
                "Structure Profile",
                value=str(source_defaults.get("structureProfile", "")),
                key=f"create_scaffold_structure_profile_{source_scaffold_id}",
            )
            features_text = st.text_area(
                "Features (one per line)",
                value=_format_string_list(source_defaults.get("features", [])),
                height=100,
                key=f"create_scaffold_features_{source_scaffold_id}",
            )
        with c2:
            complexity_options = [""] + list(COMPLEXITY_OPTIONS)
            complexity = st.selectbox(
                "Complexity",
                complexity_options,
                index=complexity_options.index(str(source_defaults.get("complexity", "")))
                if str(source_defaults.get("complexity", "")) in complexity_options
                else 0,
                key=f"create_scaffold_complexity_{source_scaffold_id}",
            )
            content_profile = st.text_input(
                "Content Profile",
                value=str(source_defaults.get("contentProfile", "")),
                key=f"create_scaffold_content_profile_{source_scaffold_id}",
            )
            allowed_build_intents = st.multiselect(
                "Allowed Build Intents",
                options=list(BUILD_INTENT_OPTIONS),
                default=[
                    intent
                    for intent in source_defaults.get("allowedBuildIntents", [])
                    if intent in BUILD_INTENT_OPTIONS
                ],
                key=f"create_scaffold_intents_{source_scaffold_id}",
            )

        tags_text = st.text_area(
            "Tags (one per line)",
            value=_format_string_list(source_defaults.get("tags", [])),
            height=120,
            key=f"create_scaffold_tags_{source_scaffold_id}",
        )
        prompt_hints_text = st.text_area(
            "Prompt Hints (one per line)",
            value=_format_string_list(source_prompt_hints),
            height=120,
            key=f"create_scaffold_prompt_hints_{source_scaffold_id}",
        )
        quality_checklist_text = st.text_area(
            "Quality Checklist (one per line)",
            value=_format_string_list(source_quality),
            height=120,
            key=f"create_scaffold_quality_{source_scaffold_id}",
        )
        upgrade_targets_text = st.text_area(
            "Research Upgrade Targets (one per line)",
            value=_format_string_list(source_upgrades),
            height=100,
            key=f"create_scaffold_upgrade_targets_{source_scaffold_id}",
        )
        create_start_variant = st.checkbox(
            "Create neutral starter variant",
            value=True,
            key=f"create_scaffold_variant_{source_scaffold_id}",
        )
        submitted = st.form_submit_button("Skapa scaffold", type="primary")

    if not submitted:
        return

    scaffold_id = scaffold_id.strip() or suggested_id
    if not re.fullmatch(r"[a-z][a-z0-9-]*", scaffold_id):
        st.error("Scaffold ID måste vara kebab-case och börja med en bokstav.")
        return
    if scaffold_id in manifest_lookup:
        st.error(f"Scaffold `{scaffold_id}` finns redan.")
        return
    if not label.strip():
        st.error("Label krävs.")
        return
    if not description.strip():
        st.error("Description krävs.")
        return
    if not allowed_build_intents:
        st.error("Välj minst ett build intent.")
        return
    if not create_start_variant:
        st.error(
            "En scaffold måste ha minst en variant för att kunna väljas av matchern. "
            "Låt 'Create neutral starter variant' vara ikryssad — eller skapa scaffolden "
            "via **Scaffold Wizard**, som alltid skriver en startvariant."
        )
        return

    features = _normalize_lines(features_text)
    tags = _normalize_lines(tags_text)
    prompt_hints = _normalize_lines(prompt_hints_text)
    quality_checklist = _normalize_lines(quality_checklist_text)
    upgrade_targets = _normalize_lines(upgrade_targets_text)

    if len(prompt_hints) < 2:
        st.error("Prompt hints bör innehålla minst 2 rader.")
        return
    if len(quality_checklist) < 3:
        st.error("Quality checklist bör innehålla minst 3 rader.")
        return
    if len(upgrade_targets) < 1:
        st.error("Ange minst en upgrade target.")
        return

    try:
        _create_scaffold(
            ctx,
            source_scaffold_id=source_scaffold_id,
            scaffold_id=scaffold_id,
            label=label.strip(),
            description=description.strip(),
            site_kind=site_kind,
            complexity=complexity,
            structure_profile=structure_profile.strip(),
            content_profile=content_profile.strip(),
            features=features,
            allowed_build_intents=allowed_build_intents,
            tags=tags,
            prompt_hints=prompt_hints,
            quality_checklist=quality_checklist,
            upgrade_targets=upgrade_targets,
            create_start_variant=create_start_variant,
        )
    except Exception as error:
        st.error(str(error))
        return

    st.success(
        f"Skapade scaffolden `{scaffold_id}` från `{source_scaffold_id}`. "
        "Bygg om embeddings och research när du vill göra den fullt synlig i generated artifacts."
    )
    st.rerun()


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


def _render_dependency_report(report: dict[str, Any]) -> None:
    def _status_text(value: Any) -> str:
        if isinstance(value, bool):
            return "ja" if value else "nej"
        return str(value)

    rows = [
        {
            "dependency": "Variant JSON files",
            "status": _status_text(len(report["variantFiles"])),
            "action": "Rensas automatiskt",
        },
        {
            "dependency": "Scaffold directory",
            "status": _status_text(report["scaffoldDirExists"]),
            "action": "Rensas automatiskt",
        },
        {
            "dependency": "types.ts union + client list",
            "status": _status_text(report["typesUnionPresent"] or report["clientListPresent"]),
            "action": "Uppdateras automatiskt",
        },
        {
            "dependency": "registry.ts imports + registry list",
            "status": _status_text(report["registryImportPresent"] or report["registryArrayPresent"]),
            "action": "Uppdateras automatiskt",
        },
        {
            "dependency": "scaffold-embedding-locale.ts",
            "status": _status_text(report["embeddingLocalePresent"]),
            "action": "Uppdateras automatiskt",
        },
        {
            "dependency": "referenceScaffoldIds in other variants",
            "status": _status_text(len(report["referenceHits"])),
            "action": "Varnas, men rensas inte automatiskt",
        },
        {
            "dependency": "Generated research entry",
            "status": _status_text(report["researchEntryPresent"]),
            "action": "Tas bort direkt om den finns, annars rebuild vid behov",
        },
        {
            "dependency": "Generated embeddings entry",
            "status": _status_text(report["embeddingsEntryPresent"]),
            "action": "Tas bort direkt om den finns, annars rebuild vid behov",
        },
        {
            "dependency": "Manual code references",
            "status": _status_text(len(report["manualCodeReferences"])),
            "action": "Måste rensas manuellt",
        },
    ]
    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

    if report["variantFiles"]:
        with st.expander(f"Variantfiler ({len(report['variantFiles'])})", expanded=False):
            for path in report["variantFiles"]:
                st.markdown(f"- `{path}`")

    if report["referenceHits"]:
        with st.expander(
            f"referenceScaffoldIds-pekare ({len(report['referenceHits'])})",
            expanded=False,
        ):
            for hit in report["referenceHits"]:
                st.markdown(
                    f"- `{hit['variantId']}` i `{hit['path']}` (scaffold `{hit['scaffoldId']}`)"
                )

    if report["manualCodeReferences"]:
        with st.expander(
            f"Manuella kodreferenser ({len(report['manualCodeReferences'])})",
            expanded=False,
        ):
            for ref in report["manualCodeReferences"]:
                line_preview = ", ".join(str(line) for line in ref["lines"])
                st.markdown(
                    f"- `{ref['path']}` — {ref['count']} träffar (rader {line_preview})"
                )


def _delete_scaffold(ctx: BackofficeContext, scaffold_id: str) -> None:
    variant_dir = ctx.variants_dir / scaffold_id
    scaffold_dir = ctx.scaffolds_dir / scaffold_id

    if variant_dir.is_dir():
        shutil.rmtree(variant_dir)
    if scaffold_dir.is_dir():
        shutil.rmtree(scaffold_dir)

    _update_types_for_deleted_scaffold(ctx, scaffold_id)
    _update_registry_for_deleted_scaffold(ctx, scaffold_id)
    _update_embedding_locale_for_deleted_scaffold(ctx, scaffold_id)
    _update_variant_schema_enum(ctx, scaffold_id, add=False)
    _clean_generated_scaffold_artifacts(ctx, scaffold_id)


def _render_delete_scaffold(
    ctx: BackofficeContext,
    scaffold_ids: list[str],
    variants: list[dict[str, Any]],
) -> None:
    if not scaffold_ids:
        st.info("Inga scaffolds hittades.")
        return

    scaffold_selector_key = (
        f"delete_scaffold_selector_{len(scaffold_ids)}_{scaffold_ids[-1] if scaffold_ids else 'none'}"
    )
    selected_scaffold = st.selectbox(
        "Scaffold att radera",
        scaffold_ids,
        key=scaffold_selector_key,
    )
    report = _scan_scaffold_dependencies(ctx, selected_scaffold, variants)
    _render_dependency_report(report)

    st.warning(
        "Radering tar bort scaffold/variant-mappar, registry-länkar och embedding-locale. "
        "Direkta generated poster i scaffold research/embeddings tvättas också bort om de finns. "
        "Andra kodreferenser och `referenceScaffoldIds` måste fortfarande rensas manuellt."
    )
    st.caption(f"Aktuell scaffold för radering: `{selected_scaffold}`")

    with st.form(f"delete_scaffold_form_{selected_scaffold}"):
        acknowledge_manual = st.checkbox(
            "Jag förstår att manuella kodreferenser och andra variantspekare inte rensas automatiskt.",
            key=f"delete_scaffold_acknowledge_{selected_scaffold}",
        )
        confirm_cleanup = st.checkbox(
            "Jag vill rensa den valda scaffolden och dess variantmapp.",
            key=f"delete_scaffold_confirm_{selected_scaffold}",
        )
        typed_value = st.text_input(
            "Bekräfta scaffold-ID",
            key=f"delete_scaffold_type_{selected_scaffold}",
            help=f"Skriv exakt `{selected_scaffold}` för att tillåta radering.",
        )
        submitted = st.form_submit_button("Radera scaffold", type="primary")

    if not submitted:
        return

    if not acknowledge_manual:
        st.error("Du måste bekräfta att manuella kodreferenser inte rensas automatiskt.")
        return
    if not confirm_cleanup:
        st.error("Du måste bekräfta att scaffolden och variantmappen ska rensas.")
        return
    if typed_value.strip() != selected_scaffold:
        st.error(f"Bekräftelsetexten måste vara exakt `{selected_scaffold}`.")
        return

    try:
        _delete_scaffold(ctx, selected_scaffold)
        st.success(
            f"Raderade scaffolden `{selected_scaffold}`. "
            "Bygg om research och embeddings innan du litar på generated artifacts igen."
        )
    except Exception as error:
        st.error(str(error))
        return
    st.rerun()


def _run_repo_command(ctx: BackofficeContext, command: list[str], *, timeout: int = 600) -> str:
    result = subprocess.run(
        command,
        capture_output=True,
        cwd=str(ctx.repo_root),
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        text=True,
        timeout=timeout,
        check=False,
    )
    output = result.stdout or ""
    if result.stderr:
        output = f"{output}\n{result.stderr}".strip()
    if result.returncode != 0:
        raise RuntimeError(output or f"Command failed with exit code {result.returncode}.")
    return output.strip() or "(no output)"


BASELINE_TAG = "scaffold-baseline-v1"
BASELINE_PATHS = (
    "src/lib/gen/scaffolds",
    "config/scaffold-variants",
    "docs/schemas/strict/scaffold-variant.schema.json",
)


def _run_git(ctx: BackofficeContext, args: list[str], *, timeout: int = 60) -> tuple[int, str]:
    result = subprocess.run(
        ["git", *args],
        capture_output=True,
        cwd=str(ctx.repo_root),
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        text=True,
        timeout=timeout,
        check=False,
    )
    output = (result.stdout or "") + (("\n" + result.stderr) if result.stderr else "")
    return result.returncode, output.strip()


def _baseline_tag_exists(ctx: BackofficeContext) -> bool:
    code, output = _run_git(ctx, ["tag", "--list", BASELINE_TAG])
    return code == 0 and BASELINE_TAG in output.splitlines()


def _baseline_drift(ctx: BackofficeContext) -> dict[str, list[str]]:
    """Files that differ from the baseline tag within the scaffold surfaces."""
    _, changed_raw = _run_git(
        ctx, ["diff", "--name-status", BASELINE_TAG, "--", *BASELINE_PATHS]
    )
    _, untracked_raw = _run_git(
        ctx, ["ls-files", "--others", "--exclude-standard", "--", *BASELINE_PATHS]
    )
    changed = [line for line in changed_raw.splitlines() if line.strip()]
    untracked = [line for line in untracked_raw.splitlines() if line.strip()]
    added = [
        line.split("\t", 1)[1]
        for line in changed
        if line.startswith("A") and "\t" in line
    ]
    return {"changed": changed, "untracked": untracked, "added_since_tag": added}


def _factory_reset_to_baseline(ctx: BackofficeContext) -> list[str]:
    """Reset the scaffold surfaces to the baseline tag. Returns log lines."""
    log: list[str] = []
    drift = _baseline_drift(ctx)

    for rel in drift["added_since_tag"] + drift["untracked"]:
        target = ctx.repo_root / rel
        if target.is_file():
            target.unlink()
            log.append(f"raderade {rel}")

    # --staged ingår så även indexet (staging) återställs — annars kan en
    # senare commit tyst återinföra experiment som UI:n påstår är borta.
    code, output = _run_git(
        ctx,
        ["restore", "--source", BASELINE_TAG, "--staged", "--worktree", "--", *BASELINE_PATHS],
        timeout=120,
    )
    if code != 0:
        raise RuntimeError(f"git restore misslyckades: {output}")
    log.append(f"git restore --source {BASELINE_TAG} --staged --worktree klar")

    # Sopa bort tomma kataloger som blev kvar efter raderade filer.
    for base_rel in BASELINE_PATHS:
        base = ctx.repo_root / base_rel
        if not base.is_dir():
            continue
        for directory in sorted(
            (d for d in base.rglob("*") if d.is_dir()),
            key=lambda d: len(d.parts),
            reverse=True,
        ):
            try:
                directory.rmdir()
                log.append(f"tog bort tom mapp {directory.relative_to(ctx.repo_root).as_posix()}")
            except OSError:
                pass
    return log


def _render_baseline_tab(ctx: BackofficeContext) -> None:
    st.caption(
        "**Version 1 — standard.** Baselinen är en git-tag "
        f"(`{BASELINE_TAG}`) som fryser scaffold-ytorna: "
        + ", ".join(f"`{path}`" for path in BASELINE_PATHS)
        + ". Fabriksåterställning återställer exakt dessa ytor till taggen — "
        "experimentera fritt i wizarden och backa hit om något blir fel."
    )

    if not _baseline_tag_exists(ctx):
        st.warning(f"Taggen `{BASELINE_TAG}` finns inte ännu.")
        if st.button("Skapa baseline-tag av nuvarande läge", type="primary"):
            code, output = _run_git(ctx, ["tag", BASELINE_TAG])
            if code == 0:
                st.success(f"Skapade `{BASELINE_TAG}`.")
                st.rerun()
            else:
                st.error(output)
        return

    drift = _baseline_drift(ctx)
    total_drift = len(drift["changed"]) + len(drift["untracked"])
    c1, c2, c3 = st.columns(3)
    c1.metric("Ändrade/raderade vs baseline", len(drift["changed"]))
    c2.metric("Nya ospårade filer", len(drift["untracked"]))
    c3.metric("Totalt avvikande", total_drift)

    if total_drift == 0:
        st.success("Scaffold-ytorna är identiska med baselinen. Inget att återställa.")
    else:
        with st.expander(f"Avvikande filer ({total_drift})", expanded=False):
            for line in drift["changed"]:
                st.markdown(f"- `{line}`")
            for line in drift["untracked"]:
                st.markdown(f"- `?? {line}` (ospårad)")

        st.error(
            "Fabriksåterställningen raderar filer som tillkommit efter baselinen och "
            "återställer alla ändringar i scaffold-ytorna — även sådant andra "
            "agenter/personer inte hunnit committa. Dubbelkolla listan ovan först."
        )
        with st.form("baseline_reset_form"):
            acknowledge = st.checkbox(
                "Jag har läst listan och förstår att avvikelserna ovan försvinner."
            )
            typed = st.text_input(
                "Bekräfta genom att skriva taggens namn",
                help=f"Skriv exakt `{BASELINE_TAG}`.",
            )
            submitted = st.form_submit_button("Fabriksåterställ scaffold-ytorna", type="primary")
        if submitted:
            if not acknowledge:
                st.error("Du måste bekräfta att du läst listan.")
                return
            if typed.strip() != BASELINE_TAG:
                st.error(f"Bekräftelsetexten måste vara exakt `{BASELINE_TAG}`.")
                return
            try:
                log = _factory_reset_to_baseline(ctx)
            except RuntimeError as error:
                st.error(str(error))
                return
            st.success("Återställt till baselinen.")
            for line in log[:50]:
                st.markdown(f"- {line}")
            st.rerun()

    st.divider()
    with st.expander("Uppdatera baselinen (gör nuvarande läge till nya 'standard')", expanded=False):
        st.caption(
            "Flyttar taggen till nuvarande commit (`git tag -f`). Gör detta när ett "
            "experiment blivit godkänt och committat och ska bli den nya fabriksinställningen."
        )
        confirm_move = st.checkbox("Jag vill flytta baselinen till nuvarande läge.")
        if st.button("Flytta baseline-taggen", disabled=not confirm_move):
            code, output = _run_git(ctx, ["tag", "-f", BASELINE_TAG])
            if code == 0:
                st.success(f"`{BASELINE_TAG}` pekar nu på nuvarande commit.")
                st.rerun()
            else:
                st.error(output)


def _render_pipeline_tools(ctx: BackofficeContext) -> None:
    st.caption(
        "Här kör du variantshärledning och relevanta scaffold/template-artifacts utan att lämna lifecycle-vyn."
    )

    st.info(
        "Den gamla `scaffold_cli.py`-pipen avvecklades 2026-04-17. Variant-underhåll "
        "sker nu från terminalen:\n\n"
        "- `npm run scaffolds:variant-embeddings` — bygg om embeddings för alla 21 variants\n"
        "- `npm run scaffolds:variant-patterns` — AI-curate `signaturePatterns`\n"
        "- `npm run dossiers:curate -- --reference=<id> --class=<hard|soft> --id=<new>` — "
        "AI-curate ett nytt dossier-utkast från `data/template-references/repos/`. "
        "Inga dossier-embeddings längre — urvalet är capability-driven (v2)."
    )


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    manifests = get_all_manifests(ctx)
    scaffold_ids = [str(manifest.get("id", "")).strip() for manifest in manifests if manifest.get("id")]
    variants = _load_variants(ctx)
    variants_by_scaffold = _variants_by_scaffold(variants)
    inspiration_lookup, inspiration_sources = _load_inspiration_lookup(ctx)
    runtime_dossier_counts = _count_runtime_dossiers(ctx)

    st.header("Scaffold Lifecycle")
    render_where_panel("Scaffold Lifecycle", domain_map)
    st.info(
        "Den här sidan binder ihop runtime-scaffolds, scaffold-variants och deras "
        f"inspirationsreferenser (`sourceTemplateIds` → v0-mallarna i `{BLOB_MANIFEST_REL}`). "
        "Själva varianten är det visuella uttrycket inom en scaffold, inte ett separat runtime-lager. "
        "Runtime-dossiers under `data/dossiers/{hard,soft}` är en **separat** pool som hanteras i sidan **Dossiers**. "
        "Vill du skapa nytt med AI-stöd? Använd **Scaffold Wizard**."
    )

    overview_tab, create_tab, variants_tab, delete_tab, pipeline_tab, baseline_tab = st.tabs(
        ["Översikt", "Skapa scaffold", "Varianter", "Radera scaffold", "Pipeline", "Baseline"]
    )

    with overview_tab:
        _render_tree_view(
            ctx,
            manifests,
            variants_by_scaffold,
            inspiration_lookup,
            inspiration_sources,
            runtime_dossier_counts,
        )

    with create_tab:
        st.subheader("Skapa ny scaffold")
        st.caption(
            "Det här skapar scaffold-shell, registry-kopplingar och embedding-locale. "
            "Matcher/retry/eval-kurering görs separat."
        )
        _render_create_scaffold(ctx, manifests)

    with variants_tab:
        st.subheader("Skapa ny variant")
        _render_create_variant(scaffold_ids, ctx)
        st.divider()
        st.subheader("Redigera variant")
        _render_edit_variant(ctx, scaffold_ids, variants_by_scaffold)
        st.divider()
        st.subheader("Radera variant")
        _render_delete_variant(ctx, scaffold_ids, variants_by_scaffold)

    with delete_tab:
        st.subheader("Beroendevalidering före scaffold-radering")
        _render_delete_scaffold(ctx, scaffold_ids, variants)

    with pipeline_tab:
        st.subheader("Scaffold/variant-pipeline")
        _render_pipeline_tools(ctx)

    with baseline_tab:
        st.subheader("Baseline / fabriksåterställning")
        _render_baseline_tab(ctx)
