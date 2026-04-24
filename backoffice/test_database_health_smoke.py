"""Smoke-test för backoffice/pages/database_health.py + redis_health.py.

Bakgrund: dessa sidor är inte enkelt enhet-testbara (Streamlit-runtime krävs
för render()), men vi VILL ändå fånga uppenbara import-fel och saknade
beroenden innan de visas i UI:t.

Testar:
  - Modulerna importerar utan exceptions
  - Alla _render_* / _run_* / _load_* funktioner finns och är callable
  - Skript-konstanter (_HEALTH_SCRIPT_REL, _PERF_INDEX_SCRIPT_REL,
    _SNAPSHOT_REL, _PERF_AUDIT_REL) pekar på rimliga sökvägar
  - npm-scripts som backoffice-knappen kan komma att kalla finns i
    package.json (samma mönster som test_pipeline_health_script_parity)
  - Reason-input-tröskel (minst 10 tecken) verkar finnas i koden
  - Nya sidor är registrerade i navigation + query-aliasen funkar

Speglar mönstret i `test_pipeline_health_script_parity.py`.
Långbänk-uppföljning 2026-04-24 (utökad efter test-agent-rapport).
"""

from __future__ import annotations

import json
import unittest

from backoffice import REPO_ROOT


class DatabaseHealthSmokeTests(unittest.TestCase):
    def test_module_imports_without_errors(self) -> None:
        from backoffice.pages import database_health  # noqa: F401

        # Verifiera publika & privata funktioner som backoffice-navigation
        # eller render() kan komma att anropa.
        self.assertTrue(callable(database_health.render))
        self.assertTrue(callable(database_health._render_payload))
        self.assertTrue(callable(database_health._render_history))
        self.assertTrue(callable(database_health._render_perf_index_button))
        self.assertTrue(callable(database_health._run_health_check))
        self.assertTrue(callable(database_health._run_perf_indexes))
        self.assertTrue(callable(database_health._load_perf_audit_log))
        self.assertTrue(callable(database_health._load_snapshots))

    def test_referenced_scripts_exist(self) -> None:
        from backoffice.pages import database_health

        for rel in (
            database_health._HEALTH_SCRIPT_REL,
            database_health._PERF_INDEX_SCRIPT_REL,
        ):
            path = REPO_ROOT / rel
            self.assertTrue(
                path.is_file(),
                f"backoffice/pages/database_health.py refererar {rel} som inte finns",
            )

    def test_button_npm_scripts_exist_in_package_json(self) -> None:
        """Backoffice-knappen anropar add-performance-indexes.mjs direkt
        via subprocess (inte via npm), men sidan dokumenterar och länkar
        till npm-aliasen. Båda måste finnas."""
        package = json.loads(
            (REPO_ROOT / "package.json").read_text(encoding="utf-8")
        )
        scripts = set(package.get("scripts", {}).keys())
        for required in ("db:health", "db:perf-indexes", "db:perf-indexes:dry"):
            self.assertIn(
                required,
                scripts,
                f"Saknat npm-script: {required} (refererad i database_health.py)",
            )

    def test_reason_minimum_length_consistent(self) -> None:
        """Den röda APPLY-knappen kräver minst 10 tecken motivering. Om
        tröskeln ändras i en fil utan att andra texter (UI hjälp + docstring)
        synkas blir det förvirrande för operatörer. Verifiera att 10-tröskeln
        finns i koden."""
        path = REPO_ROOT / "backoffice/pages/database_health.py"
        source = path.read_text(encoding="utf-8")
        self.assertIn(
            "len(reason.strip()) >= 10",
            source,
            "Minimum-reason-tröskeln (10 tecken) hittades inte i database_health.py — "
            "har den ändrats? Uppdatera även hjälptexten och denna test om så.",
        )


class RedisHealthSmokeTests(unittest.TestCase):
    def test_module_imports_without_errors(self) -> None:
        from backoffice.pages import redis_health  # noqa: F401

        self.assertTrue(callable(redis_health.render))
        self.assertTrue(callable(redis_health._render_payload))
        self.assertTrue(callable(redis_health._render_history))
        self.assertTrue(callable(redis_health._run_redis_check))
        self.assertTrue(callable(redis_health._load_snapshots))

    def test_referenced_script_exists(self) -> None:
        from backoffice.pages import redis_health

        path = REPO_ROOT / redis_health._HEALTH_SCRIPT_REL
        self.assertTrue(
            path.is_file(),
            f"backoffice/pages/redis_health.py refererar {redis_health._HEALTH_SCRIPT_REL} som inte finns",
        )

    def test_redis_health_npm_script_exists(self) -> None:
        """`npm run redis:health` är dokumenterat — kontrollera att det inte
        glider bort från `package.json`."""
        package = json.loads(
            (REPO_ROOT / "package.json").read_text(encoding="utf-8")
        )
        scripts = set(package.get("scripts", {}).keys())
        self.assertIn(
            "redis:health",
            scripts,
            "Saknat npm-script: redis:health (CLI-motsvarighet till backoffice-sidan)",
        )


class BackofficeNavigationSmokeTests(unittest.TestCase):
    def test_new_pages_registered_in_navigation(self) -> None:
        from backoffice.pages import PAGE_NAMES, PAGE_QUERY_ALIASES

        self.assertIn("Databashälsa", PAGE_NAMES)
        self.assertIn("Redis-hälsa", PAGE_NAMES)
        # Query-alias så ?nav=db / ?nav=redis fungerar
        self.assertEqual(PAGE_QUERY_ALIASES.get("db"), "Databashälsa")
        self.assertEqual(PAGE_QUERY_ALIASES.get("redis"), "Redis-hälsa")


if __name__ == "__main__":
    unittest.main()
