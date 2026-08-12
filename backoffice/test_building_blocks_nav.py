"""Grindar för Byggstenar-navigationen, spara-lägena och docs-renderingen.

Bakgrund: Byggstenar-sidorna döptes om 2026-07-24 till svenska verb-namn och fick
en hub (`Byggstenar: översikt`). Tre saker måste då hållas sanna över tid:

1. **Navigationen** — hubben finns, gruppen innehåller exakt de sex ytorna i
   arbetsordning, och alla gamla `?nav=`-slugs/sidnamn fortsätter resolvera
   (deep links, docs och `config/control-plane/policy-registry.json` pekar på dem).
2. **Spara-lägena** — texten "sparar en fil i repot" respektive "sparar bara
   lokalt" verifieras mot git (`git ls-files` / `git check-ignore`), så UI:t inte
   kan börja ljuga efter en framtida `.gitignore`-ändring.
3. **Docs-renderingen** — hubben har ingen egen prosa; den läser glossary-rader
   och kontraktsavsnitt. Om ett avsnitt döps om ska ett test falla, inte UI:t
   tystna.
"""

from __future__ import annotations

import subprocess
import unittest

from backoffice import REPO_ROOT
from backoffice.pages import PAGE_MAP, PAGE_NAMES, PAGE_QUERY_ALIASES, PAGE_SPECS, building_blocks
from backoffice.pages.dossiers_lib.labels import class_description
from backoffice.shared import (
    BUILDING_BLOCK_CHAIN,
    SAVE_SCOPE_MESSAGES,
    SAVE_SCOPE_PATHS,
    read_doc_section,
    read_json,
    read_markdown_table_cell,
    render_save_scope,
)

EXPECTED_BUILDING_BLOCK_ORDER = (
    "Byggstenar: översikt",
    "Scaffolds: titta & justera",
    "Scaffolds & varianter: skapa, redigera, klona, ta bort",
    "Guide: ny scaffold eller variant (AI)",
    "Byggblock (dossiers)",
    "Mallar (v0): inspiration & uppladdning",
)

# Gamla namn/slugs som MÅSTE fortsätta fungera (permanenta alias).
LEGACY_NAV_KEYS = (
    "Scaffolds",
    "Scaffold Lifecycle",
    "Scaffolds & varianter: skapa, klona, ta bort",
    "Scaffold Wizard",
    "Dossiers (legoklossar)",
    "Mallar → Blob-upload",
    "Scaffold Performance",
    "scaffolds",
    "scaffold-lifecycle",
    "wizard",
    "scaffold-wizard",
    "dossiers",
    "scaffold-performance",
)

# Termer som inte får dyka upp i menyn (glossary-drift). "legoklossar" är inte en
# glossary-term; UI-labeln är Byggblock.
BANNED_MENU_TERMS = ("legoklossar", "Lifecycle", "Wizard", "Performance")


def _git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


class BuildingBlocksNavigationTests(unittest.TestCase):
    def test_hub_dossier_caption_reads_the_generated_class_copy(self) -> None:
        caption = building_blocks._dossier_count_caption(2, 3)
        self.assertIn(f"2 × {class_description('hard').rstrip('.')}", caption)
        self.assertIn(f"3 × {class_description('soft').rstrip('.')}", caption)
        self.assertNotIn("kräver extern tjänst/nycklar", caption)
        self.assertNotIn("bara npm-paket", caption)

    def test_hub_page_is_registered_and_first_in_group(self) -> None:
        self.assertIn("Byggstenar: översikt", PAGE_NAMES)
        group_pages = [spec.name for spec in PAGE_SPECS if spec.group == "Byggstenar"]
        self.assertEqual(group_pages[0], "Byggstenar: översikt")
        self.assertEqual(PAGE_MAP["Byggstenar: översikt"].mode, "read")

    def test_building_blocks_group_is_exactly_the_six_surfaces_in_order(self) -> None:
        group_pages = tuple(spec.name for spec in PAGE_SPECS if spec.group == "Byggstenar")
        self.assertEqual(group_pages, EXPECTED_BUILDING_BLOCK_ORDER)

    def test_scaffold_performance_moved_to_telemetry(self) -> None:
        """Telemetri hör inte till byggstenarna — sidan bor i Telemetri & loggar."""
        self.assertIn("Scaffold-poäng", PAGE_NAMES)
        self.assertEqual(PAGE_MAP["Scaffold-poäng"].group, "Telemetri & loggar")

    def test_legacy_nav_keys_still_resolve(self) -> None:
        broken = [
            key
            for key in LEGACY_NAV_KEYS
            if PAGE_QUERY_ALIASES.get(key, key) not in PAGE_MAP
        ]
        self.assertEqual(
            broken,
            [],
            f"Gamla ?nav=-nycklar slutade fungera: {broken} — aliasen är permanenta.",
        )

    def test_menu_labels_avoid_banned_terminology(self) -> None:
        offenders: list[str] = []
        for spec in PAGE_SPECS:
            if spec.group != "Byggstenar":
                continue
            haystack = f"{spec.name} {spec.blurb}"
            offenders += [
                f"{spec.name}: {term}" for term in BANNED_MENU_TERMS if term in haystack
            ]
        self.assertEqual(
            offenders,
            [],
            "Byggstenar-menyn använder termer utanför glossaryn: " + ", ".join(offenders),
        )

    def test_chain_row_matches_the_group(self) -> None:
        chain_targets = tuple(page for _short, page in BUILDING_BLOCK_CHAIN)
        self.assertEqual(chain_targets, EXPECTED_BUILDING_BLOCK_ORDER)
        for page in chain_targets:
            self.assertIn(page, PAGE_MAP, f"Kedjeraden pekar på okänd sida: {page}")

    def test_hub_link_targets_are_registered_pages(self) -> None:
        targets = [page for card in building_blocks.BLOCK_CARDS for _label, page in card.actions]
        targets += [page for page, _what in building_blocks.PROD_SURFACES]
        unknown = sorted({page for page in targets if page not in PAGE_MAP})
        self.assertEqual(unknown, [], f"Hubben länkar till okända sidor: {unknown}")

    def test_hub_has_domain_map_entry_with_docs_paths(self) -> None:
        domain_map = read_json(REPO_ROOT / "config" / "dashboard" / "domain-map.json")
        entry = (domain_map.get("pages") or {}).get("Byggstenar: översikt")
        self.assertIsNotNone(entry, "Hubben saknar post i domain-map.json")
        assert entry is not None
        self.assertTrue(entry.get("docsPaths"), "Hubben ska peka ut sina docs-källor")


class SaveScopeParityTests(unittest.TestCase):
    """Spara-lägestexten måste stämma med verkligheten i git."""

    def test_repo_scope_paths_are_git_tracked(self) -> None:
        untracked: list[str] = []
        for rel in SAVE_SCOPE_PATHS["repo"]:
            result = _git(["ls-files", "--", rel])
            if result.returncode != 0 or not result.stdout.strip():
                untracked.append(rel)
        self.assertEqual(
            untracked,
            [],
            "UI:t säger 'sparar en fil i repot' för ospårade sökvägar: " + ", ".join(untracked),
        )

    def test_local_scope_paths_are_gitignored(self) -> None:
        tracked: list[str] = []
        for rel in SAVE_SCOPE_PATHS["local"]:
            result = _git(["check-ignore", "-q", f"{rel.rstrip('/')}/probe.json"])
            if result.returncode != 0:
                tracked.append(rel)
        self.assertEqual(
            tracked,
            [],
            "UI:t säger 'sparar bara lokalt' för sökvägar som inte är gitignorerade: "
            + ", ".join(tracked),
        )

    def test_every_scope_has_a_message(self) -> None:
        self.assertEqual(set(SAVE_SCOPE_MESSAGES), {"repo", "local", "prod"})
        for scope, (icon, message) in SAVE_SCOPE_MESSAGES.items():
            self.assertTrue(icon.strip(), f"{scope} saknar ikon")
            self.assertTrue(message.strip(), f"{scope} saknar text")

    def test_unknown_scope_fails_loudly(self) -> None:
        with self.assertRaises(ValueError):
            render_save_scope("kanske")

    def test_blob_upload_is_listed_as_a_production_surface(self) -> None:
        """Codex P2 på #615: Mallar-ytan laddar upp zip direkt till Vercel Blob
        (live-lagring) och får därför inte saknas i hubbens prod-lista — annars
        lovar sammanfattningen 'bara repot' för en produktionsändring."""
        pages = [page for page, _what in building_blocks.PROD_SURFACES]
        self.assertIn("Mallar (v0): inspiration & uppladdning", pages)

    def test_wizard_save_scope_follows_the_step(self) -> None:
        """Steg 1–3 = lokalt utkast, steg 4 = skriver spårade filer i repot."""
        from backoffice.pages import scaffold_wizard

        last_step = len(scaffold_wizard._STEPS) - 1
        for step in range(last_step):
            self.assertEqual(
                scaffold_wizard._save_scope_for_step(step),
                "local",
                f"steg {step + 1} rör bara det gitignorerade utkastet",
            )
        self.assertEqual(
            scaffold_wizard._save_scope_for_step(last_step),
            "repo",
            "sista steget skriver spårade filer och måste märkas som repo",
        )


class HubDocsRenderingTests(unittest.TestCase):
    """Hubben har ingen egen prosa — den renderar docs. Grinda de källorna."""

    def test_glossary_rows_exist_for_every_card(self) -> None:
        glossary = REPO_ROOT / building_blocks.GLOSSARY_REL
        missing = [
            card.glossary_term
            for card in building_blocks.BLOCK_CARDS
            if not read_markdown_table_cell(glossary, card.glossary_term)
        ]
        self.assertEqual(
            missing,
            [],
            "Saknade glossary-rader (hubben skulle visa en varning i stället för "
            f"definitionen): {missing}",
        )

    def test_doc_sections_resolve_for_every_card(self) -> None:
        missing = [
            f"{card.doc_rel}#{card.doc_needle}"
            for card in building_blocks.BLOCK_CARDS
            if not read_doc_section(REPO_ROOT / card.doc_rel, card.doc_needle)
        ]
        self.assertEqual(
            missing,
            [],
            f"Hubbens docs-avsnitt hittades inte: {missing}",
        )

    def test_mall_card_section_is_about_templates(self) -> None:
        """Codex P2 på #615: Mall-kortet pekade tidigare på glossaryns
        `Kärntermer`, vars Template-rad ligger ~4 800 tecken in och därför föll
        bort i trunkeringen — expandern visade scaffold-/dossier-rader i stället.
        Avsnittet måste faktiskt handla om mallar."""
        card = next(
            c for c in building_blocks.BLOCK_CARDS if c.glossary_term == "Template (v0-mall)"
        )
        section = read_doc_section(REPO_ROOT / card.doc_rel, card.doc_needle)
        assert section is not None
        lowered = section.lower()
        self.assertIn("template", lowered)
        self.assertIn("verbatim", lowered)
        self.assertNotIn("scaffold variant |", lowered)

    def test_doc_section_stops_at_next_heading(self) -> None:
        section = read_doc_section(
            REPO_ROOT / building_blocks.DOSSIER_DOC_REL, "TL;DR", max_chars=100_000
        )
        assert section is not None
        self.assertTrue(section.startswith("## TL;DR"))
        self.assertNotIn("## Two classes", section)


if __name__ == "__main__":
    unittest.main()
