"""Enhetstester för de rena hjälparna i backoffice/pages/dossiers.py.

Täcker de nya etapp 5-ytorna (gruppvy-läsning, kategori-override vid
AI-kuration, guardad radering) utan Streamlit-runtime — samma disciplin som
test_validate_manifest.py. Den destruktiva raderingsvägen testas mot en
temporär katalogstruktur med monkeypatchade modulkonstanter.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backoffice.pages import dossiers as dossiers_page


class GroupViewHelpersTests(unittest.TestCase):
    GROUPS = {
        "payments": {"label": "Betalningar", "capabilities": ["payments", "subscriptions"]},
        "ai": {"label": "AI", "capabilities": ["ai-chat"]},
        "other": {"label": "Övrigt", "capabilities": []},
    }

    def test_known_capability_resolves_to_group_label(self) -> None:
        self.assertEqual(
            dossiers_page._group_label_for_capability("payments", self.GROUPS), "Betalningar"
        )

    def test_lookup_is_case_insensitive_and_trimmed(self) -> None:
        self.assertEqual(
            dossiers_page._group_label_for_capability("  PAYMENTS ", self.GROUPS), "Betalningar"
        )

    def test_unknown_or_empty_capability_falls_back_to_ovrigt(self) -> None:
        self.assertEqual(dossiers_page._group_label_for_capability("maps", self.GROUPS), "Övrigt")
        self.assertEqual(dossiers_page._group_label_for_capability("", self.GROUPS), "Övrigt")
        self.assertEqual(dossiers_page._group_label_for_capability(None, self.GROUPS), "Övrigt")

    def test_stale_detection_flags_uncovered_capability(self) -> None:
        pool = [{"capability": "payments"}, {"capability": "maps"}]
        self.assertTrue(dossiers_page._groups_view_is_stale(self.GROUPS, pool))

    def test_stale_detection_passes_when_all_covered(self) -> None:
        pool = [{"capability": "payments"}, {"capability": "ai-chat"}]
        self.assertFalse(dossiers_page._groups_view_is_stale(self.GROUPS, pool))

    def test_empty_groups_view_is_always_stale(self) -> None:
        self.assertTrue(dossiers_page._groups_view_is_stale({}, [{"capability": "payments"}]))


class DeleteDossierDirTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        (self.dossier_root / "hard" / "acme-cms").mkdir(parents=True)
        (self.dossier_root / "hard" / "acme-cms" / "manifest.json").write_text(
            json.dumps({"id": "acme-cms"}), encoding="utf-8"
        )
        patches = [
            mock.patch.object(dossiers_page, "REPO_ROOT", self.repo_root),
            mock.patch.object(dossiers_page, "DOSSIER_ROOT", self.dossier_root),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _chosen(self, **overrides) -> dict:
        base = {
            "id": "acme-cms",
            "_class": "hard",
            "_path": "data/dossiers/hard/acme-cms",
        }
        base.update(overrides)
        return base

    def test_deletes_the_walked_directory(self) -> None:
        ok, msg = dossiers_page._delete_dossier_dir(self._chosen())
        self.assertTrue(ok, msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-cms").exists())

    def test_rejects_non_kebab_id(self) -> None:
        ok, msg = dossiers_page._delete_dossier_dir(self._chosen(id="../escape"))
        self.assertFalse(ok)
        self.assertIn("Ogiltigt dossier-id", msg)
        self.assertTrue((self.dossier_root / "hard" / "acme-cms").exists())

    def test_rejects_path_outside_pool(self) -> None:
        outside = self.repo_root / "outside"
        outside.mkdir()
        ok, msg = dossiers_page._delete_dossier_dir(self._chosen(_path="outside"))
        self.assertFalse(ok)
        self.assertIn("utanför dossier-poolen", msg)
        self.assertTrue(outside.exists())

    def test_rejects_missing_path(self) -> None:
        ok, msg = dossiers_page._delete_dossier_dir(self._chosen(_path=""))
        self.assertFalse(ok)
        self.assertIn("Saknar katalogsökväg", msg)

    def test_reports_already_deleted_directory(self) -> None:
        ok1, _ = dossiers_page._delete_dossier_dir(self._chosen())
        ok2, msg2 = dossiers_page._delete_dossier_dir(self._chosen())
        self.assertTrue(ok1)
        self.assertFalse(ok2)
        self.assertIn("finns inte längre", msg2)

    def test_refuses_symlinked_dossier_dir(self) -> None:
        # The guard must run on the UNRESOLVED path — resolve() follows the
        # link, and rmtree would otherwise delete the link target (Bugbot #500).
        real_target = self.repo_root / "elsewhere"
        real_target.mkdir()
        link = self.dossier_root / "hard" / "linked-dossier"
        try:
            link.symlink_to(real_target, target_is_directory=True)
        except OSError:
            self.skipTest("symlink creation not permitted in this environment")
        ok, msg = dossiers_page._delete_dossier_dir(
            self._chosen(id="linked-dossier", _path="data/dossiers/hard/linked-dossier")
        )
        self.assertFalse(ok)
        self.assertIn("symlink", msg)
        self.assertTrue(real_target.exists())
        self.assertTrue(link.is_symlink())


class CapabilityGroupHintTests(unittest.TestCase):
    GROUPS = {
        "payments": {"label": "Betalningar", "capabilities": ["payments", "subscriptions"]},
        "ai": {"label": "AI", "capabilities": ["ai-chat", "rag-chat"]},
        "other": {"label": "Övrigt", "capabilities": []},
    }

    def test_capability_in_chosen_group_shows_chosen_group(self) -> None:
        hint = dossiers_page._describe_capability_group_hint("ai-chat", "ai", self.GROUPS)
        self.assertIn("grupp: AI", hint)

    def test_existing_capability_from_other_group_shows_real_group(self) -> None:
        # Coach regression on #500: group "AI" picked but existing `payments`
        # typed in the free field — must NOT be reported as "ny → Övrigt".
        hint = dossiers_page._describe_capability_group_hint("payments", "ai", self.GROUPS)
        self.assertIn("Betalningar", hint)
        self.assertIn("ligger kvar", hint)
        self.assertNotIn("ny capability", hint)

    def test_unknown_capability_reports_new_and_ovrigt(self) -> None:
        hint = dossiers_page._describe_capability_group_hint("map-search", "ai", self.GROUPS)
        self.assertIn("ny capability", hint)
        self.assertIn("Övrigt", hint)

    def test_no_chosen_group_still_resolves_real_group(self) -> None:
        hint = dossiers_page._describe_capability_group_hint("payments", None, self.GROUPS)
        self.assertIn("Betalningar", hint)


class RebuildCapabilityMapTests(unittest.TestCase):
    def test_keys_by_directory_name_not_manifest_id(self) -> None:
        # The canonical TS script keys dossier ids by FOLDER name; a divergent
        # manifest.id must not make the drift preview disagree with a freshly
        # regenerated file (Bugbot medium on #500, round 2).
        pool = [
            {
                "id": "renamed-in-manifest",
                "capability": " payments ",
                "_class": "hard",
                "_path": "data/dossiers/hard/stripe-checkout",
            }
        ]
        fresh = dossiers_page._rebuild_capability_map(pool)
        self.assertEqual(fresh["capabilities"], {"payments": ["stripe-checkout"]})


class ManifestClassValidationTests(unittest.TestCase):
    def test_raw_hard_manifest_requires_providers(self) -> None:
        self.assertIn(
            "hard manifests must declare a non-empty providers array",
            dossiers_page._validate_manifest({"id": "acme"}, "hard"),
        )

    def test_raw_soft_manifest_forbids_providers(self) -> None:
        self.assertIn(
            "soft manifests must not declare providers",
            dossiers_page._validate_manifest(
                {"id": "acme", "providers": ["acme"]}, "soft"
            ),
        )

    def test_raw_save_rejects_schema_invalid_provider_before_write(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            original = {
                "id": "acme",
                "label": "Acme integration",
                "capability": "payments",
                "providers": ["acme"],
                "codeFidelity": "verbatim",
                "complexity": "medium",
                "summary":
                    "A valid provider integration fixture used by the raw editor test.",
                "lastVerified": "2026-08-05",
            }
            path.write_text(json.dumps(original), encoding="utf-8")
            invalid = {**original, "providers": ["INVALID"]}
            ok, msg = dossiers_page._save_raw_manifest(
                path, invalid, dossier_class="hard"
            )
            self.assertFalse(ok)
            self.assertIn("Strict-schema", msg)
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")), original
            )


class ApplyCapabilityOverrideTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        target = self.dossier_root / "hard" / "acme-cms"
        target.mkdir(parents=True)
        self.manifest_path = target / "manifest.json"
        self.manifest_path.write_text(
            json.dumps(
                {
                    "id": "acme-cms",
                    "label": "Acme CMS",
                    "capability": "cms",
                    "codeFidelity": "rewritable",
                    "complexity": "simple",
                    "summary": "A CMS building block used for exercising the override tests.",
                    "lastVerified": "2026-07-12",
                    "providers": ["acme"],
                }
            ),
            encoding="utf-8",
        )
        patches = [
            mock.patch.object(dossiers_page, "REPO_ROOT", self.repo_root),
            mock.patch.object(dossiers_page, "DOSSIER_ROOT", self.dossier_root),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _read_capability(self) -> str:
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))["capability"]

    def test_valid_override_is_saved(self) -> None:
        ok, msg = dossiers_page._apply_capability_override("hard", "acme-cms", "content-hub")
        self.assertTrue(ok, msg)
        self.assertEqual(self._read_capability(), "content-hub")

    def test_invalid_kebab_case_is_rejected_without_saving(self) -> None:
        ok, msg = dossiers_page._apply_capability_override("hard", "acme-cms", "Not Kebab")
        self.assertFalse(ok)
        self.assertIn("kebab-case", msg)
        self.assertEqual(self._read_capability(), "cms")

    def test_hard_override_cannot_save_after_providers_are_removed(self) -> None:
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        manifest.pop("providers")
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        ok, msg = dossiers_page._apply_capability_override(
            "hard", "acme-cms", "content-hub"
        )
        self.assertFalse(ok)
        self.assertIn("providers", msg)
        self.assertEqual(self._read_capability(), "cms")

    def test_llm_set_default_flag_is_forced_false_on_override(self) -> None:
        # An LLM draft with defaultForCapability=true retargeted onto an
        # existing capability must not silently create a duplicate default
        # (Bugbot medium on #500) — the override forces false.
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        manifest["defaultForCapability"] = True
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        ok, msg = dossiers_page._apply_capability_override("hard", "acme-cms", "payments")
        self.assertTrue(ok, msg)
        saved = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["capability"], "payments")
        self.assertFalse(saved["defaultForCapability"])

    def test_strict_schema_failure_is_fail_closed(self) -> None:
        # Strict schema caps capability at 60 chars — the light pre-check does
        # not, so this exercises exactly the AJV-parity gate added after the
        # C1/C8 review findings.
        too_long = "a" * 61
        ok, msg = dossiers_page._apply_capability_override("hard", "acme-cms", too_long)
        self.assertFalse(ok)
        self.assertIn("Strict-schema", msg)
        self.assertEqual(self._read_capability(), "cms")


class SwedishLabelCoverageTests(unittest.TestCase):
    """Varje enum-värde i strict-schemat ska ha en etikett i projektionens
    ``labelsSv``-ordlista (fångar nytt mock-värde utan ord)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.projection = json.loads(
            dossiers_page.CAPABILITY_MAP_PATH.read_text(encoding="utf-8")
        )
        cls.labels = cls.projection["labelsSv"]

    def test_every_class_value_has_swedish_label(self) -> None:
        for klass in ("hard", "soft"):
            label = str((self.labels["class"].get(klass) or {}).get("label") or "").strip()
            self.assertTrue(label, f"_class-värdet {klass!r} saknar svensk etikett i projektionen")

    def test_every_mock_enum_value_has_swedish_label(self) -> None:
        schema = json.loads(
            dossiers_page.STRICT_SCHEMA_PATH.read_text(encoding="utf-8")
        )
        mock_values = schema["properties"]["mock"]["enum"]
        self.assertTrue(mock_values)
        for value in mock_values:
            label = str((self.labels["mock"].get(value) or {}).get("label") or "").strip()
            self.assertTrue(
                label,
                f"mock-värdet {value!r} saknar svensk etikett i projektionen",
            )

    def test_labels_keep_the_technical_value_in_parentheses(self) -> None:
        self.assertEqual(
            dossiers_page.class_label("hard", projection=self.projection),
            "Kopplad (hard)",
        )
        self.assertEqual(
            dossiers_page.class_label("soft", projection=self.projection),
            "Fristående (soft)",
        )
        self.assertIn("(seed)", dossiers_page.mock_label("seed", projection=self.projection))
        # Utelämnat mock-fält räknas som `none`, precis som i runtime.
        self.assertIn("(none)", dossiers_page.mock_label(None, projection=self.projection))

    def test_unknown_values_render_raw_instead_of_guessing(self) -> None:
        self.assertEqual(
            dossiers_page.class_label("weird", projection=self.projection), "weird"
        )
        self.assertEqual(
            dossiers_page.mock_label("weird", projection=self.projection), "weird"
        )

    def test_missing_projection_falls_back_to_raw_technical_value(self) -> None:
        empty = {"labelsSv": {}}
        self.assertEqual(dossiers_page.class_label("hard", projection=empty), "hard")
        self.assertEqual(dossiers_page.mock_label("seed", projection=empty), "seed")
        with mock.patch.object(
            dossiers_page, "CAPABILITY_MAP_PATH", Path("saknas-capability-map.json")
        ):
            from backoffice.pages.dossiers_lib import labels as labels_mod

            with mock.patch.object(
                labels_mod, "CAPABILITY_MAP_PATH", Path("saknas-capability-map.json")
            ):
                self.assertEqual(dossiers_page.class_label("hard"), "hard")
                self.assertEqual(dossiers_page.mock_label("seed"), "seed")

    def test_field_labels_cover_the_dossier_form_fields(self) -> None:
        from backoffice.shared import field_label

        for key in (
            "id",
            "label",
            "capability",
            "summary",
            "summarySv",
            "codeFidelity",
            "complexity",
            "defaultForCapability",
            "mock",
            "lastVerified",
        ):
            self.assertIn(f"(`{key}`)", field_label(key))


class ProjectionReaderTests(unittest.TestCase):
    """Backoffice läser etiketter/policy ur projektionen — saknad etikett ger
    tydligt fel (rått värde), aldrig tom sträng eller gissad svenska."""

    def test_missing_label_is_raw_not_empty(self) -> None:
        broken = {"labelsSv": {"class": {"hard": {"label": "   ", "hint": "x"}}}}
        self.assertEqual(dossiers_page.class_label("hard", projection=broken), "hard")
        self.assertNotEqual(dossiers_page.class_label("hard", projection=broken), "")

    def test_mockless_exceptions_come_from_policy_node(self) -> None:
        projection = {
            "policy": {"mocklessCapabilityExceptions": ["analytics", "extra-cap"]}
        }
        self.assertEqual(
            dossiers_page._load_mockless_capability_exceptions(projection),
            frozenset({"analytics", "extra-cap"}),
        )

    def test_broken_policy_is_fail_closed_empty_set(self) -> None:
        self.assertEqual(
            dossiers_page._load_mockless_capability_exceptions({"policy": {}}),
            frozenset(),
        )
        self.assertEqual(
            dossiers_page._load_mockless_capability_exceptions({}),
            frozenset(),
        )

    def test_missing_policy_on_disk_refreshes_before_fail_closed(self) -> None:
        # Äldre projektion utan policy-nod ska synkas — inte tyst neka analytics.
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stale = {"capabilities": {}, "dossiers": [], "groups": {}, "f2Policy": {}}
        refreshed = {
            "policy": {"mocklessCapabilityExceptions": ["analytics"]},
            "labelsSv": {},
            "dossiers": [],
            "groups": {},
            "f2Policy": {},
        }
        with mock.patch.object(
            dossiers_io, "_load_json", return_value=stale
        ), mock.patch.object(
            dossiers_page,
            "_ensure_capability_map_current",
            return_value=(refreshed, None),
        ) as ensure:
            self.assertEqual(
                dossiers_page._load_mockless_capability_exceptions(),
                frozenset({"analytics"}),
            )
            ensure.assert_called_once()

    def test_requires_f3_reads_projection_for_saved_dossier(self) -> None:
        projection = {
            "dossiers": [
                {"id": "acme", "buildServerRequirement": True},
                {"id": "lite", "buildServerRequirement": False},
            ]
        }
        self.assertTrue(
            dossiers_page.requires_f3({"id": "acme"}, projection=projection)
        )
        self.assertFalse(
            dossiers_page.requires_f3({"id": "lite"}, projection=projection)
        )

    def test_requires_f3_draft_without_projection_entry_uses_local_rule(self) -> None:
        # Ospart utkast — id saknas i projektionen ⇒ lokal draft-regel.
        projection = {"dossiers": []}
        self.assertTrue(
            dossiers_page.requires_f3(
                {"id": "draft-new", "envVars": [{"key": "K"}]},
                projection=projection,
            )
        )
        self.assertFalse(
            dossiers_page.requires_f3(
                {"id": "draft-new", "envVars": [{"key": "K", "enforcement": "warn-only"}]},
                projection=projection,
            )
        )


class IsDefaultForCapabilityTests(unittest.TestCase):
    """Strikt `is True`, samma regel som scripts/dossiers/validate-all.ts:117.
    Läses fältet med en rå truthiness-koll blir UI:t osant mot CI: en sträng från
    rå-JSON-vägen ger en bock listan visar men valideraren inte ser, och en
    ikryssad ruta vars nästa sparning skriver ett äkta `true`."""

    def test_only_boolean_true_counts(self) -> None:
        self.assertTrue(
            dossiers_page.is_default_for_capability({"defaultForCapability": True})
        )
        for value in ("false", "true", 1, "1", [], {}, None, False, 0):
            self.assertFalse(
                dossiers_page.is_default_for_capability(
                    {"defaultForCapability": value}
                ),
                repr(value),
            )

    def test_missing_field_and_missing_manifest_are_false(self) -> None:
        self.assertFalse(dossiers_page.is_default_for_capability({}))
        self.assertFalse(dossiers_page.is_default_for_capability(None))


class SchemaEnumParityTests(unittest.TestCase):
    """Editorns val-listor ska komma ur strict-schemat, inte ur en handskriven
    kopia som driftar tyst när schemat får ett nytt värde."""

    def _schema_enum(self, field: str) -> tuple[str, ...]:
        schema = json.loads(
            dossiers_page.STRICT_SCHEMA_PATH.read_text(encoding="utf-8")
        )
        return tuple(schema["properties"][field]["enum"])

    def test_options_match_the_strict_schema(self) -> None:
        self.assertEqual(dossiers_page._MOCK_OPTIONS, self._schema_enum("mock"))
        self.assertEqual(
            dossiers_page._COMPLEXITY_OPTIONS, self._schema_enum("complexity")
        )

    def test_unreadable_schema_falls_back_instead_of_emptying_the_form(self) -> None:
        with mock.patch.object(
            dossiers_page, "STRICT_SCHEMA_PATH", Path("saknas-helt.json")
        ):
            self.assertEqual(
                dossiers_page._schema_enum("mock", dossiers_page._MOCK_FALLBACK),
                dossiers_page._MOCK_FALLBACK,
            )


class RequiresF3Tests(unittest.TestCase):
    """Tredje axeln för OSPARADE utkast: lokal draft-regel när id saknas i
    projektionen. Sparade dossiers läses via ``buildServerRequirement`` (se
    ``ProjectionReaderTests``)."""

    def test_build_enforced_key_requires_f3(self) -> None:
        manifest = {"envVars": [{"key": "K", "enforcement": "build"}]}
        self.assertTrue(dossiers_page.requires_f3(manifest, projection={"dossiers": []}))

    def test_omitted_enforcement_counts_as_build(self) -> None:
        # Samma default som DossierEnvVarEnforcement i types.ts.
        self.assertTrue(
            dossiers_page.requires_f3(
                {"envVars": [{"key": "K"}]}, projection={"dossiers": []}
            )
        )

    def test_server_file_requires_f3_even_without_build_keys(self) -> None:
        manifest = {
            "envVars": [{"key": "K", "enforcement": "feature-runtime"}],
            "files": [{"path": "components/api/contact/route.ts", "role": "server"}],
        }
        self.assertTrue(dossiers_page.requires_f3(manifest, projection={"dossiers": []}))

    def test_hard_dossier_can_be_done_in_f2(self) -> None:
        # Kopplad + demoläge, men varken build-nyckel eller serverfil
        # (analytics-mönstret) ⇒ inget F3-steg behövs.
        manifest = {
            "envVars": [{"key": "K", "enforcement": "warn-only"}],
            "files": [{"path": "components/analytics.tsx", "role": "client"}],
            "mock": "none",
        }
        self.assertFalse(dossiers_page.requires_f3(manifest, projection={"dossiers": []}))

    def test_missing_and_malformed_fields_do_not_crash(self) -> None:
        empty = {"dossiers": []}
        self.assertFalse(dossiers_page.requires_f3({}, projection=empty))
        self.assertFalse(
            dossiers_page.requires_f3({"envVars": None, "files": None}, projection=empty)
        )
        self.assertFalse(
            dossiers_page.requires_f3({"envVars": ["rå-sträng"]}, projection=empty)
        )


class CreateDossierSkeletonTests(unittest.TestCase):
    """C5/C6-grinden: skelettet passerar strict-schemat, ogiltig indata
    skriver ingenting, och en befintlig katalog skrivs aldrig över."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        patches = [
            mock.patch.object(dossiers_page, "REPO_ROOT", self.repo_root),
            mock.patch.object(dossiers_page, "DOSSIER_ROOT", self.dossier_root),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _create(self, target_class: str = "hard", target_id: str = "acme-maps", **overrides):
        kwargs: dict[str, object] = {
            "label": "Acme Maps",
            "capability": "map-display",
            "summary": "An interactive map building block used to exercise the skeleton tests.",
            "mock": "visual",
            "providers": ["acme"],
        }
        if target_class == "soft":
            kwargs["providers"] = None
        kwargs.update(overrides)
        return dossiers_page._create_dossier_skeleton(target_class, target_id, **kwargs)

    def _assert_nothing_written(self) -> None:
        self.assertFalse(
            self.dossier_root.exists(),
            "fail-closed bruten: något skrevs trots ogiltig indata",
        )

    def test_valid_skeleton_is_written_and_passes_strict_schema(self) -> None:
        ok, msg = self._create()
        self.assertTrue(ok, msg)
        target = self.dossier_root / "hard" / "acme-maps"
        manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
        # Grinden i C6: det genererade manifestet är grönt mot det RIKTIGA
        # strict-schemat (STRICT_SCHEMA_PATH pekar på repots schema).
        from backoffice.shared import validate_json_against_schema

        self.assertEqual(
            validate_json_against_schema(manifest, dossiers_page.STRICT_SCHEMA_PATH), []
        )
        self.assertEqual(manifest["id"], "acme-maps")
        self.assertEqual(manifest["mock"], "visual")
        self.assertEqual(manifest["providers"], ["acme"])
        instructions = (target / "instructions.md").read_text(encoding="utf-8")
        # De två H1-rubriker som `dossiers:validate-all` kräver.
        self.assertIn("# When to use", instructions)
        self.assertIn("# How to integrate", instructions)

    def test_skeleton_manifest_is_written_with_lf_newlines(self) -> None:
        # Windows Path.write_text defaults to CRLF without newline="\n"; that
        # desyncs capability-map sourceFiles hashes vs Git/CI LF normalization.
        ok, msg = self._create()
        self.assertTrue(ok, msg)
        raw = (self.dossier_root / "hard" / "acme-maps" / "manifest.json").read_bytes()
        self.assertNotIn(b"\r\n", raw, "manifest must be LF-only for capability-map hashes")
        self.assertTrue(raw.endswith(b"\n"))

    def test_invalid_id_is_rejected_before_any_write(self) -> None:
        for bad_id in ("Not Kebab", "a", "-leading", "trailing-", "a" * 61, ""):
            ok, msg = self._create(target_id=bad_id)
            self.assertFalse(ok, bad_id)
            self.assertIn("kebab-case", msg)
        self._assert_nothing_written()

    def test_invalid_capability_is_rejected_before_any_write(self) -> None:
        for bad_cap in ("Not Kebab", "x", "a" * 61):
            ok, msg = self._create(capability=bad_cap)
            self.assertFalse(ok, bad_cap)
            self.assertIn("kebab-case", msg)
        self._assert_nothing_written()

    def test_invalid_class_is_rejected_before_any_write(self) -> None:
        ok, msg = self._create(target_class="medium")
        self.assertFalse(ok)
        self.assertIn("Ogiltig klass", msg)
        self._assert_nothing_written()

    def test_hard_without_demo_mode_is_rejected(self) -> None:
        for mock_value in (None, "none"):
            ok, msg = self._create(capability="payments", mock=mock_value)
            self.assertFalse(ok, str(mock_value))
            self.assertIn("demoläge", msg.lower())
        self._assert_nothing_written()

    def test_hard_without_provider_is_rejected(self) -> None:
        ok, msg = self._create(providers=None)
        self.assertFalse(ok)
        self.assertIn("provider-id", msg)
        self._assert_nothing_written()

    def test_soft_provider_is_rejected_instead_of_written(self) -> None:
        ok, msg = self._create(
            target_class="soft",
            target_id="faq-block",
            mock=None,
            providers=["acme"],
        )
        self.assertFalse(ok)
        self.assertIn("får inte deklarera providers", msg)
        self._assert_nothing_written()

    def test_hard_exception_capability_may_skip_demo_mode(self) -> None:
        ok, msg = self._create(
            target_id="acme-analytics", capability="analytics", mock=None
        )
        self.assertTrue(ok, msg)
        manifest = json.loads(
            (self.dossier_root / "hard" / "acme-analytics" / "manifest.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertNotIn("mock", manifest)

    def test_soft_skeleton_needs_no_demo_mode(self) -> None:
        ok, msg = self._create(target_class="soft", target_id="faq-block", mock=None)
        self.assertTrue(ok, msg)
        self.assertTrue(
            (self.dossier_root / "soft" / "faq-block" / "manifest.json").is_file()
        )

    def test_strict_schema_failure_blocks_creation(self) -> None:
        # summary < 30 tecken passerar den lätta pre-checken (fältet finns) men
        # fälls av strict-schemats minLength — beviset för att strict-schemat
        # är grönt FÖRE skrivning.
        ok, msg = self._create(summary="too short")
        self.assertFalse(ok)
        self.assertIn("Strict-schema", msg)
        self._assert_nothing_written()

    def test_existing_directory_is_never_overwritten(self) -> None:
        target = self.dossier_root / "hard" / "acme-maps"
        target.mkdir(parents=True)
        sentinel = target / "manifest.json"
        sentinel.write_text('{"id": "original"}', encoding="utf-8")
        ok, msg = self._create()
        self.assertFalse(ok)
        self.assertIn("finns redan", msg)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), '{"id": "original"}')
        self.assertFalse((target / "instructions.md").exists())

    def test_second_default_for_the_same_capability_blocks_creation(self) -> None:
        existing = self.dossier_root / "soft" / "acme-map-lite"
        existing.mkdir(parents=True)
        (existing / "manifest.json").write_text(
            json.dumps(
                {
                    "id": "acme-map-lite",
                    "capability": "map-display",
                    "defaultForCapability": True,
                }
            ),
            encoding="utf-8",
        )
        ok, msg = self._create(default_for_capability=True)
        self.assertFalse(ok)
        self.assertIn("Standardval", msg)
        self.assertIn("acme-map-lite", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-maps").exists())

    def test_failed_write_rolls_back_instead_of_blocking_the_id(self) -> None:
        # Ett avbrott mellan de två skrivningarna får inte lämna en katalog kvar:
        # den skulle rapporteras som "finns redan" vid nästa försök och därmed
        # låsa id:t för ett byggblock som aldrig blev skapat.
        original_write_text = Path.write_text

        def failing_second_write(self: Path, *args: object, **kwargs: object):
            if self.name == "instructions.md":
                raise OSError("simulerat diskfel")
            return original_write_text(self, *args, **kwargs)  # type: ignore[arg-type]

        with mock.patch.object(Path, "write_text", failing_second_write):
            ok, msg = self._create()
        self.assertFalse(ok)
        self.assertIn("simulerat diskfel", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-maps").exists())
        # Och id:t är fortfarande ledigt.
        ok, msg = self._create()
        self.assertTrue(ok, msg)


class ApplyManifestFieldEditsTests(unittest.TestCase):
    """C4-grinden: fält-formulärets skrivväg går genom samma fail-closed-kedja
    (_validate_manifest → strict-schema → demoläges-regeln → backup + skriv)."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        self.manifest_path = self._write_manifest("hard", "acme-cms", "cms")
        self.original = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        # DOSSIER_ROOT måste med: Standardval-grinden scannar syskonmanifest på
        # disk, och utan patchen skulle den läsa repots riktiga pool.
        patches = [
            mock.patch.object(dossiers_page, "REPO_ROOT", self.repo_root),
            mock.patch.object(dossiers_page, "DOSSIER_ROOT", self.dossier_root),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _write_manifest(
        self, dossier_class: str, dossier_id: str, capability: str, **extra: object
    ) -> Path:
        target = self.repo_root / "data" / "dossiers" / dossier_class / dossier_id
        target.mkdir(parents=True)
        path = target / "manifest.json"
        manifest = {
            "id": dossier_id,
            "label": "Acme CMS",
            "capability": capability,
            "codeFidelity": "rewritable",
            "complexity": "simple",
            "summary": "A CMS building block used for exercising the field-edit tests.",
            "lastVerified": "2026-07-12",
            **extra,
        }
        if dossier_class == "hard" and "providers" not in extra:
            manifest["providers"] = ["acme"]
        path.write_text(json.dumps(manifest), encoding="utf-8")
        return path

    def _saved(self, path: Path | None = None) -> dict:
        return json.loads((path or self.manifest_path).read_text(encoding="utf-8"))

    def test_valid_edit_is_saved(self) -> None:
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path,
            {
                "label": "Acme CMS v2",
                "complexity": "medium",
                "mock": "seed",
                "summarySv": "Ett CMS-byggblock för svenska katalogtexten.",
            },
            dossier_class="hard",
        )
        self.assertTrue(ok, msg)
        saved = self._saved()
        self.assertEqual(saved["label"], "Acme CMS v2")
        self.assertEqual(saved["complexity"], "medium")
        self.assertEqual(saved["mock"], "seed")

    def test_none_removes_an_optional_field(self) -> None:
        # Fristående (soft) dossier: demoläget är valfritt, så borttagningen
        # visar att ``None`` faktiskt plockar bort fältet.
        path = self._write_manifest("soft", "acme-tabell", "data-table")
        ok, msg = dossiers_page._apply_manifest_field_edits(
            path, {"mock": "seed"}, dossier_class="soft"
        )
        self.assertTrue(ok, msg)
        ok, msg = dossiers_page._apply_manifest_field_edits(
            path, {"mock": None}, dossier_class="soft"
        )
        self.assertTrue(ok, msg)
        self.assertNotIn("mock", self._saved(path))

    def test_hard_may_not_lose_its_demolage(self) -> None:
        # Samma regel som skapa-formuläret: utan den kunde redigera-vägen
        # skriva ett tillstånd som `npm run dossiers:validate-all` fäller.
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path, {"mock": "seed"}, dossier_class="hard"
        )
        self.assertTrue(ok, msg)
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path, {"mock": None}, dossier_class="hard"
        )
        self.assertFalse(ok)
        self.assertIn("demoläge", msg)
        self.assertEqual(self._saved()["mock"], "seed")

    def test_hard_may_not_lose_provider_ownership(self) -> None:
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path,
            {"mock": "seed", "providers": None},
            dossier_class="hard",
        )
        self.assertFalse(ok)
        self.assertIn("providers", msg)
        self.assertEqual(self._saved(), self.original)

    def test_soft_may_not_gain_provider_ownership(self) -> None:
        path = self._write_manifest(
            "soft", "acme-tabell", "data-table", providers=["acme"]
        )
        before = self._saved(path)
        ok, msg = dossiers_page._apply_manifest_field_edits(
            path, {"label": "Acme Tabell"}, dossier_class="soft"
        )
        self.assertFalse(ok)
        self.assertIn("providers", msg)
        self.assertEqual(self._saved(path), before)

    def test_hard_on_the_exception_list_may_have_no_demolage(self) -> None:
        # Undantagslistan läses ur validate-manifest.ts — samma källa som
        # skapa-vägen och runtime.
        capability = sorted(dossiers_page._load_mockless_capability_exceptions())[0]
        path = self._write_manifest("hard", "acme-matning", capability)
        ok, msg = dossiers_page._apply_manifest_field_edits(
            path, {"label": "Acme Mätning"}, dossier_class="hard"
        )
        self.assertTrue(ok, msg)
        self.assertNotIn("mock", self._saved(path))

    def test_second_default_for_the_same_capability_is_refused(self) -> None:
        # Kors-manifest-kravet syns bara för dossiers:validate-all; varken
        # strict-schemat eller _validate_manifest ser syskonen.
        self._write_manifest(
            "soft", "acme-cms-lite", "cms", defaultForCapability=True, mock="seed"
        )
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path,
            {"mock": "seed", "defaultForCapability": True},
            dossier_class="hard",
        )
        self.assertFalse(ok)
        self.assertIn("Standardval", msg)
        self.assertIn("acme-cms-lite", msg)
        self.assertNotIn("defaultForCapability", self._saved())

    def test_non_boolean_sibling_flag_does_not_count_as_default(self) -> None:
        # Valideraren räknar strikt `=== true`. En sträng (möjlig via
        # rå-JSON-vägen) får inte göra grinden strängare än CI.
        self._write_manifest(
            "soft", "acme-cms-strang", "cms", defaultForCapability="false", mock="seed"
        )
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path,
            {"mock": "seed", "defaultForCapability": True},
            dossier_class="hard",
        )
        self.assertTrue(ok, msg)
        self.assertTrue(self._saved()["defaultForCapability"])

    def test_keeping_your_own_default_flag_is_allowed(self) -> None:
        # Sig själv räknas inte som syskon — annars kunde en dossier som redan
        # är Standardval aldrig redigeras igen.
        path = self._write_manifest(
            "soft", "acme-enda", "search", defaultForCapability=True
        )
        ok, msg = dossiers_page._apply_manifest_field_edits(
            path,
            {"label": "Acme Enda", "defaultForCapability": True},
            dossier_class="soft",
        )
        self.assertTrue(ok, msg)
        self.assertTrue(self._saved(path)["defaultForCapability"])

    def test_light_validation_failure_is_fail_closed(self) -> None:
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path, {"complexity": "gigantic"}, dossier_class="hard"
        )
        self.assertFalse(ok)
        self.assertIn("Validering misslyckades", msg)
        self.assertEqual(self._saved(), self.original)

    def test_strict_schema_failure_is_fail_closed(self) -> None:
        # summarySv < 20 tecken passerar den lätta pre-checken men fälls av
        # strict-schemats minLength.
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path, {"summarySv": "för kort"}, dossier_class="hard"
        )
        self.assertFalse(ok)
        self.assertIn("Strict-schema", msg)
        self.assertEqual(self._saved(), self.original)

    def test_unreadable_manifest_is_fail_closed(self) -> None:
        self.manifest_path.write_text("{trasig json", encoding="utf-8")
        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path, {"label": "Ny"}, dossier_class="hard"
        )
        self.assertFalse(ok)
        self.assertIn("Kunde inte läsa", msg)


class PromoteProspectCapabilityGateTests(unittest.TestCase):
    """Capability-match-gaten i `_promote_prospect` (backlog A#14, #419):
    ett utkast vars manifest.capability driftat från plan-postens
    targetCapability får inte promotas in i live-poolen. Gaten ligger före
    manifest-/strict-schema-valideringen, så testerna behöver bara minimala
    manifests och skriver aldrig till någon live-pool."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        draft = self.root / "legacy-1" / "_v2-draft"
        draft.mkdir(parents=True)
        (draft / "manifest.json").write_text(
            json.dumps({"id": "acme-pay", "capability": "payments"}), encoding="utf-8"
        )

    def _entry(self, **overrides: object) -> dict[str, object]:
        entry: dict[str, object] = {
            "legacyId": "legacy-1",
            "targetClass": "hard",
            "targetId": "acme-pay",
            "targetCapability": "payments",
        }
        entry.update(overrides)
        return entry

    def test_capability_mismatch_blocks_promotion(self) -> None:
        ok, msg = dossiers_page._promote_prospect(
            self.root, self._entry(targetCapability="database"), force=False
        )
        self.assertFalse(ok)
        self.assertIn("targetCapability", msg)

    def test_capability_match_is_case_insensitive_and_trimmed(self) -> None:
        # Matchar gaten (normaliserad jämförelse) → faller vidare till den
        # vanliga manifest-valideringen, som failar på det minimala manifestet
        # av ANDRA skäl. Poängen: inget capability-fel.
        ok, msg = dossiers_page._promote_prospect(
            self.root, self._entry(targetCapability="  PAYMENTS "), force=False
        )
        self.assertFalse(ok)
        self.assertNotIn("targetCapability", msg)

    def test_missing_plan_capability_skips_gate(self) -> None:
        # Äldre plan-poster utan targetCapability ska inte blockeras av gaten.
        ok, msg = dossiers_page._promote_prospect(
            self.root, self._entry(targetCapability=None), force=False
        )
        self.assertFalse(ok)
        self.assertNotIn("targetCapability", msg)

    def test_hard_draft_without_provider_is_rejected(self) -> None:
        ok, msg = dossiers_page._promote_prospect(
            self.root, self._entry(), force=False
        )
        self.assertFalse(ok)
        self.assertIn("providers", msg)

    def test_soft_draft_with_provider_is_rejected(self) -> None:
        manifest_path = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["providers"] = ["acme"]
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        ok, msg = dossiers_page._promote_prospect(
            self.root, self._entry(targetClass="soft"), force=False
        )
        self.assertFalse(ok)
        self.assertIn("soft manifests must not declare providers", msg)


if __name__ == "__main__":
    unittest.main()
