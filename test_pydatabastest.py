#!/usr/bin/env python3
"""Behavior tests for pydatabastest's EMPTY-group restart-state decision.

Runs without a DB or pg8000 (pg8000 is imported lazily inside pydatabastest),
so it is safe in any environment:  python -m unittest test_pydatabastest
"""

import unittest

from pydatabastest import (
    ACKNOWLEDGED_EXTRA_TABLES,
    EXPECTED_TABLES,
    FAIL,
    KNOWN_EXTRA_TABLES,
    PASS,
    WARN,
    classify_empty_group,
    classify_table_drift,
)


class ClassifyEmptyGroupTests(unittest.TestCase):
    def test_enforce_fails_on_accumulated_rows(self):
        status, name, detail = classify_empty_group("enforce", ["app_projects", "chats"], {"app_projects": 29}, [])
        self.assertEqual(status, FAIL)
        self.assertIn("non-zero rows", detail)

    def test_enforce_fails_on_unverified_count(self):
        status, _, detail = classify_empty_group("enforce", ["app_projects"], {}, ["app_projects"])
        self.assertEqual(status, FAIL)
        self.assertIn("unverified", detail)

    def test_enforce_passes_when_clean(self):
        status, name, _ = classify_empty_group("enforce", ["app_projects", "chats"], {}, [])
        self.assertEqual(status, PASS)
        self.assertNotIn("advisory", name)
        self.assertNotIn("informational", name)

    def test_warn_is_advisory_on_rows(self):
        status, name, detail = classify_empty_group("warn", ["app_projects"], {"app_projects": 29}, [])
        self.assertEqual(status, WARN)
        self.assertIn("advisory", name)
        self.assertIn("consider a dev reset", detail)

    def test_warn_is_advisory_on_unverified(self):
        status, _, detail = classify_empty_group("warn", ["app_projects"], {}, ["app_projects"])
        self.assertEqual(status, WARN)
        self.assertIn("unverified", detail)

    def test_warn_passes_when_clean(self):
        status, name, _ = classify_empty_group("warn", ["app_projects"], {}, [])
        self.assertEqual(status, PASS)
        self.assertNotIn("advisory", name)

    def test_info_passes_with_live_rows(self):
        status, name, detail = classify_empty_group("info", ["app_projects", "chats"], {"app_projects": 36}, [])
        self.assertEqual(status, PASS)
        self.assertIn("informational", name)
        self.assertIn("hold live rows", detail)

    def test_info_warns_on_unverified_count(self):
        status, _, detail = classify_empty_group("info", ["app_projects"], {}, ["app_projects"])
        self.assertEqual(status, WARN)
        self.assertIn("count failed", detail)


class ClassifyTableDriftTests(unittest.TestCase):
    """Drift-klassificeringen (backlog: extern coach-review på #495) — tidigare
    inline i inspect_db, nu ren funktion. Låser de två sista otestade
    beteendena: ACKNOWLEDGED_EXTRA_TABLES tillåts (schema_migrations) och en
    okänd extra tabell klassas som drift (FAIL-vägen)."""

    def _full_schema(self) -> set[str]:
        return set(EXPECTED_TABLES) | set(KNOWN_EXTRA_TABLES)

    def test_acknowledged_extra_table_is_not_drift(self):
        tables = self._full_schema() | set(ACKNOWLEDGED_EXTRA_TABLES)
        extra, missing_known = classify_table_drift(tables)
        self.assertEqual(extra, [])
        self.assertEqual(missing_known, [])

    def test_unknown_extra_table_is_drift(self):
        tables = self._full_schema() | {"rogue_table"}
        extra, _ = classify_table_drift(tables)
        self.assertEqual(extra, ["rogue_table"])

    def test_missing_known_extra_is_drift_not_clean(self):
        tables = set(EXPECTED_TABLES)  # KNOWN_EXTRA (error_log_events) saknas
        extra, missing_known = classify_table_drift(tables)
        self.assertEqual(extra, [])
        self.assertEqual(missing_known, list(KNOWN_EXTRA_TABLES))

    def test_clean_schema_without_acknowledged_is_clean(self):
        # ACKNOWLEDGED-tabeller är tillåtna men inte krävda.
        extra, missing_known = classify_table_drift(self._full_schema())
        self.assertEqual(extra, [])
        self.assertEqual(missing_known, [])


if __name__ == "__main__":
    unittest.main()
