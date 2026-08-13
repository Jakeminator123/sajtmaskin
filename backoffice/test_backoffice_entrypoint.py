"""Contract for the single canonical Backoffice entrypoint."""

from __future__ import annotations

import ast
import subprocess
import unittest
from pathlib import Path

from backoffice import REPO_ROOT

APP_MAIN = REPO_ROOT / "backoffice" / "app_main.py"
CANONICAL_ENTRYPOINT = REPO_ROOT / "sajtmaskin_backoffice.py"


def _tracked_python_sources() -> list[Path]:
    """Return repo-owned sources without ignored tool or dependency trees."""
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.py"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return [REPO_ROOT / rel for rel in result.stdout.split("\0") if rel]


class BackofficeEntrypointContractTests(unittest.TestCase):
    def test_app_runner_has_no_legacy_wrapper_api(self) -> None:
        tree = ast.parse(APP_MAIN.read_text(encoding="utf-8"))
        runner = next(
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "run_backoffice_app"
        )
        self.assertEqual(runner.args.posonlyargs, [])
        self.assertEqual(runner.args.args, [])
        self.assertEqual(runner.args.kwonlyargs, [])
        self.assertIsNone(runner.args.vararg)
        self.assertIsNone(runner.args.kwarg)

        source = APP_MAIN.read_text(encoding="utf-8")
        for stale_name in ("legacy_source", "initial_page", "legacy-entrypoint"):
            self.assertNotIn(stale_name, source)

    def test_only_canonical_entrypoint_calls_the_app_runner(self) -> None:
        callers: list[tuple[Path, ast.Call]] = []
        for path in _tracked_python_sources():
            if path == APP_MAIN:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            callers.extend(
                (path, node)
                for node in ast.walk(tree)
                if isinstance(node, ast.Call)
                and (
                    (isinstance(node.func, ast.Name) and node.func.id == "run_backoffice_app")
                    or (
                        isinstance(node.func, ast.Attribute)
                        and node.func.attr == "run_backoffice_app"
                    )
                )
            )

        self.assertEqual([path for path, _call in callers], [CANONICAL_ENTRYPOINT])
        call = callers[0][1]
        self.assertEqual(call.args, [])
        self.assertEqual(call.keywords, [])

    def test_entrypoint_loads_env_then_env_local(self) -> None:
        source = CANONICAL_ENTRYPOINT.read_text(encoding="utf-8")
        env_pos = source.index('load_dotenv(".env", override=False)')
        local_pos = source.index('load_dotenv(".env.local", override=True)')
        self.assertLess(env_pos, local_pos)


if __name__ == "__main__":
    unittest.main()
