from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from backoffice.shared import (
    BackofficeContext,
    read_json,
    resolve_command,
    run_repo_command,
    validate_json_against_schema,
    write_json,
)

from .constants import (
    _SIG_MIN_LAYOUTS,
    _SIG_MIN_MOTIFS,
    _SIG_MIN_ANTI,
    BLOB_MANIFEST_REL,
)
from .formatting import (
    _unique_preserving_order,
    _normalize_lines,
    _parse_font_pairings,
    _parse_theme_tokens,
)



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
    signature_layouts_text: str = "",
    signature_motifs_text: str = "",
    signature_anti_patterns_text: str = "",
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

    # signaturePatterns: build from the form fields when the operator supplied
    # any of them; otherwise keep whatever was copied from `existing` (so an
    # edit that leaves the pattern fields untouched preserves curated patterns).
    sig_layouts = _normalize_lines(signature_layouts_text)
    sig_motifs = _normalize_lines(signature_motifs_text)
    sig_anti = _normalize_lines(signature_anti_patterns_text)
    if sig_layouts or sig_motifs or sig_anti:
        payload["signaturePatterns"] = {
            "layouts": sig_layouts,
            "motifs": sig_motifs,
            "antiPatterns": sig_anti,
        }

    return payload




def _dead_source_template_ids(ctx: BackofficeContext, payload: dict[str, Any]) -> list[str]:
    """Return the ``sourceTemplateIds`` that do NOT resolve to a real v0-mall in
    the Blob manifest (`template-blob-manifest.json`).

    Shared by ``_validate_variant_payload`` (Lifecycle create/edit) and the
    Scaffold Wizard's new-scaffold path so both mirror the CI gate
    (`variant-integrity.test.ts`): every referenced id must exist in the Blob
    manifest, otherwise the gate fails once the variant lands.
    """
    source_ids = payload.get("sourceTemplateIds") or []
    if not (isinstance(source_ids, list) and source_ids):
        return []
    lookup, _sources = _load_inspiration_lookup(ctx)
    return [str(i) for i in source_ids if str(i).strip() and str(i) not in lookup]




def _dead_source_template_ids_message(dead: list[str]) -> str:
    return (
        "sourceTemplateIds pekar på id:n som inte finns i Blob-manifestet "
        f"(`{BLOB_MANIFEST_REL}`): {', '.join(dead)}. Använd riktiga v0-mall-id:n "
        "(kolumnen Blob-id i **Guide** steg 1) eller ta bort raderna."
    )


def _variant_template_reference_errors(
    ctx: BackofficeContext, payload: dict[str, Any]
) -> list[str]:
    """Ask the canonical TypeScript owners whether the references are usable.

    Blob existence alone is insufficient: runtime only accepts complete-project
    categories (plus tightly reviewed exceptions), and every cited source must
    have a current or explicitly disabled addendum. Calling the TS composition
    helper keeps Backoffice from copying either policy into Python.
    """
    source_ids = payload.get("sourceTemplateIds") or []
    if not isinstance(source_ids, list):
        return []
    normalized_ids = [
        value.strip()
        for value in source_ids
        if isinstance(value, str) and value.strip()
    ]
    if not normalized_ids:
        return []

    result = run_repo_command(
        ctx.repo_root,
        (
            "node",
            "--import",
            "tsx",
            "scripts/scaffolds/check-variant-template-references.ts",
            *normalized_ids,
        ),
        timeout=30,
    )
    stdout = str(result.get("stdoutTail") or "").strip()
    try:
        response = json.loads(stdout.splitlines()[-1])
    except (IndexError, json.JSONDecodeError, TypeError):
        detail = str(result.get("stderrTail") or "").strip()
        return [
            "Kunde inte kontrollera sourceTemplateIds mot runtime/addendum-grinden"
            + (f": {detail}" if detail else ".")
        ]

    issues = response.get("issues") if isinstance(response, dict) else None
    if not isinstance(issues, list):
        return [
            "Runtime/addendum-grinden gav ett ogiltigt svar för sourceTemplateIds."
        ]

    errors = [
        str(issue.get("detail") or issue.get("code") or "okänt referensfel")
        for issue in issues
        if isinstance(issue, dict)
    ]
    if errors:
        return [
            "sourceTemplateIds klarar inte runtime/addendum-grinden: "
            + "; ".join(errors)
        ]
    if not result.get("ok"):
        return [
            "Runtime/addendum-grinden rapporterade fel trots att inga detaljer "
            "returnerades."
        ]
    return []




def _validate_variant_payload(ctx: BackofficeContext, payload: dict[str, Any]) -> list[str]:
    """Validate a variant payload against the strict scaffold-variant schema.

    Mirrors the validate-on-save guard used by the manifest editors: returns a
    list of human-readable error strings (empty == safe to write). The
    scaffold-variant create/edit forms call this before ``write_json`` so a
    schema-breaking edit is blocked with ``st.error`` instead of corrupting the
    matching config.

    Utöver schemat blockeras döda ``sourceTemplateIds``, källor som runtime inte
    får välja och källor utan aktuellt/explicit avstängt addendum. Besluten
    hämtas från samma TypeScript-ägare som CI-grinden använder, så Backoffice
    inte kan spara en referens som ``variant-integrity.test.ts`` sedan fäller.
    """
    schema_path = (
        ctx.repo_root / "docs" / "schemas" / "strict" / "scaffold-variant.schema.json"
    )
    errors = validate_json_against_schema(payload, schema_path)

    dead = _dead_source_template_ids(ctx, payload)
    if dead:
        errors.append(_dead_source_template_ids_message(dead))
    errors.extend(_variant_template_reference_errors(ctx, payload))
    return errors




def _signature_patterns_ok(payload: dict[str, Any]) -> bool:
    sp = payload.get("signaturePatterns")
    if not isinstance(sp, dict):
        return False
    layouts = sp.get("layouts")
    motifs = sp.get("motifs")
    anti = sp.get("antiPatterns")
    return (
        isinstance(layouts, list)
        and len(layouts) >= _SIG_MIN_LAYOUTS
        and isinstance(motifs, list)
        and len(motifs) >= _SIG_MIN_MOTIFS
        and isinstance(anti, list)
        and len(anti) >= _SIG_MIN_ANTI
    )




def _sibling_default_variant_ids(
    ctx: BackofficeContext, scaffold_id: str, *, exclude_id: str
) -> list[str]:
    """Ids of OTHER variants in ``scaffold_id`` already marked ``default: true``.

    Used to enforce the gate's "at most one default per scaffold" convention at
    save time (create + edit), mirroring the Wizard's default-conflict guard.
    """
    out: list[str] = []
    variant_dir = ctx.variants_dir / scaffold_id
    if not variant_dir.is_dir():
        return out
    for path in sorted(variant_dir.glob("*.json")):
        if path.stem == exclude_id:
            continue
        try:
            data = read_json(path)
        except Exception:
            continue
        if isinstance(data, dict) and data.get("default") is True:
            out.append(path.stem)
    return out




def _variant_integrity_errors(
    ctx: BackofficeContext,
    payload: dict[str, Any],
    *,
    sibling_defaults: list[str],
    require_signature_patterns: bool = True,
) -> list[str]:
    """Mirror the parts of the CI gate (`variant-integrity.test.ts`) that the
    JSON schema alone does NOT enforce, so the Lifecycle create/edit forms can
    block a save that would later fail ``npm run scaffolds:validate``:

    - curated ``signaturePatterns`` (>=3 layouts / >=2 motifs / >=2 antiPatterns);
    - exactly one ``default: true`` per scaffold;
    - at least one ``sourceTemplateIds`` entry.

    ``require_signature_patterns`` defaults to True (fail-closed for real
    curations). Pass False for the Scaffold Wizard new-scaffold starter: the
    wizard checklist never asks for patterns, and
    ``scaffolds:variant-patterns`` writes them in the post-create step.

    (``sourceTemplateIds`` existence, runtime eligibility and addenda are
    covered by ``_validate_variant_payload``. Embeddings-index membership is
    intentionally NOT checked here: a new entry needs an embedding vector —
    the flow tells the operator to run ``npm run scaffolds:variant-embeddings``
    instead.)
    """
    errors: list[str] = []
    if require_signature_patterns and not _signature_patterns_ok(payload):
        errors.append(
            "signaturePatterns saknas eller är ofullständig — CI-grinden "
            "(`variant-integrity.test.ts`) kräver minst "
            f"{_SIG_MIN_LAYOUTS} layouts, {_SIG_MIN_MOTIFS} motifs och "
            f"{_SIG_MIN_ANTI} antiPatterns. Fyll i fälten under **Advanced**, "
            "eller skapa varianten via **Guide** som AI-kurerar mönstren."
        )
    final_default_count = len(sibling_defaults) + int(payload.get("default") is True)
    if final_default_count > 1:
        errors.append(
            "Scaffolden skulle ha "
            f"{final_default_count} default-varianter (befintliga: "
            + ", ".join(f"`{sibling}`" for sibling in sibling_defaults)
            + "). Konventionen är exakt en default per scaffold — avmarkera "
            "övriga defaults innan du sparar."
        )
    elif final_default_count == 0:
        errors.append(
            "Scaffolden skulle sakna default-variant. Exakt en variant per scaffold "
            "måste ha `default: true` — markera den här eller en syskonvariant som "
            "default innan du sparar."
        )

    source_ids = payload.get("sourceTemplateIds")
    if not (
        isinstance(source_ids, list)
        and any(isinstance(value, str) and value.strip() for value in source_ids)
    ):
        errors.append(
            "Varianten saknar `sourceTemplateIds`. CI-grinden kräver minst ett "
            "runtime-valbart v0-mall-id från Blob-manifestet."
        )
    return errors


def _projected_default_variant_ids(
    ctx: BackofficeContext,
    scaffold_id: str,
    *,
    replacements: dict[Path, dict[str, Any] | None],
) -> list[str]:
    """Return defaults after applying an in-memory multi-file mutation."""
    variant_dir = ctx.variants_dir / scaffold_id
    projected: list[str] = []
    seen: set[Path] = set()
    missing = object()

    for path in sorted(variant_dir.glob("*.json")):
        replacement = replacements.get(path, missing)
        seen.add(path)
        if replacement is None:
            continue
        if replacement is missing:
            try:
                payload = read_json(path)
            except Exception as error:
                raise ValueError(f"Kunde inte läsa varianten `{path.name}`: {error}") from error
        else:
            payload = replacement
        if not isinstance(payload, dict):
            raise ValueError(f"Varianten `{path.name}` måste innehålla ett JSON-objekt.")
        if payload.get("default") is True:
            projected.append(str(payload.get("id", "")).strip() or path.stem)

    unknown_paths = set(replacements) - seen
    if unknown_paths:
        names = ", ".join(f"`{path.name}`" for path in sorted(unknown_paths))
        raise ValueError(f"Default-transaktionen saknar befintliga variantfiler: {names}.")
    return projected


def _handoff_default_variant(
    ctx: BackofficeContext,
    *,
    scaffold_id: str,
    current_path: Path,
    successor_path: Path,
    successor_payload: dict[str, Any] | None = None,
    delete_current: bool = False,
) -> None:
    """Atomically promote one variant while demoting or deleting another.

    The two JSON files are snapshotted as raw bytes before either mutation. The
    projected family must contain exactly one default; if the second operation
    fails, both files are restored byte-for-byte and the original error wins.
    """
    variant_dir = ctx.variants_dir / scaffold_id
    if current_path == successor_path:
        raise ValueError("Nuvarande default och efterträdare måste vara olika varianter.")
    if current_path.parent != variant_dir or successor_path.parent != variant_dir:
        raise ValueError("Default-transaktionen får bara röra varianter i samma scaffold.")
    if not current_path.is_file() or not successor_path.is_file():
        raise ValueError("Båda varianterna måste finnas innan default kan flyttas.")

    current = read_json(current_path)
    successor = successor_payload if successor_payload is not None else read_json(successor_path)
    if not isinstance(current, dict) or not isinstance(successor, dict):
        raise ValueError("Båda variantfilerna måste innehålla JSON-objekt.")
    if str(current.get("scaffoldId", "")).strip() != scaffold_id or str(
        successor.get("scaffoldId", "")
    ).strip() != scaffold_id:
        raise ValueError("Båda varianterna måste tillhöra scaffolden som uppdateras.")

    current_after = dict(current)
    current_after["default"] = False
    successor_after = {
        key: value for key, value in successor.items() if not str(key).startswith("_")
    }
    successor_after["default"] = True
    replacements: dict[Path, dict[str, Any] | None] = {
        current_path: None if delete_current else current_after,
        successor_path: successor_after,
    }
    projected_defaults = _projected_default_variant_ids(
        ctx,
        scaffold_id,
        replacements=replacements,
    )
    if len(projected_defaults) != 1:
        rendered = ", ".join(f"`{variant_id}`" for variant_id in projected_defaults) or "inga"
        raise ValueError(
            "Default-transaktionen skulle lämna "
            f"{len(projected_defaults)} defaults ({rendered}); exakt en krävs."
        )

    originals = {
        current_path: current_path.read_bytes(),
        successor_path: successor_path.read_bytes(),
    }
    try:
        # Promote first so even the transient on-disk state never has zero defaults.
        write_json(successor_path, successor_after)
        if delete_current:
            write_json(current_path, current_after)
            current_path.unlink()
        else:
            write_json(current_path, current_after)
    except Exception as error:
        rollback_errors: list[str] = []
        try:
            current_path.write_bytes(originals[current_path])
        except Exception as rollback_error:
            rollback_errors.append(f"{current_path}: {rollback_error}")
            # Keep the promoted successor intact. Restoring it to non-default
            # after current restoration failed could leave the family at zero.
        else:
            try:
                successor_path.write_bytes(originals[successor_path])
            except Exception as rollback_error:
                rollback_errors.append(f"{successor_path}: {rollback_error}")
        if rollback_errors:
            error.add_note(
                "Default-rollback blev ofullständig efter originalfelet: "
                + "; ".join(rollback_errors)
            )
        raise


def _would_leave_no_default_variant(
    selected_variant: dict[str, Any], variants: list[dict[str, Any]]
) -> bool:
    """Whether deleting ``selected_variant`` would leave zero defaults.

    A broken pre-existing scaffold with two defaults may be repaired by deleting
    one of them. Zero projected defaults means the delete UI must atomically
    promote a readable sibling before it removes the selected variant.
    """
    return not any(
        variant is not selected_variant and variant.get("default") is True
        for variant in variants
    )




def _variant_embeddings_index_path(ctx: BackofficeContext) -> Path:
    return ctx.variants_dir / "_index" / "variant-embeddings.json"


def _sync_variant_embeddings_cache(ctx: BackofficeContext) -> bool:
    """Best-effort: refresh local variant-embeddings cache from Blob/manifest.

    Always prefer Blob as source of truth before prune+push, so a stale on-disk
    cache cannot overwrite newer Blob entries. Returns True when the local
    cache file exists afterwards.
    """
    import subprocess

    path = _variant_embeddings_index_path(ctx)
    try:
        subprocess.run(
            resolve_command(("npm", "run", "embeddings:sync")),
            cwd=str(ctx.repo_root),
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except Exception:
        pass
    return path.is_file()


def _prune_variant_embeddings(
    ctx: BackofficeContext,
    scaffold_id: str,
    variant_ids: list[str] | None = None,
) -> int:
    """Remove variant-embeddings index entries for a deleted variant/scaffold and
    return how many were removed.

    ``variant_ids=None`` prunes EVERY entry for ``scaffold_id`` (used when a whole
    scaffold is deleted); otherwise only the given ``<scaffold>/<id>`` entries are
    removed (single variant delete).

    The CI gate (`variant-integrity.test.ts`) fails on stale index entries for
    deleted variants, so delete-flows call this to keep the index in lockstep
    with the variant files. No-op (returns 0) when the index is missing/unreadable
    or has no matching entries, so it never blocks a delete.
    """
    # Refresh from Blob first so prune+push cannot clobber a newer remote index.
    _sync_variant_embeddings_cache(ctx)
    path = _variant_embeddings_index_path(ctx)
    if not path.is_file():
        return 0
    try:
        data = read_json(path)
    except Exception:
        return 0
    if not isinstance(data, dict) or not isinstance(data.get("embeddings"), list):
        return 0
    original = data["embeddings"]

    def _is_target(entry: Any) -> bool:
        if not isinstance(entry, dict):
            return False
        if str(entry.get("scaffoldId", "")) != scaffold_id:
            return False
        if variant_ids is None:
            return True
        return str(entry.get("id", "")) in {str(vid) for vid in variant_ids}

    filtered = [entry for entry in original if not _is_target(entry)]
    removed = len(original) - len(filtered)
    if removed:
        data["embeddings"] = filtered
        if isinstance(data.get("_meta"), dict):
            data["_meta"]["count"] = len(filtered)
        write_json(path, data)
        _push_variant_embeddings_to_blob(ctx)
    return removed


def _push_variant_embeddings_to_blob(ctx: BackofficeContext) -> None:
    """Best-effort: upload pruned local variant-embeddings JSON to Vercel Blob.

    Uses ``npm run embeddings:push -- --only=variant``. No-op when the command
    fails (missing token, offline) so deletes never block on Blob.
    """
    import subprocess

    try:
        subprocess.run(
            resolve_command(("npm", "run", "embeddings:push", "--", "--only=variant")),
            cwd=str(ctx.repo_root),
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception:
        return


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




def _load_inspiration_lookup(
    ctx: BackofficeContext,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Resolve variants' ``sourceTemplateIds`` against the canonical
    inspiration source: the committed Blob manifest
    (``template-blob-manifest.json``) — v0-mallarna i Vercel Blob. Scaffold
    Wizard skriver Blob-id:n hit. Id:n som inte finns där kan inte användas som
    runtime-inspiration och fälls av integritetsgrinden; de ska ersättas med
    giltiga Blob-id:n.

    NOTE: Källan är inte runtime-dossiers (``data/dossiers/{hard,soft}``).
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




# Valid, deterministic starter signaturePatterns for the auto-created neutral
# variant. Meets the CI gate thresholds (>=3 layouts / >=2 motifs / >=2
# antiPatterns) AND the schema minLengths (layouts >=12, motifs/antiPatterns
# >=10 chars) so a freshly created scaffold's starter variant passes
# `npm run scaffolds:validate` without a manual curation step. Operators can
# still upgrade these with `npm run scaffolds:variant-patterns -- --force
# --only=neutral-core` for AI-curated, variant-specific patterns.
def _neutral_starter_signature_patterns(label: str) -> dict[str, list[str]]:
    return {
        "layouts": [
            "Lead with a clear single-column hero: concise headline, one supporting sentence, and a single primary call-to-action.",
            "Stack content in evenly spaced full-width sections with generous vertical rhythm and a consistent container width.",
            "Use a simple responsive card grid (2-3 columns) for feature or content blocks that collapses to one column on mobile.",
        ],
        "motifs": [
            "Neutral surfaces with a single restrained accent color, comfortable spacing, and a readable typographic hierarchy.",
            "Soft consistent corner radius and light borders so components read as calm and extension-friendly.",
        ],
        "antiPatterns": [
            "Avoid loud gradients, dense dashboards, or heavy decoration that would fight a neutral, adaptable starter.",
            "Do not lock in a strong niche aesthetic; keep the expression flexible until the user's actual domain is known.",
        ],
    }




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

    source_template_ids = [
        str(value).strip()
        for value in (base_payload.get("sourceTemplateIds") or [])
        if str(value).strip()
    ]
    if not source_template_ids:
        raise ValueError(
            "Kunde inte skapa neutral startvariant: "
            "`base-nextjs/starter-neutral.json` saknar `sourceTemplateIds`."
        )

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
            # The neutral starter copies visual tokens and provenance from the
            # same canonical base variant. An empty list passes JSON Schema but
            # fails variant-integrity.test.ts, so fail closed above instead.
            "sourceTemplateIds": source_template_ids,
            "signaturePatterns": _neutral_starter_signature_patterns(label),
            "default": True,
        }
    )
    payload.pop("referenceScaffoldIds", None)
    return payload
