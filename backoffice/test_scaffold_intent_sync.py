"""Functional guards for scaffold intent writes from Backoffice."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from backoffice.pages.scaffold_lifecycle_lib.scaffold_ops import (
    _create_scaffold,
    _delete_scaffold,
    _scan_scaffold_dependencies,
)
from backoffice.pages.scaffold_lifecycle_lib.scaffold_text import (
    _upsert_scaffold_union_entry,
)
from backoffice.pages.scaffold_lifecycle_lib.ui_danger import (
    _render_delete_scaffold,
    _render_dependency_report,
)
from backoffice.pages.scaffolds import _save_scaffold_metadata
from backoffice.shared import extract_ts_string_array_field, write_text


TYPES_FIXTURE = '''export type ScaffoldId =
  | "base-nextjs";

export type ScaffoldMode = "off" | "auto" | "manual";
'''

CLIENT_LIST_FIXTURE = '''import type { ScaffoldId } from "./types";

export type ScaffoldClientListEntry = {
  readonly id: ScaffoldId;
  readonly label: string;
  readonly description: string;
  readonly allowedBuildIntents: ReadonlyArray<"website" | "app" | "template">;
};

export const SCAFFOLD_CLIENT_LIST: ReadonlyArray<ScaffoldClientListEntry> = [
  { id: "base-nextjs", label: "Base", description: "Base scaffold", allowedBuildIntents: ["website", "template"] },
];
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

RESEARCH_FIXTURE = '''{
  "generatedAt": "test",
  "scaffolds": {
    "base-nextjs": {
      "qualityChecklist": ["Keep it minimal"]
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
        (self.scaffolds_dir / "scaffold-client-list.generated.ts").write_text(
            CLIENT_LIST_FIXTURE, encoding="utf-8", newline="\n"
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
        self.research_path = self.scaffolds_dir / "scaffold-research.generated.json"
        self.research_path.write_text(
            RESEARCH_FIXTURE, encoding="utf-8", newline="\n"
        )
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
            research_json=self.research_path,
            embeddings_json=self.root / "config" / "scaffold-embeddings.json",
        )
        generator_patcher = mock.patch(
            "backoffice.pages.scaffold_lifecycle_lib.client_projection."
            "regenerate_scaffold_client_projection"
        )
        self.generator_mock = generator_patcher.start()
        self.addCleanup(generator_patcher.stop)

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
            and "data/backoffice/locks" not in path.relative_to(self.root).as_posix()
        }

    def test_create_writes_intents_to_manifest_and_client_projection(self) -> None:
        def assert_canonical_writes_precede_generator(_repo_root: Path) -> None:
            self.assertTrue((self.scaffolds_dir / "new-app" / "manifest.ts").is_file())
            self.assertIn(
                '  | "new-app";',
                (self.scaffolds_dir / "types.ts").read_text(encoding="utf-8"),
            )
            self.assertIn(
                './new-app/manifest',
                (self.scaffolds_dir / "registry.ts").read_text(encoding="utf-8"),
            )

        self.generator_mock.side_effect = assert_canonical_writes_precede_generator
        self._create(["app", "template"])

        manifest = (self.scaffolds_dir / "new-app" / "manifest.ts").read_text(
            encoding="utf-8"
        )
        self.assertEqual(
            extract_ts_string_array_field(manifest, "allowedBuildIntents"),
            ["app", "template"],
        )
        self.generator_mock.assert_called_once_with(self.root)
        self.assertIn(
            '  | "new-app";',
            (self.scaffolds_dir / "types.ts").read_text(encoding="utf-8"),
        )

    def test_union_insert_ignores_same_string_in_other_types(self) -> None:
        updated = _upsert_scaffold_union_entry(TYPES_FIXTURE, "auto")
        self.assertIn('  | "auto";', updated.split("export type ScaffoldMode", 1)[0])
        self.assertEqual(updated.count('  | "auto";'), 1)

    def test_dependency_scan_reads_union_and_client_list_separately(self) -> None:
        report = _scan_scaffold_dependencies(self.ctx, "base-nextjs", [])
        self.assertTrue(report["typesUnionPresent"])
        self.assertTrue(report["clientListPresent"])

        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        client_list_path.write_text(
            CLIENT_LIST_FIXTURE.replace(
                '  { id: "base-nextjs", label: "Base", description: "Base scaffold", '
                'allowedBuildIntents: ["website", "template"] },\n',
                "",
            ),
            encoding="utf-8",
            newline="\n",
        )
        report = _scan_scaffold_dependencies(self.ctx, "base-nextjs", [])
        self.assertTrue(report["typesUnionPresent"])
        self.assertFalse(report["clientListPresent"])

    def test_dependency_scan_and_ui_fail_soft_for_missing_or_unreadable_projection(
        self,
    ) -> None:
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        states = {
            "missing": None,
            "unreadable": b"\xff\xfe\xfa",
        }

        for expected_status, payload in states.items():
            with self.subTest(status=expected_status):
                if payload is None:
                    client_list_path.unlink(missing_ok=True)
                else:
                    client_list_path.write_bytes(payload)
                report = _scan_scaffold_dependencies(self.ctx, "base-nextjs", [])
                self.assertFalse(report["clientListPresent"])
                self.assertEqual(report["clientListStatus"], expected_status)
                with (
                    mock.patch(
                        "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.dataframe"
                    ) as dataframe,
                    mock.patch(
                        "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.expander"
                    ),
                    mock.patch(
                        "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.markdown"
                    ),
                ):
                    _render_dependency_report(report)
                dataframe.assert_called_once()

    def test_dependency_scan_finds_mjs_manual_reference(self) -> None:
        scripts_dir = self.root / "scripts"
        scripts_dir.mkdir()
        probe = scripts_dir / "manual-reference.mjs"
        probe.write_text(
            'export const scaffold = "base-nextjs";\n',
            encoding="utf-8",
            newline="\n",
        )

        report = _scan_scaffold_dependencies(self.ctx, "base-nextjs", [])

        self.assertTrue(
            any(
                ref["path"] == "scripts/manual-reference.mjs"
                for ref in report["manualCodeReferences"]
            )
        )

    def test_delete_form_renders_when_generated_projection_is_missing(self) -> None:
        (self.scaffolds_dir / "scaffold-client-list.generated.ts").unlink()
        with (
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.selectbox",
                return_value="base-nextjs",
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.dataframe"
            ) as dataframe,
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.expander"
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.markdown"
            ),
            mock.patch("backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.warning"),
            mock.patch("backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.caption"),
            mock.patch("backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.form"),
            mock.patch("backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.checkbox"),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.ui_danger.confirm_by_typing",
                return_value=False,
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.ui_danger.st.form_submit_button",
                return_value=False,
            ),
        ):
            _render_delete_scaffold(self.ctx, ["base-nextjs"], [])

        dataframe.assert_called_once()

    def test_delete_updates_all_projections_and_removes_directories(self) -> None:
        def assert_canonical_delete_precedes_generator(_repo_root: Path) -> None:
            self.assertFalse((self.scaffolds_dir / "base-nextjs").exists())
            self.assertFalse((self.variants_dir / "base-nextjs").exists())
            self.assertNotIn(
                '"base-nextjs"',
                (self.scaffolds_dir / "types.ts").read_text(encoding="utf-8"),
            )

        self.generator_mock.side_effect = assert_canonical_delete_precedes_generator
        with (
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops."
                "_clean_generated_scaffold_artifacts"
            ),
            mock.patch(
                "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops."
                "_prune_variant_embeddings"
            ),
        ):
            _delete_scaffold(self.ctx, "base-nextjs", snapshot=False)

        types_text = (self.scaffolds_dir / "types.ts").read_text(encoding="utf-8")
        registry_text = (self.scaffolds_dir / "registry.ts").read_text(
            encoding="utf-8"
        )
        locale_text = (
            self.scaffolds_dir / "scaffold-embedding-locale.ts"
        ).read_text(encoding="utf-8")
        schema = json.loads(self.schema_path.read_text(encoding="utf-8"))
        self.assertNotIn('"base-nextjs"', types_text)
        self.assertNotIn("baseNextjsManifest", registry_text)
        self.assertNotIn('"base-nextjs":', locale_text)
        self.assertNotIn(
            "base-nextjs", schema["properties"]["scaffoldId"]["enum"]
        )
        research = json.loads(self.research_path.read_text(encoding="utf-8"))
        self.assertNotIn("base-nextjs", research["scaffolds"])
        self.assertFalse((self.scaffolds_dir / "base-nextjs").exists())
        self.assertFalse((self.variants_dir / "base-nextjs").exists())
        self.generator_mock.assert_called_once_with(self.root)

    def test_delete_tolerates_arbitrary_stale_generated_projection(self) -> None:
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        client_list_path.write_bytes(b"\xef\xbb\xbfnot valid TypeScript\r\n")

        _delete_scaffold(self.ctx, "base-nextjs", snapshot=False)

        self.generator_mock.assert_called_once_with(self.root)

    def test_delete_generator_failure_restores_bytes_and_directories(self) -> None:
        registry_path = self.scaffolds_dir / "registry.ts"
        for path in (
            self.scaffolds_dir / "types.ts",
            self.scaffolds_dir / "scaffold-client-list.generated.ts",
            registry_path,
            self.scaffolds_dir / "scaffold-embedding-locale.ts",
            self.schema_path,
        ):
            lf_text = path.read_text(encoding="utf-8")
            path.write_bytes(lf_text.replace("\n", "\r\n").encode("utf-8"))
        before = self._repo_snapshot()

        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"

        def corrupt_projection_and_fail(_repo_root: Path) -> None:
            client_list_path.write_text("partial", encoding="utf-8", newline="\n")
            raise OSError("simulated delete generator failure")

        self.generator_mock.side_effect = corrupt_projection_and_fail
        with self.assertRaisesRegex(OSError, "simulated delete generator failure"):
            _delete_scaffold(self.ctx, "base-nextjs", snapshot=False)

        self.assertEqual(self._repo_snapshot(), before)

    def test_delete_partial_research_write_rolls_back_everything(self) -> None:
        before = self._repo_snapshot()

        def fail_research_write(path: Path, content: str) -> None:
            if path == self.research_path:
                path.write_text(
                    content[: max(1, len(content) // 3)],
                    encoding="utf-8",
                    newline="\n",
                )
                raise OSError("simulated partial research write failure")
            write_text(path, content)

        with mock.patch(
            "backoffice.pages.scaffold_lifecycle_lib.scaffold_ops.write_text",
            side_effect=fail_research_write,
        ):
            with self.assertRaisesRegex(
                OSError, "simulated partial research write failure"
            ):
                _delete_scaffold(self.ctx, "base-nextjs", snapshot=False)

        self.assertEqual(self._repo_snapshot(), before)
        self.generator_mock.assert_not_called()

    def test_delete_allows_missing_research_entry_as_exact_noop(self) -> None:
        self.research_path.write_text(
            '{"generatedAt":"test","scaffolds":{}}\n',
            encoding="utf-8",
            newline="\n",
        )
        original_research = self.research_path.read_bytes()

        _delete_scaffold(self.ctx, "base-nextjs", snapshot=False)

        self.assertEqual(self.research_path.read_bytes(), original_research)
        self.generator_mock.assert_called_once_with(self.root)

    def test_delete_rejects_malformed_research_shape_before_mutation(self) -> None:
        self.research_path.write_text("[]\n", encoding="utf-8", newline="\n")
        before = self._repo_snapshot()

        with self.assertRaisesRegex(ValueError, "scaffolds.*objekt"):
            _delete_scaffold(self.ctx, "base-nextjs", snapshot=False)

        self.assertEqual(self._repo_snapshot(), before)
        self.generator_mock.assert_not_called()

    def test_create_generator_failure_restores_generated_absence(self) -> None:
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        client_list_path.unlink()
        before = self._repo_snapshot()

        def create_projection_then_fail(_repo_root: Path) -> None:
            client_list_path.write_text("partial", encoding="utf-8", newline="\n")
            raise RuntimeError("create generator failure")

        self.generator_mock.side_effect = create_projection_then_fail
        with self.assertRaisesRegex(RuntimeError, "create generator failure"):
            self._create(["app"])

        self.assertEqual(self._repo_snapshot(), before)
        self.assertFalse(client_list_path.exists())
        self.assertFalse((self.scaffolds_dir / "new-app").exists())

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

    def test_create_tolerates_malformed_generated_projection(self) -> None:
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        malformed_client_list = client_list_path.read_text(encoding="utf-8").replace(
            "];",
            "] satisfies ReadonlyArray<ScaffoldClientListEntry>;",
        )
        client_list_path.write_text(
            malformed_client_list, encoding="utf-8", newline="\n"
        )
        self._create(["app"])

        self.assertTrue((self.scaffolds_dir / "new-app").is_dir())
        self.generator_mock.assert_called_once_with(self.root)

    def test_create_rolls_back_all_files_after_types_write_succeeds(self) -> None:
        tracked_paths = [
            self.scaffolds_dir / "types.ts",
            self.scaffolds_dir / "scaffold-client-list.generated.ts",
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
        self.generator_mock.assert_not_called()
        self.assertFalse((self.scaffolds_dir / "new-app").exists())
        self.assertFalse((self.variants_dir / "new-app").exists())
        for path, original in originals.items():
            with self.subTest(path=path):
                self.assertEqual(path.read_text(encoding="utf-8"), original)

    def test_create_rollback_continues_after_restore_failure(self) -> None:
        tracked_paths = [
            self.scaffolds_dir / "types.ts",
            self.scaffolds_dir / "scaffold-client-list.generated.ts",
            self.scaffolds_dir / "registry.ts",
            self.scaffolds_dir / "scaffold-embedding-locale.ts",
            self.schema_path,
        ]
        originals = {path: path.read_bytes() for path in tracked_paths}
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        restored_after_failure: list[Path] = []
        path_type = type(client_list_path)
        real_write_bytes = path_type.write_bytes

        def fail_client_list_restore(path: Path, data: bytes) -> int:
            if path == client_list_path:
                raise OSError("simulated client-list restore failure")
            restored_after_failure.append(path)
            return real_write_bytes(path, data)

        def corrupt_projection_and_fail(_repo_root: Path) -> None:
            client_list_path.write_text(
                "partial generated output", encoding="utf-8", newline="\n"
            )
            raise OSError("simulated generator failure")

        self.generator_mock.side_effect = corrupt_projection_and_fail

        with mock.patch.object(
            path_type,
            "write_bytes",
            autospec=True,
            side_effect=fail_client_list_restore,
        ):
            with self.assertRaisesRegex(OSError, "simulated generator failure") as raised:
                self._create(["app"])

        notes = getattr(raised.exception, "__notes__", [])
        self.assertTrue(any("ofullständig" in note for note in notes))
        self.assertTrue(
            any("simulated client-list restore failure" in note for note in notes)
        )
        self.assertNotEqual(
            client_list_path.read_bytes(), originals[client_list_path]
        )
        self.assertEqual(
            restored_after_failure,
            [*reversed(tracked_paths[2:]), tracked_paths[0]],
            "later originals must still be restored after the first restore fails",
        )
        self.assertFalse((self.scaffolds_dir / "new-app").exists())
        self.assertFalse((self.variants_dir / "new-app").exists())
        for path in tracked_paths:
            if path == client_list_path:
                continue
            with self.subTest(path=path):
                self.assertEqual(path.read_bytes(), originals[path])

    def test_create_rollback_continues_after_first_cleanup_failure(self) -> None:
        tracked_paths = [
            self.scaffolds_dir / "types.ts",
            self.scaffolds_dir / "scaffold-client-list.generated.ts",
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
        self.assertEqual(
            restore_attempts,
            [
                self.schema_path,
                self.scaffolds_dir / "scaffold-client-list.generated.ts",
                self.scaffolds_dir / "scaffold-embedding-locale.ts",
                self.scaffolds_dir / "registry.ts",
                self.scaffolds_dir / "types.ts",
            ],
        )
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

    def test_edit_updates_manifest_then_runs_generator(self) -> None:
        def assert_manifest_write_precedes_generator(_repo_root: Path) -> None:
            manifest = (
                self.scaffolds_dir / "base-nextjs" / "manifest.ts"
            ).read_text(encoding="utf-8")
            self.assertEqual(
                extract_ts_string_array_field(manifest, "allowedBuildIntents"),
                ["app"],
            )

        self.generator_mock.side_effect = assert_manifest_write_precedes_generator
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
        self.assertEqual(
            extract_ts_string_array_field(manifest, "allowedBuildIntents"), ["app"]
        )
        self.generator_mock.assert_called_once_with(self.root)

    def test_edit_rejects_invalid_intents_without_writing(self) -> None:
        manifest_path = self.scaffolds_dir / "base-nextjs" / "manifest.ts"
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        originals = (
            manifest_path.read_text(encoding="utf-8"),
            client_list_path.read_text(encoding="utf-8"),
        )

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
                self.assertEqual(
                    client_list_path.read_text(encoding="utf-8"), originals[1]
                )

    def test_edit_tolerates_arbitrary_generated_projection(self) -> None:
        manifest_path = self.scaffolds_dir / "base-nextjs" / "manifest.ts"
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        client_list_path.write_bytes(b"\xef\xbb\xbfnot valid TypeScript\r\n")

        changed = _save_scaffold_metadata(
            self.ctx,
            scaffold_id="base-nextjs",
            tags=["changed"],
            allowed_build_intents=["app"],
            prompt_hints=["Changed one", "Changed two"],
            quality_checklist=["Changed one", "Changed two", "Changed three"],
        )

        self.assertTrue(changed)
        self.assertIn(
            'allowedBuildIntents: ["app"]',
            manifest_path.read_text(encoding="utf-8"),
        )
        self.generator_mock.assert_called_once_with(self.root)

    def test_edit_restores_crlf_files_byte_exact_after_partial_write(self) -> None:
        manifest_path = self.scaffolds_dir / "base-nextjs" / "manifest.ts"
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        for path in (manifest_path, client_list_path):
            lf_text = path.read_text(encoding="utf-8")
            path.write_bytes(
                b"\xef\xbb\xbf" + lf_text.replace("\n", "\r\n").encode("utf-8")
            )
        originals = {
            manifest_path: manifest_path.read_bytes(),
            client_list_path: client_list_path.read_bytes(),
        }

        def partial_generator_failure(_repo_root: Path) -> None:
            client_list_path.write_text(
                "partial generated output", encoding="utf-8", newline="\n"
            )
            raise OSError("simulated partial generator failure")

        self.generator_mock.side_effect = partial_generator_failure
        with self.assertRaisesRegex(OSError, "simulated partial generator failure"):
            _save_scaffold_metadata(
                self.ctx,
                scaffold_id="base-nextjs",
                tags=["changed"],
                allowed_build_intents=["app"],
                prompt_hints=["Changed one", "Changed two"],
                quality_checklist=["Changed one", "Changed two", "Changed three"],
            )

        self.assertEqual(manifest_path.read_bytes(), originals[manifest_path])
        self.assertEqual(client_list_path.read_bytes(), originals[client_list_path])

    def test_edit_noop_skips_generator(self) -> None:
        changed = _save_scaffold_metadata(
            self.ctx,
            scaffold_id="base-nextjs",
            tags=["base"],
            allowed_build_intents=["website", "template"],
            prompt_hints=["First hint", "Second hint"],
            quality_checklist=["First check", "Second check", "Third check"],
        )

        self.assertFalse(changed)
        self.generator_mock.assert_not_called()

    def test_edit_generator_failure_restores_generated_absence(self) -> None:
        client_list_path = self.scaffolds_dir / "scaffold-client-list.generated.ts"
        client_list_path.unlink()

        def create_projection_then_fail(_repo_root: Path) -> None:
            client_list_path.write_text("partial", encoding="utf-8", newline="\n")
            raise RuntimeError("generator failed after create")

        self.generator_mock.side_effect = create_projection_then_fail
        with self.assertRaisesRegex(RuntimeError, "generator failed after create"):
            _save_scaffold_metadata(
                self.ctx,
                scaffold_id="base-nextjs",
                tags=["changed"],
                allowed_build_intents=["app"],
                prompt_hints=["Changed one", "Changed two"],
                quality_checklist=["Changed one", "Changed two", "Changed three"],
            )

        self.assertFalse(client_list_path.exists())


if __name__ == "__main__":
    unittest.main()
