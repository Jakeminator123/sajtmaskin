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
from backoffice.pages.pipeline_health import _blob_publish_line


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

    def test_embedding_scripts_require_blob_and_cover_all_artifacts(self) -> None:
        """Operator-knappar får inte lyckas med bara gitignorerad lokal cache."""
        embedding = [
            s for s in HEALTH_SCRIPTS if "embeddings" in s.tags and s.requires_api
        ]
        self.assertEqual(
            {s.id for s in embedding},
            {
                "scaffolds-variant-embeddings",
                "scaffolds-embeddings",
                "templates-embeddings",
            },
        )
        for script in embedding:
            self.assertIn(
                "--require-blob",
                script.command,
                f"{script.id} måste faila stängt utan BLOB_READ_WRITE_TOKEN",
            )

    def test_blob_parity_scripts_are_keyless_and_listed(self) -> None:
        by_id = {s.id: s for s in HEALTH_SCRIPTS}
        self.assertIn("embeddings-sync", by_id)
        self.assertIn("embeddings-ensure", by_id)
        for script_id in ("embeddings-sync", "embeddings-ensure"):
            script = by_id[script_id]
            self.assertFalse(script.requires_api)
            self.assertNotIn("--require-blob", script.command)

    def test_blob_publish_line_reads_stdout_url(self) -> None:
        self.assertIn(
            "blob.vercel-storage.com",
            _blob_publish_line(
                {
                    "stdoutTail": "Saved 10 embeddings (blob)\n  Blob: https://x.blob.vercel-storage.com/embeddings/x.json"
                }
            )
            or "",
        )
        self.assertIsNone(_blob_publish_line({"stdoutTail": "Saved locally", "stderrTail": ""}))


if __name__ == "__main__":
    unittest.main()
