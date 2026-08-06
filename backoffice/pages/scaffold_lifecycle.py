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


from .scaffold_lifecycle_lib.constants import (
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

from .scaffold_lifecycle_lib.formatting import (
    _unique_preserving_order,
    _normalize_lines,
    _slugify,
    _format_string_list,
    _format_font_pairings,
    _parse_font_pairings,
    _format_theme_tokens,
    _parse_theme_tokens,
)

from .scaffold_lifecycle_lib.variants import (
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

from .scaffold_lifecycle_lib.scaffold_text import (
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

from .scaffold_lifecycle_lib.scaffold_ops import (
    _update_types_for_created_scaffold,
    _update_registry_for_created_scaffold,
    _update_embedding_locale_for_created_scaffold,
    _update_variant_schema_enum,
    _create_scaffold,
    _update_types_for_deleted_scaffold,
    _update_registry_for_deleted_scaffold,
    _update_embedding_locale_for_deleted_scaffold,
    _scan_manual_code_references,
    _scan_scaffold_dependencies,
    _clean_generated_scaffold_artifacts,
    _delete_scaffold,
)

from .scaffold_lifecycle_lib.flash import (
    _flash_note,
    _render_flashed_note,
)

from .scaffold_lifecycle_lib.baseline import (
    _run_repo_command,
    _run_git,
    _baseline_tag_exists,
    _baseline_drift,
    _baseline_head_delta,
    _factory_reset_to_baseline,
)

from .scaffold_lifecycle_lib.ui_view import (
    _render_tree_view,
    _render_pipeline_tools,
)

from .scaffold_lifecycle_lib.ui_danger import (
    _render_delete_variant,
    _render_dependency_report,
    _render_delete_scaffold,
    _render_baseline_tab,
)



def _render_create_variant(scaffold_ids: list[str], ctx: BackofficeContext) -> None:
    if not scaffold_ids:
        st.warning("Inga scaffolds hittades. Skapa eller återställ runtime-scaffolds först.")
        return

    with st.form("create_variant_form", clear_on_submit=False):
        scaffold_id = st.selectbox(
            field_label("scaffoldId"), scaffold_ids, key="create_variant_scaffold"
        )
        label = st.text_input(field_label("label"), key="create_variant_label")
        suggested_id = _slugify(label)
        variant_id = st.text_input(
            "Variant-ID (`id`)",
            value=suggested_id,
            key="create_variant_id",
            help="Kebab-case rekommenderas.",
        )
        description = st.text_area(
            field_label("description"), height=80, key="create_variant_description"
        )
        signature_motif = st.text_input(
            field_label("signatureMotif"), key="create_variant_signature_motif"
        )
        color_mode = st.selectbox(
            field_label("colorMode"),
            ["light", "dark", "either"],
            index=2,
            key="create_variant_color_mode",
        )
        default_variant = st.checkbox(
            field_label("default"), value=False, key="create_variant_default"
        )
        keywords_text = st.text_area(
            field_label("keywords", hint="en per rad"),
            height=120,
            key="create_variant_keywords",
        )
        font_pairings_text = st.text_area(
            field_label("fontPairings", hint="`Rubrik | Brödtext` per rad"),
            height=100,
            key="create_variant_font_pairings",
        )
        prompt_hints_text = st.text_area(
            field_label("promptHints", hint="en per rad"),
            height=100,
            key="create_variant_prompt_hints",
        )
        theme_tokens_text = st.text_area(
            field_label("themeTokens", hint="`token = värde` per rad"),
            height=140,
            key="create_variant_theme_tokens",
        )
        st.markdown("**Signaturmönster** — krävs av CI-grinden (`variant-integrity.test.ts`).")
        st.caption(
            f"Minst {_SIG_MIN_LAYOUTS} layouts, {_SIG_MIN_MOTIFS} motifs och "
            f"{_SIG_MIN_ANTI} antiPatterns (en konkret mening per rad). Vill du hellre "
            "AI-kurera dem? Skapa varianten via **Guide** i stället."
        )
        signature_layouts_text = st.text_area(
            field_label("signaturePatterns.layouts", hint="en per rad"),
            height=120,
            key="create_variant_sig_layouts",
        )
        signature_motifs_text = st.text_area(
            field_label("signaturePatterns.motifs", hint="en per rad"),
            height=100,
            key="create_variant_sig_motifs",
        )
        signature_anti_patterns_text = st.text_area(
            field_label("signaturePatterns.antiPatterns", hint="en per rad"),
            height=100,
            key="create_variant_sig_anti",
        )
        with st.expander("Fler fält (avancerat)", expanded=False):
            style_rules_text = st.text_area(
                field_label("styleRules", hint="en per rad"),
                height=100,
                key="create_variant_style_rules",
            )
            section_inventory_text = st.text_area(
                field_label("sectionInventory", hint="en per rad"),
                height=100,
                key="create_variant_section_inventory",
            )
            avoid_patterns_text = st.text_area(
                field_label("avoidPatterns", hint="en per rad"),
                height=100,
                key="create_variant_avoid_patterns",
            )
            world_class_text = st.text_area(
                field_label("worldClassRubric", hint="en per rad"),
                height=100,
                key="create_variant_world_class",
            )
            source_template_ids_text = st.text_area(
                field_label("sourceTemplateIds", hint="ett v0-mall-id per rad"),
                height=100,
                key="create_variant_source_ids",
            )
            reference_scaffold_ids_text = st.text_area(
                field_label("referenceScaffoldIds", hint="en per rad"),
                height=80,
                key="create_variant_reference_scaffold_ids",
            )

        submitted = st.form_submit_button("Skapa variant", type="primary")

    if not submitted:
        return

    variant_id = variant_id.strip() or suggested_id
    if not variant_id:
        st.error("Variant-ID (`id`) krävs.")
        return
    if not label.strip():
        st.error(f"{field_label('label')} krävs.")
        return
    if not signature_motif.strip():
        st.error(f"{field_label('signatureMotif')} krävs.")
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
            signature_layouts_text=signature_layouts_text,
            signature_motifs_text=signature_motifs_text,
            signature_anti_patterns_text=signature_anti_patterns_text,
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

    integrity_errors = _variant_integrity_errors(
        ctx,
        payload,
        sibling_defaults=_sibling_default_variant_ids(
            ctx, scaffold_id, exclude_id=variant_id
        ),
    )
    if integrity_errors:
        st.error(
            "Varianten sparades inte – den skulle fällas av CI-grinden "
            "(`npm run scaffolds:validate`):\n\n"
            + "\n".join(f"- {message}" for message in integrity_errors)
        )
        st.stop()

    target_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(target_path, payload)
    rel = target_path.relative_to(ctx.repo_root).as_posix()
    _flash_note(f"Skapade `{rel}`. {_REBUILD_EMBEDDINGS_HINT}", level="warning")
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
        field_label("scaffoldId"),
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
        "signatureLayouts": _format_string_list(
            (selected_variant.get("signaturePatterns") or {}).get("layouts", [])
        ),
        "signatureMotifs": _format_string_list(
            (selected_variant.get("signaturePatterns") or {}).get("motifs", [])
        ),
        "signatureAntiPatterns": _format_string_list(
            (selected_variant.get("signaturePatterns") or {}).get("antiPatterns", [])
        ),
    }
    variant_key = f"{selected_scaffold}_{defaults['id']}"
    variant_path = selected_variant.get("_path")
    if not isinstance(variant_path, Path):
        st.error("Den valda varianten saknar filpath och kan inte sparas.")
        return

    with st.form(f"edit_variant_form_{variant_key}"):
        edited_label = st.text_input(
            field_label("label"), value=defaults["label"], key=f"edit_label_{variant_key}"
        )
        edited_id = st.text_input(
            "Variant-ID (`id`)",
            value=defaults["id"],
            key=f"edit_id_{variant_key}",
            help="Byt bara ID om du vill skriva till en ny fil och ta bort den gamla manuellt.",
            disabled=True,
        )
        edited_description = st.text_area(
            field_label("description"),
            value=defaults["description"],
            height=80,
            key=f"edit_description_{variant_key}",
        )
        edited_signature_motif = st.text_input(
            field_label("signatureMotif"),
            value=defaults["signatureMotif"],
            key=f"edit_signature_{variant_key}",
        )
        color_options = ["light", "dark", "either"]
        edited_color_mode = st.selectbox(
            field_label("colorMode"),
            color_options,
            index=color_options.index(defaults["colorMode"])
            if defaults["colorMode"] in color_options
            else 2,
            key=f"edit_color_{variant_key}",
        )
        edited_default = st.checkbox(
            field_label("default"),
            value=defaults["default"],
            key=f"edit_default_{variant_key}",
        )
        edited_keywords = st.text_area(
            field_label("keywords", hint="en per rad"),
            value=defaults["keywords"],
            height=120,
            key=f"edit_keywords_{variant_key}",
        )
        edited_font_pairings = st.text_area(
            field_label("fontPairings", hint="`Rubrik | Brödtext` per rad"),
            value=defaults["fontPairings"],
            height=100,
            key=f"edit_fonts_{variant_key}",
        )
        edited_prompt_hints = st.text_area(
            field_label("promptHints", hint="en per rad"),
            value=defaults["promptHints"],
            height=100,
            key=f"edit_prompt_hints_{variant_key}",
        )
        edited_theme_tokens = st.text_area(
            field_label("themeTokens", hint="`token = värde` per rad"),
            value=defaults["themeTokens"],
            height=140,
            key=f"edit_theme_tokens_{variant_key}",
        )
        st.markdown("**Signaturmönster** — krävs av CI-grinden (`variant-integrity.test.ts`).")
        st.caption(
            f"Minst {_SIG_MIN_LAYOUTS} layouts, {_SIG_MIN_MOTIFS} motifs och "
            f"{_SIG_MIN_ANTI} antiPatterns. Töm alla tre fälten för att behålla "
            "de befintliga mönstren oförändrade."
        )
        edited_signature_layouts = st.text_area(
            field_label("signaturePatterns.layouts", hint="en per rad"),
            value=defaults["signatureLayouts"],
            height=120,
            key=f"edit_sig_layouts_{variant_key}",
        )
        edited_signature_motifs = st.text_area(
            field_label("signaturePatterns.motifs", hint="en per rad"),
            value=defaults["signatureMotifs"],
            height=100,
            key=f"edit_sig_motifs_{variant_key}",
        )
        edited_signature_anti_patterns = st.text_area(
            field_label("signaturePatterns.antiPatterns", hint="en per rad"),
            value=defaults["signatureAntiPatterns"],
            height=100,
            key=f"edit_sig_anti_{variant_key}",
        )
        with st.expander("Fler fält (avancerat)", expanded=False):
            edited_style_rules = st.text_area(
                field_label("styleRules", hint="en per rad"),
                value=defaults["styleRules"],
                height=100,
                key=f"edit_style_rules_{variant_key}",
            )
            edited_section_inventory = st.text_area(
                field_label("sectionInventory", hint="en per rad"),
                value=defaults["sectionInventory"],
                height=100,
                key=f"edit_section_inventory_{variant_key}",
            )
            edited_avoid_patterns = st.text_area(
                field_label("avoidPatterns", hint="en per rad"),
                value=defaults["avoidPatterns"],
                height=100,
                key=f"edit_avoid_patterns_{variant_key}",
            )
            edited_world_class = st.text_area(
                field_label("worldClassRubric", hint="en per rad"),
                value=defaults["worldClassRubric"],
                height=100,
                key=f"edit_world_class_{variant_key}",
            )
            edited_source_ids = st.text_area(
                field_label("sourceTemplateIds", hint="ett v0-mall-id per rad"),
                value=defaults["sourceTemplateIds"],
                height=100,
                key=f"edit_source_ids_{variant_key}",
            )
            edited_reference_scaffold_ids = st.text_area(
                field_label("referenceScaffoldIds", hint="en per rad"),
                value=defaults["referenceScaffoldIds"],
                height=80,
                key=f"edit_reference_scaffolds_{variant_key}",
            )

        submitted = st.form_submit_button("Spara variant", type="primary")

    if not submitted:
        return

    if not edited_label.strip():
        st.error(f"{field_label('label')} krävs.")
        return
    if not edited_signature_motif.strip():
        st.error(f"{field_label('signatureMotif')} krävs.")
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
            signature_layouts_text=edited_signature_layouts,
            signature_motifs_text=edited_signature_motifs,
            signature_anti_patterns_text=edited_signature_anti_patterns,
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

    integrity_errors = _variant_integrity_errors(
        ctx,
        payload,
        sibling_defaults=_sibling_default_variant_ids(
            ctx, selected_scaffold, exclude_id=defaults["id"]
        ),
    )
    if integrity_errors:
        st.error(
            "Varianten sparades inte – den skulle fällas av CI-grinden "
            "(`npm run scaffolds:validate`):\n\n"
            + "\n".join(f"- {message}" for message in integrity_errors)
        )
        st.stop()

    write_json(variant_path, payload)
    st.success(f"Sparade `{variant_path.relative_to(ctx.repo_root).as_posix()}`.")
    st.rerun()




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
        "Byggblock (`data/dossiers/{hard,soft}`) är en separat pool och hanteras i sidan **Byggblock (dossiers)**."
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
        label = st.text_input(
            field_label("label"),
            value=default_label,
            key=f"create_scaffold_label_{source_scaffold_id}",
        )
        suggested_id = _slugify(label)
        scaffold_id = st.text_input(
            "Scaffold-ID (`id`)",
            value=suggested_id,
            key=f"create_scaffold_id_{source_scaffold_id}",
            help="Kebab-case. Måste börja med en bokstav.",
        )
        description = st.text_area(
            field_label("description"),
            value=default_description,
            height=90,
            key=f"create_scaffold_description_{source_scaffold_id}",
        )
        c1, c2 = st.columns(2)
        with c1:
            site_kind_options = [""] + list(SITE_KIND_OPTIONS)
            site_kind = st.selectbox(
                field_label("siteKind"),
                site_kind_options,
                index=site_kind_options.index(str(source_defaults.get("siteKind", "")))
                if str(source_defaults.get("siteKind", "")) in site_kind_options
                else 0,
                key=f"create_scaffold_site_kind_{source_scaffold_id}",
            )
            structure_profile = st.text_input(
                field_label("structureProfile"),
                value=str(source_defaults.get("structureProfile", "")),
                key=f"create_scaffold_structure_profile_{source_scaffold_id}",
            )
            features_text = st.text_area(
                field_label("features", hint="en per rad"),
                value=_format_string_list(source_defaults.get("features", [])),
                height=100,
                key=f"create_scaffold_features_{source_scaffold_id}",
            )
        with c2:
            complexity_options = [""] + list(COMPLEXITY_OPTIONS)
            complexity = st.selectbox(
                field_label("complexity"),
                complexity_options,
                index=complexity_options.index(str(source_defaults.get("complexity", "")))
                if str(source_defaults.get("complexity", "")) in complexity_options
                else 0,
                key=f"create_scaffold_complexity_{source_scaffold_id}",
            )
            content_profile = st.text_input(
                field_label("contentProfile"),
                value=str(source_defaults.get("contentProfile", "")),
                key=f"create_scaffold_content_profile_{source_scaffold_id}",
            )
            allowed_build_intents = st.multiselect(
                field_label("allowedBuildIntents"),
                options=list(BUILD_INTENT_OPTIONS),
                default=[
                    intent
                    for intent in source_defaults.get("allowedBuildIntents", [])
                    if intent in BUILD_INTENT_OPTIONS
                ],
                key=f"create_scaffold_intents_{source_scaffold_id}",
            )

        tags_text = st.text_area(
            field_label("tags", hint="en per rad"),
            value=_format_string_list(source_defaults.get("tags", [])),
            height=120,
            key=f"create_scaffold_tags_{source_scaffold_id}",
        )
        prompt_hints_text = st.text_area(
            field_label("promptHints", hint="en per rad, minst 2"),
            value=_format_string_list(source_prompt_hints),
            height=120,
            key=f"create_scaffold_prompt_hints_{source_scaffold_id}",
        )
        quality_checklist_text = st.text_area(
            field_label("qualityChecklist", hint="en per rad, minst 3"),
            value=_format_string_list(source_quality),
            height=120,
            key=f"create_scaffold_quality_{source_scaffold_id}",
        )
        upgrade_targets_text = st.text_area(
            field_label("upgradeTargets", hint="en per rad, minst 1"),
            value=_format_string_list(source_upgrades),
            height=100,
            key=f"create_scaffold_upgrade_targets_{source_scaffold_id}",
        )
        create_start_variant = st.checkbox(
            "Skapa neutral startvariant",
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
        st.error(f"{field_label('label')} krävs.")
        return
    if not description.strip():
        st.error(f"{field_label('description')} krävs.")
        return
    if not allowed_build_intents:
        st.error(f"Välj minst ett värde under {field_label('allowedBuildIntents')}.")
        return
    if not create_start_variant:
        st.error(
            "En scaffold måste ha minst en variant för att kunna väljas av matchern. "
            "Låt 'Skapa neutral startvariant' vara ikryssad — eller skapa scaffolden "
            "via **Guide**, som alltid skriver en startvariant."
        )
        return

    features = _normalize_lines(features_text)
    tags = _normalize_lines(tags_text)
    prompt_hints = _normalize_lines(prompt_hints_text)
    quality_checklist = _normalize_lines(quality_checklist_text)
    upgrade_targets = _normalize_lines(upgrade_targets_text)

    if len(prompt_hints) < 2:
        st.error(f"{field_label('promptHints')} behöver minst 2 rader.")
        return
    if len(quality_checklist) < 3:
        st.error(f"{field_label('qualityChecklist')} behöver minst 3 rader.")
        return
    if len(upgrade_targets) < 1:
        st.error(f"{field_label('upgradeTargets')} behöver minst 1 rad.")
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




def render(ctx: BackofficeContext) -> None:
    manifests = get_all_manifests(ctx)
    scaffold_ids = [str(manifest.get("id", "")).strip() for manifest in manifests if manifest.get("id")]
    variants = _load_variants(ctx)
    variants_by_scaffold = _variants_by_scaffold(variants)
    inspiration_lookup, inspiration_sources = _load_inspiration_lookup(ctx)
    runtime_dossier_counts = _count_runtime_dossiers(ctx)

    st.header("Scaffolds & varianter: skapa, klona, ta bort")
    render_building_blocks_nav(PAGE_NAME)
    st.markdown(
        "Här skapar och klonar du **scaffolds** (startpunkter) och **varianter** "
        "(det visuella uttrycket inom en scaffold). Radering och "
        "fabriksåterställning ligger i en egen farlig zon."
    )
    render_save_scope(
        "repo",
        paths=("src/lib/gen/scaffolds/", "config/scaffold-variants/"),
        note="Vill du ha AI-hjälp med utkastet? Använd **Guide** i kedjan ovan.",
    )
    with tech_details():
        st.markdown(
            "- Variantens `sourceTemplateIds` är inspirationsetiketter som slås upp "
            f"mot Blob-manifestet (`{BLOB_MANIFEST_REL}`) — inget injiceras från dem."
        )
        st.markdown(
            "- Byggblock (dossiers) under `data/dossiers/{hard,soft}` är en **separat** "
            "pool: se sidan **Byggblock (dossiers)**."
        )
        st.markdown(
            "- Skapande skriver även `types.ts`, `registry.ts` och "
            "`scaffold-embedding-locale.ts`; misslyckas något rullas allt tillbaka."
        )
        st.markdown("- Validera efter ändring: `npm run scaffolds:validate`")

    # Post-action-noten ligger utanför tabbarna: create/edit/delete bor numera i
    # var sin tabb, och `st.rerun()` landar alltid på den första. Renderades noten
    # inne i en tabb skulle "kör om embeddings"-påminnelsen bli osynlig.
    _render_flashed_note()

    # Tabbarna följer verben: var tittar jag / var skapar jag / var ändrar jag /
    # var är det farligt / vad kör jag efteråt.
    view_tab, create_tab, edit_tab, danger_tab, maintenance_tab = st.tabs(
        ["Titta", "Skapa", "Ändra", "Farlig zon", "Underhåll"]
    )

    with view_tab:
        _render_tree_view(
            ctx,
            manifests,
            variants_by_scaffold,
            inspiration_lookup,
            inspiration_sources,
            runtime_dossier_counts,
        )

    with create_tab:
        st.caption(
            "Vill du ha AI-hjälp med utkastet? **Guide: ny scaffold eller variant (AI)** "
            "föreslår fält, kurerar designmönster och skriver ingenting förrän "
            "checklistan är grön."
        )
        nav_link_button(
            "Öppna Guide (AI)",
            "Guide: ny scaffold eller variant (AI)",
            key="lifecycle_create_open_wizard",
        )
        st.divider()
        st.subheader("Skapa ny scaffold")
        st.caption(
            "Det här skapar scaffold-shell, registry-kopplingar och embedding-locale. "
            "Matcher/retry/eval-kurering görs separat."
        )
        _render_create_scaffold(ctx, manifests)
        st.divider()
        st.subheader("Skapa ny variant")
        _render_create_variant(scaffold_ids, ctx)

    with edit_tab:
        st.subheader("Ändra variant")
        _render_edit_variant(ctx, scaffold_ids, variants_by_scaffold)
        st.divider()
        st.caption(
            "Scaffoldens egen metadata (matchord, instruktioner till own-engine, "
            "kvalitetskrav) ändrar du i **Scaffolds: titta & justera**."
        )
        nav_link_button(
            "Öppna Scaffolds: titta & justera",
            "Scaffolds: titta & justera",
            key="lifecycle_edit_open_scaffolds",
        )

    with danger_tab:
        st.caption(
            "Allt som raderar eller rullar tillbaka ligger här. Varje åtgärd kräver att "
            "du skriver namnet, och det som tas bort säkerhetskopieras först — kan en "
            "säkerhetskopia inte tas händer ingenting alls. Snapshots hittar du i "
            "**Återställning**."
        )
        with danger_zone(
            "Radera variant",
            help_text="Tar bort en enskild variantfil och dess post i matchnings-indexet.",
        ):
            _render_delete_variant(ctx, scaffold_ids, variants_by_scaffold)
        with danger_zone(
            "Radera scaffold",
            help_text="Tar bort scaffold-mappen, hela variantmappen och registry-länkarna.",
        ):
            st.caption("Beroendevalidering före scaffold-radering")
            _render_delete_scaffold(ctx, scaffold_ids, variants)
        with danger_zone(
            "Fabriksåterställ till baseline",
            help_text="Återställer hela scaffold-ytan till baseline-taggen och raderar "
            "det som tillkommit efter den.",
        ):
            _render_baseline_tab(ctx)

    with maintenance_tab:
        st.subheader("Scaffold/variant-pipeline")
        _render_pipeline_tools(ctx)
