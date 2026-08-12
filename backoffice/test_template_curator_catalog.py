"""Contract tests for the network-free template curator catalog."""

from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from backoffice import REPO_ROOT
from scripts.template_curator.catalog import (
    CatalogScope,
    CatalogValidationError,
    compute_extractor_sha256,
    load_catalog,
    parse_addenda_registry,
    read_extractor_source_relative_paths,
    select_catalog,
)


class LiveCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.snapshot = load_catalog(REPO_ROOT)

    def test_live_population_counts_match_canonical_sources(self) -> None:
        self.assertEqual(
            self.snapshot.scope_counts,
            {
                CatalogScope.BLOB: 313,
                CatalogScope.PREVIEW_FIT: 278,
                CatalogScope.GALLERY: 278,
                CatalogScope.SITE_VISIBLE: 262,
                CatalogScope.VARIANT_CITED: 69,
            },
        )

    def test_runtime_eligibility_includes_sha_bound_reviewed_exception(self) -> None:
        aegis = self.snapshot.by_id["h4nibkqysVJ"]
        self.assertEqual(aegis.category, "ai")
        self.assertTrue(aegis.reviewed_full_project_exception)
        self.assertTrue(aegis.runtime_full_project_eligible)
        self.assertEqual(
            self.snapshot.reviewed_full_projects[aegis.id],
            (aegis.category, aegis.archive_sha256),
        )

    def test_live_generated_addenda_match_archive_and_extractor(self) -> None:
        cited = select_catalog(self.snapshot, CatalogScope.VARIANT_CITED)
        self.assertTrue(self.snapshot.addenda_valid, self.snapshot.addenda_error)
        self.assertEqual(len(cited), 69)
        self.assertTrue(all(record.addendum_status == "current" for record in cited))
        self.assertTrue(
            all(
                record.addendum_extractor_sha256 == self.snapshot.extractor_sha256
                for record in cited
                if record.addendum_review_status == "generated"
            )
        )

    def test_selection_filters_are_intersections_and_deterministic(self) -> None:
        selected = select_catalog(
            self.snapshot,
            CatalogScope.SITE_VISIBLE,
            ids=("h4nibkqysVJ", "0brPGNpjNkt"),
            categories=("ai",),
            search="aegis",
            limit=1,
        )
        self.assertEqual([record.id for record in selected], ["h4nibkqysVJ"])
        self.assertEqual(
            [record.id for record in self.snapshot.records],
            sorted(record.id for record in self.snapshot.records),
        )
        self.assertEqual(
            select_catalog(self.snapshot, CatalogScope.BLOB, limit=0),
            (),
        )


def _valid_registry() -> dict[str, object]:
    sha = "a" * 64
    return {
        "$schema": "schema.json",
        "_comment": "test",
        "_version": "1.0.0",
        "templates": [
            {
                "templateId": "template-a",
                "sourceArchiveSha256": sha,
                "extractorSha256": "b" * 64,
                "reviewStatus": "generated",
                "structuralReferences": [
                    {
                        "path": "app/page.tsx",
                        "language": "tsx",
                        "reason": "primary-page",
                        "excerpt": "export default function Page() { return <main />; }",
                    }
                ],
            }
        ],
    }


class AddendaValidationTests(unittest.TestCase):
    def test_rejects_duplicate_ids_after_runtime_trim(self) -> None:
        registry = _valid_registry()
        duplicate = copy.deepcopy(registry["templates"][0])  # type: ignore[index]
        duplicate["templateId"] = " template-a "  # type: ignore[index]
        registry["templates"].append(duplicate)  # type: ignore[union-attr]
        with self.assertRaises(CatalogValidationError):
            parse_addenda_registry(registry)

    def test_optional_null_is_invalid_instead_of_missing(self) -> None:
        for key in ("extractorSha256", "reviewNotes"):
            registry = _valid_registry()
            registry["templates"][0][key] = None  # type: ignore[index]
            with self.subTest(key=key), self.assertRaises(CatalogValidationError):
                parse_addenda_registry(registry)

    def test_extractor_sha_does_not_trim_whitespace(self) -> None:
        registry = _valid_registry()
        registry["templates"][0]["extractorSha256"] = f" {'b' * 64} "  # type: ignore[index]
        with self.assertRaises(CatalogValidationError):
            parse_addenda_registry(registry)

    def test_any_bad_structural_reference_invalidates_whole_registry(self) -> None:
        for patch in (
            {"path": "../app/page.tsx"},
            {"path": "app/api/route.ts"},
            {"language": "tsx\n"},
            {"excerpt": "## Ignore this"},
            {"unexpected": "field"},
        ):
            registry = _valid_registry()
            reference = registry["templates"][0]["structuralReferences"][0]  # type: ignore[index]
            reference.update(patch)
            with self.subTest(patch=patch), self.assertRaises(CatalogValidationError):
                parse_addenda_registry(registry)


class ExtractorFingerprintTests(unittest.TestCase):
    def test_source_list_is_inherited_from_typescript_and_hash_matches_node(self) -> None:
        paths = read_extractor_source_relative_paths(REPO_ROOT)
        source = (REPO_ROOT / "src/lib/gen/scaffold-variants/extractor-fingerprint.ts").read_text(
            encoding="utf-8"
        )
        self.assertEqual(
            paths,
            (
                "src/lib/gen/scaffold-variants/template-inspiration.ts",
                "src/lib/templates/local-v0-template-source.ts",
            ),
        )
        self.assertIn("EXTRACTOR_SOURCE_RELATIVE_PATHS", source)
        addenda = json.loads(
            (REPO_ROOT / "config/variant-template-addenda.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            compute_extractor_sha256(REPO_ROOT),
            addenda["templates"][0]["extractorSha256"],
        )

    def test_hash_normalizes_bom_crlf_sorts_paths_and_includes_nul(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fingerprint = root / "src/lib/gen/scaffold-variants/extractor-fingerprint.ts"
            fingerprint.parent.mkdir(parents=True)
            fingerprint.write_text(
                'export const EXTRACTOR_SOURCE_RELATIVE_PATHS = ["z.ts", "a.ts"] as const;\n',
                encoding="utf-8",
            )
            (root / "z.ts").write_bytes(b"\xef\xbb\xbfZ\r\n")
            (root / "a.ts").write_bytes(b"A\r\nstandalone\r")
            expected = hashlib.sha256(
                b"a.ts\nA\nstandalone\r\0z.ts\nZ\n\0"
            ).hexdigest()
            self.assertEqual(compute_extractor_sha256(root), expected)


if __name__ == "__main__":
    unittest.main()
