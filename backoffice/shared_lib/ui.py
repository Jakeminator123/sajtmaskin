from __future__ import annotations

import re
from typing import Any

import streamlit as st

# Läge-badges: förklarar direkt i UI:t om en vy bara läser, redigerar filer,
# kör skript eller innehåller destruktiva åtgärder. Läses av app_main (sidomeny)
# och overview (kartan).
MODE_BADGES = {
    "read": ("🟢", "Läsvy — ändrar ingenting."),
    "edit": ("✏️", "Redigerbar — sparningar säkerhetskopieras (se Återställning)."),
    "run": ("⚙️", "Kör skript/kommandon — kan skriva genererade artefakter."),
    "danger": ("🔴", "Innehåller destruktiva åtgärder (radering) — läs varningarna."),
}


def nav_link_button(label: str, page_name: str, *, key: str) -> None:
    """Sidebar/page button that jumps to another backoffice page.

    Clears the sidebar widget state so ``app_main`` re-derives group + page
    from ``backoffice_nav`` on the rerun.
    """
    if st.button(label, key=key):
        st.session_state["backoffice_nav"] = page_name
        st.session_state.pop("backoffice_group_radio", None)
        st.session_state.pop("backoffice_nav_select", None)
        st.rerun()


# --- Byggstenar: kedja, spara-läge, teknik-expander och docs-rendering --------
# Byggstenar-gruppens ytor i arbetsordning (titta → skapa → byggblock → mallar).
# Sidnamnen är kanoniska i `backoffice.pages.PAGE_SPECS`; kedjeraden renderas
# högst upp på varje Byggstenar-sida så operatören alltid ser var i kedjan hen
# står och kan hoppa vidare utan att gå via sidomenyn.
BUILDING_BLOCK_CHAIN: tuple[tuple[str, str], ...] = (
    ("Översikt", "Byggstenar: översikt"),
    ("Scaffolds", "Scaffolds: titta & justera"),
    ("Skapa & hantera", "Scaffolds & varianter: skapa, redigera, klona, ta bort"),
    ("Guide (AI)", "Guide: ny scaffold eller variant (AI)"),
    ("Byggblock", "Byggblock (dossiers)"),
    ("Mallar (v0)", "Mallar (v0): inspiration & uppladdning"),
    ("Kurera mallar", "Mallar (v0): kurera Blob-arkiv"),
)


def render_building_blocks_nav(current: str) -> None:
    """Render the shared Byggstenar chain row at the top of a Byggstenar page.

    ``current`` is the calling page's registered name; it renders as plain text
    (no self-link) so the operator can see where in the chain they are.
    """
    cols = st.columns(len(BUILDING_BLOCK_CHAIN))
    slug = re.sub(r"[^a-z0-9]+", "_", current.lower()).strip("_")
    for col, (short, page_name) in zip(cols, BUILDING_BLOCK_CHAIN):
        with col:
            if page_name == current:
                st.markdown(f"**● {short}**")
            else:
                target_slug = re.sub(r"[^a-z0-9]+", "_", page_name.lower()).strip("_")
                nav_link_button(short, page_name, key=f"bbchain_{slug}_{target_slug}")
    st.divider()


# Spara-lägen: vad en sparning på den här ytan faktiskt påverkar. Renderas i
# DEFAULT-ytan (aldrig i en expander) på varje redigerings-/skapayta, så
# skillnaden "repo-fil" vs "produktion" alltid är synlig innan man klickar.
SAVE_SCOPE_MESSAGES: dict[str, tuple[str, str]] = {
    "repo": (
        "💾",
        "**Sparar en fil i repot.** Produktionen påverkas först när ändringen "
        "committas och mergas till `master`. Föregående version säkerhetskopieras "
        "(se **Återställning**).",
    ),
    "local": (
        "📝",
        "**Sparar bara lokalt** i en gitignorerad mapp — filen når aldrig "
        "produktion och committas inte.",
    ),
    "prod": (
        "🔴",
        "**Påverkar produktion direkt.** Åtgärden träffar live-data eller en "
        "live-tjänst utan mellansteg — ingen commit, ingen merge, ingen ångra-knapp.",
    ),
}

# Deklarerade sökvägar per spara-läge. `backoffice/test_building_blocks_nav.py`
# verifierar mot git att varje `repo`-sökväg verkligen är spårad och varje
# `local`-sökväg verkligen är gitignorerad — så UI-texten inte kan börja ljuga
# efter en framtida .gitignore-ändring.
SAVE_SCOPE_PATHS: dict[str, tuple[str, ...]] = {
    "repo": (
        "config/scaffold-variants",
        "config/ai_models/manifest.json",
        "data/dossiers/hard",
        "data/dossiers/soft",
        "src/lib/gen/scaffolds",
    ),
    "local": (
        "data/scaffold-wizard-drafts",
        "data/backoffice",
    ),
}


def render_save_scope(
    scope: str,
    *,
    paths: tuple[str, ...] | list[str] = (),
    note: str = "",
) -> None:
    """Say — in plain Swedish, in the default surface — what a save does here.

    ``scope`` is one of ``"repo"`` (git-tracked file: production only after
    commit + merge to master), ``"local"`` (gitignored, never reaches
    production) or ``"prod"`` (hits live data/service immediately).
    Unknown scopes raise, so a typo fails loudly in the page-import smoke test
    instead of rendering a silently wrong promise.
    """
    if scope not in SAVE_SCOPE_MESSAGES:
        raise ValueError(
            f"Okänt spara-läge {scope!r} — välj ett av {sorted(SAVE_SCOPE_MESSAGES)}."
        )
    icon, message = SAVE_SCOPE_MESSAGES[scope]
    body = f"{icon} {message}"
    if paths:
        body += "\n\nBerör: " + ", ".join(f"`{path}`" for path in paths)
    if note:
        body += f"\n\n{note}"
    if scope == "prod":
        st.error(body)
    elif scope == "local":
        st.success(body)
    else:
        st.info(body)


# Text som är handskriven i Python och INTE läses ur kod/disk/DB/API ser
# likadan ut som live-data i Streamlit — samma rubriker, samma punktlistor. En
# operatör som läser en beskrivning av F2/F3-livscykeln har inget sätt att se om
# den speglar koden idag eller skrevs för tre månader sedan. Badgen säger det
# rakt ut (P2-2), med en pekare till ytan som äger sanningen.
STATIC_REFERENCE_BADGE = "Statisk referens — senast uppdaterad manuellt"


def render_static_reference(*, source: str = "", note: str = "") -> None:
    """Märk ett avsnitt som handskriven referenstext, inte läst data.

    Använd den **bara** när avsnittet inte läser disk, DB eller API. Läser
    sidan värdena live (som `orchestration.py`, som parsar TS-filer vid varje
    rendering) är badgen osann och ska inte sättas — skriv i stället i captionen
    var värdena kommer ifrån.

    ``source`` pekar ut den yta som äger sanningen (doc, kontrakt eller kodfil)
    så läsaren vet vad texten ska kontrolleras mot.

    ``st.badge`` finns i nyare Streamlit men inte i hela intervallet som
    `requirements.backoffice.txt` tillåter (`>=1.49`). Saknas den renderas samma
    text som fet markdown-rad i st.f. att sidan kraschar på ett API som inte
    finns — märkningen är viktigare än chip-utseendet.
    """
    badge = getattr(st, "badge", None)
    if callable(badge):
        badge(STATIC_REFERENCE_BADGE, icon="📄", color="orange")
    else:
        st.markdown(f"📄 **{STATIC_REFERENCE_BADGE}**")
    tail = ""
    if source:
        tail = f" Kontrollera mot `{source}` innan du litar på den."
    if note:
        tail += f" {note}"
    st.caption(
        "Texten nedan är skriven för hand i backoffice-koden — den läses inte ur "
        "koden och kan därför ligga efter." + tail
    )


def tech_details(label: str = "Visa tekniska detaljer", *, expanded: bool = False):
    """Standard collapsed expander for jargon (paths, schemas, script names).

    Product-owner surface stays clean: sökvägar, schema-id:n, registry-detaljer
    och kommandon bor här inne, inte i default-vyn. Returns the expander so it
    can be used as a context manager.
    """
    return st.expander(label, expanded=expanded)

def render_where_panel(page: str, dm: dict[str, Any]) -> None:
    meta = (dm.get("pages") or {}).get(page)
    if not meta:
        st.info(
            f"Saknar post för **{page}** i `config/backoffice/domain-map.json`. "
            "Lägg till en `pages`-nyckel som matchar vynamnet."
        )
        return
    with st.expander(
        "Var ligger detta? · config (sparbar) · docs (förklaring) · kod",
        expanded=False,
    ):
        # NB: `summary` is already rendered once as the page caption in
        # app_main.py — don't repeat it here (avoids the same text twice).
        st.markdown("**Källfiler** (Backoffice skriver under `config/` där det är relevant)")
        for line in meta.get("canonicalPaths") or []:
            st.markdown(f"- `{line}`")
        st.markdown(
            "**Dokumentation** (syskonmapp `docs/` eller README i `config/` — uppdateras manuellt)"
        )
        docs = meta.get("docsPaths") or []
        if docs:
            for line in docs:
                st.markdown(f"- `{line}`")
        else:
            st.caption("Ingen doc-sökväg listad.")
        human_schemas = meta.get("humanSchemaPaths") or []
        if human_schemas:
            st.markdown("**Human schemas** (mänskligt läsbara kontrakt)")
            for line in human_schemas:
                st.markdown(f"- `{line}`")
        strict_schemas = meta.get("strictSchemaPaths") or []
        if strict_schemas:
            st.markdown("**Strict schemas** (maskinorienterade kontrakt)")
            for line in strict_schemas:
                st.markdown(f"- `{line}`")
        readers = meta.get("codeReaders") or []
        if readers:
            st.markdown("**Kod som läser / använder detta**")
            for line in readers:
                st.markdown(f"- `{line}`")
