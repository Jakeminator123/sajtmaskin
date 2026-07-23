"""Guards for mirroring the variant-integrity CI gate in the backoffice.

Covers the follow-ups triaged in PR #587: the Scaffold Lifecycle create/edit/
delete flows and the Scaffold Wizard new-scaffold path must not persist a variant
state that later fails ``npm run scaffolds:validate``
(``src/lib/gen/scaffold-variants/variant-integrity.test.ts``):

  * create/edit require curated ``signaturePatterns`` (>=3/2/2) and block a
    second ``default: true`` per scaffold;
  * the neutral starter variant is auto-populated with valid signaturePatterns;
  * delete prunes the ``variant-embeddings.json`` index so no stale entry remains;
  * the wizard new-scaffold path runs the Blob ``sourceTemplateIds`` check.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from backoffice.pages import scaffold_lifecycle as sl
from backoffice.pages import scaffold_wizard as sw
from backoffice.shared import build_backoffice_context


def _variant_payload(**overrides):
    base = dict(
        existing=None,
        scaffold_id="landing-page",
        variant_id="temp-variant",
        label="Temp Variant",
        description="A temporary variant for tests.",
        signature_motif="a calm neutral test motif phrase",
        color_mode="either",
        default_variant=False,
        keywords_text="one\ntwo\nthree",
        font_pairings_text="Inter | Inter",
        prompt_hints_text="A specific, concrete visual hint for tests.",
        theme_tokens_text="",
        style_rules_text="",
        section_inventory_text="",
        avoid_patterns_text="",
        world_class_text="",
        source_template_ids_text="",
        reference_scaffold_ids_text="",
    )
    base.update(overrides)
    return sl._variant_payload(**base)


class SignaturePatternsTests(unittest.TestCase):
    def test_variant_payload_builds_signature_patterns_from_text(self) -> None:
        payload = _variant_payload(
            signature_layouts_text="layout one here\nlayout two here\nlayout three here",
            signature_motifs_text="motif one here\nmotif two here",
            signature_anti_patterns_text="avoid one here\navoid two here",
        )
        self.assertEqual(
            payload["signaturePatterns"],
            {
                "layouts": ["layout one here", "layout two here", "layout three here"],
                "motifs": ["motif one here", "motif two here"],
                "antiPatterns": ["avoid one here", "avoid two here"],
            },
        )
        self.assertTrue(sl._signature_patterns_ok(payload))

    def test_variant_payload_keeps_existing_patterns_when_blank(self) -> None:
        existing = {
            "signaturePatterns": {
                "layouts": ["a" * 20, "b" * 20, "c" * 20],
                "motifs": ["m" * 15, "n" * 15],
                "antiPatterns": ["x" * 15, "y" * 15],
            }
        }
        payload = _variant_payload(existing=existing)
        self.assertEqual(payload["signaturePatterns"], existing["signaturePatterns"])
        self.assertTrue(sl._signature_patterns_ok(payload))

    def test_signature_patterns_ok_rejects_too_few(self) -> None:
        self.assertFalse(sl._signature_patterns_ok({}))
        self.assertFalse(
            sl._signature_patterns_ok(
                {
                    "signaturePatterns": {
                        "layouts": ["only one"],
                        "motifs": ["one", "two"],
                        "antiPatterns": ["one", "two"],
                    }
                }
            )
        )


class NeutralStarterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ctx = build_backoffice_context()

    def test_neutral_variant_payload_passes_gate_and_schema(self) -> None:
        payload = sl._neutral_variant_payload(
            self.ctx,
            scaffold_id="landing-page",
            label="Autotest Scaffold",
            description="A scaffold created by the auto test.",
            tags=["test", "neutral"],
        )
        self.assertTrue(
            sl._signature_patterns_ok(payload),
            "neutral starter must satisfy the signaturePatterns gate thresholds",
        )
        # No dead sourceTemplateIds and schema-valid → safe to write + gate-clean.
        self.assertEqual(sl._validate_variant_payload(self.ctx, payload), [])


class IntegrityErrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ctx = build_backoffice_context()

    def test_flags_missing_signature_patterns(self) -> None:
        payload = _variant_payload()  # no signaturePatterns supplied
        errors = sl._variant_integrity_errors(self.ctx, payload)
        self.assertTrue(any("signaturePatterns" in e for e in errors))

    def test_flags_default_conflict(self) -> None:
        payload = _variant_payload(
            default_variant=True,
            signature_layouts_text="l one here now\nl two here now\nl three now",
            signature_motifs_text="m one here now\nm two here now",
            signature_anti_patterns_text="a one here now\na two here now",
        )
        errors = sl._variant_integrity_errors(
            self.ctx, payload, sibling_defaults=["other-default"]
        )
        self.assertTrue(any("default" in e for e in errors))

    def test_no_error_when_valid_and_no_sibling_default(self) -> None:
        payload = _variant_payload(
            default_variant=True,
            signature_layouts_text="l one here now\nl two here now\nl three now",
            signature_motifs_text="m one here now\nm two here now",
            signature_anti_patterns_text="a one here now\na two here now",
        )
        self.assertEqual(
            sl._variant_integrity_errors(self.ctx, payload, sibling_defaults=[]), []
        )


class SiblingDefaultTests(unittest.TestCase):
    def test_detects_sibling_default_excluding_self(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            variant_dir = root / "config" / "scaffold-variants" / "landing-page"
            variant_dir.mkdir(parents=True)
            (variant_dir / "self.json").write_text(
                json.dumps({"id": "self", "default": True}), encoding="utf-8"
            )
            (variant_dir / "sibling.json").write_text(
                json.dumps({"id": "sibling", "default": True}), encoding="utf-8"
            )
            (variant_dir / "plain.json").write_text(
                json.dumps({"id": "plain", "default": False}), encoding="utf-8"
            )
            ctx = SimpleNamespace(variants_dir=root / "config" / "scaffold-variants")
            siblings = sl._sibling_default_variant_ids(
                ctx, "landing-page", exclude_id="self"
            )
            self.assertEqual(siblings, ["sibling"])


class PruneVariantEmbeddingsTests(unittest.TestCase):
    def _write_index(self, root: Path, entries: list[dict]) -> Path:
        index_dir = root / "config" / "scaffold-variants" / "_index"
        index_dir.mkdir(parents=True)
        path = index_dir / "variant-embeddings.json"
        path.write_text(
            json.dumps(
                {"_meta": {"count": len(entries)}, "embeddings": entries},
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return path

    def test_prune_single_variant(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = self._write_index(
                root,
                [
                    {"id": "keep", "scaffoldId": "landing-page", "embedding": [0.1]},
                    {"id": "gone", "scaffoldId": "landing-page", "embedding": [0.2]},
                    {"id": "gone", "scaffoldId": "portfolio", "embedding": [0.3]},
                ],
            )
            ctx = SimpleNamespace(variants_dir=root / "config" / "scaffold-variants")
            removed = sl._prune_variant_embeddings(ctx, "landing-page", ["gone"])
            self.assertEqual(removed, 1)
            data = json.loads(path.read_text(encoding="utf-8"))
            keys = {(e["scaffoldId"], e["id"]) for e in data["embeddings"]}
            self.assertEqual(
                keys, {("landing-page", "keep"), ("portfolio", "gone")}
            )
            self.assertEqual(data["_meta"]["count"], 2)

    def test_prune_all_for_scaffold(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = self._write_index(
                root,
                [
                    {"id": "a", "scaffoldId": "landing-page", "embedding": [0.1]},
                    {"id": "b", "scaffoldId": "landing-page", "embedding": [0.2]},
                    {"id": "c", "scaffoldId": "portfolio", "embedding": [0.3]},
                ],
            )
            ctx = SimpleNamespace(variants_dir=root / "config" / "scaffold-variants")
            removed = sl._prune_variant_embeddings(ctx, "landing-page")
            self.assertEqual(removed, 2)
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(
                [e["scaffoldId"] for e in data["embeddings"]], ["portfolio"]
            )

    def test_prune_noop_when_index_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx = SimpleNamespace(
                variants_dir=Path(tmp) / "config" / "scaffold-variants"
            )
            self.assertEqual(sl._prune_variant_embeddings(ctx, "landing-page", ["x"]), 0)


class DeadSourceTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ctx = build_backoffice_context()

    def test_real_blob_id_resolves(self) -> None:
        payload = {"sourceTemplateIds": ["8Y9E0cStKrW"]}
        self.assertEqual(sl._dead_source_template_ids(self.ctx, payload), [])

    def test_fake_blob_id_is_dead(self) -> None:
        payload = {"sourceTemplateIds": ["definitely-not-a-real-blob-id"]}
        self.assertEqual(
            sl._dead_source_template_ids(self.ctx, payload),
            ["definitely-not-a-real-blob-id"],
        )


class WizardNewScaffoldBlobCheckTests(unittest.TestCase):
    """Finding 5: the wizard new-scaffold path must run the Blob sourceTemplateIds
    integrity check, not only JSON-schema validation."""

    def setUp(self) -> None:
        self.ctx = build_backoffice_context()

    def _draft(self, source_template_id: str) -> dict:
        return {
            "mode": "new-scaffold",
            "scaffold": {
                "cloneFrom": "base-nextjs",
                "id": "temp-integrity-scaffold",
                "label": "Temp Integrity Scaffold",
                "description": "A temp scaffold used only in tests.",
                "siteKind": "",
                "complexity": "",
                "intents": ["website"],
                "tagsText": "one\ntwo",
                "hintsText": "hint one line\nhint two line",
                "qualityText": "q one line\nq two line\nq three line",
                "upgradesText": "upgrade one line",
            },
            "variant": {
                "scaffoldId": "temp-integrity-scaffold",
                "id": "temp-integrity-variant",
                "label": "Temp Integrity Variant",
                "description": "",
                "signatureMotif": "a calm neutral test motif phrase",
                "colorMode": "either",
                "keywordsText": "one\ntwo\nthree",
                "fontsText": "Inter | Inter",
                "hintsText": "A specific, concrete visual hint for tests.",
                "tokensText": "",
                "default": True,
                "sourceTemplateId": source_template_id,
            },
        }

    def _schema_check(self, checks: list[dict]) -> dict:
        return next(c for c in checks if c["kontroll"] == "Varianten klarar det strikta schemat")

    def test_dead_blob_id_fails_new_scaffold_check(self) -> None:
        checks, _payload = sw._run_checks(self.ctx, self._draft("definitely-not-a-real-blob-id"))
        schema_check = self._schema_check(checks)
        self.assertEqual(schema_check["status"], "❌")
        self.assertIn("Blob-manifestet", schema_check["detalj"])

    def test_real_blob_id_passes_new_scaffold_check(self) -> None:
        checks, _payload = sw._run_checks(self.ctx, self._draft("8Y9E0cStKrW"))
        schema_check = self._schema_check(checks)
        self.assertEqual(schema_check["status"], "✅")


if __name__ == "__main__":
    unittest.main()
