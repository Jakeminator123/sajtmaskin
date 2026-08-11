"""Guards for mirroring the variant-integrity CI gate in the backoffice.

Covers the follow-ups triaged in PR #587: the Scaffold Lifecycle create/edit/
delete flows and the Scaffold Wizard new-scaffold path must not persist a variant
state that later fails ``npm run scaffolds:validate``
(``src/lib/gen/scaffold-variants/variant-integrity.test.ts``):

  * create/edit require curated ``signaturePatterns`` (>=3/2/2), exactly one
    ``default: true`` per scaffold and non-empty template provenance;
  * the neutral starter variant is auto-populated with valid signaturePatterns;
  * delete cannot remove the sole default and prunes the embeddings index;
  * Lifecycle and Wizard use the runtime-selectability + addendum contract for
    ``sourceTemplateIds``, not only Blob existence.

Fas B (2026-07-29) added :class:`CreateScaffoldValidationTests`: the tab
reorganisation moved the create form to another tab, and only the labels were
supposed to change. These guards fail if a future edit quietly drops one of the
save-time rules along the way.
"""

from __future__ import annotations

import inspect
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backoffice.pages import scaffold_lifecycle as sl
from backoffice.pages import scaffold_wizard as sw
from backoffice.pages.scaffold_lifecycle_lib import scaffold_ops as scaffold_ops_lib
from backoffice.pages.scaffold_lifecycle_lib import variants as variants_lib
from backoffice.pages.scaffold_lifecycle_lib.formatting import _exception_message
from backoffice.pages.scaffold_lifecycle_lib.variants import (
    _handoff_default_variant,
    _would_leave_no_default_variant,
)
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
        source_template_ids_text="8Y9E0cStKrW",
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
        self.assertTrue(payload.get("sourceTemplateIds"))
        # Real sourceTemplateIds + schema/default/signature invariants → gate-clean.
        with patch.object(
            variants_lib, "_variant_template_reference_errors", return_value=[]
        ):
            self.assertEqual(sl._validate_variant_payload(self.ctx, payload), [])
        self.assertEqual(
            sl._variant_integrity_errors(self.ctx, payload, sibling_defaults=[]),
            [],
        )


class CreateScaffoldTransactionTests(unittest.TestCase):
    """The late starter gate is inside a real multi-file transaction."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.scaffolds_dir = self.root / "src" / "lib" / "gen" / "scaffolds"
        self.variants_dir = self.root / "config" / "scaffold-variants"
        real_ctx = build_backoffice_context()

        shutil.copytree(
            real_ctx.scaffolds_dir / "base-nextjs" / "files",
            self.scaffolds_dir / "base-nextjs" / "files",
        )
        for filename in (
            "types.ts",
            "registry.ts",
            "scaffold-embedding-locale.ts",
        ):
            target = self.scaffolds_dir / filename
            shutil.copy2(real_ctx.scaffolds_dir / filename, target)
            # Exercise byte-exact rollback on the Windows newline shape that a
            # text snapshot used to normalize into a residual diff.
            raw = target.read_bytes().replace(b"\r\n", b"\n")
            target.write_bytes(raw.replace(b"\n", b"\r\n"))

        self.schema_path = (
            self.root
            / "docs"
            / "schemas"
            / "strict"
            / "scaffold-variant.schema.json"
        )
        self.schema_path.parent.mkdir(parents=True)
        shutil.copy2(
            real_ctx.repo_root
            / "docs"
            / "schemas"
            / "strict"
            / "scaffold-variant.schema.json",
            self.schema_path,
        )
        schema_bytes = self.schema_path.read_bytes().replace(b"\r\n", b"\n")
        self.schema_path.write_bytes(schema_bytes.replace(b"\n", b"\r\n"))

        base_variant_dir = self.variants_dir / "base-nextjs"
        base_variant_dir.mkdir(parents=True)
        starter_path = base_variant_dir / "starter-neutral.json"
        shutil.copy2(
            real_ctx.variants_dir / "base-nextjs" / "starter-neutral.json",
            starter_path,
        )
        self.source_template_ids = json.loads(starter_path.read_text(encoding="utf-8"))[
            "sourceTemplateIds"
        ]
        self.assertTrue(self.source_template_ids)

        self.blob_manifest_path = (
            self.root / "src" / "lib" / "templates" / "template-blob-manifest.json"
        )
        self.blob_manifest_path.parent.mkdir(parents=True)
        shutil.copy2(
            real_ctx.repo_root
            / "src"
            / "lib"
            / "templates"
            / "template-blob-manifest.json",
            self.blob_manifest_path,
        )
        self.ctx = build_backoffice_context(self.root)
        self.types_path = self.scaffolds_dir / "types.ts"
        self.registry_path = self.scaffolds_dir / "registry.ts"
        self.locale_path = self.scaffolds_dir / "scaffold-embedding-locale.ts"
        self.original_bytes = {
            path: path.read_bytes()
            for path in (
                self.types_path,
                self.registry_path,
                self.locale_path,
                self.schema_path,
            )
        }

    def _create(self, scaffold_id: str) -> None:
        sl._create_scaffold(
            self.ctx,
            source_scaffold_id="base-nextjs",
            scaffold_id=scaffold_id,
            label="Transaction Probe",
            description="Exercises the scaffold transaction boundary.",
            site_kind="marketing",
            complexity="simple",
            structure_profile="",
            content_profile="",
            features=[],
            allowed_build_intents=["website"],
            tags=["transaction", "probe"],
            prompt_hints=["Keep the structure clear.", "Stay easy to extend."],
            quality_checklist=["One", "Two", "Three"],
            upgrade_targets=["Richer domain patterns"],
            create_start_variant=True,
        )

    def test_late_reference_failure_rolls_back_every_write_byte_exactly(self) -> None:
        scaffold_id = "rollback-probe"
        new_scaffold_dir = self.scaffolds_dir / scaffold_id
        new_variant_dir = self.variants_dir / scaffold_id

        def fail_after_writes(_ctx, payload):
            self.assertTrue((new_scaffold_dir / "manifest.ts").is_file())
            self.assertTrue((new_scaffold_dir / "files" / "app" / "page.tsx").is_file())
            for path in self.original_bytes:
                self.assertIn(scaffold_id, path.read_text(encoding="utf-8"))
            self.assertEqual(payload["sourceTemplateIds"], self.source_template_ids)
            return ["forced runtime/addendum reference failure"]

        with patch(
            "backoffice.pages.scaffold_lifecycle_lib.variants._variant_template_reference_errors",
            side_effect=fail_after_writes,
        ):
            with self.assertRaisesRegex(ValueError, "forced runtime/addendum"):
                self._create(scaffold_id)

        for path, original in self.original_bytes.items():
            self.assertEqual(path.read_bytes(), original, f"rollback changed {path.name}")
        self.assertFalse(new_scaffold_dir.exists())
        self.assertFalse(new_variant_dir.exists())

    def test_success_persists_truthful_nonempty_starter_provenance(self) -> None:
        scaffold_id = "success-probe"
        with patch(
            "backoffice.pages.scaffold_lifecycle_lib.variants._variant_template_reference_errors",
            return_value=[],
        ):
            self._create(scaffold_id)

        variant_path = self.variants_dir / scaffold_id / "neutral-core.json"
        self.assertTrue(variant_path.is_file())
        payload = json.loads(variant_path.read_text(encoding="utf-8"))
        source_ids = payload.get("sourceTemplateIds")
        self.assertEqual(source_ids, self.source_template_ids)
        self.assertTrue(source_ids)

        manifest = json.loads(self.blob_manifest_path.read_text(encoding="utf-8"))
        blob_ids = {entry["id"] for entry in manifest["templates"]}
        self.assertTrue(all(source_id in blob_ids for source_id in source_ids))
        self.assertTrue(payload["default"])
        self.assertEqual(payload["scaffoldId"], scaffold_id)
        self.assertTrue((self.scaffolds_dir / scaffold_id / "manifest.ts").is_file())

    def _wizard_apply_inputs(self, scaffold_id: str) -> tuple[dict, dict]:
        payload = sl._neutral_variant_payload(
            self.ctx,
            scaffold_id=scaffold_id,
            label="Wizard Transaction Probe",
            description="Exercises the Wizard transaction boundary.",
            tags=["wizard", "transaction"],
        )
        draft = {
            "mode": "new-scaffold",
            "scaffold": {
                "cloneFrom": "base-nextjs",
                "label": "Wizard Transaction Probe",
                "description": "Exercises the Wizard transaction boundary.",
                "siteKind": "marketing",
                "complexity": "simple",
                "intents": ["website"],
                "tagsText": "wizard\ntransaction",
                "hintsText": "Keep the structure clear.\nStay easy to extend.",
                "qualityText": "One\nTwo\nThree",
                "upgradesText": "Richer domain patterns",
            },
            "variant": {
                "id": "neutral-core",
                "scaffoldId": scaffold_id,
            },
        }
        return draft, payload

    def test_wizard_apply_rolls_back_a_post_write_variant_failure(self) -> None:
        scaffold_id = "wizard-rollback-probe"
        new_scaffold_dir = self.scaffolds_dir / scaffold_id
        new_variant_dir = self.variants_dir / scaffold_id
        variant_path = new_variant_dir / "neutral-core.json"
        draft, payload = self._wizard_apply_inputs(scaffold_id)
        real_write_json = scaffold_ops_lib.write_json

        def fail_after_variant_write(path: Path, data: object) -> None:
            real_write_json(path, data)
            self.assertEqual(path, variant_path)
            self.assertTrue(variant_path.is_file())
            self.assertTrue((new_scaffold_dir / "manifest.ts").is_file())
            for control_path in self.original_bytes:
                self.assertIn(scaffold_id, control_path.read_text(encoding="utf-8"))
            raise OSError("forced post-write starter failure")

        with (
            patch.object(
                variants_lib,
                "_variant_template_reference_errors",
                return_value=[],
            ),
            patch.object(
                scaffold_ops_lib,
                "write_json",
                side_effect=fail_after_variant_write,
            ),
        ):
            with self.assertRaisesRegex(OSError, "forced post-write starter failure"):
                sw._apply(self.ctx, draft, payload)

        for path, original in self.original_bytes.items():
            self.assertEqual(path.read_bytes(), original, f"rollback changed {path.name}")
        self.assertFalse(new_scaffold_dir.exists())
        self.assertFalse(new_variant_dir.exists())

    def test_wizard_rollback_retries_cleanup_without_masking_original_error(self) -> None:
        scaffold_id = "wizard-cleanup-retry-probe"
        new_scaffold_dir = self.scaffolds_dir / scaffold_id
        new_variant_dir = self.variants_dir / scaffold_id
        draft, payload = self._wizard_apply_inputs(scaffold_id)
        real_write_json = scaffold_ops_lib.write_json
        real_rmtree = scaffold_ops_lib.shutil.rmtree
        cleanup_calls: list[Path] = []

        def fail_after_variant_write(path: Path, data: object) -> None:
            real_write_json(path, data)
            raise OSError("forced original starter failure")

        def transient_cleanup_failure(path: str | Path, *args, **kwargs) -> None:
            directory = Path(path)
            cleanup_calls.append(directory)
            if directory == new_variant_dir and cleanup_calls.count(directory) == 1:
                raise PermissionError("forced transient cleanup lock")
            real_rmtree(path, *args, **kwargs)

        with (
            patch.object(
                variants_lib,
                "_variant_template_reference_errors",
                return_value=[],
            ),
            patch.object(
                scaffold_ops_lib,
                "write_json",
                side_effect=fail_after_variant_write,
            ),
            patch.object(
                scaffold_ops_lib.shutil,
                "rmtree",
                side_effect=transient_cleanup_failure,
            ),
        ):
            with self.assertRaisesRegex(OSError, "forced original starter failure"):
                sw._apply(self.ctx, draft, payload)

        self.assertEqual(cleanup_calls.count(new_variant_dir), 2)
        self.assertIn(new_scaffold_dir, cleanup_calls)
        for path, original in self.original_bytes.items():
            self.assertEqual(path.read_bytes(), original, f"rollback changed {path.name}")
        self.assertFalse(new_scaffold_dir.exists())
        self.assertFalse(new_variant_dir.exists())


class IntegrityErrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ctx = build_backoffice_context()

    def test_flags_missing_signature_patterns(self) -> None:
        payload = _variant_payload()  # no signaturePatterns supplied
        errors = sl._variant_integrity_errors(
            self.ctx, payload, sibling_defaults=[]
        )
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

    def test_flags_zero_default(self) -> None:
        payload = _variant_payload(
            default_variant=False,
            signature_layouts_text="l one here now\nl two here now\nl three now",
            signature_motifs_text="m one here now\nm two here now",
            signature_anti_patterns_text="a one here now\na two here now",
        )
        errors = sl._variant_integrity_errors(
            self.ctx, payload, sibling_defaults=[]
        )
        self.assertTrue(any("sakna default-variant" in error for error in errors))

    def test_non_default_is_valid_when_sibling_default_exists(self) -> None:
        payload = _variant_payload(
            default_variant=False,
            signature_layouts_text="l one here now\nl two here now\nl three now",
            signature_motifs_text="m one here now\nm two here now",
            signature_anti_patterns_text="a one here now\na two here now",
        )
        self.assertEqual(
            sl._variant_integrity_errors(
                self.ctx, payload, sibling_defaults=["canonical-default"]
            ),
            [],
        )

    def test_non_default_does_not_preserve_two_sibling_defaults(self) -> None:
        payload = _variant_payload(
            default_variant=False,
            signature_layouts_text="l one here now\nl two here now\nl three now",
            signature_motifs_text="m one here now\nm two here now",
            signature_anti_patterns_text="a one here now\na two here now",
        )
        errors = sl._variant_integrity_errors(
            self.ctx, payload, sibling_defaults=["default-a", "default-b"]
        )
        self.assertTrue(any("2 default-varianter" in error for error in errors))

    def test_flags_missing_source_template_ids(self) -> None:
        payload = _variant_payload(
            default_variant=True,
            source_template_ids_text="",
            signature_layouts_text="l one here now\nl two here now\nl three now",
            signature_motifs_text="m one here now\nm two here now",
            signature_anti_patterns_text="a one here now\na two here now",
        )
        errors = sl._variant_integrity_errors(
            self.ctx, payload, sibling_defaults=[]
        )
        self.assertTrue(any("sourceTemplateIds" in error for error in errors))

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


class DefaultDeletionTests(unittest.TestCase):
    def _family(self, root: Path, payloads: list[dict]) -> tuple[SimpleNamespace, dict[str, Path]]:
        variant_dir = root / "config" / "scaffold-variants" / "landing-page"
        variant_dir.mkdir(parents=True)
        paths: dict[str, Path] = {}
        for payload in payloads:
            path = variant_dir / f"{payload['id']}.json"
            path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            paths[str(payload["id"])] = path
        return (
            SimpleNamespace(variants_dir=root / "config" / "scaffold-variants"),
            paths,
        )

    def test_only_default_requires_delete_handoff(self) -> None:
        selected = {"id": "default", "default": True}
        variants = [selected, {"id": "plain", "default": False}]
        self.assertTrue(_would_leave_no_default_variant(selected, variants))

    def test_allows_deleting_non_default(self) -> None:
        selected = {"id": "plain", "default": False}
        variants = [{"id": "default", "default": True}, selected]
        self.assertFalse(_would_leave_no_default_variant(selected, variants))

    def test_preexisting_zero_default_state_requires_delete_handoff(self) -> None:
        selected = {"id": "plain-a", "default": False}
        variants = [selected, {"id": "plain-b", "default": False}]
        self.assertTrue(_would_leave_no_default_variant(selected, variants))

    def test_allows_repairing_preexisting_double_default(self) -> None:
        selected = {"id": "old", "default": True}
        variants = [selected, {"id": "keep", "default": True}]
        self.assertFalse(_would_leave_no_default_variant(selected, variants))

    def test_delete_renderer_uses_the_default_guard(self) -> None:
        source = inspect.getsource(sl._render_delete_variant)
        self.assertIn("_would_leave_no_default_variant", source)
        self.assertIn("_handoff_default_variant", source)

    def test_atomic_handoff_promotes_successor_and_demotes_current(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx, paths = self._family(
                Path(tmp),
                [
                    {"id": "current", "scaffoldId": "landing-page", "default": True},
                    {"id": "successor", "scaffoldId": "landing-page", "default": False},
                ],
            )

            _handoff_default_variant(
                ctx,
                scaffold_id="landing-page",
                current_path=paths["current"],
                successor_path=paths["successor"],
            )

            self.assertFalse(json.loads(paths["current"].read_text(encoding="utf-8"))["default"])
            self.assertTrue(json.loads(paths["successor"].read_text(encoding="utf-8"))["default"])

    def test_atomic_delete_handoff_promotes_successor_and_removes_current(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx, paths = self._family(
                Path(tmp),
                [
                    {"id": "current", "scaffoldId": "landing-page", "default": True},
                    {"id": "successor", "scaffoldId": "landing-page", "default": False},
                ],
            )

            _handoff_default_variant(
                ctx,
                scaffold_id="landing-page",
                current_path=paths["current"],
                successor_path=paths["successor"],
                delete_current=True,
            )

            self.assertFalse(paths["current"].exists())
            self.assertTrue(json.loads(paths["successor"].read_text(encoding="utf-8"))["default"])

    def test_second_write_failure_restores_both_files_byte_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx, paths = self._family(
                Path(tmp),
                [
                    {"id": "current", "scaffoldId": "landing-page", "default": True},
                    {"id": "successor", "scaffoldId": "landing-page", "default": False},
                ],
            )
            for path in paths.values():
                raw = path.read_bytes().replace(b"\r\n", b"\n")
                path.write_bytes(raw.replace(b"\n", b"\r\n"))
            originals = {name: path.read_bytes() for name, path in paths.items()}
            real_write_json = variants_lib.write_json

            def fail_after_current_write(path: Path, data: object) -> None:
                real_write_json(path, data)
                if path == paths["current"]:
                    raise OSError("forced second-write failure")

            with patch.object(
                variants_lib,
                "write_json",
                side_effect=fail_after_current_write,
            ):
                with self.assertRaisesRegex(OSError, "forced second-write failure"):
                    _handoff_default_variant(
                        ctx,
                        scaffold_id="landing-page",
                        current_path=paths["current"],
                        successor_path=paths["successor"],
                    )

            for name, path in paths.items():
                self.assertEqual(path.read_bytes(), originals[name])

    def test_first_write_failure_restores_both_files_byte_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx, paths = self._family(
                Path(tmp),
                [
                    {"id": "current", "scaffoldId": "landing-page", "default": True},
                    {"id": "successor", "scaffoldId": "landing-page", "default": False},
                ],
            )
            originals = {name: path.read_bytes() for name, path in paths.items()}
            real_write_json = variants_lib.write_json

            def fail_after_successor_write(path: Path, data: object) -> None:
                real_write_json(path, data)
                raise OSError("forced first-write failure")

            with patch.object(
                variants_lib,
                "write_json",
                side_effect=fail_after_successor_write,
            ):
                with self.assertRaisesRegex(OSError, "forced first-write failure"):
                    _handoff_default_variant(
                        ctx,
                        scaffold_id="landing-page",
                        current_path=paths["current"],
                        successor_path=paths["successor"],
                    )

            for name, path in paths.items():
                self.assertEqual(path.read_bytes(), originals[name])

    def test_unlink_failure_restores_both_files_byte_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx, paths = self._family(
                Path(tmp),
                [
                    {"id": "current", "scaffoldId": "landing-page", "default": True},
                    {"id": "successor", "scaffoldId": "landing-page", "default": False},
                ],
            )
            originals = {name: path.read_bytes() for name, path in paths.items()}
            path_type = type(paths["current"])
            real_unlink = path_type.unlink

            def fail_current_unlink(path: Path, *args, **kwargs) -> None:
                if path == paths["current"]:
                    raise OSError("forced unlink failure")
                real_unlink(path, *args, **kwargs)

            with patch.object(
                path_type,
                "unlink",
                autospec=True,
                side_effect=fail_current_unlink,
            ):
                with self.assertRaisesRegex(OSError, "forced unlink failure"):
                    _handoff_default_variant(
                        ctx,
                        scaffold_id="landing-page",
                        current_path=paths["current"],
                        successor_path=paths["successor"],
                        delete_current=True,
                    )

            for name, path in paths.items():
                self.assertEqual(path.read_bytes(), originals[name])

    def test_current_rollback_failure_keeps_successor_promoted_and_reports_note(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx, paths = self._family(
                Path(tmp),
                [
                    {"id": "current", "scaffoldId": "landing-page", "default": True},
                    {"id": "successor", "scaffoldId": "landing-page", "default": False},
                ],
            )
            real_write_json = variants_lib.write_json
            path_type = type(paths["current"])
            real_write_bytes = path_type.write_bytes

            def fail_after_current_write(path: Path, data: object) -> None:
                real_write_json(path, data)
                if path == paths["current"]:
                    raise OSError("forced original write failure")

            def fail_current_restore(path: Path, data: bytes) -> int:
                if path == paths["current"]:
                    raise PermissionError("forced current rollback failure")
                return real_write_bytes(path, data)

            with (
                patch.object(
                    variants_lib,
                    "write_json",
                    side_effect=fail_after_current_write,
                ),
                patch.object(
                    path_type,
                    "write_bytes",
                    autospec=True,
                    side_effect=fail_current_restore,
                ),
            ):
                with self.assertRaisesRegex(
                    OSError, "forced original write failure"
                ) as caught:
                    _handoff_default_variant(
                        ctx,
                        scaffold_id="landing-page",
                        current_path=paths["current"],
                        successor_path=paths["successor"],
                    )

            current = json.loads(paths["current"].read_text(encoding="utf-8"))
            successor = json.loads(paths["successor"].read_text(encoding="utf-8"))
            self.assertFalse(current["default"])
            self.assertTrue(successor["default"])
            notes = getattr(caught.exception, "__notes__", [])
            self.assertTrue(any("ofullständig" in note for note in notes))
            rendered = _exception_message(caught.exception)
            self.assertIn("forced original write failure", rendered)
            self.assertIn("forced current rollback failure", rendered)

    def test_projected_multiple_defaults_block_before_any_write(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx, paths = self._family(
                Path(tmp),
                [
                    {"id": "current", "scaffoldId": "landing-page", "default": True},
                    {"id": "successor", "scaffoldId": "landing-page", "default": False},
                    {"id": "other", "scaffoldId": "landing-page", "default": True},
                ],
            )
            originals = {name: path.read_bytes() for name, path in paths.items()}

            with patch.object(variants_lib, "write_json") as writer:
                with self.assertRaisesRegex(ValueError, "2 defaults"):
                    _handoff_default_variant(
                        ctx,
                        scaffold_id="landing-page",
                        current_path=paths["current"],
                        successor_path=paths["successor"],
                    )
            writer.assert_not_called()

            for name, path in paths.items():
                self.assertEqual(path.read_bytes(), originals[name])

    def test_edit_renderer_uses_atomic_default_handoff(self) -> None:
        self.assertIn("_handoff_default_variant", inspect.getsource(sl._render_edit_variant))


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

    def test_lifecycle_rejects_existing_but_runtime_ineligible_blob_id(self) -> None:
        payload = sl._neutral_variant_payload(
            self.ctx,
            scaffold_id="landing-page",
            label="Autotest Scaffold",
            description="A scaffold created by the auto test.",
            tags=["test", "neutral"],
        )
        payload["sourceTemplateIds"] = ["0NFF1rjZrz5"]
        with patch.object(
            variants_lib,
            "_variant_template_reference_errors",
            return_value=[
                "sourceTemplateIds klarar inte runtime/addendum-grinden: "
                "No sourceTemplateIds entry is runtime-selectable; "
                "0NFF1rjZrz5: missing variant-template addendum"
            ],
        ):
            errors = sl._validate_variant_payload(self.ctx, payload)
        self.assertTrue(any("runtime-selectable" in error for error in errors))
        self.assertTrue(any("missing" in error for error in errors))


class VariantTemplateReferenceAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ctx = SimpleNamespace(repo_root=Path("C:/hermetic-backoffice-test"))
        self.payload = {"sourceTemplateIds": [" first-id ", "second-id"]}

    def test_builds_exact_command_and_parses_green_json(self) -> None:
        with patch.object(variants_lib, "run_repo_command") as runner:
            runner.return_value = {
                "ok": True,
                "stdoutTail": json.dumps(
                    {"selectedTemplateId": "first-id", "issues": []}
                ),
                "stderrTail": "",
            }
            self.assertEqual(
                variants_lib._variant_template_reference_errors(
                    self.ctx, self.payload
                ),
                [],
            )

        runner.assert_called_once_with(
            self.ctx.repo_root,
            (
                "node",
                "--import",
                "tsx",
                "scripts/scaffolds/check-variant-template-references.ts",
                "first-id",
                "second-id",
            ),
            timeout=30,
        )

    def test_surfaces_structured_cli_issues_on_nonzero_exit(self) -> None:
        with patch.object(variants_lib, "run_repo_command") as runner:
            runner.return_value = {
                "ok": False,
                "stdoutTail": json.dumps(
                    {
                        "selectedTemplateId": None,
                        "issues": [
                            {
                                "code": "no-runtime-selectable-template",
                                "detail": "No source is runtime-selectable.",
                            },
                            {
                                "code": "missing-addendum",
                                "detail": "first-id: missing addendum",
                            },
                        ],
                    }
                ),
                "stderrTail": "",
            }
            errors = variants_lib._variant_template_reference_errors(
                self.ctx, self.payload
            )

        self.assertEqual(len(errors), 1)
        self.assertIn("runtime-selectable", errors[0])
        self.assertIn("missing addendum", errors[0])

    def test_fails_closed_when_cli_cannot_load_tsx(self) -> None:
        with patch.object(variants_lib, "run_repo_command") as runner:
            runner.return_value = {
                "ok": False,
                "stdoutTail": "",
                "stderrTail": "ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'",
            }
            errors = variants_lib._variant_template_reference_errors(
                self.ctx, self.payload
            )

        self.assertEqual(len(errors), 1)
        self.assertIn("Kunde inte kontrollera", errors[0])
        self.assertIn("ERR_MODULE_NOT_FOUND", errors[0])

    def test_fails_closed_on_success_exit_with_invalid_json_contract(self) -> None:
        with patch.object(variants_lib, "run_repo_command") as runner:
            runner.return_value = {
                "ok": True,
                "stdoutTail": json.dumps({"selectedTemplateId": "first-id"}),
                "stderrTail": "",
            }
            errors = variants_lib._variant_template_reference_errors(
                self.ctx, self.payload
            )

        self.assertEqual(
            errors,
            ["Runtime/addendum-grinden gav ett ogiltigt svar för sourceTemplateIds."],
        )


class CreateScaffoldValidationTests(unittest.TestCase):
    """Skapa-scaffold-reglerna överlevde tabbomläggningen i Fas B.

    Reglerna sitter i formulärflödet (``_render_create_scaffold``) och kan inte
    anropas utan Streamlit-runtime, så grinden läser koden. Faller ett av de här
    testerna har någon tagit bort en spärr, inte bara skrivit om en etikett.
    """

    def setUp(self) -> None:
        self.source = inspect.getsource(sl._render_create_scaffold)

    def test_scaffold_id_must_be_kebab_case(self) -> None:
        self.assertIn(r're.fullmatch(r"[a-z][a-z0-9-]*", scaffold_id)', self.source)

    def test_minimum_row_counts_are_enforced(self) -> None:
        for guard in (
            "len(prompt_hints) < 2",
            "len(quality_checklist) < 3",
            "len(upgrade_targets) < 1",
        ):
            self.assertIn(guard, self.source, f"spärren `{guard}` är borta")

    def test_start_variant_is_still_mandatory(self) -> None:
        self.assertIn("if not create_start_variant:", self.source)
        self.assertIn("måste ha minst en variant", self.source)

    def test_success_flash_reflects_whether_start_variant_was_created(self) -> None:
        self.assertIn("if create_start_variant:", self.source)
        self.assertIn("validerad startvariant", self.source)
        self.assertIn("utan startvariant", self.source)

    def test_duplicate_and_empty_fields_are_still_rejected(self) -> None:
        self.assertIn("finns redan", self.source)
        self.assertIn("if not allowed_build_intents:", self.source)


class WizardNewScaffoldBlobCheckTests(unittest.TestCase):
    """Finding 5: the wizard new-scaffold path must run the Blob sourceTemplateIds
    integrity check, not only JSON-schema validation."""

    def setUp(self) -> None:
        self.ctx = build_backoffice_context()
        reference_patcher = patch.object(
            sw,
            "_variant_template_reference_errors",
            side_effect=self._reference_errors,
        )
        reference_patcher.start()
        self.addCleanup(reference_patcher.stop)

    @staticmethod
    def _reference_errors(_ctx, payload: dict) -> list[str]:
        source_ids = payload.get("sourceTemplateIds") or []
        if "0NFF1rjZrz5" in source_ids:
            return [
                "sourceTemplateIds klarar inte runtime/addendum-grinden: "
                "No sourceTemplateIds entry is runtime-selectable; "
                "0NFF1rjZrz5: missing variant-template addendum"
            ]
        return []

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

    def _default_check(self, checks: list[dict]) -> dict:
        return next(c for c in checks if c["kontroll"] == "Exakt en default-variant")

    def test_dead_blob_id_fails_new_scaffold_check(self) -> None:
        checks, _payload = sw._run_checks(self.ctx, self._draft("definitely-not-a-real-blob-id"))
        schema_check = self._schema_check(checks)
        self.assertEqual(schema_check["status"], "❌")
        self.assertIn("Blob-manifestet", schema_check["detalj"])

    def test_real_blob_id_passes_new_scaffold_check(self) -> None:
        checks, _payload = sw._run_checks(self.ctx, self._draft("8Y9E0cStKrW"))
        schema_check = self._schema_check(checks)
        self.assertEqual(schema_check["status"], "✅")

    def test_existing_but_runtime_ineligible_blob_id_fails(self) -> None:
        checks, _payload = sw._run_checks(self.ctx, self._draft("0NFF1rjZrz5"))
        schema_check = self._schema_check(checks)
        self.assertEqual(schema_check["status"], "❌")
        self.assertIn("runtime-selectable", schema_check["detalj"])
        self.assertIn("missing", schema_check["detalj"])

    def test_empty_blob_id_fails_new_scaffold_check(self) -> None:
        checks, _payload = sw._run_checks(self.ctx, self._draft(""))
        schema_check = self._schema_check(checks)
        self.assertEqual(schema_check["status"], "❌")
        self.assertIn("sourceTemplateIds", schema_check["detalj"])

    def test_new_scaffold_requires_its_start_variant_to_be_default(self) -> None:
        draft = self._draft("8Y9E0cStKrW")
        draft["variant"]["default"] = False
        checks, _payload = sw._run_checks(self.ctx, draft)
        default_check = self._default_check(checks)
        self.assertEqual(default_check["status"], "❌")
        self.assertIn("default efter skapandet: 0", default_check["detalj"])


class PostCreateStatusTests(unittest.TestCase):
    def test_only_green_validation_marks_integrity_complete(self) -> None:
        self.assertFalse(sw._post_create_validation_passed({}))
        self.assertFalse(
            sw._post_create_validation_passed({"validate": {"ok": False}})
        )
        self.assertFalse(
            sw._post_create_validation_passed(
                {"validate": {"ok": True, "skipped": True}}
            )
        )
        self.assertTrue(
            sw._post_create_validation_passed({"validate": {"ok": True}})
        )

    def test_post_create_copy_does_not_claim_completion_early(self) -> None:
        source = inspect.getsource(sw._render_post_create)
        self.assertNotIn("Klart — varianten är skapad", source)
        self.assertIn("integritetskontroller återstår", source)
        self.assertIn("Integritetsgrinden är grön", source)
        self.assertIn("redo för master", source)

    def test_validation_status_is_derived_after_button_handlers(self) -> None:
        source = inspect.getsource(sw._render_post_create)
        button_pos = source.find('st.button("▶ Kör alla steg i följd (igen)"')
        status_pos = source.find(
            "validation_passed = _post_create_validation_passed(results)"
        )
        self.assertGreater(button_pos, -1)
        self.assertGreater(status_pos, button_pos)
        self.assertIn("status_slot", source)

    def test_mutation_invalidates_an_earlier_green_validation(self) -> None:
        results = {
            "validate": {"ok": True},
            "patterns": {"ok": True},
        }
        sw._invalidate_validation_after_mutation(results, "embeddings")
        self.assertNotIn("validate", results)
        self.assertFalse(sw._post_create_validation_passed(results))

    def test_validation_step_does_not_invalidate_itself(self) -> None:
        results = {"validate": {"ok": True}}
        sw._invalidate_validation_after_mutation(results, "validate")
        self.assertTrue(sw._post_create_validation_passed(results))


if __name__ == "__main__":
    unittest.main()
