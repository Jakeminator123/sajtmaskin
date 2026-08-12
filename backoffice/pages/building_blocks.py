"""Byggstenar: översikt — den mentala modellen för Sajtmaskins byggstenar.

Ägargräns (medvetet smal, så panelen inte får ett fjärde översiktslager):

* **Start → Översikt** äger kartan över *alla vyer* och länkar hit.
* **Control Plane** äger "vilken fil äger vilket beslut" — rörs inte härifrån.
* **Den här sidan** äger bara en sak: vad scaffold / variant / byggblock / mall
  är, hur de hänger ihop, hur de väljs, och vad en sparning påverkar.

Förklaringstexterna är därför INTE skrivna i Python. Korttexterna renderas från
de kanoniska docs-ytorna (`docs/architecture/glossary.md`,
`docs/contracts/scaffold-system.md`, `docs/contracts/dossier-system.md`) via
`shared.read_markdown_table_cell` / `shared.read_doc_section`. Saknas ett
avsnitt visas en ärlig notis med länk — aldrig en tyst kopia som kan åldras.
Klassförklaringarna läses ur den genererade dossierprojektionen. Siffrorna
läses från disk vid varje rendering.
"""

from __future__ import annotations

from dataclasses import dataclass

import streamlit as st

from backoffice.shared import (
    SAVE_SCOPE_PATHS,
    BackofficeContext,
    first_sentence,
    nav_link_button,
    read_doc_section,
    read_json,
    read_markdown_table_cell,
    render_building_blocks_nav,
    render_save_scope,
    tech_details,
)
from backoffice.pages.dossiers_lib.labels import class_description

PAGE_NAME = "Byggstenar: översikt"

GLOSSARY_REL = "docs/architecture/glossary.md"
SCAFFOLD_DOC_REL = "docs/contracts/scaffold-system.md"
DOSSIER_DOC_REL = "docs/contracts/dossier-system.md"
TEMPLATES_DOC_REL = "docs/architecture/templates.md"
BLOB_MANIFEST_REL = "src/lib/templates/template-blob-manifest.json"

# Ytor som påverkar produktion direkt — visas i "vad händer när jag sparar?" så
# skillnaden mot repo-filerna blir konkret (namnen måste finnas i PAGE_SPECS).
PROD_SURFACES: tuple[tuple[str, str], ...] = (
    (
        "Mallar (v0): inspiration & uppladdning",
        "laddar upp zip-filer till Vercel Blob (live-lagring)",
    ),
    ("Projekt-admin (radera)", "raderar användarprojekt i databasen"),
    ("Databashälsa", "kan applicera index i databasen"),
    ("Logg-export", "kan läsa produktionsdatabasen"),
)


def _dossier_count_caption(hard: int, soft: int) -> str:
    hard_description = class_description("hard").rstrip(".")
    soft_description = class_description("soft").rstrip(".")
    return (
        f"Byggblock: {hard} × {hard_description}; "
        f"{soft} × {soft_description}. "
        "Siffrorna läses från disk varje gång sidan visas."
    )


@dataclass(frozen=True)
class BlockCard:
    """En byggsten: kortnamn, glossary-term, verbknappar och docs-avsnitt."""

    title: str
    glossary_term: str
    lives_in: str
    doc_rel: str
    doc_needle: str
    choose_caption: str
    actions: tuple[tuple[str, str], ...]


BLOCK_CARDS: tuple[BlockCard, ...] = (
    BlockCard(
        title="1. Scaffold — startpunkten",
        glossary_term="Scaffold",
        lives_in="filer i repot (git-spårade) — exakta sökvägar i teknik-expandern",
        doc_rel=SCAFFOLD_DOC_REL,
        doc_needle="STEG 3",
        choose_caption="Så väljs scaffolden (ur scaffold-kontraktet)",
        actions=(
            ("Titta & justera", "Scaffolds: titta & justera"),
            ("Skapa eller hantera", "Scaffolds & varianter: skapa, redigera, klona, ta bort"),
        ),
    ),
    BlockCard(
        title="2. Variant — det visuella uttrycket",
        glossary_term="Scaffold Variant",
        lives_in="en JSON-fil per variant i repot (git-spårad)",
        doc_rel=SCAFFOLD_DOC_REL,
        doc_needle="Variant signature patterns",
        choose_caption="Så väljs varianten (ur scaffold-kontraktet)",
        actions=(
            ("Skapa & ändra", "Scaffolds & varianter: skapa, redigera, klona, ta bort"),
            ("Guide med AI-hjälp", "Guide: ny scaffold eller variant (AI)"),
        ),
    ),
    BlockCard(
        title="3. Byggblock — funktionen",
        glossary_term="Dossier",
        lives_in="en mapp per byggblock i repot (git-spårad)",
        doc_rel=DOSSIER_DOC_REL,
        doc_needle="TL;DR",
        choose_caption="Så väljs byggblocken (ur byggblocks-kontraktet)",
        actions=(("Öppna byggblock", "Byggblock (dossiers)"),),
    ),
    BlockCard(
        title="4. Mall (v0) — inspirationen",
        glossary_term="Template (v0-mall)",
        lives_in="zip i Vercel Blob (live) + katalogfil i repot",
        doc_rel=TEMPLATES_DOC_REL,
        doc_needle="Verbatim-import vs fritext",
        choose_caption="Mallar matchas inte — de importeras ordagrant",
        actions=(
            ("Ladda upp mallar", "Mallar (v0): inspiration & uppladdning"),
            ("Använd som inspiration", "Guide: ny scaffold eller variant (AI)"),
        ),
    ),
)


def _count_scaffolds(ctx: BackofficeContext) -> int:
    return len(list(ctx.scaffolds_dir.glob("*/manifest.ts")))


def _count_variants(ctx: BackofficeContext) -> int:
    if not ctx.variants_dir.is_dir():
        return 0
    return len(
        [
            path
            for path in ctx.variants_dir.glob("*/*.json")
            if not path.parent.name.startswith("_")
        ]
    )


def _count_dossiers(ctx: BackofficeContext) -> tuple[int, int]:
    def _count(klass: str) -> int:
        root = ctx.repo_root / "data" / "dossiers" / klass
        if not root.is_dir():
            return 0
        return len(
            [
                directory
                for directory in root.iterdir()
                if directory.is_dir()
                and not directory.name.startswith("_")
                and (directory / "manifest.json").is_file()
            ]
        )

    return _count("hard"), _count("soft")


def _count_templates(ctx: BackofficeContext) -> int:
    path = ctx.repo_root / BLOB_MANIFEST_REL
    if not path.is_file():
        return 0
    try:
        payload = read_json(path)
    except (OSError, ValueError):
        return 0
    templates = payload.get("templates") if isinstance(payload, dict) else None
    return len(templates) if isinstance(templates, list) else 0


def _render_definition(ctx: BackofficeContext, card: BlockCard) -> None:
    """Kort definition ur glossaryn (kanonisk källa), aldrig en Python-kopia."""
    glossary_path = ctx.repo_root / GLOSSARY_REL
    definition = read_markdown_table_cell(glossary_path, card.glossary_term)
    if definition:
        st.markdown(first_sentence(definition))
        return
    st.warning(
        f"Termen **{card.glossary_term}** hittades inte i `{GLOSSARY_REL}` — "
        "lägg till en rad där i stället för att skriva en förklaring här."
    )


def _render_card(ctx: BackofficeContext, card: BlockCard) -> None:
    with st.container(border=True):
        st.markdown(f"**{card.title}**")
        _render_definition(ctx, card)
        st.caption(f"Bor: {card.lives_in}")
        action_cols = st.columns(len(card.actions))
        for col, (label, page_name) in zip(action_cols, card.actions):
            with col:
                nav_link_button(
                    label,
                    page_name,
                    key=f"bbhub_{card.glossary_term}_{page_name}".replace(" ", "_"),
                )


def _render_choice_sections(ctx: BackofficeContext) -> None:
    st.subheader("Hur väljs de när en sajt byggs?")
    st.caption(
        "Avsnitten nedan renderas ordagrant ur kontraktsdokumenten — panelen har "
        "ingen egen version av sanningen. Vissa kontrakt är skrivna på engelska; "
        "de visas som de står i filen."
    )
    for card in BLOCK_CARDS:
        doc_path = ctx.repo_root / card.doc_rel
        with st.expander(f"{card.title.split('—')[0].strip()} · {card.choose_caption}"):
            section = read_doc_section(doc_path, card.doc_needle)
            if section:
                st.caption(f"Källa: `{card.doc_rel}` → avsnitt som matchar `{card.doc_needle}`")
                st.markdown(section)
            else:
                st.info(
                    f"Hittade inget avsnitt med `{card.doc_needle}` i `{card.doc_rel}`. "
                    "Läs dokumentet direkt — ingen kopia görs här."
                )


def _render_save_scope_panel() -> None:
    st.subheader("Vad händer när jag sparar?")
    st.markdown(
        "Scaffolds, varianter och byggblock är **filer i repot**. Att spara dem "
        "ändrar alltså repot — inte produktionen; produktionen får ändringen när "
        "den committas och mergas till `master`. **Undantag:** Mallar-ytan laddar "
        "upp zip-filer till Vercel Blob, som är live-lagring (se listan nedan)."
    )
    render_save_scope("repo", paths=SAVE_SCOPE_PATHS["repo"])
    render_save_scope("local", paths=SAVE_SCOPE_PATHS["local"])
    st.markdown("**Ytor som däremot träffar produktionen direkt:**")
    for page_name, what in PROD_SURFACES:
        text_col, button_col = st.columns([5, 1])
        with text_col:
            st.markdown(f"🔴 **{page_name}** — {what}")
        with button_col:
            nav_link_button(
                "Öppna",
                page_name,
                key=f"bbhub_prod_{page_name}".replace(" ", "_"),
            )


def _render_tech_details(ctx: BackofficeContext, domain_map: dict) -> None:
    with tech_details():
        st.markdown("**Kanoniska filer**")
        for line in (
            "src/lib/gen/scaffolds/<id>/manifest.ts + files/",
            "src/lib/gen/scaffolds/{types,registry}.ts",
            "config/scaffold-variants/<scaffold>/<variant>.json",
            "docs/schemas/strict/scaffold-variant.schema.json",
            "data/dossiers/{hard,soft}/<id>/manifest.json",
            "data/dossiers/_index/capability-map.json (genererad vy)",
            "docs/schemas/strict/dossier.schema.json",
            BLOB_MANIFEST_REL,
        ):
            st.markdown(f"- `{line}`")
        st.markdown("**Validera efter en ändring**")
        for line in (
            "npm run scaffolds:validate",
            "npm run dossiers:validate-all",
            "npm run backoffice:test",
        ):
            st.markdown(f"- `{line}`")
        st.markdown("**Läs mer**")
        for line in (SCAFFOLD_DOC_REL, DOSSIER_DOC_REL, GLOSSARY_REL):
            st.markdown(f"- `{line}`")
        st.caption(
            "Sökvägarna ovan speglas i `config/backoffice/domain-map.json`; "
            "kodägarskapet per beslut finns i vyn **Control Plane (cockpit)**."
        )


def render(ctx: BackofficeContext) -> None:
    domain_map = (
        read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    )
    st.header("Byggstenar: översikt")
    render_building_blocks_nav(PAGE_NAME)
    st.markdown(
        "Fyra saker bygger en genererad sajt. De är **olika system** — men de "
        "hänger ihop i den här ordningen:"
    )
    st.markdown(
        "**Mall (inspiration)** → **Scaffold (startpunkt)** + **Variant (uttryck)** "
        "→ **Byggblock (funktion)** → genererad sajt → publicera"
    )

    scaffolds = _count_scaffolds(ctx)
    variants = _count_variants(ctx)
    hard, soft = _count_dossiers(ctx)
    templates = _count_templates(ctx)
    cols = st.columns(4)
    cols[0].metric("Scaffolds", scaffolds)
    cols[1].metric("Varianter", variants)
    cols[2].metric("Byggblock", hard + soft, help="Kopplade (hard) + fristående (soft).")
    cols[3].metric("Mallar (v0)", templates)
    st.caption(_dossier_count_caption(hard, soft))

    st.subheader("De fyra byggstenarna")
    top = st.columns(2)
    bottom = st.columns(2)
    for card, col in zip(BLOCK_CARDS, [*top, *bottom]):
        with col:
            _render_card(ctx, card)

    st.divider()
    _render_save_scope_panel()

    st.divider()
    _render_choice_sections(ctx)

    _render_tech_details(ctx, domain_map)
