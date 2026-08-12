from __future__ import annotations

import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from backoffice.pages import dossiers as dossiers_page
from backoffice.pages.dossiers_lib import io as dossiers_io
from backoffice.shared_lib.repo_lock import RepoMutationLockTimeout, repo_mutation_lock


class RepoMutationLockTests(unittest.TestCase):
    def test_transaction_adapter_script_allocates_and_cleans_stage(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        launcher = repo_root / "scripts" / "dev" / "run-python.mjs"
        adapter = repo_root / "scripts" / "dossiers" / "transaction_adapter.py"
        allocate = subprocess.run(
            [
                "node",
                str(launcher),
                str(adapter),
                "allocate",
                "--id=adapter-smoke",
            ],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(allocate.returncode, 0, allocate.stderr)
        stage = Path(allocate.stdout.strip())
        self.assertTrue(stage.is_dir(), allocate.stdout)
        cleanup = subprocess.run(
            [
                "node",
                str(launcher),
                str(adapter),
                "cleanup",
                f"--stage={stage}",
            ],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(cleanup.returncode, 0, cleanup.stderr)
        self.assertFalse(stage.exists())

    def test_nested_acquisition_reuses_the_process_lock(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            with repo_mutation_lock(repo_root, "dossiers", timeout_seconds=0.2):
                with repo_mutation_lock(repo_root, "dossiers", timeout_seconds=0.2):
                    pass

    def test_capability_map_writer_can_nest_under_the_same_lock(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            completed = SimpleNamespace(returncode=0, stdout="ok", stderr="")
            with (
                mock.patch.object(dossiers_page, "REPO_ROOT", repo_root),
                mock.patch.object(
                    dossiers_io.subprocess, "run", return_value=completed
                ),
                repo_mutation_lock(repo_root, "dossiers", timeout_seconds=0.2),
            ):
                ok, output = dossiers_io._run_capability_map_write()

            self.assertTrue(ok, output)

    def test_serializes_across_processes_and_releases_after_exit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            ready = repo_root / "ready"
            script = "\n".join(
                [
                    "import sys, time",
                    "from pathlib import Path",
                    "from backoffice.shared_lib.repo_lock import repo_mutation_lock",
                    "root, ready = Path(sys.argv[1]), Path(sys.argv[2])",
                    "with repo_mutation_lock(root, 'dossiers', timeout_seconds=2):",
                    "    ready.write_text('locked', encoding='utf-8')",
                    "    time.sleep(0.8)",
                ]
            )
            process = subprocess.Popen(
                [sys.executable, "-c", script, str(repo_root), str(ready)],
                cwd=Path(__file__).resolve().parents[1],
            )
            self.addCleanup(lambda: process.poll() is None and process.kill())
            deadline = time.monotonic() + 3
            while (
                not ready.exists()
                and process.poll() is None
                and time.monotonic() < deadline
            ):
                time.sleep(0.02)
            self.assertTrue(ready.exists(), f"child exited with {process.poll()}")

            with self.assertRaises(RepoMutationLockTimeout):
                with repo_mutation_lock(
                    repo_root, "dossiers", timeout_seconds=0.1, poll_seconds=0.01
                ):
                    self.fail("a second process acquired the held lock")

            self.assertEqual(process.wait(timeout=3), 0)
            with repo_mutation_lock(repo_root, "dossiers", timeout_seconds=0.2):
                pass


if __name__ == "__main__":
    unittest.main()
