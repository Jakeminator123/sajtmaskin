from __future__ import annotations

from typing import Any

import streamlit as st

from backoffice import wizard_support as wiz
from backoffice.ai_workloads import (
    WORKLOAD_SCAFFOLD_WIZARD_GUIDE,
    WORKLOAD_SCAFFOLD_WIZARD_PERSONA,
    model_supports_vision,
    resolve_model_choices,
)
from backoffice.pages.scaffold_lifecycle import (
    BUILD_INTENT_OPTIONS,
    COMPLEXITY_OPTIONS,
    SITE_KIND_OPTIONS,
    _create_scaffold,
    _dead_source_template_ids,
    _dead_source_template_ids_message,
    _delete_scaffold,
    _slugify,
    _validate_variant_payload,
    _variant_payload,
)
from backoffice.shared import (
    BackofficeContext,
    field_label,
    get_all_manifests,
    read_json,
    render_building_blocks_nav,
    render_save_scope,
    run_repo_command,
    tech_details,
    write_json,
)


def _facade():
    from backoffice.pages import scaffold_wizard as page
    return page


from .constants import (
    PAGE_NAME,
    _STEPS,
)

from .formatting import (
    _lines,
    _font_lines,
    _token_lines,
)



# ---------------------------------------------------------------------------
# Steg 4 — validering + skapande
# ---------------------------------------------------------------------------


def _build_variant_payload(ctx: BackofficeContext, draft: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    variant = draft.get("variant") or {}
    try:
        payload = _variant_payload(
            existing=None,
            scaffold_id=str(variant.get("scaffoldId", "")),
            variant_id=str(variant.get("id", "")),
            label=str(variant.get("label", "")),
            description=str(variant.get("description", "")),
            signature_motif=str(variant.get("signatureMotif", "")),
            color_mode=str(variant.get("colorMode", "either")),
            default_variant=bool(variant.get("default", False)),
            keywords_text=str(variant.get("keywordsText", "")),
            font_pairings_text=str(variant.get("fontsText", "")),
            prompt_hints_text=str(variant.get("hintsText", "")),
            theme_tokens_text=str(variant.get("tokensText", "")),
            style_rules_text="",
            section_inventory_text="",
            avoid_patterns_text="",
            world_class_text="",
            source_template_ids_text=str(variant.get("sourceTemplateId", "")),
            reference_scaffold_ids_text="",
        )
    except ValueError as error:
        return None, str(error)
    payload = {"$schema": "../../../docs/schemas/strict/scaffold-variant.schema.json", **payload}
    return payload, None




def _planned_writes(draft: dict[str, Any]) -> list[str]:
    """Repo-relativa sökvägar som "Skapa nu" skriver — inget annat rörs.

    Spegling av :func:`_apply` (och, för ny scaffold,
    ``scaffold_lifecycle._create_scaffold``) så steg 4 kan säga vad som händer
    *innan* checklistan, inte bara efteråt. Ren funktion utan Streamlit, så
    listan kan grindas i test mot vad koden faktiskt skriver.
    """
    variant = draft.get("variant") or {}
    scaffold_id = str(variant.get("scaffoldId", "")).strip() or "<scaffold>"
    variant_id = str(variant.get("id", "")).strip() or "<variant>"

    paths: list[str] = []
    if draft.get("mode") == "new-scaffold":
        clone_from = str((draft.get("scaffold") or {}).get("cloneFrom", "")).strip()
        cloned = f" (klonas från `{clone_from}`)" if clone_from else ""
        paths += [
            f"src/lib/gen/scaffolds/{scaffold_id}/manifest.ts",
            f"src/lib/gen/scaffolds/{scaffold_id}/files/{cloned}",
            "src/lib/gen/scaffolds/types.ts",
            "src/lib/gen/scaffolds/registry.ts",
            "src/lib/gen/scaffolds/scaffold-embedding-locale.ts",
            "docs/schemas/strict/scaffold-variant.schema.json",
        ]
    paths.append(f"config/scaffold-variants/{scaffold_id}/{variant_id}.json")
    return paths




def _autorun_writes(draft: dict[str, Any]) -> list[dict[str, str]]:
    """Filer som efter-stegen skriver om direkt efter "Skapa nu".

    "Skapa nu" sätter ``swz_autorun``, och nästa render kör
    :func:`_post_create_steps` automatiskt. Stegen är alltså en del av
    sparningen även om de ligger i separata npm-skript — utelämnas de här säger
    rutan "det här kommer att skrivas" och räknar ändå inte upp allt som skrivs.

    Sökvägarna är lästa ur skripten, inte gissade:

    * ``scaffolds:variant-patterns`` → ``auto-curate-variant-patterns.ts``
      skriver ``writeFileSync(ref.filePath, …)``, alltså variantfilen själv
      (``--only`` gör att bara den nyss skapade varianten rörs).
    * ``scaffolds:variant-embeddings`` → ``generate-variant-embeddings.ts``
      skriver ``OUTPUT_PATH``, dvs
      ``config/scaffold-variants/_index/variant-embeddings.json``, och bygger om
      hela indexet från samtliga varianter.
    * ``scaffolds:validate`` kör vitest och skriver ingenting.

    Båda skrivstegen har ``needs_api`` och hoppas över utan ``OPENAI_API_KEY``,
    så anroparen måste säga vilket fall som gäller.
    `backoffice/test_scaffold_lifecycle_ui.py` grindar listan mot skriptens
    faktiska ``writeFileSync``-mål.
    """
    variant = draft.get("variant") or {}
    scaffold_id = str(variant.get("scaffoldId", "")).strip() or "<scaffold>"
    variant_id = str(variant.get("id", "")).strip() or "<variant>"

    return [
        {
            "path": f"config/scaffold-variants/{scaffold_id}/{variant_id}.json",
            "script": "scaffolds:variant-patterns",
            "source": "scripts/scaffolds/auto-curate-variant-patterns.ts",
            "note": "variantfilen skrivs om med `signaturePatterns` (bara din variant)",
        },
        {
            "path": "config/scaffold-variants/_index/variant-embeddings.json",
            "script": "scaffolds:variant-embeddings",
            "source": "scripts/scaffolds/generate-variant-embeddings.ts",
            "note": "hela matchningsindexet byggs om, inte bara din variant",
        },
    ]




def _run_checks(ctx: BackofficeContext, draft: dict[str, Any]) -> tuple[list[dict[str, str]], dict[str, Any] | None]:
    """Return (checklist rows, variant payload if buildable)."""
    checks: list[dict[str, str]] = []
    variant = draft.get("variant") or {}
    new_scaffold = draft.get("mode") == "new-scaffold"
    scaffold = draft.get("scaffold") or {}

    def add(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"kontroll": name, "status": "✅" if ok else "❌", "detalj": detail})

    import re as _re

    kebab = _re.compile(r"^[a-z][a-z0-9-]*$")
    variant_id = str(variant.get("id", ""))
    scaffold_id = str(variant.get("scaffoldId", ""))

    add("Variant-ID är kebab-case", bool(kebab.fullmatch(variant_id)), variant_id or "(saknas)")
    add(f"{field_label('label')} ifyllt", bool(str(variant.get("label", "")).strip()))
    add(
        f"{field_label('signatureMotif')} ifyllt",
        bool(str(variant.get("signatureMotif", "")).strip()),
    )

    payload, build_error = _build_variant_payload(ctx, draft)
    add("Variantfälten kan tolkas", payload is not None, build_error or "")

    if new_scaffold:
        add("Scaffold-ID är kebab-case", bool(kebab.fullmatch(scaffold_id)), scaffold_id or "(saknas)")
        existing_ids = {str(m.get("id", "")) for m in get_all_manifests(ctx)}
        add("Scaffold-ID är ledigt", scaffold_id not in existing_ids and bool(scaffold_id))
        add("Scaffold-namn ifyllt", bool(str(scaffold.get("label", "")).strip()))
        add("Scaffold-beskrivning ifylld", bool(str(scaffold.get("description", "")).strip()))
        add("Minst ett build intent", bool(scaffold.get("intents")))
        hint_count = len([l for l in str(scaffold.get("hintsText", "")).splitlines() if l.strip()])
        quality_count = len([l for l in str(scaffold.get("qualityText", "")).splitlines() if l.strip()])
        upgrade_count = len([l for l in str(scaffold.get("upgradesText", "")).splitlines() if l.strip()])
        add("Minst 2 prompt hints (scaffold)", hint_count >= 2, f"{hint_count} rader")
        add("Minst 3 quality checklist-rader", quality_count >= 3, f"{quality_count} rader")
        add("Minst 1 upgrade target", upgrade_count >= 1, f"{upgrade_count} rader")
        add(
            "Startvariant skapas (scaffold utan variant är omöjligt här)",
            True,
            "wizarden skriver varianten direkt efter scaffolden",
        )
    else:
        target_path = ctx.variants_dir / scaffold_id / f"{variant_id}.json"
        add(
            "Variantfilen är ledig",
            not target_path.exists(),
            target_path.relative_to(ctx.repo_root).as_posix(),
        )
        default_conflict = ""
        if payload is not None and payload.get("default"):
            variant_dir = ctx.variants_dir / scaffold_id
            if variant_dir.is_dir():
                for sibling in variant_dir.glob("*.json"):
                    try:
                        sibling_payload = read_json(sibling)
                    except Exception:
                        continue
                    if isinstance(sibling_payload, dict) and sibling_payload.get("default"):
                        default_conflict = f"`{sibling.stem}` är redan default"
                        break
        add(
            "Ingen default-krock",
            not default_conflict,
            default_conflict or "konvention: exakt en default per scaffold",
        )

    if payload is not None:
        if new_scaffold:
            # The new scaffold's id isn't in the on-disk schema enum yet, so use
            # the in-memory enum patch. But ALSO run the Blob sourceTemplateIds
            # integrity check (variant-integrity.test.ts gate) that
            # _validate_variant_payload does — schema validation alone won't
            # catch a sourceTemplateId missing from template-blob-manifest.json.
            schema = wiz.load_variant_schema(ctx.repo_root)
            errors = wiz.validate_variant_payload_against_schema(
                payload, schema, extra_scaffold_id=scaffold_id
            )
            dead = _dead_source_template_ids(ctx, payload)
            if dead:
                errors = [*errors, _dead_source_template_ids_message(dead)]
        else:
            errors = _validate_variant_payload(ctx, payload)
        add(
            "Varianten klarar det strikta schemat",
            not errors,
            "; ".join(errors[:3]) if errors else "",
        )
    else:
        add("Varianten klarar det strikta schemat", False, "kan inte valideras — fältfel ovan")

    return checks, payload




def _apply(ctx: BackofficeContext, draft: dict[str, Any], payload: dict[str, Any]) -> str:
    """Persist the draft. Returns a human-readable success message. Raises on error."""
    from backoffice.pages.scaffold_lifecycle import _normalize_lines

    new_scaffold = draft.get("mode") == "new-scaffold"
    variant = draft["variant"]
    scaffold_id = str(variant["scaffoldId"])

    if new_scaffold:
        scaffold = draft["scaffold"]
        _create_scaffold(
            ctx,
            source_scaffold_id=str(scaffold["cloneFrom"]),
            scaffold_id=scaffold_id,
            label=str(scaffold["label"]),
            description=str(scaffold["description"]),
            site_kind=str(scaffold.get("siteKind", "")),
            complexity=str(scaffold.get("complexity", "")),
            structure_profile="",
            content_profile="",
            features=[],
            allowed_build_intents=list(scaffold.get("intents") or []),
            tags=_normalize_lines(str(scaffold.get("tagsText", ""))),
            prompt_hints=_normalize_lines(str(scaffold.get("hintsText", ""))),
            quality_checklist=_normalize_lines(str(scaffold.get("qualityText", ""))),
            upgrade_targets=_normalize_lines(str(scaffold.get("upgradesText", ""))),
            create_start_variant=False,
        )
        try:
            variant_dir = ctx.variants_dir / scaffold_id
            variant_dir.mkdir(parents=True, exist_ok=True)
            write_json(variant_dir / f"{variant['id']}.json", payload)
        except Exception:
            # Rulla tillbaka den nyss skapade scaffolden. Best-effort +
            # snapshot=False: en fabriks-fräsch scaffold behöver ingen
            # undo-snapshot, och en fail-closed städning får aldrig maskera
            # det ursprungliga variant-skrivfelet nedan.
            try:
                _delete_scaffold(ctx, scaffold_id, snapshot=False)
            except Exception:
                pass
            raise
        return (
            f"Skapade scaffolden `{scaffold_id}` (klonad från `{scaffold['cloneFrom']}`) "
            f"med startvarianten `{variant['id']}`."
        )

    variant_dir = ctx.variants_dir / scaffold_id
    variant_dir.mkdir(parents=True, exist_ok=True)
    write_json(variant_dir / f"{variant['id']}.json", payload)
    return f"Skapade varianten `{variant['id']}` i scaffolden `{scaffold_id}`."




# ---------------------------------------------------------------------------
# Steg 4b — efter skapande: kör efter-stegen automatiskt (inga kommandon)
# ---------------------------------------------------------------------------


def _post_create_steps(variant_id: str) -> list[dict[str, Any]]:
    """De tre efter-stegen som annars körs manuellt i terminalen."""
    return [
        {
            "key": "patterns",
            "label": "1. Fyll designmönster (AI)",
            "command": ("npm", "run", "scaffolds:variant-patterns", "--", f"--only={variant_id}"),
            "needs_api": True,
            "help": (
                "Låter en modell skriva layouts/motifs/antiPatterns för just den här "
                "varianten. `--only` gör att bara din variant rörs — de andra lämnas orörda."
            ),
        },
        {
            "key": "embeddings",
            "label": "2. Bygg om matchning",
            "command": ("npm", "run", "scaffolds:variant-embeddings"),
            "needs_api": True,
            "help": (
                "Bygger om variant-embeddings så matchern kan välja varianten. Anropar "
                "OpenAI för alla varianter — kan ta en stund."
            ),
        },
        {
            "key": "validate",
            "label": "3. Validera",
            "command": ("npm", "run", "scaffolds:validate"),
            "needs_api": False,
            "help": "Kör schema + kollisionskontroller. Snabb, ingen API-nyckel behövs.",
        },
    ]




def _variant_has_patterns(ctx: BackofficeContext, scaffold_id: str, variant_id: str) -> bool:
    """True only if the variant file actually has a populated signaturePatterns.

    `scaffolds:variant-patterns` exits 0 even when the LLM call failed or the
    variant was skipped, so exit code alone would be a false-green signal.
    """
    if not scaffold_id or not variant_id:
        return False
    path = ctx.variants_dir / scaffold_id / f"{variant_id}.json"
    if not path.is_file():
        return False
    try:
        sp = (read_json(path) or {}).get("signaturePatterns") or {}
    except Exception:
        return False
    return bool(sp.get("layouts") and sp.get("motifs") and sp.get("antiPatterns"))
