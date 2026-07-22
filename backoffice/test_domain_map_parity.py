"""Parity guards so the backoffice navigation stays single-sourced in PAGE_SPECS.

Background: ``overview.py`` used to carry a hand-maintained ``CONFIG_NAV_PAGES``
tuple that drifted from the real ``PAGE_SPECS`` registry (it silently omitted
Control Plane, Env Readiness, Selection Rationale, Generation History,
Logg-export, LLM-flöde telemetri/status and Scaffold Performance). ``overview.py``
now generates its "vy → var du redigerar/läser"-karta directly from
``PAGE_SPECS``, so the only thing left to guard is that the surrounding metadata
never names a page that does not exist in the registry — and that the hardcoded
list never comes back.
"""

from __future__ import annotations

import unittest

from backoffice import REPO_ROOT
from backoffice.pages import PAGE_NAMES, PAGE_QUERY_ALIASES, overview
from backoffice.shared import read_json

DOMAIN_MAP_JSON = REPO_ROOT / "config" / "dashboard" / "domain-map.json"


class DomainMapParityTests(unittest.TestCase):
    def test_every_domain_map_page_is_a_registered_page(self) -> None:
        """Every key under domain-map.json ``pages`` must match a registered
        ``PAGE_SPECS`` name. Catches a renamed/removed page leaving a stale
        domain-map entry — the drift ``CONFIG_NAV_PAGES`` used to hide."""
        domain_map = read_json(DOMAIN_MAP_JSON)
        page_names = set(PAGE_NAMES)
        stale = sorted(k for k in (domain_map.get("pages") or {}) if k not in page_names)
        self.assertEqual(stale, [], f"domain-map.json names unknown pages: {stale}")

    def test_every_registered_page_has_a_domain_map_entry(self) -> None:
        """Bidirectional parity (sedan 2026-07-21): varje registrerad sida ska ha
        en post i domain-map.json så "var ligger detta?"-hjälpen och summary-raden
        aldrig tystnar för en ny sida. Lägg till summary + canonicalPaths när du
        registrerar en ny PageSpec."""
        domain_map = read_json(DOMAIN_MAP_JSON)
        mapped = set((domain_map.get("pages") or {}).keys())
        missing = sorted(name for name in PAGE_NAMES if name not in mapped)
        self.assertEqual(
            missing,
            [],
            f"Registered pages missing a domain-map.json entry: {missing}",
        )

    def test_query_aliases_resolve_to_registered_pages(self) -> None:
        """Every ``PAGE_QUERY_ALIASES`` target must be a real registered page so
        a ``?nav=`` deep link can never resolve to a non-existent view."""
        page_names = set(PAGE_NAMES)
        broken = sorted(
            f"{alias} -> {target}"
            for alias, target in PAGE_QUERY_ALIASES.items()
            if target not in page_names
        )
        self.assertEqual(broken, [], f"PAGE_QUERY_ALIASES point at unknown pages: {broken}")


class OverviewNavSingleSourceTests(unittest.TestCase):
    def test_overview_has_no_hardcoded_nav_list(self) -> None:
        """``overview.py`` must not reintroduce a hand-maintained page list; the
        karta is generated from ``PAGE_SPECS`` now. Guards against the
        ``CONFIG_NAV_PAGES`` drift coming back."""
        self.assertFalse(
            hasattr(overview, "CONFIG_NAV_PAGES"),
            "overview.py reintroduced CONFIG_NAV_PAGES — generate from PAGE_SPECS instead",
        )


if __name__ == "__main__":
    unittest.main()
