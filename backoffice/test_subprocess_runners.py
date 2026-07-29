"""Tester för backoffice/subprocess_runners.py.

Mockar ``shutil.which`` — inga riktiga subprocess-anrop.
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from backoffice.subprocess_runners import resolve_node_command


class ResolveNodeCommandTests(unittest.TestCase):
    def test_missing_node_returns_none(self) -> None:
        with patch("backoffice.subprocess_runners.shutil.which", return_value=None):
            self.assertIsNone(resolve_node_command())

    def test_found_node_returns_tuple(self) -> None:
        with patch(
            "backoffice.subprocess_runners.shutil.which",
            return_value="/usr/local/bin/node",
        ) as which_mock:
            self.assertEqual(resolve_node_command(), ("/usr/local/bin/node",))
            which_mock.assert_called_once_with("node")


if __name__ == "__main__":
    unittest.main()
