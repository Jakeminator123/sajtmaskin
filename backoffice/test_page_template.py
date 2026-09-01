"""Grindar för sidmallen: "Var ligger detta?" och statisk-referens-badgen.

Två P2-rader från stringensplanen landade här:

* **P2-5** — `render_where_panel` var opt-in och satt på 23 av 36 sidor. De 13
  som saknade den var inte enklare sidor, bara sidor där ingen råkat lägga till
  anropet. Panelen är nu en standardrad i `app_main.py`, och testerna nedan
  hindrar både att den försvinner därifrån och att en sida börjar rendera sin
  egen kopia (vilket skulle ge två paneler).
* **P2-2** — handskriven referenstext ser ut som live-data i Streamlit. Badgen
  märker den, och testet håller den knuten till ytor som faktiskt inte läser
  disk/DB/API.
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

from backoffice import REPO_ROOT
from backoffice.pages import PAGE_NAMES, PAGE_SPECS
from backoffice.shared import (
    STATIC_REFERENCE_BADGE,
    render_static_reference,
    render_where_panel,
)

PAGES_DIR = REPO_ROOT / "backoffice" / "pages"
APP_MAIN = REPO_ROOT / "backoffice" / "app_main.py"


def _page_modules() -> list[Path]:
    return sorted(p for p in PAGES_DIR.glob("*.py") if p.name != "__init__.py")


def _calls(path: Path, func_name: str) -> int:
    """Antal anrop av ``func_name`` i filen (import räknas inte)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return sum(
        1
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (
            (isinstance(node.func, ast.Name) and node.func.id == func_name)
            or (isinstance(node.func, ast.Attribute) and node.func.attr == func_name)
        )
    )


def _static_reference_sources(path: Path) -> list[str]:
    """Literal repo paths passed to ``render_static_reference`` in one page."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported_names = {"render_static_reference"}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        for alias in node.names:
            if alias.name == "render_static_reference":
                imported_names.add(alias.asname or alias.name)

    sources: list[str] = []
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Call)
            and (
                (isinstance(node.func, ast.Name) and node.func.id in imported_names)
                or (
                    isinstance(node.func, ast.Attribute)
                    and node.func.attr == "render_static_reference"
                )
            )
        ):
            continue
        for kw in node.keywords:
            if kw.arg != "source":
                continue
            if not (
                isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str)
            ):
                raise AssertionError(
                    f"{path.name}: render_static_reference source måste vara en literal repo-sökväg"
                )
            if kw.value.value:
                sources.append(kw.value.value)
    return sources


class WherePanelIsPartOfThePageTemplateTests(unittest.TestCase):
    def test_app_main_renders_the_panel_once(self) -> None:
        self.assertEqual(
            _calls(APP_MAIN, "render_where_panel"),
            1,
            "sidmallen ska rendera 'Var ligger detta?' exakt en gång",
        )

    def test_no_page_renders_its_own_panel(self) -> None:
        """Annars får sidan två paneler — sidmallens och sin egen."""
        offenders = [
            path.name for path in _page_modules() if _calls(path, "render_where_panel")
        ]
        self.assertEqual(
            offenders,
            [],
            "Sidor kallar render_where_panel själva — sidmallen i app_main.py äger "
            f"panelen sedan P2-5: {offenders}",
        )

    def test_every_registered_page_can_render_the_panel(self) -> None:
        """Standardraden är bara sann om varje sidnamn finns i domain-map.
        Saknas posten renderar panelen en 'saknar post'-ruta i st.f. innehåll —
        på VARJE sida nu, inte bara de 23 som hade opt-in.
        (Paritet i båda riktningar grindas i test_domain_map_parity.py; här
        säkras kopplingen mellan just den grinden och den nya standardraden.)"""
        import json

        domain_map = json.loads(
            (REPO_ROOT / "config" / "backoffice" / "domain-map.json").read_text(
                encoding="utf-8"
            )
        )
        missing = [
            name for name in PAGE_NAMES if name not in (domain_map.get("pages") or {})
        ]
        self.assertEqual(missing, [], f"Sidor utan domain-map-post: {missing}")

    def test_panel_helper_is_callable(self) -> None:
        self.assertTrue(callable(render_where_panel))


class StaticReferenceBadgeTests(unittest.TestCase):
    def test_badge_text_says_it_is_manually_updated(self) -> None:
        self.assertIn("Statisk referens", STATIC_REFERENCE_BADGE)
        self.assertIn("manuellt", STATIC_REFERENCE_BADGE)

    def test_helper_is_callable(self) -> None:
        self.assertTrue(callable(render_static_reference))

    def test_renders_on_streamlit_versions_without_st_badge(self) -> None:
        """`requirements.backoffice.txt` tillåter `streamlit>=1.49`, och `st.badge`
        finns inte i hela intervallet. Utan fallback hade sidan kraschat på ett
        API som inte finns — märkningen är viktigare än chip-utseendet."""
        import streamlit as st

        from backoffice import shared

        calls: list[tuple[str, str]] = []
        real_badge = getattr(st, "badge", None)
        real_markdown = st.markdown
        real_caption = st.caption
        try:
            if real_badge is not None:
                delattr(st, "badge")
            st.markdown = lambda body, *a, **k: calls.append(("markdown", str(body)))
            st.caption = lambda body, *a, **k: calls.append(("caption", str(body)))
            shared.render_static_reference(source="docs/x.md")
        finally:
            if real_badge is not None:
                st.badge = real_badge
            st.markdown = real_markdown
            st.caption = real_caption

        kinds = [kind for kind, _ in calls]
        self.assertEqual(kinds, ["markdown", "caption"])
        self.assertIn(STATIC_REFERENCE_BADGE, calls[0][1])
        self.assertIn("docs/x.md", calls[1][1])

    def test_preview_page_marks_its_handwritten_sections(self) -> None:
        """`preview.py` beskriver F2/F3-livscykeln i handskriven markdown. Utan
        badge går texten inte att skilja från sidans disk-lästa mätvärden."""
        preview = PAGES_DIR / "preview.py"
        self.assertGreaterEqual(
            _calls(preview, "render_static_reference"),
            2,
            "preview.py har två handskrivna avsnitt som båda ska vara märkta",
        )

    def test_every_source_pointer_exists_on_disk(self) -> None:
        """Badgen säger "kontrollera mot X" — pekar X på en fil som inte finns är
        rådet värdelöst. Grinden gäller alla sidor som sätter badgen."""
        missing: list[str] = []
        for path in _page_modules():
            for rel in _static_reference_sources(path):
                if not (REPO_ROOT / rel).exists():
                    missing.append(f"{path.name} → {rel}")
        self.assertEqual(
            missing, [], f"Badge pekar på sökvägar som inte finns: {missing}"
        )

    def test_every_source_pointer_is_owned_by_its_page_domain_map(self) -> None:
        """Direkta Backoffice-konsumenter måste finnas i den centrala kartan.

        CI-scope använder kartan för att välja ``backoffice:test`` när den
        utpekade filen ändras. En literal som bara finns i Python-koden skulle
        annars kunna se ut som vanlig docs-only och hoppa över sin konsument.
        """
        import json

        domain_pages = json.loads(
            (REPO_ROOT / "config" / "backoffice" / "domain-map.json").read_text(
                encoding="utf-8"
            )
        ).get("pages", {})
        page_names_by_module: dict[str, list[str]] = {}
        for spec in PAGE_SPECS:
            module_name = getattr(spec.render, "__module__", "").rsplit(".", 1)[-1]
            if module_name:
                page_names_by_module.setdefault(f"{module_name}.py", []).append(
                    spec.name
                )

        missing: list[str] = []
        path_fields = (
            "canonicalPaths",
            "docsPaths",
            "humanSchemaPaths",
            "strictSchemaPaths",
            "codeReaders",
        )
        for path in _page_modules():
            page_names = page_names_by_module.get(path.name, [])
            declared = {
                rel
                for page_name in page_names
                for field in path_fields
                for rel in (domain_pages.get(page_name, {}).get(field) or [])
            }
            for source in _static_reference_sources(path):
                if source not in declared:
                    owners = ", ".join(page_names) or "ingen registrerad PageSpec"
                    missing.append(f"{path.name} ({owners}) → {source}")

        self.assertEqual(
            missing,
            [],
            "Statisk Backoffice-källpekare saknas i sidans domain-map: "
            + "; ".join(missing),
        )

    def test_badge_is_not_put_on_pages_that_read_live_values(self) -> None:
        """Badgen påstår "uppdateras manuellt". På en sida som läser värdena vid
        varje rendering vore det osant. `orchestration.py` parsar TS-filer från
        disk — dess caption säger var värdena kommer ifrån, och den ska INTE ha
        badgen. (Bevisraden i P2-2 antog motsatsen; koden säger annat.)"""
        orchestration = PAGES_DIR / "orchestration.py"
        text = orchestration.read_text(encoding="utf-8")
        self.assertEqual(_calls(orchestration, "render_static_reference"), 0)
        self.assertIn("parsad direkt ur TS-koden", text)
        self.assertIn("read_text", text)


if __name__ == "__main__":
    unittest.main()
