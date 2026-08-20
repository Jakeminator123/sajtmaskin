"""Enhetstester för icke-trivial logik i backoffice/pages/generation_history.py.

Fokus: preview-etiketter (M#pv1 cutoff), tidstolkning, kortning och
read-only Node-script-wrapper (mockad subprocess).

Sedan P2-4 grindas även kolumnrubrikerna, men bara via modulens konstanter — de
gamla legacy-orden ("Quality gate", "Autofix", "Syntax-fixer") får inte komma
tillbaka som fria strängar, och DB-nycklarna ska vara oförändrade.
"""

from __future__ import annotations

import contextlib
import json
import subprocess
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest import mock

from backoffice.pages import generation_history as gh


def _is_node_argv0(argv0: str) -> bool:
    """True for bare ``node`` or an absolute PATH entry whose stem is ``node``.

    Accepts ``node``, ``node.exe``, ``node.cmd``, ``/usr/bin/node``,
    ``C:\\Program Files\\nodejs\\node.exe`` — pathlib strips the suffix.
    """
    return Path(argv0).stem.lower() == "node"


def _assert_missing_node_error(testcase: unittest.TestCase, message: str) -> None:
    err = message.lower()
    testcase.assertIn("node", err)
    testcase.assertTrue(
        any(token in err for token in ("saknas", "finns inte", "path", "not found")),
        msg=f"expected a missing-node error, got: {message!r}",
    )


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
        args = list(run.call_args.args[0])
        # argv0 may be bare "node" (today) or an absolute which()-path (P2-1).
        self.assertTrue(_is_node_argv0(args[0]), msg=f"argv0={args[0]!r}")
        script_idx = args.index(str(self.script))
        self.assertEqual(script_idx, 1, msg="node binary must precede the script path")
        self.assertIn("--json", args)
        self.assertIn("--limit=5", args)
        self.assertLess(args.index("--json"), args.index("--limit=5"))
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
        """Godkänn både tidig PATH-miss (P2-1) och FileNotFoundError från subprocess.

        Tvingar PATH-miss via ``shutil.which`` / ev. resolve-helper så testet
        inte bara råkar passera för att lokal node finns installerad.
        """
        with mock.patch.object(
            gh.subprocess, "run", side_effect=FileNotFoundError("node")
        ) as run:
            with contextlib.ExitStack() as stack:
                stack.enter_context(mock.patch("shutil.which", return_value=None))
                for name in ("_resolve_node_command", "resolve_node_command", "which"):
                    if hasattr(gh, name):
                        stack.enter_context(
                            mock.patch.object(gh, name, return_value=None)
                        )
                result = gh._run_history(self.repo, [])
        self.assertIn("error", result)
        _assert_missing_node_error(self, result["error"])
        # Antingen tidig retur (run orörd) eller FileNotFoundError-vägen.
        self.assertTrue(
            run.call_count in (0, 1),
            msg=f"unexpected subprocess call count: {run.call_count}",
        )


class QualityGateLabelTests(unittest.TestCase):
    """SM-017: visad grind får inte vara grön när postchecken spärrade."""

    def test_product_blocked_is_not_shown_as_preflight_passed(self) -> None:
        rows = [
            {
                "created_at": "2026-08-19T10:00:00Z",
                "quality_gate_result": "preflight_passed",
                "product_blocked": True,
                "chat_id": "c1",
            }
        ]
        df = gh._recent_dataframe(rows)
        shown = df[gh.COLUMN_QUALITY_GATE].iloc[0]
        self.assertNotEqual(shown, "preflight_passed")
        self.assertEqual(shown, "product_blocked")

    def test_prefers_reported_quality_gate_from_script(self) -> None:
        self.assertEqual(
            gh._quality_gate_label(
                {
                    "quality_gate_result": "preflight_passed",
                    "product_blocked": False,
                    "reported_quality_gate": "product_blocked",
                }
            ),
            "product_blocked",
        )

    def test_keeps_finalize_pass_without_postcheck_block(self) -> None:
        self.assertEqual(
            gh._quality_gate_label({"quality_gate_result": "preflight_passed"}),
            "preflight_passed",
        )

    def test_keeps_finalize_failure_when_postcheck_also_blocked(self) -> None:
        self.assertEqual(
            gh._quality_gate_label(
                {
                    "quality_gate_result": "verifier_failed",
                    "product_blocked": True,
                }
            ),
            "verifier_failed",
        )

    def test_legend_names_the_postcheck_overlay(self) -> None:
        self.assertIn("product_postcheck.summary", gh.GATE_COLUMN_LEGEND)
        self.assertIn("product_blocked", gh.GATE_COLUMN_LEGEND)


class GlossaryColumnHeaderTests(unittest.TestCase):
    """P2-4: sidan pratade legacy ("Quality gate", "Autofix", "Syntax-fixer") medan
    resten av repot använder glossaryns kontrollbegrepp."""

    ROWS = [
        {
            "created_at": "2026-07-29T10:00:00Z",
            "quality_gate_result": "passed",
            "autofix_applied": True,
            "syntax_fixer_used": False,
            "preview_success": True,
        }
    ]

    def test_recent_table_uses_glossary_headers(self) -> None:
        columns = list(gh._recent_dataframe(self.ROWS).columns)
        self.assertIn(gh.COLUMN_QUALITY_GATE, columns)
        self.assertIn(gh.COLUMN_NORMALIZE, columns)
        for legacy in ("Quality gate", "Autofix", "Syntax-fixer"):
            self.assertNotIn(legacy, columns, f"legacy-rubriken {legacy!r} är tillbaka")

    def test_legend_maps_each_column_to_its_db_key(self) -> None:
        """Rubrikbytet får inte göra det svårare att hitta telemetri-kolumnen:
        DB-nycklarna behåller sina namn (terminology.mdc) och legenden säger vilken
        rubrik som är vilken nyckel."""
        for db_key in ("quality_gate_result", "autofix_applied", "syntax_fixer_used"):
            self.assertIn(db_key, gh.GATE_COLUMN_LEGEND)
        # Grinden bär två tier-namn eftersom samma kolumn används av båda.
        self.assertIn("RenderGate", gh.GATE_COLUMN_LEGEND)
        self.assertIn("ReleaseGate", gh.GATE_COLUMN_LEGEND)
        self.assertIn("fixerImproved", gh.GATE_COLUMN_LEGEND)
        self.assertIn("riskyFixCount", gh.GATE_COLUMN_LEGEND)
        self.assertIn(gh.COLUMN_REPAIR_HELPED, gh.GATE_COLUMN_LEGEND)
        self.assertIn(gh.COLUMN_RISKY_FIXES, gh.GATE_COLUMN_LEGEND)

    def test_repair_helped_label(self) -> None:
        self.assertEqual(gh._repair_helped_label(True, True), "ja")
        self.assertEqual(gh._repair_helped_label(True, False), "nej")
        self.assertEqual(gh._repair_helped_label(False, True), "—")
        self.assertEqual(gh._repair_helped_label(None, None), "—")

    def test_no_legacy_header_literal_left_in_the_code(self) -> None:
        """Bara koden granskas — kommentaren som förklarar bytet nämner
        legacy-orden med flit, och att förbjuda det vore att förbjuda historiken."""
        code_lines = [
            line
            for line in Path(gh.__file__).read_text(encoding="utf-8").splitlines()
            if not line.lstrip().startswith("#")
        ]
        code = "\n".join(code_lines)
        for legacy in ('"Quality gate"', '"Autofix"', '"Syntax-fixer"'):
            self.assertNotIn(legacy, code, f"{legacy} kvar som fri sträng i koden")


if __name__ == "__main__":
    unittest.main()
