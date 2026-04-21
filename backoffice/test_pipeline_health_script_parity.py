"""Parity-test: alla `npm run <x>`-kommandon i Pipeline Health-panelen
måste finnas i `package.json`.

Bakgrund: i commit 9adb3c4 satt en knapp kvar som körde `npm run dossiers:embeddings`
trots att det skriptet aldrig fanns i v2 (dossiers:curate är enda dossier-skriptet).
Det här testet förhindrar att liknande "döda knappar" smyger sig in igen.
"""

from __future__ import annotations

import json
import unittest

from backoffice import REPO_ROOT
from backoffice.pages.pipeline_health import SCRIPTS as HEALTH_SCRIPTS


class PipelineHealthScriptParityTests(unittest.TestCase):
    def test_all_npm_scripts_exist_in_package_json(self) -> None:
        package_json_path = REPO_ROOT / "package.json"
        package = json.loads(package_json_path.read_text(encoding="utf-8"))
        scripts = set(package.get("scripts", {}).keys())

        missing: list[tuple[str, str]] = []
        for hs in HEALTH_SCRIPTS:
            if len(hs.command) >= 3 and hs.command[0] == "npm" and hs.command[1] == "run":
                script_name = hs.command[2]
                if script_name not in scripts:
                    missing.append((hs.id, script_name))

        self.assertEqual(
            missing,
            [],
            "Pipeline Health refererar npm-skript som inte finns i package.json: "
            + ", ".join(f"{hs_id} -> npm run {name}" for hs_id, name in missing),
        )


if __name__ == "__main__":
    unittest.main()
