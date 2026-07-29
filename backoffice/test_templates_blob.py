"""Enhetstester för icke-trivial logik i backoffice/pages/templates_blob.py.

Täcker källmapp-default, Blob-uploader (mockad subprocess) och
manifest-sammanfattning utan Streamlit-runtime eller nätverk.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backoffice.pages import templates_blob as tb


class DefaultSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.parent = Path(self._tmp.name)
        self.repo = self.parent / "repo"
        self.repo.mkdir()

    def test_returns_sibling_mallar_when_it_exists(self) -> None:
        sibling = self.parent / "mallar"
        sibling.mkdir()
        self.assertEqual(tb._default_source(self.repo), str(sibling))

    def test_falls_back_to_relative_path_when_sibling_missing(self) -> None:
        self.assertEqual(tb._default_source(self.repo), "../mallar")


class RunUploaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name)
        self.script = self.repo / tb._UPLOADER_REL
        self.script.parent.mkdir(parents=True)
        self.script.write_text("// stub\n", encoding="utf-8")

    def test_missing_script_returns_error_without_subprocess(self) -> None:
        self.script.unlink()
        with mock.patch.object(tb.subprocess, "run") as run:
            result = tb._run_uploader(self.repo, "/tmp/mallar", upload=False)
        run.assert_not_called()
        self.assertFalse(result["ok"])
        self.assertIn("Skript saknas", result["error"])

    def test_dry_run_omits_upload_flags(self) -> None:
        fake = mock.Mock(returncode=0, stdout="scanned 3", stderr="")
        with mock.patch.object(tb.subprocess, "run", return_value=fake) as run:
            result = tb._run_uploader(self.repo, "C:/mallar", upload=False)
        args = run.call_args.args[0]
        self.assertEqual(args[0], "node")
        self.assertEqual(args[1], str(self.script))
        self.assertEqual(args[2], "--source=C:/mallar")
        self.assertNotIn("--upload", args)
        self.assertNotIn("--write-catalog", args)
        self.assertTrue(result["ok"])
        self.assertEqual(result["code"], 0)
        self.assertEqual(result["output"], "scanned 3")

    def test_upload_mode_adds_upload_and_write_catalog(self) -> None:
        fake = mock.Mock(returncode=0, stdout="uploaded", stderr="warn")
        with mock.patch.object(tb.subprocess, "run", return_value=fake) as run:
            result = tb._run_uploader(self.repo, "/src", upload=True)
        args = run.call_args.args[0]
        self.assertIn("--upload", args)
        self.assertIn("--write-catalog", args)
        self.assertTrue(result["ok"])
        self.assertIn("uploaded", result["output"])
        self.assertIn("warn", result["output"])

    def test_nonzero_exit_marks_not_ok(self) -> None:
        fake = mock.Mock(returncode=7, stdout="", stderr="boom")
        with mock.patch.object(tb.subprocess, "run", return_value=fake):
            result = tb._run_uploader(self.repo, "/src", upload=False)
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], 7)
        self.assertEqual(result["output"], "boom")

    def test_timeout_returns_error(self) -> None:
        with mock.patch.object(
            tb.subprocess, "run", side_effect=subprocess.TimeoutExpired("node", 1)
        ):
            result = tb._run_uploader(self.repo, "/src", upload=False)
        self.assertFalse(result["ok"])
        self.assertIn("Timeout", result["error"])
        self.assertIn(str(tb._TIMEOUT_S), result["error"])

    def test_missing_node_returns_error(self) -> None:
        with mock.patch.object(
            tb.subprocess, "run", side_effect=FileNotFoundError("node")
        ):
            result = tb._run_uploader(self.repo, "/src", upload=True)
        self.assertFalse(result["ok"])
        self.assertIn("`node` saknas", result["error"])


class LoadManifestSummaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name)
        self.manifest = self.repo / tb._MANIFEST_REL
        self.manifest.parent.mkdir(parents=True)

    def test_missing_manifest_returns_none(self) -> None:
        self.assertIsNone(tb._load_manifest_summary(self.repo))

    def test_invalid_json_returns_none(self) -> None:
        self.manifest.write_text("{not-json", encoding="utf-8")
        self.assertIsNone(tb._load_manifest_summary(self.repo))

    def test_non_object_json_returns_zero_count(self) -> None:
        self.manifest.write_text("[1,2,3]\n", encoding="utf-8")
        summary = tb._load_manifest_summary(self.repo)
        self.assertIsNotNone(summary)
        assert summary is not None
        self.assertEqual(summary["count"], 0)
        self.assertEqual(summary["templates"], [])
        self.assertIsNone(summary["lastUpdated"])

    def test_templates_not_list_counts_as_zero(self) -> None:
        self.manifest.write_text(
            json.dumps({"templates": {"a": 1}, "_lastUpdated": "2026-01-01"}),
            encoding="utf-8",
        )
        summary = tb._load_manifest_summary(self.repo)
        assert summary is not None
        self.assertEqual(summary["count"], 0)
        self.assertEqual(summary["templates"], [])
        self.assertEqual(summary["lastUpdated"], "2026-01-01")

    def test_valid_manifest_summary(self) -> None:
        payload = {
            "_lastUpdated": "2026-07-01T12:00:00Z",
            "templates": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
        }
        self.manifest.write_text(json.dumps(payload), encoding="utf-8")
        summary = tb._load_manifest_summary(self.repo)
        assert summary is not None
        self.assertEqual(summary["count"], 3)
        self.assertEqual(summary["lastUpdated"], "2026-07-01T12:00:00Z")
        self.assertEqual(len(summary["templates"]), 3)


if __name__ == "__main__":
    unittest.main()
