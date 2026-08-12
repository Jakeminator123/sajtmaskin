from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backoffice.pages.scaffold_lifecycle_lib import client_projection


class ScaffoldClientProjectionCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.repo_root = Path(self.tempdir.name)

    def test_success_uses_owner_command_and_timeout(self) -> None:
        result = {
            "ok": True,
            "exitCode": 0,
            "stdoutTail": "generated",
            "stderrTail": "",
        }
        with mock.patch.object(
            client_projection, "run_repo_command", return_value=result
        ) as runner:
            client_projection.regenerate_scaffold_client_projection(self.repo_root)

        runner.assert_called_once_with(
            self.repo_root,
            (
                "node",
                "--import",
                "tsx",
                "scripts/scaffolds/generate-client-list.ts",
                "--write",
            ),
            timeout=120,
        )

    def test_nonzero_exit_reports_stdout_and_stderr(self) -> None:
        result = {
            "ok": False,
            "exitCode": 7,
            "stdoutTail": "generator output",
            "stderrTail": "generator error",
        }
        with mock.patch.object(
            client_projection, "run_repo_command", return_value=result
        ):
            with self.assertRaisesRegex(RuntimeError, "exit 7") as raised:
                client_projection.regenerate_scaffold_client_projection(self.repo_root)

        self.assertIn("generator output", str(raised.exception))
        self.assertIn("generator error", str(raised.exception))

    def test_missing_node_is_reported(self) -> None:
        result = {
            "ok": False,
            "exitCode": -2,
            "stdoutTail": "",
            "stderrTail": "Saknar binär (node)",
        }
        with mock.patch.object(
            client_projection, "run_repo_command", return_value=result
        ):
            with self.assertRaisesRegex(RuntimeError, "Saknar binär"):
                client_projection.regenerate_scaffold_client_projection(self.repo_root)

    def test_timeout_is_reported(self) -> None:
        result = {
            "ok": False,
            "exitCode": -1,
            "stdoutTail": "partial output",
            "stderrTail": "[backoffice] Timeout efter 120s",
        }
        with mock.patch.object(
            client_projection, "run_repo_command", return_value=result
        ):
            with self.assertRaisesRegex(RuntimeError, "Timeout efter 120s"):
                client_projection.regenerate_scaffold_client_projection(self.repo_root)


if __name__ == "__main__":
    unittest.main()
