"""Enhetstester för icke-trivial logik i backoffice/pages/projects_admin.py.

Täcker den destruktiva massraderingsytan utan Streamlit-runtime och utan
riktiga Node/DB-anrop: kommando-byggning, env-parsning, JSON-summary och
subprocess-felvägar (mockade).
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from backoffice.pages import projects_admin as pa


def _is_node_argv0(argv0: str) -> bool:
    """True for bare ``node`` or a PATH entry whose stem is ``node`` (P2-1)."""
    return Path(argv0).stem.lower() == "node"


class BuildCommandTests(unittest.TestCase):
    def test_dry_run_all_test_users(self) -> None:
        cmd = pa._build_command("all_test_users", 4, "", "", apply_mode=False)
        self.assertIsNotNone(cmd)
        assert cmd is not None
        # Builder returnerar idag literal "node"; acceptera även resolved PATH.
        self.assertTrue(_is_node_argv0(cmd[0]), msg=f"argv0={cmd[0]!r}")
        self.assertEqual(cmd[1], pa._SCRIPT_REL)
        self.assertIn("--keep", cmd)
        self.assertEqual(cmd[cmd.index("--keep") + 1], "4")
        self.assertIn("--all-test-users", cmd)
        self.assertNotIn("--apply", cmd)
        self.assertNotIn("--user", cmd)
        self.assertNotIn("--user-id", cmd)

    def test_apply_mode_appends_apply_flag(self) -> None:
        cmd = pa._build_command("all_test_users", 0, "", "", apply_mode=True)
        self.assertIsNotNone(cmd)
        assert cmd is not None
        self.assertIn("--apply", cmd)
        self.assertEqual(cmd[-1], "--apply")

    def test_specific_email_uses_user_flag(self) -> None:
        cmd = pa._build_command(
            "specific_email", 2, "  Admin@Example.com  ", "", apply_mode=False
        )
        self.assertIsNotNone(cmd)
        assert cmd is not None
        self.assertIn("--user", cmd)
        self.assertEqual(cmd[cmd.index("--user") + 1], "Admin@Example.com")
        self.assertNotIn("--all-test-users", cmd)
        self.assertNotIn("--user-id", cmd)

    def test_specific_user_id_uses_user_id_flag(self) -> None:
        cmd = pa._build_command(
            "specific_user_id", 1, "", "  user_abc  ", apply_mode=True
        )
        self.assertIsNotNone(cmd)
        assert cmd is not None
        self.assertIn("--user-id", cmd)
        self.assertEqual(cmd[cmd.index("--user-id") + 1], "user_abc")
        self.assertIn("--apply", cmd)
        self.assertNotIn("--all-test-users", cmd)

    def test_empty_specific_email_returns_none_not_all_users(self) -> None:
        """Tom specifik email → inget kommando (aldrig --all-test-users)."""
        for blank in ("", "   ", "\t"):
            with self.subTest(blank=repr(blank)):
                cmd = pa._build_command(
                    "specific_email", 3, blank, "", apply_mode=False
                )
                self.assertIsNone(cmd)
                apply_cmd = pa._build_command(
                    "specific_email", 3, blank, "", apply_mode=True
                )
                self.assertIsNone(apply_cmd)

    def test_empty_specific_user_id_returns_none_not_all_users(self) -> None:
        for blank in ("", "   ", "\t"):
            with self.subTest(blank=repr(blank)):
                cmd = pa._build_command(
                    "specific_user_id", 3, "", blank, apply_mode=False
                )
                self.assertIsNone(cmd)
                apply_cmd = pa._build_command(
                    "specific_user_id", 3, "", blank, apply_mode=True
                )
                self.assertIsNone(apply_cmd)

    def test_unknown_scope_returns_none(self) -> None:
        self.assertIsNone(
            pa._build_command("everyone", 1, "a@x.com", "u1", apply_mode=False)
        )

    def test_keep_is_coerced_to_int_string(self) -> None:
        cmd = pa._build_command("all_test_users", 7, "", "", apply_mode=False)
        assert cmd is not None
        self.assertEqual(cmd[cmd.index("--keep") + 1], "7")


class ExtractSummaryTests(unittest.TestCase):
    def test_picks_last_json_object_line(self) -> None:
        stdout = "\n".join(
            [
                "progress…",
                json.dumps({"mode": "dry", "keep": 1}),
                "more noise",
                json.dumps({"mode": "apply", "keep": 4, "summary": [{"deleted": 2}]}),
            ]
        )
        summary = pa._extract_summary(stdout)
        self.assertIsNotNone(summary)
        assert summary is not None
        self.assertEqual(summary["mode"], "apply")
        self.assertEqual(summary["keep"], 4)

    def test_skips_invalid_json_looking_lines(self) -> None:
        stdout = "{not json}\n" + json.dumps({"ok": True})
        self.assertEqual(pa._extract_summary(stdout), {"ok": True})

    def test_returns_none_when_no_json_object(self) -> None:
        self.assertIsNone(pa._extract_summary("plain text\n[1,2,3]\n"))
        self.assertIsNone(pa._extract_summary(""))


class ReadEnvLocalTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.env_path = self.root / ".env.local"
        self.ctx = SimpleNamespace(env_local=self.env_path, repo_root=self.root)

    def test_missing_file_returns_empty(self) -> None:
        self.assertEqual(pa._read_env_local(self.ctx), {})

    def test_parses_keys_skips_comments_and_blank(self) -> None:
        self.env_path.write_text(
            "\n".join(
                [
                    "# comment",
                    "",
                    "ADMIN_EMAILS=a@x.com,b@x.com",
                    "QUOTED=\"hello world\"",
                    "SINGLE='one'",
                    "NO_SEP",
                    "  SPACED = value  ",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        env = pa._read_env_local(self.ctx)
        self.assertEqual(env["ADMIN_EMAILS"], "a@x.com,b@x.com")
        self.assertEqual(env["QUOTED"], "hello world")
        self.assertEqual(env["SINGLE"], "one")
        self.assertEqual(env["SPACED"], "value")
        self.assertNotIn("NO_SEP", env)
        self.assertNotIn("# comment", env)


class ReadTestEmailsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.env_path = Path(self._tmp.name) / ".env.local"
        self.ctx = SimpleNamespace(env_local=self.env_path)

    def test_collects_dedupes_and_lowercases(self) -> None:
        self.env_path.write_text(
            "\n".join(
                [
                    "ADMIN_EMAILS=Admin@X.com, other@x.com, admin@x.com",
                    "SUPERADMIN_EMAIL=Other@X.com",
                    "TEST_USER_EMAIL=guest@x.com",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        emails = pa._read_test_emails(self.ctx)
        self.assertEqual(emails, ["admin@x.com", "other@x.com", "guest@x.com"])

    def test_empty_env_returns_empty_list(self) -> None:
        self.env_path.write_text("FOO=bar\n", encoding="utf-8")
        self.assertEqual(pa._read_test_emails(self.ctx), [])

    def test_missing_env_returns_empty_list(self) -> None:
        self.assertEqual(pa._read_test_emails(self.ctx), [])


class ReadTargetDbTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.env_path = Path(self._tmp.name) / ".env.local"
        self.ctx = SimpleNamespace(env_local=self.env_path)

    def test_masks_password_in_postgres_url(self) -> None:
        self.env_path.write_text(
            "POSTGRES_URL=postgresql://user:s3cret@db.example.com:5432/app\n",
            encoding="utf-8",
        )
        masked = pa._read_target_db(self.ctx)
        self.assertIn("://***:***@", masked)
        self.assertIn("db.example.com:5432/app", masked)
        self.assertNotIn("s3cret", masked)
        self.assertNotIn("user:", masked)

    def test_falls_back_through_url_keys(self) -> None:
        self.env_path.write_text(
            "DATABASE_URL=postgres://u:p@host/db\n",
            encoding="utf-8",
        )
        self.assertIn("host/db", pa._read_target_db(self.ctx))

    def test_prefers_postgres_url_over_database_url(self) -> None:
        self.env_path.write_text(
            "\n".join(
                [
                    "POSTGRES_URL=postgresql://a:b@first/db",
                    "DATABASE_URL=postgresql://a:b@second/db",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        self.assertIn("first/db", pa._read_target_db(self.ctx))
        self.assertNotIn("second", pa._read_target_db(self.ctx))

    def test_missing_url_returns_empty(self) -> None:
        self.env_path.write_text("ADMIN_EMAILS=a@x.com\n", encoding="utf-8")
        self.assertEqual(pa._read_target_db(self.ctx), "")


class RunScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ctx = SimpleNamespace(repo_root=Path("."))

    def test_success_includes_summary_and_exit_zero(self) -> None:
        summary = {"mode": "dry-run", "keep": 4, "summary": []}
        fake = mock.Mock(
            returncode=0,
            stdout=f"ok\n{json.dumps(summary)}\n",
            stderr="",
        )
        with mock.patch.object(pa.subprocess, "run", return_value=fake) as run:
            result = pa._run_script(self.ctx, ["node", "script.mjs", "--keep", "4"])
        run.assert_called_once()
        kwargs = run.call_args.kwargs
        self.assertEqual(kwargs["cwd"], ".")
        self.assertFalse(kwargs["shell"])
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(result["summary"], summary)
        # Echo of the argv we passed in — first token is node-ish, script present.
        cmd_parts = result["command"].split()
        self.assertTrue(_is_node_argv0(cmd_parts[0]), msg=result["command"])
        self.assertIn("script.mjs", result["command"])
        self.assertIn("startedAt", result)
        self.assertIn("finishedAt", result)
        self.assertIsInstance(result["elapsedSec"], float)

    def test_timeout_sets_exit_minus_one(self) -> None:
        exc = subprocess.TimeoutExpired(cmd=["node"], timeout=1, output="partial")
        with mock.patch.object(pa.subprocess, "run", side_effect=exc):
            result = pa._run_script(self.ctx, ["node", "x.mjs"])
        self.assertEqual(result["exitCode"], -1)
        self.assertIn("Timed out", result["stderr"])
        self.assertEqual(result["stdout"], "partial")

    def test_missing_binary_sets_exit_minus_two(self) -> None:
        # _run_script tar emot färdig argv — testar FileNotFoundError-hanteraren,
        # inte PATH-lookup. Feltexten ska nämna binären.
        with mock.patch.object(
            pa.subprocess, "run", side_effect=FileNotFoundError("node")
        ):
            result = pa._run_script(self.ctx, ["node", "x.mjs"])
        self.assertEqual(result["exitCode"], -2)
        self.assertIn("Saknar binär", result["stderr"])
        self.assertIn("node", result["stderr"].lower())


if __name__ == "__main__":
    unittest.main()
