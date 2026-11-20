"""`codegen_core`-sparningen får inte skriva en fragmentlista som stoppar
systemprompten (`src/lib/gen/static-core-loader.ts` kastar på tom lista,
`..`, absolut sökväg eller saknad fil)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backoffice import REPO_ROOT
from backoffice.pages.codegen_core import fragment_path_errors


class FragmentPathErrorsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.config = Path(self._tmp.name) / "config"
        (self.config / "prompt-core").mkdir(parents=True)
        (self.config / "prompt-core" / "00-core.md").write_text("core", encoding="utf-8")
        (Path(self._tmp.name) / "outside.md").write_text("x", encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_committed_manifest_is_valid(self) -> None:
        config_dir = REPO_ROOT / "config"
        data = json.loads((config_dir / "codegen-core-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(fragment_path_errors(config_dir, data["fragments"]), [])

    def test_existing_fragment_passes(self) -> None:
        self.assertEqual(fragment_path_errors(self.config, ["prompt-core/00-core.md"]), [])

    def test_empty_list_is_rejected(self) -> None:
        self.assertTrue(fragment_path_errors(self.config, []))

    def test_missing_file_is_rejected(self) -> None:
        errors = fragment_path_errors(self.config, ["prompt-core/00-core.md", "prompt-core/nope.md"])
        self.assertEqual(len(errors), 1)
        self.assertIn("nope.md", errors[0])

    def test_traversal_and_absolute_paths_are_rejected(self) -> None:
        for rel in ("../outside.md", "prompt-core/../../outside.md", "/etc/passwd", "C:/x.md"):
            with self.subTest(rel=rel):
                self.assertTrue(fragment_path_errors(self.config, [rel]))


if __name__ == "__main__":
    unittest.main()
