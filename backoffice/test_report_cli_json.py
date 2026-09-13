"""Exercise real Node stdout, including dotenv, without any database credentials."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class ReportCliJsonTests(unittest.TestCase):
    def test_missing_database_produces_only_json_for_backoffice_consumers(self):
        root = Path(__file__).resolve().parents[1]
        node = shutil.which("node")
        self.assertIsNotNone(node, "Install Node and npm dependencies before backoffice:test")
        # Do not inherit DB credentials, NODE_OPTIONS or DOTENV_CONFIG_QUIET.
        system_keys = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR",
                       "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "LANG"}
        env = {k: v for k, v in os.environ.items() if k.upper() in system_keys}
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, ".env.local").write_text("# isolated fixture\n", encoding="utf-8")
            for script in ("generation-history.mjs", "scaffold-scores.mjs"):
                with self.subTest(script=script):
                    result = subprocess.run(
                        [node, str(root / "scripts/db" / script), "--json"],
                        cwd=directory, env=env, capture_output=True, text=True,
                        encoding="utf-8", timeout=15, check=False,
                    )
                    self.assertEqual(result.returncode, 1, result.stderr)
                    payload = json.loads(result.stdout)
                    self.assertIsInstance(payload, dict)
                    self.assertIn("Database URL missing", payload.get("error", ""))
