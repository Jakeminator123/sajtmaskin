"""Enhetstester för icke-trivial logik i backoffice/pages/projects_admin.py.

Täcker den destruktiva massraderingsytan utan Streamlit-runtime och utan
riktiga Node/DB-anrop: kommando-byggning, env-parsning, JSON-summary och
subprocess-felvägar (mockade).
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from backoffice.pages import projects_admin as pa


def _render_admin_for_test(repo_root: str) -> None:
    from pathlib import Path

    from backoffice.pages.projects_admin import render
    from backoffice.shared import build_backoffice_context

    render(build_backoffice_context(Path(repo_root)))


class ProjectsAdminInteractionTests(unittest.TestCase):
    def setUp(self) -> None:
        from streamlit.testing.v1 import AppTest

        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.env_file = self.root / ".env.local"
        self.env_file.write_text("TEST_USER_EMAIL=fixture@example.test\n", encoding="utf-8")
        patcher = mock.patch.object(pa, "_run_script", side_effect=self._result)
        self.run_script = patcher.start()
        self.addCleanup(patcher.stop)
        self.app = AppTest.from_function(_render_admin_for_test, args=(str(self.root),))
        self.app.run(timeout=10)

    def _result(self, _ctx, command):
        return {
            "command": " ".join(command), "exitCode": 0, "elapsedSec": 0,
            "stdout": "", "stderr": "",
            "summary": {
                "mode": "apply" if "--apply" in command else "dry-run",
                "keep": int(command[command.index("--keep") + 1]),
                "summary": [{"email": "fixture@example.test", "keep": 4,
                             "deleted": 2, "engineChats": 2}],
            },
        }

    def _button(self, text):
        return next(b for b in self.app.button if text in b.label)

    def _preview_and_confirm(self):
        self._button("Kör DRY-RUN").click().run()
        self.app.checkbox(key=pa._CONFIRM_KEY).check().run()
        self.assertFalse(self._button("KÖR APPLY").disabled)

    def _assert_blocked(self):
        self.assertEqual(list(self.app.exception), [])
        self.assertTrue(self._button("KÖR APPLY").disabled)
        self.assertFalse(self.app.checkbox(key=pa._CONFIRM_KEY).value)
        self.assertFalse(any("--apply" in c.args[1] for c in self.run_script.call_args_list))

    def test_initial_apply_is_blocked(self):
        self._assert_blocked()
        self.run_script.assert_not_called()

    def test_failed_dry_run_never_authorizes_apply(self):
        self.run_script.side_effect = lambda ctx, cmd: {**self._result(ctx, cmd), "exitCode": 1}
        self._button("Kör DRY-RUN").click().run()
        self._assert_blocked()

    def test_missing_or_wrong_summary_never_authorizes_apply(self):
        for summary in (None, {}, {"mode": "apply", "keep": 4, "summary": [{}]},
                        {"mode": "dry-run", "keep": 0, "summary": [{}]}):
            with self.subTest(summary=summary):
                self.run_script.side_effect = lambda ctx, cmd: {
                    **self._result(ctx, cmd), "summary": summary,
                }
                self._button("Kör DRY-RUN").click().run()
                self._assert_blocked()

    def test_keep_change_invalidates_preview_even_when_changed_back(self):
        self._preview_and_confirm()
        self.app.number_input[0].set_value(0).run()
        self._assert_blocked()
        self.app.number_input[0].set_value(4).run()
        self._assert_blocked()

    def test_scope_and_specific_email_changes_require_new_preview(self):
        self._preview_and_confirm()
        self.app.radio[0].set_value("specific_email").run()
        self.app.text_input[0].set_value("one@example.test").run()
        self._assert_blocked()
        self._preview_and_confirm()
        self.app.text_input[0].set_value("two@example.test").run()
        self._assert_blocked()

    def test_user_id_change_requires_new_preview(self):
        self.app.radio[0].set_value("specific_user_id").run()
        self.app.text_input[0].set_value("fixture-one").run()
        self._preview_and_confirm()
        self.app.text_input[0].set_value("fixture-two").run()
        self._assert_blocked()

    def test_env_file_change_requires_new_preview(self):
        self._preview_and_confirm()
        self.env_file.write_text("TEST_USER_EMAIL=changed@example.test\n", encoding="utf-8")
        self.app.run()
        self._assert_blocked()

    def test_inherited_database_change_requires_new_preview(self):
        with mock.patch.dict(os.environ, {"DATABASE_URL": "postgres://fixture/one"}):
            self._preview_and_confirm()
            with mock.patch.dict(os.environ, {"DATABASE_URL": "postgres://fixture/two"}):
                self.app.run()
                self._assert_blocked()

    def test_new_dry_run_resets_confirmation(self):
        self._preview_and_confirm()
        self._button("Kör DRY-RUN").click().run()
        self._assert_blocked()
        self.assertFalse(self.app.checkbox(key=pa._CONFIRM_KEY).disabled)

    def test_env_changed_during_dry_run_cannot_authorize_apply(self):
        def changed(ctx, command):
            self.env_file.write_text("TEST_USER_EMAIL=changed@example.test\n", encoding="utf-8")
            return self._result(ctx, command)

        self.run_script.side_effect = changed
        self._button("Kör DRY-RUN").click().run()
        self._assert_blocked()

    def test_configuration_is_rechecked_when_apply_is_clicked(self):
        self._preview_and_confirm()
        real_binding = pa._dry_binding
        count = 0

        def changes_before_execution(ctx, command):
            nonlocal count
            count += 1
            return real_binding(ctx, command) if count == 1 else None

        with mock.patch.object(pa, "_dry_binding", side_effect=changes_before_execution):
            self._button("KÖR APPLY").click().run()
        self.assertEqual(list(self.app.exception), [])
        self.assertFalse(any("--apply" in c.args[1] for c in self.run_script.call_args_list))

    def test_successful_preview_runs_same_arguments_once_including_keep_zero(self):
        self.app.number_input[0].set_value(0).run()
        self._preview_and_confirm()
        dry_command = self.run_script.call_args.args[1]
        self._button("KÖR APPLY").click().run()
        self.assertEqual(list(self.app.exception), [])
        self.assertEqual(self.run_script.call_args.args[1], [*dry_command, "--apply"])
        self.assertEqual(self.run_script.call_count, 2)
        self.assertTrue(self._button("KÖR APPLY").disabled)
        self.assertFalse(self.app.checkbox(key=pa._CONFIRM_KEY).value)

    def test_failed_apply_consumes_confirmation_too(self):
        self._preview_and_confirm()
        self.run_script.side_effect = lambda ctx, cmd: {**self._result(ctx, cmd), "exitCode": 1}
        self._button("KÖR APPLY").click().run()
        self.assertEqual(list(self.app.exception), [])
        self.assertTrue(self._button("KÖR APPLY").disabled)
        self.assertFalse(self.app.checkbox(key=pa._CONFIRM_KEY).value)


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
