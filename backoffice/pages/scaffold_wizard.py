"""Scaffold Wizard — pedagogiskt steg-för-steg-flöde: v0-mall i Blob → utkast →
validerad scaffold-variant (eller ny scaffold + startvariant).

Flödet är avsiktligt idiotsäkert:
- Mallarna listas från det committade Blob-manifestet (`template-blob-manifest.json`).
- En OpenAI-persona (vision: stillbild + kodutdrag ur zippen) skriver ett UTKAST.
- Ingenting persisteras i `config/` eller `src/lib/gen/scaffolds/` förrän
  valideringschecklistan i sista steget är helt grön.
- Utkast sparas i `data/scaffold-wizard-drafts/` (gitignorerad) så inget går förlorat.
- Utan OPENAI_API_KEY fungerar allt i manuellt läge — persona-steget hoppas över.
"""

from __future__ import annotations

from typing import Any

import streamlit as st

from backoffice import wizard_support as wiz
from backoffice.pages.scaffold_lifecycle import (
    BUILD_INTENT_OPTIONS,
    COMPLEXITY_OPTIONS,
    SITE_KIND_OPTIONS,
    _create_scaffold,
    _delete_scaffold,
    _slugify,
    _validate_variant_payload,
    _variant_payload,
)
from backoffice.shared import (
    BackofficeContext,
    get_all_manifests,
    read_json,
    render_where_panel,
    run_repo_command,
    write_json,
)

_STEPS = (
    "1. Välj mall i Blob",
    "2. Persona-analys",
    "3. Granska utkast",
    "4. Validera & skapa",
)


def _step() -> int:
    return int(st.session_state.get("swz_step", 0))


def _goto(step: int) -> None:
    st.session_state["swz_step"] = max(0, min(step, len(_STEPS) - 1))
    st.rerun()


def _draft() -> dict[str, Any]:
    return st.session_state.setdefault("swz_draft", {})


def _lines(values: Any) -> str:
    if isinstance(values, list):
        return "\n".join(str(v).strip() for v in values if str(v).strip())
    return ""


def _font_lines(values: Any) -> str:
    if not isinstance(values, list):
        return ""
    rows = []
    for entry in values:
        if isinstance(entry, dict) and entry.get("heading") and entry.get("body"):
            rows.append(f"{entry['heading']} | {entry['body']}")
    return "\n".join(rows)


def _token_lines(tokens: Any) -> str:
    if not isinstance(tokens, dict):
        return ""
    return "\n".join(f"{key} = {value}" for key, value in tokens.items() if str(value).strip())


def _render_progress() -> None:
    current = _step()
    cols = st.columns(len(_STEPS))
    for idx, (col, name) in enumerate(zip(cols, _STEPS)):
        with col:
            if idx < current:
                st.markdown(f"✅ ~~{name}~~")
            elif idx == current:
                st.markdown(f"🔵 **{name}**")
            else:
                st.markdown(f"⚪ {name}")
    st.divider()


def _render_guide(ctx: BackofficeContext, step_context: str) -> None:
    """Interaktiv AI-guide: operatören kan ställa frågor om aktuellt steg."""
    api_key = wiz.get_openai_api_key()
    with st.expander("🤝 Fråga guiden (AI) om det här steget", expanded=False):
        if not api_key:
            st.caption(
                "Ingen `OPENAI_API_KEY` i miljön (`.env.local`) — guiden är avstängd. "
                "Wizarden fungerar ändå manuellt."
            )
            return
        question = st.text_input(
            "Din fråga",
            key=f"swz_guide_q_{_step()}",
            placeholder="T.ex. Vad är skillnaden på scaffold och variant?",
        )
        if st.button("Fråga", key=f"swz_guide_btn_{_step()}") and question.strip():
            try:
                with st.spinner("Guiden funderar…"):
                    answer = wiz.ask_guide(
                        api_key=api_key,
                        model="gpt-4o",
                        step_context=step_context,
                        question=question.strip(),
                    )
                st.session_state[f"swz_guide_a_{_step()}"] = answer
            except (RuntimeError, ValueError) as error:
                st.error(str(error))
        answer = st.session_state.get(f"swz_guide_a_{_step()}")
        if answer:
            st.info(answer)


# ---------------------------------------------------------------------------
# Steg 1 — välj mall
# ---------------------------------------------------------------------------


def _render_step_pick(ctx: BackofficeContext) -> None:
    st.subheader("Steg 1 — Välj en v0-mall från Vercel Blob som inspiration")
    st.caption(
        "Mallarna nedan är de zippar som redan ligger i Blob (samma källa som "
        "Templates-galleriet på sajten, `template-blob-manifest.json`). Mallen används "
        "**endast som inspiration** — inga filer kopieras in i scaffolden. Det som skapas "
        "är en scaffold-variant (visuellt uttryck) eller en ny scaffold vars filer klonas "
        "från en **befintlig** scaffold-shell, så stack och paket förblir kompatibla."
    )

    templates = wiz.load_blob_templates(ctx.repo_root)
    if not templates:
        st.warning(
            "Hittar inga mallar i `src/lib/templates/template-blob-manifest.json`. "
            "Ladda upp mallar via sidan **Mallar → Blob-upload** först."
        )
        return

    categories = sorted({str(t.get("category", "")) for t in templates})
    chosen_category = st.selectbox("Kategori", ["(alla)"] + categories, key="swz_category")
    filtered = [
        t
        for t in templates
        if chosen_category == "(alla)" or str(t.get("category", "")) == chosen_category
    ]
    labels = [f"{t.get('title', t['id'])} · {t.get('category', '')}" for t in filtered]
    if not filtered:
        st.info("Inga mallar i den kategorin.")
        return
    picked_label = st.selectbox(f"Mall ({len(filtered)} st)", labels, key="swz_template_pick")
    template = filtered[labels.index(picked_label)]

    col_img, col_meta = st.columns([2, 1])
    with col_img:
        still = str(template.get("stillImageUrl", "")).strip()
        if still:
            st.image(still, caption=template.get("title", ""), width="stretch")
        else:
            st.caption("Ingen stillbild för den här mallen.")
    with col_meta:
        st.markdown(f"**Blob-id:** `{template.get('id')}`")
        size_mb = (template.get("archiveSizeBytes") or 0) / (1024 * 1024)
        st.markdown(f"**Zip-storlek:** {size_mb:.1f} MB")
        st.markdown(f"**Kategori:** `{template.get('category', '')}`")
        if template.get("previewFits") is False:
            st.warning("Mallen är för stor för preview-VM:en — går ändå bra som inspiration.")

    if st.button("Använd den här mallen →", type="primary"):
        st.session_state["swz_template"] = template
        st.session_state.pop("swz_analysis", None)
        st.session_state.pop("swz_repo_summary", None)
        _goto(1)

    _render_guide(
        ctx,
        "Steg 1: operatören väljer en v0-mall (zip i Vercel Blob) som inspirationskälla. "
        "Mallen kopieras aldrig — den inspirerar en scaffold-variant eller en ny scaffold "
        "vars filer klonas från befintlig scaffold-shell.",
    )


# ---------------------------------------------------------------------------
# Steg 2 — persona-analys
# ---------------------------------------------------------------------------


def _render_step_persona(ctx: BackofficeContext) -> None:
    template = st.session_state.get("swz_template")
    if not template:
        st.warning("Ingen mall vald — gå tillbaka till steg 1.")
        if st.button("← Till steg 1"):
            _goto(0)
        return

    st.subheader("Steg 2 — Låt en persona titta på mallen")
    st.caption(
        "Personan (en OpenAI-modell med syn) får mallens stillbild + kodutdrag ur zippen "
        "och skriver ett **utkast**: beskrivning, matchord, typsnitt, färgtokens och en "
        "rekommendation om det ska bli en ny variant eller en ny scaffold. Du granskar och "
        "ändrar allt i steg 3 — inget sparas ännu."
    )
    st.markdown(f"Vald mall: **{template.get('title')}** (`{template.get('id')}`)")

    api_key = wiz.get_openai_api_key()
    if not api_key:
        st.warning(
            "Ingen `OPENAI_API_KEY` i miljön — persona-steget hoppas över. "
            "Du kan fylla i allt manuellt i steg 3."
        )
        if st.button("Fortsätt manuellt →", type="primary"):
            _goto(2)
        if st.button("← Byt mall"):
            _goto(0)
        return

    persona_name = st.selectbox(
        "Persona", list(wiz.PERSONA_PRESETS.keys()), key="swz_persona_name"
    )
    persona_prompt = st.text_area(
        "Persona-instruktion (redigerbar)",
        value=wiz.PERSONA_PRESETS[persona_name],
        height=110,
        key=f"swz_persona_prompt_{persona_name}",
    )
    model = st.selectbox("Modell", list(wiz.WIZARD_MODEL_CHOICES), key="swz_model")
    include_code = st.checkbox(
        "Ladda ner zippen och låt personan läsa nyckel-filer (package.json, layout, page, CSS)",
        value=True,
        key="swz_include_code",
        help="Läses bara i minnet med storleksgränser — packas aldrig upp på disk, körs aldrig.",
    )

    if st.button("Kör persona-analys", type="primary"):
        manifests = get_all_manifests(ctx)
        scaffold_options = [
            {
                "id": str(m.get("id", "")),
                "label": str(m.get("label", "")),
                "description": str(m.get("description", "")),
            }
            for m in manifests
            if m.get("id")
        ]
        repo_summary = None
        try:
            if include_code:
                with st.spinner("Hämtar och analyserar zippen (i minnet)…"):
                    zip_bytes = wiz.download_zip_bytes(str(template.get("archiveUrl", "")))
                    repo_summary = wiz.summarize_template_zip(zip_bytes)
                st.session_state["swz_repo_summary"] = repo_summary
            with st.spinner("Personan tittar på mallen…"):
                analysis = wiz.run_persona_analysis(
                    api_key=api_key,
                    model=model,
                    persona_prompt=persona_prompt,
                    template_meta=template,
                    repo_summary=repo_summary,
                    scaffold_options=scaffold_options,
                )
            st.session_state["swz_analysis"] = analysis
            draft_record = {
                "templateId": template.get("id"),
                "templateTitle": template.get("title"),
                "persona": persona_name,
                "model": model,
                "analysis": analysis,
            }
            saved = wiz.save_draft(ctx.repo_root, draft_record)
            st.session_state["swz_draft_path"] = str(saved)
        except (RuntimeError, ValueError, OSError) as error:
            st.error(f"Analysen misslyckades: {error}")

    analysis = st.session_state.get("swz_analysis")
    if analysis:
        st.success("Personan är klar. Läs anteckningarna och gå vidare till granskning.")
        st.info(str(analysis.get("personaNotes", "(inga anteckningar)")))
        recommendation = str(analysis.get("recommendation", "new-variant"))
        reason = str(analysis.get("recommendationReason", ""))
        target = str(analysis.get("targetScaffoldId", ""))
        if recommendation == "new-scaffold":
            st.markdown(f"**Rekommendation:** ny scaffold — {reason}")
        else:
            st.markdown(f"**Rekommendation:** ny variant till `{target}` — {reason}")
        draft_path = st.session_state.get("swz_draft_path")
        if draft_path:
            st.caption(f"Utkastet är sparat: `{draft_path}` (gitignorerad mapp).")
        if st.button("Granska utkastet →", type="primary"):
            _goto(2)

    if st.button("← Byt mall"):
        _goto(0)

    _render_guide(
        ctx,
        "Steg 2: en OpenAI-persona analyserar mallen (stillbild + kodutdrag) och skriver "
        "ett utkast till scaffold-variant eller ny scaffold. Inget sparas i runtime-config "
        "ännu; utkastet hamnar i data/scaffold-wizard-drafts/.",
    )


# ---------------------------------------------------------------------------
# Steg 3 — granska/justera utkast
# ---------------------------------------------------------------------------


def _render_step_review(ctx: BackofficeContext) -> None:
    template = st.session_state.get("swz_template")
    if not template:
        st.warning("Ingen mall vald — gå tillbaka till steg 1.")
        if st.button("← Till steg 1"):
            _goto(0)
        return

    analysis = st.session_state.get("swz_analysis") or {}
    variant_draft = analysis.get("variantDraft") or {}
    scaffold_draft = analysis.get("scaffoldDraft") or {}

    st.subheader("Steg 3 — Granska och justera utkastet")
    st.caption(
        "Allt nedan är förslag — du bestämmer. Fälten motsvarar exakt variant-schemat "
        "(`docs/schemas/strict/scaffold-variant.schema.json`). I steg 4 valideras allt "
        "innan något skrivs."
    )

    manifests = get_all_manifests(ctx)
    scaffold_ids = [str(m.get("id", "")) for m in manifests if m.get("id")]
    if not scaffold_ids:
        st.warning(
            "Inga runtime-scaffolds hittades i `src/lib/gen/scaffolds/` — wizarden "
            "behöver minst en befintlig scaffold (som mål för varianten eller som "
            "klonkälla). Återställ scaffold-ytorna via Scaffold Lifecycle → Baseline."
        )
        if st.button("← Till steg 1", key="swz_review_empty_back"):
            _goto(0)
        return

    recommended_mode = (
        "Ny scaffold + startvariant"
        if str(analysis.get("recommendation", "")) == "new-scaffold"
        else "Ny variant till befintlig scaffold"
    )
    mode = st.radio(
        "Vad ska skapas?",
        ["Ny variant till befintlig scaffold", "Ny scaffold + startvariant"],
        index=0 if recommended_mode.startswith("Ny variant") else 1,
        key="swz_mode",
        help="En scaffold kan aldrig skapas utan variant — wizarden skapar alltid startvarianten åt dig.",
    )
    new_scaffold = mode == "Ny scaffold + startvariant"

    draft = _draft()
    draft["mode"] = "new-scaffold" if new_scaffold else "new-variant"

    if new_scaffold:
        st.markdown("#### Ny scaffold (filshell klonas från befintlig scaffold)")
        clone_default = str(scaffold_draft.get("cloneFromScaffoldId", "")).strip()
        clone_from = st.selectbox(
            "Klona filer från",
            scaffold_ids,
            index=scaffold_ids.index(clone_default) if clone_default in scaffold_ids else 0,
            key="swz_clone_from",
            help="Garanterar att den nya scaffolden använder samma stack och paket.",
        )
        scaffold_label = st.text_input(
            "Scaffold-label", value=str(scaffold_draft.get("label", "")), key="swz_sc_label"
        )
        scaffold_id = st.text_input(
            "Scaffold-ID (kebab-case)",
            value=_slugify(scaffold_label) if scaffold_label else "",
            key="swz_sc_id",
        )
        scaffold_description = st.text_area(
            "Scaffold-beskrivning (engelska)",
            value=str(scaffold_draft.get("description", "")),
            height=70,
            key="swz_sc_desc",
        )
        c1, c2 = st.columns(2)
        with c1:
            site_kind_options = [""] + list(SITE_KIND_OPTIONS)
            draft_site_kind = str(scaffold_draft.get("siteKind", ""))
            site_kind = st.selectbox(
                "Site Kind",
                site_kind_options,
                index=site_kind_options.index(draft_site_kind)
                if draft_site_kind in site_kind_options
                else 0,
                key="swz_sc_site_kind",
            )
        with c2:
            complexity_options = [""] + list(COMPLEXITY_OPTIONS)
            draft_complexity = str(scaffold_draft.get("complexity", ""))
            complexity = st.selectbox(
                "Complexity",
                complexity_options,
                index=complexity_options.index(draft_complexity)
                if draft_complexity in complexity_options
                else 0,
                key="swz_sc_complexity",
            )
        intents = st.multiselect(
            "Allowed Build Intents",
            options=list(BUILD_INTENT_OPTIONS),
            default=["website"],
            key="swz_sc_intents",
        )
        tags_text = st.text_area(
            "Tags (en per rad)", value=_lines(scaffold_draft.get("tags")), height=90, key="swz_sc_tags"
        )
        sc_hints_text = st.text_area(
            "Prompt Hints (minst 2 rader)",
            value=_lines(scaffold_draft.get("promptHints")),
            height=90,
            key="swz_sc_hints",
        )
        sc_quality_text = st.text_area(
            "Quality Checklist (minst 3 rader)",
            value=_lines(scaffold_draft.get("qualityChecklist")),
            height=90,
            key="swz_sc_quality",
        )
        sc_upgrades_text = st.text_area(
            "Research Upgrade Targets (minst 1 rad)",
            value=_lines(scaffold_draft.get("upgradeTargets")),
            height=70,
            key="swz_sc_upgrades",
        )
        draft["scaffold"] = {
            "cloneFrom": clone_from,
            "id": scaffold_id.strip(),
            "label": scaffold_label.strip(),
            "description": scaffold_description.strip(),
            "siteKind": site_kind,
            "complexity": complexity,
            "intents": intents,
            "tagsText": tags_text,
            "hintsText": sc_hints_text,
            "qualityText": sc_quality_text,
            "upgradesText": sc_upgrades_text,
        }
        target_scaffold_id = scaffold_id.strip()
    else:
        draft.pop("scaffold", None)
        target_default = str(analysis.get("targetScaffoldId", "")).strip()
        target_scaffold_id = st.selectbox(
            "Scaffold att lägga varianten i",
            scaffold_ids,
            index=scaffold_ids.index(target_default) if target_default in scaffold_ids else 0,
            key="swz_target_scaffold",
        )

    st.markdown("#### Variant (det visuella uttrycket)")
    variant_label = st.text_input(
        "Label", value=str(variant_draft.get("label", "")), key="swz_v_label"
    )
    variant_id = st.text_input(
        "Variant-ID (kebab-case)",
        value=str(variant_draft.get("id", "")) or _slugify(variant_label),
        key="swz_v_id",
    )
    variant_description = st.text_area(
        "Description",
        value=str(variant_draft.get("description", "")),
        height=80,
        key="swz_v_desc",
    )
    signature_motif = st.text_input(
        "Signature Motif (en fras, 10–120 tecken)",
        value=str(variant_draft.get("signatureMotif", "")),
        key="swz_v_motif",
    )
    color_options = ["light", "dark", "either"]
    draft_color = str(variant_draft.get("colorMode", "either"))
    color_mode = st.selectbox(
        "Color Mode",
        color_options,
        index=color_options.index(draft_color) if draft_color in color_options else 2,
        key="swz_v_color",
    )
    keywords_text = st.text_area(
        "Keywords (en per rad, minst 3)",
        value=_lines(variant_draft.get("keywords")),
        height=110,
        key="swz_v_keywords",
    )
    fonts_text = st.text_area(
        "Font Pairings (`Heading | Body` per rad)",
        value=_font_lines(variant_draft.get("fontPairings")),
        height=80,
        key="swz_v_fonts",
    )
    hints_text = st.text_area(
        "Prompt Hints (en per rad, specifika visuella direktiv)",
        value=_lines(variant_draft.get("promptHints")),
        height=90,
        key="swz_v_hints",
    )
    tokens_text = st.text_area(
        "Theme Tokens (`token = värde` per rad, oklch för färger)",
        value=_token_lines(variant_draft.get("themeTokens")),
        height=120,
        key="swz_v_tokens",
    )
    default_variant = st.checkbox(
        "Default-variant",
        value=new_scaffold,
        key="swz_v_default",
        help="En ny scaffolds startvariant bör vara default. Konvention: exakt en default per scaffold.",
    )
    st.caption(
        f"`sourceTemplateIds` sätts automatiskt till mallens Blob-id: `{template.get('id')}` "
        "— så syns inspirationskällan i översikten."
    )

    draft["variant"] = {
        "scaffoldId": target_scaffold_id,
        "id": variant_id.strip(),
        "label": variant_label.strip(),
        "description": variant_description,
        "signatureMotif": signature_motif.strip(),
        "colorMode": color_mode,
        "keywordsText": keywords_text,
        "fontsText": fonts_text,
        "hintsText": hints_text,
        "tokensText": tokens_text,
        "default": default_variant,
        "sourceTemplateId": str(template.get("id", "")),
    }

    col_back, col_next = st.columns(2)
    with col_back:
        if st.button("← Tillbaka till persona"):
            _goto(1)
    with col_next:
        if st.button("Validera →", type="primary"):
            _goto(3)

    _render_guide(
        ctx,
        "Steg 3: operatören granskar och justerar utkastets fält. Varianten motsvarar "
        "scaffold-variant-schemat. Vid 'ny scaffold' klonas filerna alltid från en "
        "befintlig scaffold så stacken är kompatibel.",
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
    add("Label ifylld", bool(str(variant.get("label", "")).strip()))
    add("Signature Motif ifylld", bool(str(variant.get("signatureMotif", "")).strip()))

    payload, build_error = _build_variant_payload(ctx, draft)
    add("Variantfälten kan tolkas", payload is not None, build_error or "")

    if new_scaffold:
        add("Scaffold-ID är kebab-case", bool(kebab.fullmatch(scaffold_id)), scaffold_id or "(saknas)")
        existing_ids = {str(m.get("id", "")) for m in get_all_manifests(ctx)}
        add("Scaffold-ID är ledigt", scaffold_id not in existing_ids and bool(scaffold_id))
        add("Scaffold-label ifylld", bool(str(scaffold.get("label", "")).strip()))
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
            schema = wiz.load_variant_schema(ctx.repo_root)
            errors = wiz.validate_variant_payload_against_schema(
                payload, schema, extra_scaffold_id=scaffold_id
            )
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


def _render_step_validate(ctx: BackofficeContext) -> None:
    import pandas as pd

    # Efter lyckat skapande: visa den persistenta "Slutför automatiskt"-panelen
    # (knappar som kör efter-stegen) i stället för validerings-/skapa-flödet.
    created = st.session_state.get("swz_created")
    if created:
        _render_post_create(ctx, created)
        return

    draft = _draft()
    if not draft.get("variant"):
        st.warning("Inget utkast att validera — gå tillbaka till steg 3.")
        if st.button("← Till steg 3"):
            _goto(2)
        return

    st.subheader("Steg 4 — Validering och skapande")
    st.caption(
        "Skapa-knappen är låst tills alla kontroller är gröna. Skapandet använder samma "
        "transaktionslogik som Scaffold Lifecycle (rollback vid fel)."
    )

    checks, payload = _run_checks(ctx, draft)
    st.dataframe(pd.DataFrame(checks), width="stretch", hide_index=True)
    all_green = all(check["status"] == "✅" for check in checks)

    if not all_green:
        st.error("Åtgärda de röda kontrollerna i steg 3 innan du kan skapa.")
    else:
        st.success("Alla kontroller gröna — redo att skapa.")

    with st.expander("Visa exakt variant-JSON som skrivs", expanded=False):
        if payload is not None:
            st.json(payload)

    col_back, col_create = st.columns(2)
    with col_back:
        if st.button("← Justera utkastet"):
            _goto(2)
    with col_create:
        if st.button("Skapa nu", type="primary", disabled=not all_green or payload is None):
            try:
                message = _apply(ctx, draft, payload)
            except Exception as error:
                st.error(f"Skapandet misslyckades (rollback körd där möjligt): {error}")
                return
            # Behåll steget på 4 och byt till den persistenta slutför-panelen.
            # Efter-stegen (designmönster → embeddings → validering) körs
            # automatiskt vid nästa render — operatören ska aldrig lämnas med
            # en halvfärdig variant utan att veta vad som återstår.
            st.session_state["swz_created"] = {
                "variantId": str((payload or {}).get("id", "")),
                "scaffoldId": str((payload or {}).get("scaffoldId", "")),
                "message": message,
            }
            st.session_state["swz_autorun"] = True
            for key in ("swz_draft", "swz_analysis", "swz_template", "swz_repo_summary"):
                st.session_state.pop(key, None)
            st.session_state.pop("swz_cmd_results", None)
            st.session_state.pop("swz_balloons_shown", None)
            st.rerun()

    _render_guide(
        ctx,
        "Steg 4: checklista-validering (kebab-case-id, schema, kollisioner, default-konvention) "
        "och själva skapandet. Efteråt kör wizarden efter-stegen (designmönster, embeddings, "
        "validering) automatiskt via knappar.",
    )


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


def _render_post_create(ctx: BackofficeContext, created: dict[str, Any]) -> None:
    variant_id = str(created.get("variantId", ""))
    scaffold_id = str(created.get("scaffoldId", ""))

    st.subheader("Klart — varianten är skapad")
    st.success(created.get("message", "Varianten skapades."))
    if not st.session_state.get("swz_balloons_shown"):
        st.balloons()
        st.session_state["swz_balloons_shown"] = True

    if variant_id and scaffold_id:
        st.caption(
            f"Fil: `config/scaffold-variants/{scaffold_id}/{variant_id}.json` · "
            f"scaffold-kod: `src/lib/gen/scaffolds/{scaffold_id}/`"
        )

    st.markdown(
        "### Slutför automatiskt\n"
        "Kör efter-stegen direkt här — **inga terminalkommandon behövs**. "
        "Grönt = klart, rött = fel med logg. Kör helst i ordning 1 → 2 → 3."
    )

    has_key = bool(wiz.get_openai_api_key())
    if not has_key:
        st.warning(
            "Ingen `OPENAI_API_KEY` i miljön (`.env.local`) — AI-stegen (designmönster + "
            "embeddings) är avstängda. Valideringen (steg 3) går ändå."
        )

    steps = _post_create_steps(variant_id)
    results: dict[str, Any] = st.session_state.setdefault("swz_cmd_results", {})

    def _run(step: dict[str, Any]) -> None:
        with st.spinner(f"Kör: {step['label']} …"):
            res = run_repo_command(ctx.repo_root, step["command"])
        # Curation exits 0 even on LLM failure/skip — verify the file really got
        # signaturePatterns so a no-op run can't show a false-green check.
        if step["key"] == "patterns":
            has_patterns = _variant_has_patterns(ctx, scaffold_id, variant_id)
            res["verifiedOk"] = bool(res.get("ok") and has_patterns)
            if res.get("ok") and not has_patterns:
                res["warn"] = (
                    "Kommandot kördes (exit 0) men varianten fick **inga** "
                    "`signaturePatterns` — troligen LLM-fel eller skippad. Se loggen. "
                    "Varianten blir inte matchoptimerad förrän detta lyckas."
                )
        results[step["key"]] = res
        st.session_state["swz_cmd_results"] = results

    def _run_chain() -> None:
        # Fresh chain: drop stale results from earlier runs first, so a later
        # step's old ✅ can't linger as false-green when an early step now fails
        # and the chain stops before reaching it.
        for step in steps:
            results.pop(step["key"], None)
        st.session_state["swz_cmd_results"] = results
        for step in steps:
            if step["needs_api"] and not has_key:
                results[step["key"]] = {"skipped": True, "command": " ".join(step["command"])}
                continue
            _run(step)
            # Fail-fast: a red step (e.g. designmönster-steget som inte gav
            # signaturePatterns) must stop the chain — annars byggs embeddings
            # och validering på halvfärdigt innehåll och visar falskt grönt.
            res = results.get(step["key"], {})
            step_ok = bool(res.get("verifiedOk")) if "verifiedOk" in res else bool(res.get("ok"))
            if not step_ok:
                results[step["key"]] = {
                    **res,
                    "warn": (res.get("warn") or "")
                    + " Kedjan stoppades här — efterföljande steg kördes inte.",
                }
                st.session_state["swz_cmd_results"] = results
                break

    # Auto-run direkt efter skapandet (idiotsäkring): operatören ska inte
    # behöva veta att knappen finns. Flaggan konsumeras så en manuell
    # om-körning fortfarande går via knappen.
    if st.session_state.pop("swz_autorun", False):
        st.info("Kör efter-stegen automatiskt (designmönster → matchning → validering)…")
        _run_chain()
        st.rerun()

    if st.button("▶ Kör alla steg i följd (igen)", type="primary"):
        _run_chain()
        st.rerun()

    cols = st.columns(len(steps))
    for step, col in zip(steps, cols):
        with col:
            disabled = bool(step["needs_api"] and not has_key)
            if st.button(
                step["label"], key=f"swz_run_{step['key']}", disabled=disabled, help=step["help"]
            ):
                _run(step)
                st.rerun()

    for step in steps:
        res = results.get(step["key"])
        if not res:
            continue
        if res.get("skipped"):
            st.caption(f"• {step['label']}: hoppad (ingen API-nyckel).")
            continue
        # For pattern curation, trust the file-verified outcome over exit code.
        ok = bool(res.get("verifiedOk")) if "verifiedOk" in res else bool(res.get("ok"))
        badge = "✅" if ok else "❌"
        st.markdown(
            f"{badge} **{step['label']}** — `{res.get('command', '')}` "
            f"({res.get('elapsedSec', '?')}s, exit {res.get('exitCode')})"
        )
        if res.get("warn"):
            st.warning(res["warn"])
        with st.expander("Visa logg", expanded=not ok):
            out = (res.get("stdoutTail") or "").strip()
            err = (res.get("stderrTail") or "").strip()
            if out:
                st.code(out[-3000:], language="text")
            if err:
                st.code(err[-3000:], language="text")
            if not out and not err:
                st.caption("(ingen output)")

    st.divider()
    st.caption(
        "Kvar manuellt: granska diffen och committa när du är nöjd. Ångra allt? Fliken "
        "**Baseline** i Scaffold Lifecycle återställer till `scaffold-baseline-v1`."
    )
    if st.button("Skapa en till variant / börja om"):
        for key in (
            "swz_created",
            "swz_cmd_results",
            "swz_balloons_shown",
            "swz_step",
            "swz_draft",
            "swz_analysis",
            "swz_template",
            "swz_repo_summary",
        ):
            st.session_state.pop(key, None)
        st.rerun()


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Scaffold Wizard")
    render_where_panel("Scaffold Wizard", domain_map)
    st.info(
        "Steg-för-steg-flöde: välj en v0-mall i Vercel Blob som **inspiration**, låt en "
        "AI-persona skriva ett utkast, granska, validera och skapa en scaffold-variant "
        "(eller ny scaffold + startvariant). Ingenting sparas förrän checklistan i sista "
        "steget är grön. Fabriksåterställning finns i Scaffold Lifecycle → Baseline."
    )
    _render_progress()

    step = _step()
    if step == 0:
        _render_step_pick(ctx)
    elif step == 1:
        _render_step_persona(ctx)
    elif step == 2:
        _render_step_review(ctx)
    else:
        _render_step_validate(ctx)

    st.divider()
    with st.expander("Sparade utkast (gitignorerade)", expanded=False):
        drafts = wiz.list_drafts(ctx.repo_root)
        if not drafts:
            st.caption("Inga utkast ännu.")
        for path in drafts[:15]:
            loaded = wiz.load_draft(path)
            title = loaded.get("templateTitle", path.stem) if loaded else path.stem
            st.markdown(f"- `{path.name}` — {title}")
