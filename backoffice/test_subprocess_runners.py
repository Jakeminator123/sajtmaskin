"""Tester för backoffice/subprocess_runners.py.

Mockar ``shutil.which`` — inga riktiga subprocess-anrop. Täcker:
  * ingen kandidat hittas → None
  * första kandidaten faller, andra funkar
  * node-/python-wrappers (inkl. Windows py -3 och SAJTMASKIN_PYTHON)
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from backoffice.subprocess_runners import (
    resolve_command_from_candidates,
    resolve_node_command,
    resolve_python_command,
)


class ResolveCommandFromCandidatesTests(unittest.TestCase):
    def test_returns_none_when_no_binary_found(self) -> None:
        with patch("backoffice.subprocess_runners.shutil.which", return_value=None):
            self.assertIsNone(
                resolve_command_from_candidates((("missing-a",), ("missing-b",)))
            )

    def test_first_candidate_fails_second_works(self) -> None:
        def fake_which(name: str) -> str | None:
            return "/usr/bin/python" if name == "python" else None

        with patch("backoffice.subprocess_runners.shutil.which", side_effect=fake_which):
            result = resolve_command_from_candidates((("python3",), ("python",)))
        self.assertEqual(result, ("/usr/bin/python",))

    def test_preserves_extra_args_on_resolved_binary(self) -> None:
        with patch(
            "backoffice.subprocess_runners.shutil.which",
            return_value=r"C:\Windows\py.exe",
        ):
            result = resolve_command_from_candidates((("py", "-3"),))
        self.assertEqual(result, (r"C:\Windows\py.exe", "-3"))

    def test_skips_empty_candidate_tuples(self) -> None:
        with patch(
            "backoffice.subprocess_runners.shutil.which",
            return_value="/bin/node",
        ):
            result = resolve_command_from_candidates(((), ("node",)))
        self.assertEqual(result, ("/bin/node",))


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


class ResolvePythonCommandTests(unittest.TestCase):
    def test_missing_python_returns_none(self) -> None:
        with patch("backoffice.subprocess_runners.shutil.which", return_value=None):
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("SAJTMASKIN_PYTHON", None)
                self.assertIsNone(resolve_python_command())

    def test_falls_through_python3_to_python(self) -> None:
        def fake_which(name: str) -> str | None:
            return "/usr/bin/python" if name == "python" else None

        with patch("backoffice.subprocess_runners.shutil.which", side_effect=fake_which):
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("SAJTMASKIN_PYTHON", None)
                with patch("backoffice.subprocess_runners.sys.platform", "linux"):
                    self.assertEqual(resolve_python_command(), ("/usr/bin/python",))

    def test_windows_probes_py_dash_3(self) -> None:
        seen: list[str] = []

        def fake_which(name: str) -> str | None:
            seen.append(name)
            return r"C:\Windows\py.exe" if name == "py" else None

        with patch("backoffice.subprocess_runners.shutil.which", side_effect=fake_which):
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("SAJTMASKIN_PYTHON", None)
                with patch("backoffice.subprocess_runners.sys.platform", "win32"):
                    result = resolve_python_command()
        self.assertEqual(result, (r"C:\Windows\py.exe", "-3"))
        self.assertEqual(seen, ["python3", "python", "py"])

    def test_sajtmaskin_python_override(self) -> None:
        with patch(
            "backoffice.subprocess_runners.shutil.which",
            return_value="/opt/custom/python",
        ) as which_mock:
            with patch.dict(os.environ, {"SAJTMASKIN_PYTHON": "/opt/custom/python"}):
                self.assertEqual(resolve_python_command(), ("/opt/custom/python",))
            which_mock.assert_called_once_with("/opt/custom/python")


if __name__ == "__main__":
    unittest.main()
