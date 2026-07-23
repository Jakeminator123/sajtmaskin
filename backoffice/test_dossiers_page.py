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


if __name__ == "__main__":
    unittest.main()
