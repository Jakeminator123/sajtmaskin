"""Functional guards for scaffold intent writes from Backoffice."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from backoffice.pages.scaffold_lifecycle_lib.scaffold_ops import _create_scaffold
from backoffice.pages.scaffolds import _save_scaffold_metadata
from backoffice.shared import extract_ts_string_array_field, write_text


TYPES_FIXTURE = '''export type ScaffoldId =
  | "base-nextjs";

export type ScaffoldMode = "off" | "auto" | "manual";

export const SCAFFOLD_CLIENT_LIST: ReadonlyArray<{
  id: ScaffoldId;
  label: string;
  description: string;
  allowedBuildIntents: ReadonlyArray<"website" | "app" | "template">;
}> = [
  { id: "base-nextjs", label: "Base", description: "Base scaffold", allowedBuildIntents: ["website", "template"] },
] as const;
'''

REGISTRY_FIXTURE = '''import { baseNextjsManifest } from "./base-nextjs/manifest";
import { getScaffoldResearchOverrides } from "./scaffold-research";

const BASE_SCAFFOLDS = [
  baseNextjsManifest,
];
'''

LOCALE_FIXTURE = '''export const SCAFFOLD_EMBEDDING_LOCALE: Record<ScaffoldId, ScaffoldEmbeddingLocale> = {
  "base-nextjs": {
    labelSv: "Bas",
    descriptionSv: "Bas.",
    keywordsSv: ["bas"],
  },
};
'''

MANIFEST_FIXTURE = '''import type { ScaffoldManifest } from "../types";

export const baseNextjsManifest: ScaffoldManifest = {
  id: "base-nextjs",
  label: "Base",
  description: "Base scaffold",
  allowedBuildIntents: ["website", "template"],
  tags: ["base"],
  promptHints: [
    "First hint",
    "Second hint",
  ],
  qualityChecklist: [
    "First check",
    "Second check",
    "Third check",
  ],
  files: [],
};
'''

SCHEMA_FIXTURE = '''{
  "properties": {
    "scaffoldId": {
      "enum": [
        "base-nextjs"
      ]
    }
  }
}
'''


class ScaffoldIntentWriterTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.scaffolds_dir = self.root / "src" / "lib" / "gen" / "scaffolds"
        self.variants_dir = self.root / "config" / "scaffold-variants"
        self.scaffolds_dir.mkdir(parents=True)
        self.variants_dir.mkdir(parents=True)
        (self.scaffolds_dir / "types.ts").write_text(
            TYPES_FIXTURE, encoding="utf-8", newline="\n"
        )
        (self.scaffolds_dir / "registry.ts").write_text(
            REGISTRY_FIXTURE, encoding="utf-8", newline="\n"
        )
        (self.scaffolds_dir / "scaffold-embedding-locale.ts").write_text(
            LOCALE_FIXTURE, encoding="utf-8", newline="\n"
        )
        source_dir = self.scaffolds_dir / "base-nextjs"
        (source_dir / "files" / "app").mkdir(parents=True)
        (source_dir / "files" / "app" / "page.tsx").write_text(
            "export default function Page() { return null; }\n",
            encoding="utf-8",
            newline="\n",
        )
        (source_dir / "manifest.ts").write_text(
            MANIFEST_FIXTURE, encoding="utf-8", newline="\n"
        )
        schema_path = (
            self.root / "docs" / "schemas" / "strict" / "scaffold-variant.schema.json"
        )
        schema_path.parent.mkdir(parents=True)
        schema_path.write_text(SCHEMA_FIXTURE, encoding="utf-8", newline="\n")
        self.schema_path = schema_path
        # create_start_variant=True copies provenance from the base starter.
        starter_dir = self.variants_dir / "base-nextjs"
        starter_dir.mkdir(parents=True)
        (starter_dir / "starter-neutral.json").write_text(
            json.dumps({"sourceTemplateIds": ["test-template-id"]}),
            encoding="utf-8",
            newline="\n",
        )
        self.ctx = SimpleNamespace(
            repo_root=self.root,
            scaffolds_dir=self.scaffolds_dir,
            variants_dir=self.variants_dir,
        )

    def _create(
        self, intents: list[str], *, create_start_variant: bool = False
    ) -> None:
        _create_scaffold(
            self.ctx,
            source_scaffold_id="base-nextjs",
            scaffold_id="new-app",
            label="New App",
            description="A new application scaffold.",
            site_kind="app",
            complexity="medium",
            structure_profile="application shell",
            content_profile="workspace",
            features=["navigation"],
            allowed_build_intents=intents,
            tags=["app"],
            prompt_hints=["First hint", "Second hint"],
            quality_checklist=["First", "Second", "Third"],
            upgrade_targets=["More routes"],
            create_start_variant=create_start_variant,
        )

    def _repo_snapshot(self) -> dict[str, bytes]:
        return {
            path.relative_to(self.root).as_posix(): path.read_bytes()
            for path in self.root.rglob("*")
            if path.is_file()
        }

    def test_create_writes_intents_to_manifest_and_client_projection(self) -> None:
        self._create(["app", "template"])

        manifest = (self.scaffolds_dir / "new-app" / "manifest.ts").read_text(
            encoding="utf-8"
        )
        types_text = (self.scaffolds_dir / "types.ts").read_text(encoding="utf-8")
        self.assertEqual(
            extract_ts_string_array_field(manifest, "allowedBuildIntents"),
            ["app", "template"],
        )
        self.assertIn(
            'id: "new-app", label: "New App", description: "A new application scaffold.", '
            'allowedBuildIntents: ["app", "template"]',
            types_text,
        )

    def test_create_rejects_empty_or_unknown_intents_before_writing(self) -> None:
        for intents in ([], ["website", "unknown"]):
            with self.subTest(intents=intents):
                with self.assertRaisesRegex(ValueError, "allowedBuildIntents"):
                    self._create(intents)
                self.assertFalse((self.scaffolds_dir / "new-app").exists())

    def test_create_rejects_stale_projections_before_writing(self) -> None:
        types_path = self.scaffolds_dir / "types.ts"
        registry_path = self.scaffolds_dir / "registry.ts"
        locale_path = self.scaffolds_dir / "scaffold-embedding-locale.ts"
        original_types = types_path.read_text(encoding="utf-8")
        original_registry = registry_path.read_text(encoding="utf-8")
        original_locale = locale_path.read_text(encoding="utf-8")
        stale_states = {
            "union": (
                types_path,
                original_types.replace(
                    '  | "base-nextjs";', '  | "base-nextjs"\n  | "new-app";'
                ),
            ),
            "client": (
                types_path,
                original_types.replace(
                    "] as const;",
                    '  { id: "new-app", label: "Old", description: "Stale", '
                    'allowedBuildIntents: ["website"] },\n] as const;',
                ),
            ),
            "registry": (
                registry_path,
                original_registry.replace(
                    "  baseNextjsManifest,",
                    "  baseNextjsManifest,\n  newAppManifest,",
                ),
            ),
            "locale": (
                locale_path,
                original_locale.replace(
                    "};",
                    '  "new-app": { labelSv: "Gammal", descriptionSv: "Gammal", '
                    'keywordsSv: [] },\n};',
                ),
            ),
        }

        for case, (path, stale_text) in stale_states.items():
            with self.subTest(case=case):
                path.write_text(stale_text, encoding="utf-8", newline="\n")
                before = self._repo_snapshot()
                with self.assertRaisesRegex(ValueError, "projektion|finns redan"):
                    self._create(["app"])
                self.assertEqual(self._repo_snapshot(), before)
                self.assertFalse((self.scaffolds_dir / "new-app").exists())
                self.assertFalse((self.variants_dir / "new-app").exists())
                path.write_text(
                    {
                        types_path: original_types,
                        registry_path: original_registry,
                        locale_path: original_locale,
                    }[path],
                    encoding="utf-8",
                    newline="\n",
                )

    def test_create_rejects_malformed_client_list_before_writing(self) -> None:
        types_path = self.scaffolds_dir / "types.ts"
        malformed_types = types_path.read_text(encoding="utf-8").replace(
            "] as const;",
            "];\n\nexport const OTHER_LIST = [] as const;",
        )
        types_path.write_text(malformed_types, encoding="utf-8", newline="\n")
        before = self._repo_snapshot()

        with self.assertRaisesRegex(ValueError, "SCAFFOLD_CLIENT_LIST"):
            self._create(["app"])

        self.assertEqual(self._repo_snapshot(), before)
        self.assertFalse((self.scaffolds_dir / "new-app").exists())
        self.assertFalse((self.variants_dir / "new-app").exists())

    def test_create_rolls_back_all_files_after_types_write_succeeds(self) -> None:
        tracked_paths = [
            self.scaffolds_dir / "types.ts",
            self.scaffolds_dir / "registry.ts",
            self.scaffolds_dir / "scaffold-embedding-locale.ts",
            self.schema_path,
        ]
        originals = {path: path.read_text(encoding="utf-8") for path in tracked_paths}
        registry_path = self.scaffolds_dir / "registry.ts"
        types_path = self.scaffolds_dir / "types.ts"
        types_was_mutated = False
        registry_failed_once = False

        def fail_first_registry_write(path: Path, content: str) -> None:
            nonlocal registry_failed_once, types_was_mutated
            if path == registry_path and not registry_failed_once:
                registry_failed_once = True
                raise OSError("simulated registry write failure")
            write_text(path, content)
            if path == types_path and content != originals[types_path]:
                types_was_mutated = path.read_text(encoding="utf-8") == content

        with mock.patch(
            "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops.write_text",
            side_effect=fail_first_registry_write,
        ):
            with self.assertRaisesRegex(OSError, "simulated registry write failure"):
                self._create(["app"])

        self.assertTrue(types_was_mutated)
        self.assertTrue(registry_failed_once)
        self.assertFalse((self.scaffolds_dir / "new-app").exists())
        self.assertFalse((self.variants_dir / "new-app").exists())
        for path, original in originals.items():
            with self.subTest(path=path):
                self.assertEqual(path.read_text(encoding="utf-8"), original)

    def test_create_rollback_continues_after_restore_failure(self) -> None:
        tracked_paths = [
            self.scaffolds_dir / "types.ts",
            self.scaffolds_dir / "registry.ts",
            self.scaffolds_dir / "scaffold-embedding-locale.ts",
            self.schema_path,
        ]
        originals = {path: path.read_bytes() for path in tracked_paths}
        types_path = self.scaffolds_dir / "types.ts"
        restored_after_failure: list[Path] = []
        path_type = type(types_path)
        real_write_bytes = path_type.write_bytes

        def fail_types_restore(path: Path, data: bytes) -> int:
            if path == types_path:
                raise OSError("simulated types restore failure")
            restored_after_failure.append(path)
            return real_write_bytes(path, data)

        with (
            mock.patch.object(
                path_type,
                "write_bytes",
                autospec=True,
                side_effect=fail_types_restore,
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops._validate_variant_payload",
                return_value=[],
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops.write_json",
                side_effect=OSError("simulated variant write failure"),
            ),
        ):
            with self.assertRaisesRegex(
                OSError, "simulated variant write failure"
            ) as raised:
                self._create(["app"], create_start_variant=True)

        notes = getattr(raised.exception, "__notes__", [])
        self.assertTrue(any("ofullständig" in note for note in notes))
        self.assertTrue(
            any("simulated types restore failure" in note for note in notes)
        )
        self.assertNotEqual(types_path.read_bytes(), originals[types_path])
        self.assertEqual(
            restored_after_failure,
            list(reversed(tracked_paths[1:])),
            "later originals must still be restored after the first restore fails",
        )
        self.assertFalse((self.scaffolds_dir / "new-app").exists())
        self.assertFalse((self.variants_dir / "new-app").exists())
        for path in tracked_paths[1:]:
            with self.subTest(path=path):
                self.assertEqual(path.read_bytes(), originals[path])

    def test_create_rollback_continues_after_first_cleanup_failure(self) -> None:
        tracked_paths = [
            self.scaffolds_dir / "types.ts",
            self.scaffolds_dir / "registry.ts",
            self.scaffolds_dir / "scaffold-embedding-locale.ts",
            self.schema_path,
        ]
        originals = {path: path.read_bytes() for path in tracked_paths}
        restore_attempts: list[Path] = []
        cleanup_attempts: list[Path] = []
        variant_dir = self.variants_dir / "new-app"
        scaffold_dir = self.scaffolds_dir / "new-app"
        real_rmtree = shutil.rmtree
        path_type = type(tracked_paths[0])
        real_write_bytes = path_type.write_bytes

        def track_restores(path: Path, data: bytes) -> int:
            if path in originals and data == originals[path]:
                restore_attempts.append(path)
            return real_write_bytes(path, data)

        def fail_first_cleanup(path: Path) -> None:
            cleanup_attempts.append(path)
            if path == variant_dir:
                raise OSError("simulated variant cleanup failure")
            real_rmtree(path)

        with (
            mock.patch.object(
                path_type,
                "write_bytes",
                autospec=True,
                side_effect=track_restores,
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops._validate_variant_payload",
                return_value=[],
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops.write_json",
                side_effect=OSError("simulated variant write failure"),
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops.shutil.rmtree",
                side_effect=fail_first_cleanup,
            ),
        ):
            with self.assertRaisesRegex(
                OSError, "simulated variant write failure"
            ) as raised:
                self._create(["app"], create_start_variant=True)

        notes = getattr(raised.exception, "__notes__", [])
        self.assertTrue(any("ofullständig" in note for note in notes))
        self.assertTrue(
            any("simulated variant cleanup failure" in note for note in notes)
        )
        self.assertEqual(restore_attempts, list(reversed(tracked_paths)))
        self.assertEqual(
            cleanup_attempts,
            [variant_dir, scaffold_dir, variant_dir],
            "failed cleanup must be retried after other rollback targets",
        )
        self.assertTrue(variant_dir.is_dir())
        self.assertFalse(scaffold_dir.exists())
        for path, original in originals.items():
            with self.subTest(path=path):
                self.assertEqual(path.read_bytes(), original)

    def test_edit_updates_manifest_and_client_projection(self) -> None:
        changed = _save_scaffold_metadata(
            self.ctx,
            scaffold_id="base-nextjs",
            tags=["base", "app"],
            allowed_build_intents=["app"],
            prompt_hints=["First hint", "Second hint"],
            quality_checklist=["First check", "Second check", "Third check"],
        )

        self.assertTrue(changed)
        manifest = (self.scaffolds_dir / "base-nextjs" / "manifest.ts").read_text(
            encoding="utf-8"
        )
        types_text = (self.scaffolds_dir / "types.ts").read_text(encoding="utf-8")
        self.assertEqual(
            extract_ts_string_array_field(manifest, "allowedBuildIntents"), ["app"]
        )
        self.assertIn('allowedBuildIntents: ["app"]', types_text)

    def test_edit_rejects_invalid_intents_without_writing(self) -> None:
        manifest_path = self.scaffolds_dir / "base-nextjs" / "manifest.ts"
        types_path = self.scaffolds_dir / "types.ts"
        originals = (manifest_path.read_text(encoding="utf-8"), types_path.read_text(encoding="utf-8"))

        for intents in ([], ["website", "unknown"]):
            with self.subTest(intents=intents):
                with self.assertRaisesRegex(ValueError, "allowedBuildIntents"):
                    _save_scaffold_metadata(
                        self.ctx,
                        scaffold_id="base-nextjs",
                        tags=["changed"],
                        allowed_build_intents=intents,
                        prompt_hints=["Changed one", "Changed two"],
                        quality_checklist=["Changed one", "Changed two", "Changed three"],
                    )
                self.assertEqual(manifest_path.read_text(encoding="utf-8"), originals[0])
                self.assertEqual(types_path.read_text(encoding="utf-8"), originals[1])

    def test_edit_rejects_missing_or_malformed_client_row_before_writing(self) -> None:
        manifest_path = self.scaffolds_dir / "base-nextjs" / "manifest.ts"
        types_path = self.scaffolds_dir / "types.ts"
        original_manifest = manifest_path.read_text(encoding="utf-8")
        original_types = types_path.read_text(encoding="utf-8")
        bad_types_values = {
            "missing": original_types.replace(
                '  { id: "base-nextjs", label: "Base", description: "Base scaffold", '
                'allowedBuildIntents: ["website", "template"] },\n',
                "",
            ),
            "malformed": original_types.replace(
                'allowedBuildIntents: ["website", "template"]',
                'allowedBuildIntents: "website"',
            ),
        }

        for case, bad_types in bad_types_values.items():
            with self.subTest(case=case):
                types_path.write_text(bad_types, encoding="utf-8", newline="\n")
                with self.assertRaisesRegex(ValueError, "SCAFFOLD_CLIENT_LIST"):
                    _save_scaffold_metadata(
                        self.ctx,
                        scaffold_id="base-nextjs",
                        tags=["changed"],
                        allowed_build_intents=["app"],
                        prompt_hints=["Changed one", "Changed two"],
                        quality_checklist=["Changed one", "Changed two", "Changed three"],
                    )
                self.assertEqual(
                    manifest_path.read_text(encoding="utf-8"), original_manifest
                )
                self.assertEqual(types_path.read_text(encoding="utf-8"), bad_types)

        types_path.write_text(original_types, encoding="utf-8", newline="\n")

    def test_edit_restores_both_files_after_partial_client_projection_write(self) -> None:
        manifest_path = self.scaffolds_dir / "base-nextjs" / "manifest.ts"
        types_path = self.scaffolds_dir / "types.ts"
        original_manifest = manifest_path.read_text(encoding="utf-8")
        original_types = types_path.read_text(encoding="utf-8")

        def fail_types_write(path: Path, content: str) -> None:
            if path == types_path:
                path.write_text(
                    content[: max(1, len(content) // 3)],
                    encoding="utf-8",
                    newline="\n",
                )
                raise OSError("simulated partial types write failure")
            write_text(path, content)

        with mock.patch(
            "backoffice.pages.scaffolds.write_text", side_effect=fail_types_write
        ):
            with self.assertRaisesRegex(OSError, "simulated partial types write failure"):
                _save_scaffold_metadata(
                    self.ctx,
                    scaffold_id="base-nextjs",
                    tags=["changed"],
                    allowed_build_intents=["app"],
                    prompt_hints=["Changed one", "Changed two"],
                    quality_checklist=["Changed one", "Changed two", "Changed three"],
                )

        self.assertEqual(manifest_path.read_text(encoding="utf-8"), original_manifest)
        self.assertEqual(types_path.read_text(encoding="utf-8"), original_types)


if __name__ == "__main__":
    unittest.main()
