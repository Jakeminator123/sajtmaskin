"""Enhetstester för icke-trivial logik i backoffice/pages/generation_history.py.

Fokus: preview-etiketter (M#pv1 cutoff), tidstolkning, kortning och
read-only Node-script-wrapper (mockad subprocess). Asserterar inte på
UI-kolumnrubriker som "Quality gate"/"Autofix".
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest import mock

from backoffice.pages import generation_history as gh


class PreviewLabelTests(unittest.TestCase):
    def test_false_is_failed_regardless_of_timestamp(self) -> None:
        self.assertEqual(gh._preview_label(False, "2026-07-10T00:00:00Z"), "failed")
        self.assertEqual(gh._preview_label(False, None), "failed")

    def test_none_and_other_non_bool_are_pending(self) -> None:
        self.assertEqual(gh._preview_label(None), "pending")
        self.assertEqual(gh._preview_label("true", "2026-07-10T00:00:00Z"), "pending")
        self.assertEqual(gh._preview_label(1, "2026-07-10T00:00:00Z"), "pending")

    def test_true_after_cutoff_is_ready(self) -> None:
        after = gh._PREVIEW_SUCCESS_SEMANTIC_CUTOFF + timedelta(seconds=1)
        self.assertEqual(
            gh._preview_label(True, after.isoformat().replace("+00:00", "Z")),
            "ready",
        )

    def test_true_before_cutoff_is_legacy_preflight(self) -> None:
        before = gh._PREVIEW_SUCCESS_SEMANTIC_CUTOFF - timedelta(seconds=1)
        self.assertEqual(
            gh._preview_label(True, before.isoformat().replace("+00:00", "Z")),
            "legacy (preflight)",
        )

    def test_true_exactly_at_cutoff_is_ready(self) -> None:
        # parsed < cutoff → legacy; equality is post-cutoff / ready.
        at = gh._PREVIEW_SUCCESS_SEMANTIC_CUTOFF
        self.assertEqual(
            gh._preview_label(True, at.isoformat().replace("+00:00", "Z")),
            "ready",
        )

    def test_true_with_missing_or_unparseable_timestamp_is_legacy(self) -> None:
        self.assertEqual(gh._preview_label(True, None), "legacy (preflight)")
        self.assertEqual(gh._preview_label(True, ""), "legacy (preflight)")
        self.assertEqual(gh._preview_label(True, "   "), "legacy (preflight)")
        self.assertEqual(gh._preview_label(True, "not-a-date"), "legacy (preflight)")


class PreviewSemanticCutoffTests(unittest.TestCase):
    def test_naive_datetime_assumed_utc(self) -> None:
        naive = "2026-07-03 14:29:59"
        self.assertTrue(gh._is_before_preview_semantic_cutoff(naive))
        naive_after = "2026-07-03 14:30:00"
        self.assertFalse(gh._is_before_preview_semantic_cutoff(naive_after))

    def test_zulu_and_offset_formats(self) -> None:
        self.assertTrue(
            gh._is_before_preview_semantic_cutoff("2026-07-03T14:29:59Z")
        )
        self.assertFalse(
            gh._is_before_preview_semantic_cutoff("2026-07-03T16:30:00+02:00")
        )

    def test_aware_non_utc_compared_correctly(self) -> None:
        # 14:30 UTC = 16:30 +02:00 — at cutoff → not before.
        self.assertFalse(
            gh._is_before_preview_semantic_cutoff("2026-07-03T16:30:00+02:00")
        )
        # 14:29:59 UTC = 16:29:59 +02:00 — before.
        self.assertTrue(
            gh._is_before_preview_semantic_cutoff("2026-07-03T16:29:59+02:00")
        )


class ShortTests(unittest.TestCase):
    def test_none_becomes_empty(self) -> None:
        self.assertEqual(gh._short(None), "")

    def test_truncates_to_length(self) -> None:
        self.assertEqual(gh._short("abcdefghijklmnopqrstuvwxyz", 5), "abcde")

    def test_default_length_36(self) -> None:
        text = "x" * 50
        self.assertEqual(len(gh._short(text)), 36)


class RecentDataframePreviewColumnTests(unittest.TestCase):
    def test_preview_column_uses_preview_label(self) -> None:
        cutoff = gh._PREVIEW_SUCCESS_SEMANTIC_CUTOFF
        rows = [
            {
                "created_at": (cutoff + timedelta(hours=1)).isoformat(),
                "preview_success": True,
                "chat_id": "c1",
            },
            {
                "created_at": (cutoff - timedelta(hours=1)).isoformat(),
                "preview_success": True,
                "chat_id": "c2",
            },
            {
                "created_at": cutoff.isoformat(),
                "preview_success": False,
                "chat_id": "c3",
            },
            {
                "created_at": cutoff.isoformat(),
                "preview_success": None,
                "chat_id": "c4",
            },
        ]
        df = gh._recent_dataframe(rows)
        self.assertEqual(
            list(df["Preview"]),
            ["ready", "legacy (preflight)", "failed", "pending"],
        )
        self.assertEqual(list(df["chat_id"]), ["c1", "c2", "c3", "c4"])


class RunHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name)
        self.script = self.repo / gh._SCRIPT_REL
        self.script.parent.mkdir(parents=True)
        self.script.write_text("// stub\n", encoding="utf-8")

    def test_missing_script_returns_error(self) -> None:
        self.script.unlink()
        with mock.patch.object(gh.subprocess, "run") as run:
            result = gh._run_history(self.repo, ["--limit=10"])
        run.assert_not_called()
        self.assertIn("Script saknas", result["error"])

    def test_parses_json_object_stdout(self) -> None:
        payload = {"rows": [{"chat_id": "abc"}], "summary": {"total": 1}}
        fake = mock.Mock(returncode=0, stdout=json.dumps(payload), stderr="")
        with mock.patch.object(gh.subprocess, "run", return_value=fake) as run:
            result = gh._run_history(self.repo, ["--limit=5"])
        args = run.call_args.args[0]
        self.assertEqual(args[0], "node")
        self.assertEqual(args[1], str(self.script))
        self.assertEqual(args[2], "--json")
        self.assertEqual(args[3], "--limit=5")
        self.assertEqual(result, payload)

    def test_empty_stdout_uses_stderr_as_error(self) -> None:
        fake = mock.Mock(returncode=1, stdout="  ", stderr=" DB down ")
        with mock.patch.object(gh.subprocess, "run", return_value=fake):
            result = gh._run_history(self.repo, [])
        self.assertEqual(result["error"], "DB down")

    def test_invalid_json_returns_error(self) -> None:
        fake = mock.Mock(returncode=0, stdout="not-json", stderr="")
        with mock.patch.object(gh.subprocess, "run", return_value=fake):
            result = gh._run_history(self.repo, [])
        self.assertIn("Kunde inte tolka JSON", result["error"])

    def test_non_object_json_rejected(self) -> None:
        fake = mock.Mock(returncode=0, stdout="[1,2]", stderr="")
        with mock.patch.object(gh.subprocess, "run", return_value=fake):
            result = gh._run_history(self.repo, [])
        self.assertIn("Oväntat svarsformat", result["error"])

    def test_timeout_returns_error(self) -> None:
        with mock.patch.object(
            gh.subprocess, "run", side_effect=subprocess.TimeoutExpired("node", 1)
        ):
            result = gh._run_history(self.repo, [])
        self.assertIn("timeout", result["error"].lower())
        self.assertIn(str(gh._TIMEOUT_S), result["error"])

    def test_missing_node_returns_error(self) -> None:
        with mock.patch.object(
            gh.subprocess, "run", side_effect=FileNotFoundError("node")
        ):
            result = gh._run_history(self.repo, [])
        self.assertIn("`node` saknas", result["error"])


if __name__ == "__main__":
    unittest.main()
