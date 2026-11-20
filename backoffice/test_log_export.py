"""Enhetstester för backoffice/pages/log_export.py.

Fokus: per-kind-fel (`skipped`) från `scripts/db/dump-logs.mjs` får inte se ut
som en tom tabell.
"""

from __future__ import annotations

import unittest

from backoffice.pages import log_export as le


class SkippedWarningsTests(unittest.TestCase):
    def test_each_skipped_kind_becomes_a_warning(self) -> None:
        payload = {
            "kinds": ["errors", "drain"],
            "counts": {"errors": 0, "drain": 0},
            "skipped": {
                "errors": 'relation "engine_version_error_logs" does not exist',
                "drain": "ej chattfiltrerbar: tabellen saknar chatt-kolumn",
            },
            "data": {"errors": [], "drain": []},
        }
        warnings = le._skipped_warnings(payload)
        self.assertEqual(len(warnings), 2)
        self.assertIn("`errors`", warnings[0])
        self.assertIn("does not exist", warnings[0])
        self.assertIn("ej chattfiltrerbar", warnings[1])

    def test_no_skipped_means_no_warnings(self) -> None:
        self.assertEqual(le._skipped_warnings({"skipped": {}}), [])
        self.assertEqual(le._skipped_warnings({}), [])
        self.assertEqual(le._skipped_warnings({"skipped": None}), [])
        self.assertEqual(le._skipped_warnings({"skipped": ["bad-shape"]}), [])


if __name__ == "__main__":
    unittest.main()
