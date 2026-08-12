"""Characterization tests for the dossier capability-map projection owner.

The tests import ``capability_projection`` directly so the extracted read,
freshness and drift-preview behavior does not depend on the Streamlit page
facade.  All filesystem cases use temporary repositories; no generator
subprocess is started.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from backoffice.pages.dossiers_lib import capability_projection as projection


def _normalized_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


class LoadGroupViewTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.map_path = Path(self._tmp.name) / "capability-map.json"

    def test_returns_the_generated_groups_dict_without_rederiving_it(self) -> None:
        groups = {
            "ai": {"label": "AI", "capabilities": ["ai-chat"]},
            "other": {"label": "Övrigt", "capabilities": []},
        }
        self.map_path.write_text(
            json.dumps({"groups": groups, "dossiers": [{"capability": "ignored"}]}),
            encoding="utf-8",
        )

        self.assertEqual(projection._load_group_view(self.map_path), groups)

    def test_missing_malformed_or_non_dict_groups_degrade_to_empty(self) -> None:
        self.assertEqual(projection._load_group_view(self.map_path), {})

        payloads = (
            "{ not json",
            json.dumps({}),
            json.dumps({"groups": None}),
            json.dumps({"groups": []}),
            json.dumps({"groups": "ai"}),
        )
        for payload in payloads:
            with self.subTest(payload=payload):
                self.map_path.write_text(payload, encoding="utf-8")
                self.assertEqual(projection._load_group_view(self.map_path), {})


class ExtractTsUnionValuesTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.types_path = Path(self._tmp.name) / "capability-types.ts"

    def test_reads_exported_multiline_union_with_mixed_quotes_in_source_order(self) -> None:
        self.types_path.write_text(
            """
export type OtherType = "ignored";
export type CapabilitySpecificityTier =
  "core"
  | 'supporting'
  | "edge";
""".strip(),
            encoding="utf-8",
        )

        self.assertEqual(
            projection._extract_ts_union_values(
                self.types_path, "CapabilitySpecificityTier"
            ),
            ["core", "supporting", "edge"],
        )

    def test_missing_type_or_file_returns_empty(self) -> None:
        self.types_path.write_text('export type OtherType = "ignored";', encoding="utf-8")
        self.assertEqual(
            projection._extract_ts_union_values(
                self.types_path, "CapabilitySpecificityTier"
            ),
            [],
        )
        self.assertEqual(
            projection._extract_ts_union_values(
                self.types_path.with_name("missing.ts"),
                "CapabilitySpecificityTier",
            ),
            [],
        )


class CapabilityMapFingerprintTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"

        self.source = self.repo_root / "src" / "lib" / "gen" / "dossiers" / "f2-mute.ts"
        self.source.parent.mkdir(parents=True)
        self.source.write_bytes(b"export const x = 1;\n")

        self.manifest = self.dossier_root / "hard" / "acme" / "manifest.json"
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_text(json.dumps({"id": "acme"}), encoding="utf-8")

        self.source_key = "src/lib/gen/dossiers/f2-mute.ts"
        self.manifest_key = "data/dossiers/hard/acme/manifest.json"

    def _fresh_projection(self) -> dict[str, object]:
        return {
            "sourceFiles": {
                self.source_key: _normalized_sha256(self.source),
                self.manifest_key: _normalized_sha256(self.manifest),
            }
        }

    def _fingerprints(self, current: dict[str, object]) -> dict[str, str] | None:
        return projection._capability_map_source_fingerprints(
            current,
            repo_root=self.repo_root,
            dossier_root=self.dossier_root,
        )

    def _is_stale(self, current: dict[str, object]) -> bool:
        return projection._capability_map_is_stale(
            current,
            repo_root=self.repo_root,
            dossier_root=self.dossier_root,
        )

    def test_fingerprints_are_lf_normalized_and_sorted_by_repo_relative_path(self) -> None:
        current = self._fresh_projection()
        expected = {
            self.manifest_key: _normalized_sha256(self.manifest),
            self.source_key: _normalized_sha256(self.source),
        }

        fingerprints = self._fingerprints(current)
        self.assertEqual(fingerprints, expected)
        self.assertEqual(list((fingerprints or {}).keys()), sorted(expected))
        self.assertFalse(self._is_stale(current))

        self.source.write_bytes(b"export const x = 1;\r\n")
        self.assertEqual(self._fingerprints(current), expected)
        self.assertFalse(self._is_stale(current))

        self.source.write_bytes(b"export const x = 2;\r\n")
        self.assertTrue(self._is_stale(current))

    def test_an_added_manifest_makes_the_projection_stale(self) -> None:
        current = self._fresh_projection()
        added = self.dossier_root / "soft" / "newcomer" / "manifest.json"
        added.parent.mkdir(parents=True)
        added.write_text(json.dumps({"id": "newcomer"}), encoding="utf-8")

        self.assertTrue(self._is_stale(current))

    def test_malformed_or_unsafe_source_keys_fail_closed(self) -> None:
        malformed_source_files = (None, [], {}, {self.manifest_key: "0" * 64})
        for source_files in malformed_source_files:
            with self.subTest(source_files=source_files):
                current = {"sourceFiles": source_files}
                self.assertIsNone(self._fingerprints(current))
                self.assertTrue(self._is_stale(current))

        unsafe_keys = (
            "/etc/passwd",
            "C:/Windows/win.ini",
            "../../../etc/passwd",
            "src/../../escape.ts",
            "src\\outside.ts",
            "",
        )
        for key in unsafe_keys:
            with self.subTest(key=key):
                current = {"sourceFiles": {key: "0" * 64}}
                self.assertIsNone(self._fingerprints(current))
                self.assertTrue(self._is_stale(current))


class RebuildCapabilityMapPreviewTests(unittest.TestCase):
    def test_preview_matches_ts_grouping_normalization_and_sorting(self) -> None:
        dossiers = [
            {
                "id": "renamed-in-manifest",
                "capability": " beta ",
                "_path": "data/dossiers/hard/zeta",
            },
            {
                "id": "also-not-the-directory",
                "capability": "beta",
                "_path": "data\\dossiers\\soft\\alpha\\",
            },
            {
                "id": "fallback",
                "capability": "",
                "_path": "",
            },
        ]

        rebuilt = projection._rebuild_capability_map(dossiers)

        self.assertEqual(
            rebuilt["capabilities"],
            {
                "beta": ["alpha", "zeta"],
                "uncategorized": ["fallback"],
            },
        )
        generated_at = datetime.fromisoformat(rebuilt["generatedAt"])
        self.assertEqual(generated_at.utcoffset(), timedelta(0))


if __name__ == "__main__":
    unittest.main()
