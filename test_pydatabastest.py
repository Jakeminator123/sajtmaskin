#!/usr/bin/env python3
"""Behavior tests for pydatabastest's EMPTY-group restart-state decision.

Runs without a DB or pg8000 (pg8000 is imported lazily inside pydatabastest),
so it is safe in any environment:  python -m unittest test_pydatabastest
"""

import unittest

from pydatabastest import FAIL, PASS, WARN, classify_empty_group


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


if __name__ == "__main__":
    unittest.main()
