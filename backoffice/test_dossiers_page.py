"""Enhetstester för de rena hjälparna i backoffice/pages/dossiers.py.

Täcker de nya etapp 5-ytorna (gruppvy-läsning, kategori-override vid
AI-kuration, guardad radering) utan Streamlit-runtime — samma disciplin som
test_validate_manifest.py. Den destruktiva raderingsvägen testas mot en
temporär katalogstruktur med monkeypatchade modulkonstanter.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from backoffice.pages import dossiers as dossiers_page


class GroupViewHelpersTests(unittest.TestCase):
    GROUPS = {
        "payments": {
            "label": "Betalningar",
            "capabilities": ["payments", "subscriptions"],
        },
        "ai": {"label": "AI", "capabilities": ["ai-chat"]},
        "other": {"label": "Övrigt", "capabilities": []},
    }

    def test_known_capability_resolves_to_group_label(self) -> None:
        self.assertEqual(
            dossiers_page._group_label_for_capability("payments", self.GROUPS),
            "Betalningar",
        )

    def test_lookup_is_case_insensitive_and_trimmed(self) -> None:
        self.assertEqual(
            dossiers_page._group_label_for_capability("  PAYMENTS ", self.GROUPS),
            "Betalningar",
        )

    def test_unknown_or_empty_capability_falls_back_to_ovrigt(self) -> None:
        self.assertEqual(
            dossiers_page._group_label_for_capability("maps", self.GROUPS), "Övrigt"
        )
        self.assertEqual(
            dossiers_page._group_label_for_capability("", self.GROUPS), "Övrigt"
        )
        self.assertEqual(
            dossiers_page._group_label_for_capability(None, self.GROUPS), "Övrigt"
        )

    def test_stale_detection_flags_uncovered_capability(self) -> None:
        pool = [{"capability": "payments"}, {"capability": "maps"}]
        self.assertTrue(dossiers_page._groups_view_is_stale(self.GROUPS, pool))

    def test_stale_detection_passes_when_all_covered(self) -> None:
        pool = [{"capability": "payments"}, {"capability": "ai-chat"}]
        self.assertFalse(dossiers_page._groups_view_is_stale(self.GROUPS, pool))

    def test_empty_groups_view_is_always_stale(self) -> None:
        self.assertTrue(
            dossiers_page._groups_view_is_stale({}, [{"capability": "payments"}])
        )


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
            mock.patch.object(dossiers_page, "HARD_ROOT", self.dossier_root / "hard"),
            mock.patch.object(dossiers_page, "SOFT_ROOT", self.dossier_root / "soft"),
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

    def _write_hard_manifest(
        self, dossier_id: str, *, capability: str, is_default: bool
    ) -> Path:
        target = self.dossier_root / "hard" / dossier_id
        target.mkdir(parents=True, exist_ok=True)
        path = target / "manifest.json"
        path.write_text(
            json.dumps(
                {
                    "id": dossier_id,
                    "label": "Acme CMS",
                    "capability": capability,
                    "codeFidelity": "rewritable",
                    "complexity": "simple",
                    "summary": "A CMS building block used by the guarded deletion tests.",
                    "lastVerified": "2026-08-11",
                    "providers": ["acme"],
                    "mock": "seed",
                    "defaultForCapability": is_default,
                }
            ),
            encoding="utf-8",
        )
        return path

    def _run_killed_delete(self, phase: str) -> subprocess.CompletedProcess[str]:
        script = r"""
import os
import sys
from pathlib import Path

from backoffice.pages import dossiers as page
from backoffice.pages.dossiers_lib import io

root = Path(sys.argv[1])
phase = sys.argv[2]
page.REPO_ROOT = root
page.DOSSIER_ROOT = root / "data" / "dossiers"
page.HARD_ROOT = page.DOSSIER_ROOT / "hard"
page.SOFT_ROOT = page.DOSSIER_ROOT / "soft"

if phase == "after-successor":
    original_save = io._save_json
    def kill_after_successor(path, data):
        original_save(path, data)
        if path.parent.name == "beta-cms":
            os._exit(71)
    io._save_json = kill_after_successor
elif phase == "after-quarantine":
    original_rmtree = io.shutil.rmtree
    def kill_before_quarantine_delete(path, *args, **kwargs):
        if ".backoffice-delete-" in Path(path).name:
            os._exit(72)
        return original_rmtree(path, *args, **kwargs)
    io.shutil.rmtree = kill_before_quarantine_delete
elif phase == "after-delete":
    original_recovery = io._recover_pending_default_transaction_locked
    calls = 0
    def kill_before_journal_clear():
        global calls
        calls += 1
        if calls == 2:
            os._exit(73)
        return original_recovery()
    io._recover_pending_default_transaction_locked = kill_before_journal_clear

page._delete_dossier_dir(
    {
        "id": "acme-cms",
        "_class": "hard",
        "_path": "data/dossiers/hard/acme-cms",
    },
    replacement_default_path=page.DOSSIER_ROOT / "hard" / "beta-cms" / "manifest.json",
)
os._exit(90)
"""
        return subprocess.run(
            [sys.executable, "-c", script, str(self.repo_root), phase],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )

    def _assert_single_cms_default(self) -> None:
        defaults = []
        for manifest_path in self.dossier_root.glob("*/*/manifest.json"):
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if (
                manifest.get("capability") == "cms"
                and manifest.get("defaultForCapability") is True
            ):
                defaults.append(manifest_path.parent.name)
        self.assertEqual(len(defaults), 1, defaults)

    def test_process_kill_after_successor_write_recovers_by_rollback(self) -> None:
        self._write_hard_manifest("acme-cms", capability="cms", is_default=True)
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)

        result = self._run_killed_delete("after-successor")
        self.assertEqual(result.returncode, 71, result.stderr)
        self.assertTrue((self.dossier_root / "hard" / "acme-cms").exists())
        self.assertTrue(json.loads(successor.read_text())["defaultForCapability"])

        ok, msg = dossiers_page._recover_pending_default_transaction()
        self.assertTrue(ok, msg)
        self._assert_single_cms_default()
        self.assertFalse(json.loads(successor.read_text())["defaultForCapability"])

    def test_process_kill_after_quarantine_rename_recovers_by_rollforward(self) -> None:
        self._write_hard_manifest("acme-cms", capability="cms", is_default=True)
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)

        result = self._run_killed_delete("after-quarantine")
        self.assertEqual(result.returncode, 72, result.stderr)
        self.assertFalse((self.dossier_root / "hard" / "acme-cms").exists())

        ok, msg = dossiers_page._recover_pending_default_transaction()
        self.assertTrue(ok, msg)
        self._assert_single_cms_default()
        self.assertTrue(json.loads(successor.read_text())["defaultForCapability"])

    def test_process_kill_after_quarantine_delete_recovers_committed_state(
        self,
    ) -> None:
        self._write_hard_manifest("acme-cms", capability="cms", is_default=True)
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)

        result = self._run_killed_delete("after-delete")
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertFalse((self.dossier_root / "hard" / "acme-cms").exists())

        ok, msg = dossiers_page._recover_pending_default_transaction()
        self.assertTrue(ok, msg)
        self._assert_single_cms_default()
        self.assertTrue(json.loads(successor.read_text())["defaultForCapability"])

    def test_semantically_invalid_journal_blocks_without_writing_live_files(
        self,
    ) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        primary = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        primary_before = primary.read_bytes()
        successor_before = successor.read_bytes()
        invalid = {
            "version": 1,
            "operation": "manifest-handoff",
            "capability": "cms",
            "primary": dossiers_io._manifest_transaction_entry(
                primary,
                dossier_class="hard",
                original=primary_before,
                desired=primary_before,
            ),
            "successor": dossiers_io._manifest_transaction_entry(
                successor,
                dossier_class="hard",
                original=successor_before,
                desired=successor_before,
            ),
        }
        journal_ok, journal_msg = dossiers_io._write_default_transaction_journal(
            invalid
        )
        self.assertTrue(journal_ok, journal_msg)

        ok, msg = dossiers_page._recover_pending_default_transaction()

        self.assertFalse(ok)
        self.assertIn("skapar inget Standardval", msg)
        self.assertEqual(primary.read_bytes(), primary_before)
        self.assertEqual(successor.read_bytes(), successor_before)

    def test_same_target_journal_blocks_before_any_recovery_write(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        primary = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        primary_before = primary.read_bytes()
        primary_false = json.loads(primary_before.decode("utf-8"))
        primary_false["defaultForCapability"] = False
        false_bytes = dossiers_io._json_bytes(primary_false)
        same_target = {
            "version": 1,
            "operation": "manifest-handoff",
            "capability": "cms",
            "primary": dossiers_io._manifest_transaction_entry(
                primary,
                dossier_class="hard",
                original=primary_before,
                desired=false_bytes,
            ),
            "successor": dossiers_io._manifest_transaction_entry(
                primary,
                dossier_class="hard",
                original=false_bytes,
                desired=primary_before,
            ),
        }
        journal_ok, journal_msg = dossiers_io._write_default_transaction_journal(
            same_target
        )
        self.assertTrue(journal_ok, journal_msg)

        ok, msg = dossiers_page._recover_pending_default_transaction()

        self.assertFalse(ok)
        self.assertIn("samma manifest", msg)
        self.assertEqual(primary.read_bytes(), primary_before)

    def test_recovery_never_deletes_tampered_quarantine(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        primary = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)
        primary_before = primary.read_bytes()
        successor_before = successor.read_bytes()
        successor_manifest = json.loads(successor_before.decode("utf-8"))
        successor_manifest["defaultForCapability"] = True
        successor_desired = dossiers_io._json_bytes(successor_manifest)
        source_tree, snapshot_error = dossiers_io._tree_byte_snapshot(primary.parent)
        self.assertIsNone(snapshot_error)
        assert source_tree is not None
        transaction_root, root_error = dossiers_io._transaction_root()
        self.assertIsNone(root_error)
        assert transaction_root is not None
        quarantine = (
            transaction_root
            / "_acme-cms.backoffice-delete-0123456789abcdef0123456789abcdef"
        )
        journal = {
            "version": 1,
            "operation": "delete-handoff",
            "capability": "cms",
            "primary": dossiers_io._manifest_transaction_entry(
                primary,
                dossier_class="hard",
                original=primary_before,
                desired=primary_before,
            ),
            "successor": dossiers_io._manifest_transaction_entry(
                successor,
                dossier_class="hard",
                original=successor_before,
                desired=successor_desired,
            ),
            "quarantine": quarantine.name,
            "quarantineTreeSha256": dossiers_io._tree_snapshot_digest(source_tree),
        }
        journal_ok, journal_msg = dossiers_io._write_default_transaction_journal(
            journal
        )
        self.assertTrue(journal_ok, journal_msg)
        dossiers_io._atomic_replace_bytes(successor, successor_desired)
        primary.parent.rename(quarantine)
        marker = quarantine / "tampered-after-crash.txt"
        marker.write_text("do not delete", encoding="utf-8")

        ok, msg = dossiers_page._recover_pending_default_transaction()

        self.assertTrue(ok, msg)
        self.assertIn("ändrad/osäker", msg)
        self.assertTrue(marker.exists())
        self.assertFalse(primary.parent.exists())
        self._assert_single_cms_default()

    def test_deletes_the_walked_directory(self) -> None:
        ok, msg = dossiers_page._delete_dossier_dir(self._chosen())
        self.assertTrue(ok, msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-cms").exists())

    def test_refuses_to_delete_default_when_multiple_hard_siblings_would_remain(
        self,
    ) -> None:
        selected = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        self._write_hard_manifest("beta-cms", capability="cms", is_default=False)
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)

        with mock.patch("backoffice.pages.dossiers_lib.io.backup_tree") as backup:
            ok, msg = dossiers_page._delete_dossier_dir(self._chosen())

        self.assertFalse(ok)
        self.assertIn("Standardvalsregeln", msg)
        self.assertIn("no resolvable default demo", msg)
        self.assertTrue(selected.parent.exists())
        backup.assert_not_called()

    def test_deletes_with_atomic_default_handoff(self) -> None:
        self._write_hard_manifest("acme-cms", capability="cms", is_default=True)
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)

        ok, msg = dossiers_page._delete_dossier_dir(
            self._chosen(), replacement_default_path=successor
        )

        self.assertTrue(ok, msg)
        self.assertIn("beständig crash-recovery", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-cms").exists())
        self.assertTrue(
            json.loads(successor.read_text(encoding="utf-8"))["defaultForCapability"]
        )

    def test_delete_writes_successor_before_quarantining_primary(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        primary = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)
        events: list[str] = []
        quarantine_targets: list[Path] = []
        original_save_json = dossiers_io._save_json
        original_rename = Path.rename

        def record_save(path: Path, data: dict) -> None:
            if path == successor:
                events.append("successor")
            original_save_json(path, data)

        def record_rename(path: Path, target: Path) -> Path:
            if path == primary.parent:
                events.append("quarantine")
                quarantine_targets.append(target)
            return original_rename(path, target)

        with (
            mock.patch.object(dossiers_io, "_save_json", side_effect=record_save),
            mock.patch.object(Path, "rename", record_rename),
        ):
            ok, msg = dossiers_page._delete_dossier_dir(
                self._chosen(), replacement_default_path=successor
            )

        self.assertTrue(ok, msg)
        self.assertEqual(events[:2], ["successor", "quarantine"])
        self.assertEqual(len(quarantine_targets), 1)
        transaction_root = (
            self.repo_root / "data" / "backoffice" / "staging" / "dossiers"
        )
        self.assertEqual(
            quarantine_targets[0].parent.resolve(), transaction_root.resolve()
        )
        self.assertNotIn(
            self.dossier_root.resolve(), quarantine_targets[0].resolve().parents
        )

    def test_partial_quarantine_delete_restores_primary_tree_and_successor_bytes(
        self,
    ) -> None:
        import shutil

        primary_manifest = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        primary_dir = primary_manifest.parent
        (primary_dir / "instructions.md").write_bytes(b"instructions\r\nexact\n")
        component = primary_dir / "components" / "widget.tsx"
        component.parent.mkdir()
        component.write_bytes(b"export const x = 1;\r\n")
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)

        def tree_bytes(root: Path) -> dict[str, bytes | None]:
            return {
                path.relative_to(root).as_posix(): None
                if path.is_dir()
                else path.read_bytes()
                for path in sorted(root.rglob("*"))
            }

        primary_before = tree_bytes(primary_dir)
        successor_before = successor.read_bytes()
        original_rmtree = shutil.rmtree

        def partially_delete_then_fail(path: object, *args: object, **kwargs: object):
            target = Path(path)  # type: ignore[arg-type]
            if ".backoffice-delete-" in target.name:
                victim = next(
                    candidate for candidate in target.rglob("*") if candidate.is_file()
                )
                victim.unlink()
                raise OSError("simulerad partiell quarantine-radering")
            return original_rmtree(path, *args, **kwargs)  # type: ignore[arg-type]

        with mock.patch(
            "backoffice.pages.dossiers_lib.io.shutil.rmtree",
            partially_delete_then_fail,
        ):
            ok, msg = dossiers_page._delete_dossier_dir(
                self._chosen(), replacement_default_path=successor
            )

        self.assertFalse(ok)
        self.assertIn("återställdes byte-exakt", msg)
        self.assertEqual(tree_bytes(primary_dir), primary_before)
        self.assertEqual(successor.read_bytes(), successor_before)

    def test_rename_keyboard_interrupt_rolls_back_then_reraises(self) -> None:
        primary = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)
        primary_before = primary.read_bytes()
        successor_before = successor.read_bytes()
        original_rename = Path.rename

        def rename_then_interrupt(path: Path, target: Path) -> Path:
            result = original_rename(path, target)
            if path == primary.parent:
                raise KeyboardInterrupt()
            return result

        with mock.patch.object(Path, "rename", rename_then_interrupt):
            with self.assertRaises(KeyboardInterrupt):
                dossiers_page._delete_dossier_dir(
                    self._chosen(), replacement_default_path=successor
                )

        self.assertEqual(primary.read_bytes(), primary_before)
        self.assertEqual(successor.read_bytes(), successor_before)

    def test_partial_delete_keyboard_interrupt_restores_then_reraises(self) -> None:
        import shutil

        primary = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)
        primary_before = primary.read_bytes()
        successor_before = successor.read_bytes()
        original_rmtree = shutil.rmtree

        def partially_delete_then_interrupt(
            path: object, *args: object, **kwargs: object
        ) -> None:
            target = Path(path)  # type: ignore[arg-type]
            if ".backoffice-delete-" in target.name:
                next(
                    candidate for candidate in target.rglob("*") if candidate.is_file()
                ).unlink()
                raise KeyboardInterrupt()
            original_rmtree(path, *args, **kwargs)  # type: ignore[arg-type]

        with mock.patch(
            "backoffice.pages.dossiers_lib.io.shutil.rmtree",
            partially_delete_then_interrupt,
        ):
            with self.assertRaises(KeyboardInterrupt):
                dossiers_page._delete_dossier_dir(
                    self._chosen(), replacement_default_path=successor
                )

        self.assertEqual(primary.read_bytes(), primary_before)
        self.assertEqual(successor.read_bytes(), successor_before)

    def test_partial_delete_rollback_restores_primary_default_before_successor(
        self,
    ) -> None:
        import shutil

        primary = self._write_hard_manifest(
            "acme-cms", capability="cms", is_default=True
        )
        successor = self._write_hard_manifest(
            "beta-cms", capability="cms", is_default=False
        )
        self._write_hard_manifest("gamma-cms", capability="cms", is_default=False)
        events: list[str] = []
        original_rmtree = shutil.rmtree
        original_unpack_archive = shutil.unpack_archive
        from backoffice.pages.dossiers_lib import io as dossiers_io

        original_atomic_replace = dossiers_io._atomic_replace_bytes

        def partially_delete_then_fail(
            path: object, *args: object, **kwargs: object
        ) -> None:
            target = Path(path)  # type: ignore[arg-type]
            if ".backoffice-delete-" in target.name:
                next(
                    candidate for candidate in target.rglob("*") if candidate.is_file()
                ).unlink()
                raise OSError("simulerad partiell quarantine-radering")
            original_rmtree(path, *args, **kwargs)  # type: ignore[arg-type]

        def record_unpack(*args: object, **kwargs: object) -> None:
            events.append("primary")
            original_unpack_archive(*args, **kwargs)  # type: ignore[arg-type]

        def record_write(path: Path, content: bytes) -> None:
            if path == successor:
                events.append("successor")
            original_atomic_replace(path, content)

        with (
            mock.patch(
                "backoffice.pages.dossiers_lib.io.shutil.rmtree",
                partially_delete_then_fail,
            ),
            mock.patch(
                "backoffice.pages.dossiers_lib.io.shutil.unpack_archive",
                record_unpack,
            ),
            mock.patch.object(dossiers_io, "_atomic_replace_bytes", record_write),
        ):
            ok, msg = dossiers_page._delete_dossier_dir(
                self._chosen(), replacement_default_path=successor
            )

        self.assertFalse(ok)
        self.assertIn("återställdes byte-exakt", msg)
        self.assertEqual(events[-2:], ["primary", "successor"])
        self.assertTrue(
            json.loads(primary.read_text(encoding="utf-8"))["defaultForCapability"]
        )
        self.assertFalse(
            json.loads(successor.read_text(encoding="utf-8"))["defaultForCapability"]
        )

    def test_allows_deleting_default_when_only_one_hard_sibling_remains(self) -> None:
        self._write_hard_manifest("acme-cms", capability="cms", is_default=True)
        self._write_hard_manifest("beta-cms", capability="cms", is_default=False)

        ok, msg = dossiers_page._delete_dossier_dir(self._chosen())

        self.assertTrue(ok, msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-cms").exists())
        self.assertTrue((self.dossier_root / "hard" / "beta-cms").exists())

    def test_rejects_non_kebab_id(self) -> None:
        ok, msg = dossiers_page._delete_dossier_dir(self._chosen(id="../escape"))
        self.assertFalse(ok)
        self.assertIn("Ogiltigt dossier-id", msg)
        self.assertTrue((self.dossier_root / "hard" / "acme-cms").exists())

    def test_rejects_different_valid_chosen_id_for_walked_directory(self) -> None:
        ok, msg = dossiers_page._delete_dossier_dir(self._chosen(id="other-cms"))

        self.assertFalse(ok)
        self.assertIn("matchar inte", msg)
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
        "payments": {
            "label": "Betalningar",
            "capabilities": ["payments", "subscriptions"],
        },
        "ai": {"label": "AI", "capabilities": ["ai-chat", "rag-chat"]},
        "other": {"label": "Övrigt", "capabilities": []},
    }

    def test_capability_in_chosen_group_shows_chosen_group(self) -> None:
        hint = dossiers_page._describe_capability_group_hint(
            "ai-chat", "ai", self.GROUPS
        )
        self.assertIn("grupp: AI", hint)

    def test_existing_capability_from_other_group_shows_real_group(self) -> None:
        # Coach regression on #500: group "AI" picked but existing `payments`
        # typed in the free field — must NOT be reported as "ny → Övrigt".
        hint = dossiers_page._describe_capability_group_hint(
            "payments", "ai", self.GROUPS
        )
        self.assertIn("Betalningar", hint)
        self.assertIn("ligger kvar", hint)
        self.assertNotIn("ny capability", hint)

    def test_unknown_capability_reports_new_and_ovrigt(self) -> None:
        hint = dossiers_page._describe_capability_group_hint(
            "map-search", "ai", self.GROUPS
        )
        self.assertIn("ny capability", hint)
        self.assertIn("Övrigt", hint)

    def test_no_chosen_group_still_resolves_real_group(self) -> None:
        hint = dossiers_page._describe_capability_group_hint(
            "payments", None, self.GROUPS
        )
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
            repo_root = Path(tmp)
            dossier_root = repo_root / "data" / "dossiers"
            path = dossier_root / "hard" / "acme" / "manifest.json"
            path.parent.mkdir(parents=True)
            original = {
                "id": "acme",
                "label": "Acme integration",
                "capability": "payments",
                "providers": ["acme"],
                "codeFidelity": "verbatim",
                "complexity": "medium",
                "summary": "A valid provider integration fixture used by the raw editor test.",
                "lastVerified": "2026-08-05",
            }
            path.write_text(json.dumps(original), encoding="utf-8")
            invalid = {**original, "providers": ["INVALID"]}
            with (
                mock.patch.object(dossiers_page, "REPO_ROOT", repo_root),
                mock.patch.object(dossiers_page, "DOSSIER_ROOT", dossier_root),
            ):
                ok, msg = dossiers_page._save_raw_manifest(
                    path, invalid, dossier_class="hard"
                )
            self.assertFalse(ok)
            self.assertIn("Strict-schema", msg)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), original)


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
            mock.patch.object(dossiers_page, "HARD_ROOT", self.dossier_root / "hard"),
            mock.patch.object(dossiers_page, "SOFT_ROOT", self.dossier_root / "soft"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _read_capability(self) -> str:
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))["capability"]

    def test_valid_override_is_saved(self) -> None:
        ok, msg = dossiers_page._apply_capability_override(
            self.manifest_path, "hard", "content-hub"
        )
        self.assertTrue(ok, msg)
        self.assertEqual(self._read_capability(), "content-hub")

    def test_invalid_kebab_case_is_rejected_without_saving(self) -> None:
        ok, msg = dossiers_page._apply_capability_override(
            self.manifest_path, "hard", "Not Kebab"
        )
        self.assertFalse(ok)
        self.assertIn("kebab-case", msg)
        self.assertEqual(self._read_capability(), "cms")

    def test_hard_override_cannot_save_after_providers_are_removed(self) -> None:
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        manifest.pop("providers")
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        ok, msg = dossiers_page._apply_capability_override(
            self.manifest_path, "hard", "content-hub"
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
        ok, msg = dossiers_page._apply_capability_override(
            self.manifest_path, "hard", "payments"
        )
        self.assertTrue(ok, msg)
        saved = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["capability"], "payments")
        self.assertFalse(saved["defaultForCapability"])

    def test_override_cannot_orphan_old_hard_capability_family(self) -> None:
        current = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        current["defaultForCapability"] = True
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        for dossier_id in ("beta-cms", "gamma-cms"):
            sibling = self.dossier_root / "hard" / dossier_id
            sibling.mkdir(parents=True)
            (sibling / "manifest.json").write_text(
                json.dumps(
                    {
                        "id": dossier_id,
                        "capability": "cms",
                        "defaultForCapability": False,
                    }
                ),
                encoding="utf-8",
            )

        ok, msg = dossiers_page._apply_capability_override(
            self.manifest_path, "hard", "payments"
        )

        self.assertFalse(ok)
        self.assertIn("Standardvalsregeln", msg)
        saved = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["capability"], "cms")
        self.assertTrue(saved["defaultForCapability"])

    def test_override_transfers_old_family_default_atomically(self) -> None:
        current = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        current.update({"defaultForCapability": True, "mock": "seed"})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        sibling_paths: list[Path] = []
        for dossier_id in ("beta-cms", "gamma-cms"):
            sibling_path = self.dossier_root / "hard" / dossier_id / "manifest.json"
            sibling_path.parent.mkdir(parents=True)
            sibling_path.write_text(
                json.dumps(
                    {
                        **current,
                        "id": dossier_id,
                        "label": f"{dossier_id} integration",
                        "defaultForCapability": False,
                    }
                ),
                encoding="utf-8",
            )
            sibling_paths.append(sibling_path)

        ok, msg = dossiers_page._apply_capability_override(
            self.manifest_path,
            "hard",
            "payments",
            replacement_default_path=sibling_paths[0],
        )

        self.assertTrue(ok, msg)
        saved = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["capability"], "payments")
        self.assertFalse(saved["defaultForCapability"])
        successor = json.loads(sibling_paths[0].read_text(encoding="utf-8"))
        self.assertTrue(successor["defaultForCapability"])

    def test_strict_schema_failure_is_fail_closed(self) -> None:
        # Strict schema caps capability at 60 chars — the light pre-check does
        # not, so this exercises exactly the AJV-parity gate added after the
        # C1/C8 review findings.
        too_long = "a" * 61
        ok, msg = dossiers_page._apply_capability_override(
            self.manifest_path, "hard", too_long
        )
        self.assertFalse(ok)
        self.assertIn("Strict-schema", msg)
        self.assertEqual(self._read_capability(), "cms")

    def test_mismatched_primary_id_never_mutates_matching_sibling(self) -> None:
        mismatched_path = self.dossier_root / "hard" / "foo" / "manifest.json"
        mismatched_path.parent.mkdir(parents=True)
        mismatched_path.write_text(
            self.manifest_path.read_text(encoding="utf-8"), encoding="utf-8"
        )
        real_original = self.manifest_path.read_bytes()
        mismatched_original = mismatched_path.read_bytes()

        ok, msg = dossiers_page._apply_capability_override(
            mismatched_path, "hard", "content-hub"
        )

        self.assertFalse(ok)
        self.assertIn("id, katalog och klass", msg)
        self.assertEqual(self.manifest_path.read_bytes(), real_original)
        self.assertEqual(mismatched_path.read_bytes(), mismatched_original)

    def test_partial_override_write_restores_original_bytes(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        original = self.manifest_path.read_bytes()

        def truncate_then_fail(path: Path, _data: dict[str, object]) -> None:
            path.write_bytes(b'{"partial":')
            raise OSError("simulerad trunkering")

        with mock.patch.object(dossiers_io, "_save_json", truncate_then_fail):
            ok, msg = dossiers_page._apply_capability_override(
                self.manifest_path, "hard", "content-hub"
            )

        self.assertFalse(ok)
        self.assertIn("byte-exakt", msg)
        self.assertEqual(self.manifest_path.read_bytes(), original)

    def test_override_backup_failure_is_fail_closed(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        original = self.manifest_path.read_bytes()
        with mock.patch.object(dossiers_io, "backup_file", return_value=None):
            ok, msg = dossiers_page._apply_capability_override(
                self.manifest_path, "hard", "content-hub"
            )

        self.assertFalse(ok)
        self.assertIn("säkerhetskopiera", msg)
        self.assertEqual(self.manifest_path.read_bytes(), original)


class RunCurateFinalizeTests(unittest.TestCase):
    """Backoffice curate must publish under the mutation lock and re-apply capability."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        patches = [
            mock.patch.object(dossiers_page, "REPO_ROOT", self.repo_root),
            mock.patch.object(dossiers_page, "DOSSIER_ROOT", self.dossier_root),
            mock.patch.object(dossiers_page, "HARD_ROOT", self.dossier_root / "hard"),
            mock.patch.object(dossiers_page, "SOFT_ROOT", self.dossier_root / "soft"),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def test_parse_curate_stage_path_reads_marker(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self.repo_root / "data" / "backoffice" / "staging" / "dossiers" / "_x.curate-stage-1"
        output = f"noise\nSTAGE_PATH={stage}\n[curate] stage-only — skipped live publish\n"
        self.assertEqual(dossiers_io._parse_curate_stage_path(output), stage)
        self.assertIsNone(dossiers_io._parse_curate_stage_path("no marker here"))

    def test_run_curate_finalizes_under_lock_and_applies_capability(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self.repo_root / "_acme-pay.curate-stage-abc"
        stage.mkdir(parents=True)
        lock_holder = mock.Mock()

        def fake_run(cmd, **_kwargs):
            self.assertIn("--stage-only", cmd)
            self.assertIn("--capability=content-hub", cmd)
            return mock.Mock(
                returncode=0,
                stdout=f"STAGE_PATH={stage}\n",
                stderr="",
            )

        def fake_finalize(staged_dir, target_class, target_id, capability="", *, force=False):
            lock_holder()
            self.assertEqual(staged_dir, stage)
            self.assertEqual(target_class, "hard")
            self.assertEqual(target_id, "acme-pay")
            self.assertEqual(capability, "content-hub")
            self.assertFalse(force)
            return True, "publicerad"

        with (
            mock.patch.object(dossiers_io.subprocess, "run", side_effect=fake_run),
            mock.patch.object(
                dossiers_io, "_finalize_curated_dossier", side_effect=fake_finalize
            ) as finalize,
        ):
            ok, msg = dossiers_io._run_curate(
                "ref-repo", "hard", "acme-pay", "model-x", "content-hub"
            )

        self.assertTrue(ok, msg)
        self.assertIn("publicerad", msg)
        finalize.assert_called_once()
        lock_holder.assert_called_once()

    def test_run_curate_fails_closed_without_stage_marker(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        with (
            mock.patch.object(
                dossiers_io.subprocess,
                "run",
                return_value=mock.Mock(returncode=0, stdout="ok but no marker\n", stderr=""),
            ),
            mock.patch.object(dossiers_io, "_finalize_curated_dossier") as finalize,
        ):
            ok, msg = dossiers_io._run_curate("ref-repo", "hard", "acme-pay")

        self.assertFalse(ok)
        self.assertIn("STAGE_PATH", msg)
        finalize.assert_not_called()

    def test_finalize_applies_capability_override_after_commit(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self.repo_root / "_acme-pay.curate-stage-abc"
        manifest = self.dossier_root / "hard" / "acme-pay" / "manifest.json"

        with (
            mock.patch.object(
                dossiers_io,
                "_commit_curated_dossier_stage",
                return_value=(True, "Publicerade kurations-stage"),
            ) as commit,
            mock.patch.object(
                dossiers_io,
                "_apply_capability_override",
                return_value=(True, "ok"),
            ) as override,
        ):
            ok, msg = dossiers_io._finalize_curated_dossier(
                stage, "hard", "acme-pay", "content-hub"
            )

        self.assertTrue(ok, msg)
        self.assertIn("capability='content-hub'", msg)
        commit.assert_called_once_with(stage, "hard", "acme-pay", force=False)
        override.assert_called_once_with(manifest, "hard", "content-hub")

    def test_finalize_reports_override_failure_without_hiding_publish(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self.repo_root / "_acme-pay.curate-stage-abc"
        with (
            mock.patch.object(
                dossiers_io,
                "_commit_curated_dossier_stage",
                return_value=(True, "Publicerade kurations-stage"),
            ),
            mock.patch.object(
                dossiers_io,
                "_apply_capability_override",
                return_value=(False, "Strict-schema misslyckades"),
            ),
        ):
            ok, msg = dossiers_io._finalize_curated_dossier(
                stage, "hard", "acme-pay", "content-hub"
            )

        self.assertTrue(ok)
        self.assertIn("KUNDE INTE sätta vald capability", msg)
        self.assertIn("Strict-schema misslyckades", msg)

    def test_finalize_waits_on_mutation_lock(self) -> None:
        import time
        from contextlib import contextmanager

        from backoffice.pages.dossiers_lib import io as dossiers_io
        from backoffice.shared_lib.repo_lock import repo_mutation_lock

        stage = self.repo_root / "_acme-pay.curate-stage-abc"
        ready = self.repo_root / "lock-ready"
        real_lock = repo_mutation_lock
        holder = subprocess.Popen(
            [
                sys.executable,
                "-c",
                "\n".join(
                    [
                        "import sys, time",
                        "from pathlib import Path",
                        "from backoffice.shared_lib.repo_lock import repo_mutation_lock",
                        "root, ready = Path(sys.argv[1]), Path(sys.argv[2])",
                        "with repo_mutation_lock(root, 'dossiers', timeout_seconds=2):",
                        "    ready.write_text('locked', encoding='utf-8')",
                        "    time.sleep(1.0)",
                    ]
                ),
                str(self.repo_root),
                str(ready),
            ],
            cwd=Path(__file__).resolve().parents[1],
        )
        self.addCleanup(lambda: holder.poll() is None and holder.kill())
        deadline = time.monotonic() + 3
        while (
            not ready.exists()
            and holder.poll() is None
            and time.monotonic() < deadline
        ):
            time.sleep(0.02)
        self.assertTrue(ready.exists(), f"lock holder exited with {holder.poll()}")

        @contextmanager
        def short_timeout_lock(
            repo_root: Path,
            name: str,
            *,
            timeout_seconds: float = 15.0,
            poll_seconds: float = 0.05,
        ):
            with real_lock(
                repo_root,
                name,
                timeout_seconds=0.2,
                poll_seconds=poll_seconds,
            ):
                yield

        with mock.patch.object(dossiers_io, "repo_mutation_lock", short_timeout_lock):
            ok, msg = dossiers_io._finalize_curated_dossier(
                stage, "hard", "acme-pay", "content-hub"
            )

        self.assertFalse(ok)
        self.assertIn("annan Backoffice-process", msg)
        self.assertEqual(holder.wait(timeout=3), 0)


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
            label = str(
                (self.labels["class"].get(klass) or {}).get("label") or ""
            ).strip()
            self.assertTrue(
                label, f"_class-värdet {klass!r} saknar svensk etikett i projektionen"
            )

    def test_every_mock_enum_value_has_swedish_label(self) -> None:
        schema = json.loads(
            dossiers_page.STRICT_SCHEMA_PATH.read_text(encoding="utf-8")
        )
        mock_values = schema["properties"]["mock"]["enum"]
        self.assertTrue(mock_values)
        for value in mock_values:
            label = str(
                (self.labels["mock"].get(value) or {}).get("label") or ""
            ).strip()
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
        self.assertIn(
            "(seed)", dossiers_page.mock_label("seed", projection=self.projection)
        )
        # Utelämnat mock-fält räknas som `none`, precis som i runtime.
        self.assertIn(
            "(none)", dossiers_page.mock_label(None, projection=self.projection)
        )

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
        with (
            mock.patch.object(dossiers_io, "_load_json", return_value=stale),
            mock.patch.object(
                dossiers_page,
                "_ensure_capability_map_current",
                return_value=(refreshed, None),
            ) as ensure,
        ):
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
                {
                    "id": "draft-new",
                    "envVars": [{"key": "K", "enforcement": "warn-only"}],
                },
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
        self.assertTrue(
            dossiers_page.requires_f3(manifest, projection={"dossiers": []})
        )

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
        self.assertTrue(
            dossiers_page.requires_f3(manifest, projection={"dossiers": []})
        )

    def test_hard_dossier_can_be_done_in_f2(self) -> None:
        # Kopplad + demoläge, men varken build-nyckel eller serverfil
        # (analytics-mönstret) ⇒ inget F3-steg behövs.
        manifest = {
            "envVars": [{"key": "K", "enforcement": "warn-only"}],
            "files": [{"path": "components/analytics.tsx", "role": "client"}],
            "mock": "none",
        }
        self.assertFalse(
            dossiers_page.requires_f3(manifest, projection={"dossiers": []})
        )

    def test_missing_and_malformed_fields_do_not_crash(self) -> None:
        empty = {"dossiers": []}
        self.assertFalse(dossiers_page.requires_f3({}, projection=empty))
        self.assertFalse(
            dossiers_page.requires_f3(
                {"envVars": None, "files": None}, projection=empty
            )
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

    def _create(
        self, target_class: str = "hard", target_id: str = "acme-maps", **overrides
    ):
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

    def _write_hard_sibling(self, dossier_id: str, *, valid: bool = True) -> Path:
        target = self.dossier_root / "hard" / dossier_id
        target.mkdir(parents=True)
        manifest = {
            "id": dossier_id,
            "label": "Sibling Maps",
            "capability": "map-display",
            "codeFidelity": "rewritable",
            "complexity": "simple",
            "summary": "A sibling map building block used by the creation guard tests.",
            "lastVerified": "2026-08-11",
            "mock": "visual",
            "defaultForCapability": False,
        }
        if valid:
            manifest["providers"] = ["sibling"]
        path = target / "manifest.json"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        return path

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
        self.assertNotIn(
            b"\r\n", raw, "manifest must be LF-only for capability-map hashes"
        )
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

    def test_non_default_creation_cannot_make_hard_family_unresolvable(self) -> None:
        self._write_hard_sibling("sibling-maps")

        ok, msg = self._create(default_for_capability=False)

        self.assertFalse(ok)
        self.assertIn("Standardvalsregeln", msg)
        self.assertIn("no resolvable default demo", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-maps").exists())

    def test_readable_invalid_sibling_is_deliberately_fail_closed(self) -> None:
        # CI excludes this provider-less hard manifest from its cross-manifest
        # pass after reporting the schema error. Backoffice is intentionally
        # stricter inside the affected family: repair/remove the damaged sibling
        # before changing its default ownership.
        self._write_hard_sibling("broken-maps", valid=False)

        ok, msg = self._create(default_for_capability=False)

        self.assertFalse(ok)
        self.assertIn("Standardvalsregeln", msg)
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

    def test_keyboard_interrupt_after_first_write_rolls_back_and_reraises(self) -> None:
        original_write_text = Path.write_text

        def interrupt_second_write(self: Path, *args: object, **kwargs: object):
            if self.name == "instructions.md":
                raise KeyboardInterrupt()
            return original_write_text(self, *args, **kwargs)  # type: ignore[arg-type]

        with mock.patch.object(Path, "write_text", interrupt_second_write):
            with self.assertRaises(KeyboardInterrupt):
                self._create()

        self.assertFalse((self.dossier_root / "hard" / "acme-maps").exists())


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

    def _run_killed_manifest_handoff(
        self, phase: str, successor: Path
    ) -> subprocess.CompletedProcess[str]:
        script = r"""
import os
import sys
from pathlib import Path

from backoffice.pages import dossiers as page
from backoffice.pages.dossiers_lib import io

root = Path(sys.argv[1])
phase = sys.argv[2]
page.REPO_ROOT = root
page.DOSSIER_ROOT = root / "data" / "dossiers"
page.HARD_ROOT = page.DOSSIER_ROOT / "hard"
page.SOFT_ROOT = page.DOSSIER_ROOT / "soft"
primary = page.HARD_ROOT / "acme-cms" / "manifest.json"
successor = page.HARD_ROOT / "beta-cms" / "manifest.json"

if phase == "after-successor":
    original_save = io._save_json
    def kill_after_successor(path, data):
        original_save(path, data)
        if path == successor:
            os._exit(81)
    io._save_json = kill_after_successor
elif phase == "after-primary":
    original_recovery = io._recover_pending_default_transaction_locked
    calls = 0
    def kill_before_journal_clear():
        global calls
        calls += 1
        if calls == 2:
            os._exit(82)
        return original_recovery()
    io._recover_pending_default_transaction_locked = kill_before_journal_clear

page._apply_manifest_field_edits(
    primary,
    {"mock": "seed", "defaultForCapability": False},
    dossier_class="hard",
    replacement_default_path=successor,
)
os._exit(90)
"""
        return subprocess.run(
            [sys.executable, "-c", script, str(self.repo_root), phase],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )

    def test_process_kill_mid_manifest_handoff_recovers_by_rollback(self) -> None:
        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successor = self._write_manifest(
            "hard", "beta-cms", "cms", mock="seed", defaultForCapability=False
        )

        result = self._run_killed_manifest_handoff("after-successor", successor)
        self.assertEqual(result.returncode, 81, result.stderr)
        ok, msg = dossiers_page._recover_pending_default_transaction()
        self.assertTrue(ok, msg)
        self.assertTrue(self._saved()["defaultForCapability"])
        self.assertFalse(self._saved(successor)["defaultForCapability"])

    def test_process_kill_after_complete_manifest_handoff_keeps_commit(self) -> None:
        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successor = self._write_manifest(
            "hard", "beta-cms", "cms", mock="seed", defaultForCapability=False
        )

        result = self._run_killed_manifest_handoff("after-primary", successor)
        self.assertEqual(result.returncode, 82, result.stderr)
        ok, msg = dossiers_page._recover_pending_default_transaction()
        self.assertTrue(ok, msg)
        self.assertFalse(self._saved()["defaultForCapability"])
        self.assertTrue(self._saved(successor)["defaultForCapability"])

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

    def test_partial_edit_write_restores_original_bytes(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        original = self.manifest_path.read_bytes()

        def truncate_then_fail(path: Path, _data: dict[str, object]) -> None:
            path.write_bytes(b'{"partial":')
            raise OSError("simulerad trunkering")

        with mock.patch.object(dossiers_io, "_save_json", truncate_then_fail):
            ok, msg = dossiers_page._apply_manifest_field_edits(
                self.manifest_path,
                {"label": "Ny etikett", "mock": "seed"},
                dossier_class="hard",
            )

        self.assertFalse(ok)
        self.assertIn("byte-exakt", msg)
        self.assertEqual(self.manifest_path.read_bytes(), original)

    def test_edit_backup_failure_is_fail_closed(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        original = self.manifest_path.read_bytes()
        with mock.patch.object(dossiers_io, "backup_file", return_value=None):
            ok, msg = dossiers_page._apply_manifest_field_edits(
                self.manifest_path,
                {"label": "Ny etikett", "mock": "seed"},
                dossier_class="hard",
            )

        self.assertFalse(ok)
        self.assertIn("säkerhetskopiera", msg)
        self.assertEqual(self.manifest_path.read_bytes(), original)

    def test_raw_partial_write_restores_original_bytes(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        original = self.manifest_path.read_bytes()
        edited = {**self._saved(), "label": "Rå ny etikett"}

        def truncate_then_fail(path: Path, _data: dict[str, object]) -> None:
            path.write_bytes(b'{"partial":')
            raise OSError("simulerad trunkering")

        with mock.patch.object(dossiers_io, "_save_json", truncate_then_fail):
            ok, msg = dossiers_page._save_raw_manifest(
                self.manifest_path, edited, dossier_class="hard"
            )

        self.assertFalse(ok)
        self.assertIn("byte-exakt", msg)
        self.assertEqual(self.manifest_path.read_bytes(), original)

    def test_raw_backup_failure_is_fail_closed(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        original = self.manifest_path.read_bytes()
        edited = {**self._saved(), "label": "Rå ny etikett"}
        with mock.patch.object(dossiers_io, "backup_file", return_value=None):
            ok, msg = dossiers_page._save_raw_manifest(
                self.manifest_path, edited, dossier_class="hard"
            )

        self.assertFalse(ok)
        self.assertIn("säkerhetskopiera", msg)
        self.assertEqual(self.manifest_path.read_bytes(), original)

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

    def test_hard_default_cannot_be_unchecked_when_multiple_dossiers_need_it(
        self,
    ) -> None:
        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        self._write_manifest(
            "hard", "beta-cms", "cms", mock="seed", defaultForCapability=False
        )

        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path,
            {"mock": "seed", "defaultForCapability": False},
            dossier_class="hard",
        )

        self.assertFalse(ok)
        self.assertIn("Standardvalsregeln", msg)
        self.assertIn("no resolvable default demo", msg)
        self.assertTrue(self._saved()["defaultForCapability"])

    def test_default_is_transferred_to_sibling_in_one_save(self) -> None:
        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successor_path = self._write_manifest(
            "hard", "beta-cms", "cms", mock="seed", defaultForCapability=False
        )

        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path,
            {"mock": "seed", "defaultForCapability": False},
            dossier_class="hard",
            replacement_default_path=successor_path,
        )

        self.assertTrue(ok, msg)
        self.assertFalse(self._saved()["defaultForCapability"])
        self.assertTrue(self._saved(successor_path)["defaultForCapability"])

    def test_handoff_rejects_primary_change_after_caller_snapshot(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successor_path = self._write_manifest(
            "hard", "beta-cms", "cms", mock="seed", defaultForCapability=False
        )
        external = {**current, "label": "Extern ändring"}

        def mutate_after_read() -> set[str]:
            self.manifest_path.write_text(json.dumps(external), encoding="utf-8")
            return {"cms"}

        with mock.patch.object(
            dossiers_io,
            "_load_mockless_capability_exceptions",
            side_effect=mutate_after_read,
        ):
            ok, msg = dossiers_page._apply_manifest_field_edits(
                self.manifest_path,
                {"mock": "seed", "defaultForCapability": False},
                dossier_class="hard",
                replacement_default_path=successor_path,
            )

        self.assertFalse(ok)
        self.assertIn("ändrades efter", msg)
        self.assertEqual(self._saved(), external)
        self.assertFalse(self._saved(successor_path)["defaultForCapability"])

    def test_concurrent_handoffs_cannot_leave_duplicate_defaults(self) -> None:
        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successors = [
            self._write_manifest(
                "hard", dossier_id, "cms", mock="seed", defaultForCapability=False
            )
            for dossier_id in ("beta-cms", "gamma-cms")
        ]
        barrier = threading.Barrier(3)
        results: list[tuple[bool, str]] = []

        def transfer(successor_path: Path) -> None:
            barrier.wait()
            results.append(
                dossiers_page._apply_manifest_field_edits(
                    self.manifest_path,
                    {"mock": "seed", "defaultForCapability": False},
                    dossier_class="hard",
                    replacement_default_path=successor_path,
                )
            )

        threads = [
            threading.Thread(target=transfer, args=(path,)) for path in successors
        ]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=5)

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(sum(ok for ok, _msg in results), 1, results)
        defaults = [
            path.parent.name
            for path in successors
            if self._saved(path).get("defaultForCapability") is True
        ]
        self.assertEqual(len(defaults), 1, defaults)
        self.assertFalse(self._saved()["defaultForCapability"])

    def test_cas_rejects_external_change_before_single_manifest_write(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        external = {**self._saved(), "label": "Extern ändring", "mock": "seed"}

        def race(*_args: object, **_kwargs: object) -> list[str]:
            self.manifest_path.write_text(json.dumps(external), encoding="utf-8")
            return []

        with mock.patch.object(
            dossiers_io, "_default_invariant_errors_after_change", side_effect=race
        ):
            ok, msg = dossiers_page._apply_manifest_field_edits(
                self.manifest_path,
                {"label": "Backoffice-ändring", "mock": "seed"},
                dossier_class="hard",
            )

        self.assertFalse(ok)
        self.assertIn("ändrades medan redigeringen", msg)
        self.assertEqual(self._saved(), external)

    def test_mismatched_folder_id_is_never_offered_or_accepted_as_successor(
        self,
    ) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successor_path = self._write_manifest(
            "hard", "other-cms", "cms", mock="seed", defaultForCapability=False
        )
        mismatched_path = successor_path.parent.parent / "beta-cms" / "manifest.json"
        mismatched_path.parent.mkdir(parents=True)
        successor_path.replace(mismatched_path)

        candidates = dossiers_io._default_handoff_candidates(
            self.manifest_path, dossier_class="hard"
        )
        self.assertNotIn(mismatched_path, [path for _id, path in candidates])

        ok, msg = dossiers_page._apply_manifest_field_edits(
            self.manifest_path,
            {"mock": "seed", "defaultForCapability": False},
            dossier_class="hard",
            replacement_default_path=mismatched_path,
        )

        self.assertFalse(ok)
        self.assertIn("manifest.id matchar inte katalognamnet", msg)
        self.assertTrue(self._saved()["defaultForCapability"])
        self.assertFalse(self._saved(mismatched_path)["defaultForCapability"])

    def test_default_handoff_rolls_back_both_when_second_write_fails(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successor_path = self._write_manifest(
            "hard", "beta-cms", "cms", mock="seed", defaultForCapability=False
        )
        original_save_json = dossiers_io._save_json

        def fail_primary_write(path: Path, data: dict[str, object]) -> None:
            if path == self.manifest_path:
                raise OSError("simulerat andra-skrivningsfel")
            original_save_json(path, data)

        with mock.patch.object(dossiers_io, "_save_json", fail_primary_write):
            ok, msg = dossiers_page._apply_manifest_field_edits(
                self.manifest_path,
                {"mock": "seed", "defaultForCapability": False},
                dossier_class="hard",
                replacement_default_path=successor_path,
            )

        self.assertFalse(ok)
        self.assertIn("båda manifesten rullades tillbaka", msg)
        self.assertTrue(self._saved()["defaultForCapability"])
        self.assertFalse(self._saved(successor_path)["defaultForCapability"])

    def test_default_handoff_rolls_back_then_reraises_keyboard_interrupt(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        current = self._saved()
        current.update({"mock": "seed", "defaultForCapability": True})
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        successor_path = self._write_manifest(
            "hard", "beta-cms", "cms", mock="seed", defaultForCapability=False
        )
        original_save_json = dossiers_io._save_json

        def interrupt_primary(path: Path, data: dict[str, object]) -> None:
            if path == self.manifest_path:
                raise KeyboardInterrupt()
            original_save_json(path, data)

        with mock.patch.object(dossiers_io, "_save_json", interrupt_primary):
            with self.assertRaises(KeyboardInterrupt):
                dossiers_page._apply_manifest_field_edits(
                    self.manifest_path,
                    {"mock": "seed", "defaultForCapability": False},
                    dossier_class="hard",
                    replacement_default_path=successor_path,
                )

        self.assertTrue(self._saved()["defaultForCapability"])
        self.assertFalse(self._saved(successor_path)["defaultForCapability"])

    def test_raw_editor_cannot_bypass_hard_default_invariant(self) -> None:
        current = self._saved()
        current["defaultForCapability"] = True
        self.manifest_path.write_text(json.dumps(current), encoding="utf-8")
        self._write_manifest("hard", "beta-cms", "cms", defaultForCapability=False)
        edited = {**current, "defaultForCapability": False}

        ok, msg = dossiers_page._save_raw_manifest(
            self.manifest_path, edited, dossier_class="hard"
        )

        self.assertFalse(ok)
        self.assertIn("Standardvalsregeln", msg)
        self.assertTrue(self._saved()["defaultForCapability"])

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
        (draft / "instructions.md").write_text(
            "# When to use\n\nTest.\n\n# How to integrate\n\nTest.\n",
            encoding="utf-8",
        )
        self.dossier_root = self.root / "data" / "dossiers"
        patches = [
            mock.patch.object(dossiers_page, "REPO_ROOT", self.root),
            mock.patch.object(dossiers_page, "DOSSIER_ROOT", self.dossier_root),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def _entry(self, **overrides: object) -> dict[str, object]:
        entry: dict[str, object] = {
            "legacyId": "legacy-1",
            "targetClass": "hard",
            "targetId": "acme-pay",
            "targetCapability": "payments",
        }
        entry.update(overrides)
        return entry

    def _write_valid_hard_manifest(self, path: Path, dossier_id: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "id": dossier_id,
                    "label": "Acme Payments",
                    "capability": "payments",
                    "codeFidelity": "rewritable",
                    "complexity": "simple",
                    "summary": "A payments building block used by the promotion guard tests.",
                    "lastVerified": "2026-08-11",
                    "providers": ["acme"],
                    "mock": "seed",
                    "defaultForCapability": False,
                }
            ),
            encoding="utf-8",
        )

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
        ok, msg = dossiers_page._promote_prospect(self.root, self._entry(), force=False)
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

    def test_promotion_cannot_make_hard_family_unresolvable(self) -> None:
        draft_manifest = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        self._write_valid_hard_manifest(draft_manifest, "acme-pay")
        sibling_manifest = self.dossier_root / "hard" / "sibling-pay" / "manifest.json"
        self._write_valid_hard_manifest(sibling_manifest, "sibling-pay")

        ok, msg = dossiers_page._promote_prospect(self.root, self._entry(), force=False)

        self.assertFalse(ok)
        self.assertIn("Standardvalsregeln", msg)
        self.assertIn("no resolvable default demo", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-pay").exists())

    def test_rejects_escaped_legacy_id_before_reading_outside_root(self) -> None:
        outside = self.root.parent / "outside" / "_v2-draft"
        outside.mkdir(parents=True, exist_ok=True)
        (outside / "manifest.json").write_text("{}", encoding="utf-8")

        ok, msg = dossiers_page._promote_prospect(
            self.root, self._entry(legacyId="../outside"), force=False
        )

        self.assertFalse(ok)
        self.assertIn("legacyId", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-pay").exists())

    def test_draft_change_after_projection_is_rejected_without_live_write(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        draft_manifest = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        self._write_valid_hard_manifest(draft_manifest, "acme-pay")

        def mutate_source(*_args: object, **_kwargs: object) -> list[str]:
            changed = json.loads(draft_manifest.read_text(encoding="utf-8"))
            changed["label"] = "Extern ändring"
            draft_manifest.write_text(json.dumps(changed), encoding="utf-8")
            return []

        with mock.patch.object(
            dossiers_io,
            "_default_invariant_errors_after_change",
            side_effect=mutate_source,
        ):
            ok, msg = dossiers_page._promote_prospect(
                self.root, self._entry(), force=False
            )

        self.assertFalse(ok)
        self.assertIn("ändrades under valideringen", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-pay").exists())

    def test_target_appearing_before_commit_is_preserved(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        draft_manifest = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        self._write_valid_hard_manifest(draft_manifest, "acme-pay")
        target_manifest = self.dossier_root / "hard" / "acme-pay" / "manifest.json"
        external = b'{"id":"acme-pay","external":true}'

        def create_target(*_args: object, **_kwargs: object) -> list[str]:
            target_manifest.parent.mkdir(parents=True)
            target_manifest.write_bytes(external)
            return []

        with mock.patch.object(
            dossiers_io,
            "_default_invariant_errors_after_change",
            side_effect=create_target,
        ):
            ok, msg = dossiers_page._promote_prospect(
                self.root, self._entry(), force=True
            )

        self.assertFalse(ok)
        self.assertIn("annan session", msg)
        self.assertEqual(target_manifest.read_bytes(), external)

    def test_rename_after_success_failure_restores_forced_target(self) -> None:
        draft_manifest = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        self._write_valid_hard_manifest(draft_manifest, "acme-pay")
        target_manifest = self.dossier_root / "hard" / "acme-pay" / "manifest.json"
        self._write_valid_hard_manifest(target_manifest, "acme-pay")
        old_bytes = target_manifest.read_bytes()
        original_rename = Path.rename

        def rename_then_fail(path: Path, target: Path) -> Path:
            result = original_rename(path, target)
            if ".promote-stage-" in path.name:
                raise OSError("simulerat rename-after-success")
            return result

        with mock.patch.object(Path, "rename", rename_then_fail):
            ok, msg = dossiers_page._promote_prospect(
                self.root, self._entry(), force=True
            )

        self.assertFalse(ok)
        self.assertIn("återställdes", msg)
        self.assertEqual(target_manifest.read_bytes(), old_bytes)

    def test_pool_change_after_projection_blocks_promotion(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        draft_manifest = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        self._write_valid_hard_manifest(draft_manifest, "acme-pay")
        candidate = json.loads(draft_manifest.read_text(encoding="utf-8"))
        candidate["defaultForCapability"] = True
        draft_manifest.write_text(json.dumps(candidate), encoding="utf-8")
        sibling = self.dossier_root / "hard" / "other-pay" / "manifest.json"

        def add_competing_default(*_args: object, **_kwargs: object) -> list[str]:
            self._write_valid_hard_manifest(sibling, "other-pay")
            data = json.loads(sibling.read_text(encoding="utf-8"))
            data["defaultForCapability"] = True
            sibling.write_text(json.dumps(data), encoding="utf-8")
            return []

        with mock.patch.object(
            dossiers_io,
            "_default_invariant_errors_after_change",
            side_effect=add_competing_default,
        ):
            ok, msg = dossiers_page._promote_prospect(
                self.root, self._entry(), force=False
            )

        self.assertFalse(ok)
        self.assertIn("Dossier-poolen ändrades", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-pay").exists())

    def test_draft_change_during_target_backup_blocks_promotion(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        draft_manifest = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        self._write_valid_hard_manifest(draft_manifest, "acme-pay")
        target_manifest = self.dossier_root / "hard" / "acme-pay" / "manifest.json"
        self._write_valid_hard_manifest(target_manifest, "acme-pay")
        old_target = target_manifest.read_bytes()

        def mutate_draft(*_args: object, **_kwargs: object) -> Path:
            changed = json.loads(draft_manifest.read_text(encoding="utf-8"))
            changed["label"] = "Sen extern ändring"
            draft_manifest.write_text(json.dumps(changed), encoding="utf-8")
            return self.root / "backup.zip"

        with mock.patch.object(dossiers_io, "backup_tree", side_effect=mutate_draft):
            ok, msg = dossiers_page._promote_prospect(
                self.root, self._entry(), force=True
            )

        self.assertFalse(ok)
        self.assertIn("Utkastet ändrades före commit", msg)
        self.assertEqual(target_manifest.read_bytes(), old_target)

    def test_silent_stage_materialization_drift_is_rejected(self) -> None:
        draft_manifest = self.root / "legacy-1" / "_v2-draft" / "manifest.json"
        self._write_valid_hard_manifest(draft_manifest, "acme-pay")
        original_write_bytes = Path.write_bytes

        def tamper_instructions(path: Path, content: bytes) -> int:
            if ".promote-stage-" in path.parent.name and path.name == "instructions.md":
                return original_write_bytes(path, b"tampered")
            return original_write_bytes(path, content)

        with mock.patch.object(Path, "write_bytes", tamper_instructions):
            ok, msg = dossiers_page._promote_prospect(
                self.root, self._entry(), force=False
            )

        self.assertFalse(ok)
        self.assertIn("matchar inte", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-pay").exists())


class CuratedDossierTransactionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        patches = [
            mock.patch.object(dossiers_page, "REPO_ROOT", self.repo_root),
            mock.patch.object(dossiers_page, "DOSSIER_ROOT", self.dossier_root),
            mock.patch.object(dossiers_page, "HARD_ROOT", self.dossier_root / "hard"),
            mock.patch.object(dossiers_page, "SOFT_ROOT", self.dossier_root / "soft"),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def _stage(self, dossier_id: str = "acme-pay") -> Path:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        ok, stage = dossiers_io._allocate_curated_dossier_stage(dossier_id)
        self.assertTrue(ok, stage)
        path = Path(stage)
        (path / "manifest.json").write_text(
            json.dumps(
                {
                    "id": dossier_id,
                    "label": "Acme Payments",
                    "capability": "payments",
                    "codeFidelity": "rewritable",
                    "complexity": "simple",
                    "summary": "A payments building block used by transaction tests.",
                    "lastVerified": "2026-08-11",
                    "providers": ["acme"],
                    "mock": "seed",
                    "defaultForCapability": False,
                }
            ),
            encoding="utf-8",
        )
        (path / "instructions.md").write_text(
            "# When to use\n\nTest.\n\n# How to integrate\n\nTest.\n",
            encoding="utf-8",
        )
        return path

    def _run_killed_tree_swap(
        self, phase: str, stage: Path, target: Path
    ) -> subprocess.CompletedProcess[str]:
        script = r"""
import os
import sys
from pathlib import Path

from backoffice.pages import dossiers as page
from backoffice.pages.dossiers_lib import io
from backoffice.shared_lib.repo_lock import repo_mutation_lock

root = Path(sys.argv[1])
phase = sys.argv[2]
stage = Path(sys.argv[3])
target = Path(sys.argv[4])
page.REPO_ROOT = root
page.DOSSIER_ROOT = root / "data" / "dossiers"
page.HARD_ROOT = page.DOSSIER_ROOT / "hard"
page.SOFT_ROOT = page.DOSSIER_ROOT / "soft"
original_rename = Path.rename

def kill_at_boundary(path, destination):
    result = original_rename(path, destination)
    if phase == "after-old" and path == target:
        os._exit(91)
    if phase == "after-new" and path == stage:
        os._exit(92)
    return result

Path.rename = kill_at_boundary
with repo_mutation_lock(root, "dossiers"):
    io._swap_staged_directory(target, stage, operation="kill-test")
os._exit(90)
"""
        return subprocess.run(
            [
                sys.executable,
                "-c",
                script,
                str(self.repo_root),
                phase,
                str(stage),
                str(target),
            ],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )

    def _prepare_default_tree_swap(self) -> tuple[Path, Path, bytes, bytes]:
        stage = self._stage()
        desired_instructions = (stage / "instructions.md").read_bytes()
        staged_manifest = json.loads(
            (stage / "manifest.json").read_text(encoding="utf-8")
        )
        staged_manifest["defaultForCapability"] = True
        (stage / "manifest.json").write_text(
            json.dumps(staged_manifest), encoding="utf-8"
        )
        target = self.dossier_root / "hard" / "acme-pay"
        target.mkdir(parents=True)
        (target / "manifest.json").write_text(
            json.dumps(staged_manifest), encoding="utf-8"
        )
        old_instructions = b"old default instructions\r\n"
        (target / "instructions.md").write_bytes(old_instructions)
        return stage, target, old_instructions, desired_instructions

    def test_process_kill_after_old_tree_rename_restores_default_target(self) -> None:
        stage, target, old_instructions, _desired = self._prepare_default_tree_swap()

        result = self._run_killed_tree_swap("after-old", stage, target)
        self.assertEqual(result.returncode, 91, result.stderr)
        self.assertFalse(target.exists())

        ok, msg = dossiers_page._recover_pending_default_transaction()

        self.assertTrue(ok, msg)
        self.assertEqual((target / "instructions.md").read_bytes(), old_instructions)
        self.assertTrue(
            json.loads((target / "manifest.json").read_text())["defaultForCapability"]
        )

    def test_process_kill_after_new_tree_rename_keeps_committed_default(self) -> None:
        stage, target, _old, desired_instructions = self._prepare_default_tree_swap()

        result = self._run_killed_tree_swap("after-new", stage, target)
        self.assertEqual(result.returncode, 92, result.stderr)
        self.assertTrue(target.exists())

        ok, msg = dossiers_page._recover_pending_default_transaction()

        self.assertTrue(ok, msg)
        self.assertEqual(
            (target / "instructions.md").read_bytes(), desired_instructions
        )
        self.assertTrue(
            json.loads((target / "manifest.json").read_text())["defaultForCapability"]
        )

    def test_tree_swap_recovery_blocks_tampered_old_tree(self) -> None:
        stage, target, _old, _desired = self._prepare_default_tree_swap()
        result = self._run_killed_tree_swap("after-old", stage, target)
        self.assertEqual(result.returncode, 91, result.stderr)
        transaction_root = (
            self.repo_root / "data" / "backoffice" / "staging" / "dossiers"
        )
        old = next(transaction_root.glob("_acme-pay.replaced-*"))
        marker = old / "tampered-after-crash.txt"
        marker.write_text("keep", encoding="utf-8")

        ok, msg = dossiers_page._recover_pending_default_transaction()

        self.assertFalse(ok)
        self.assertIn("tvetydig", msg)
        self.assertTrue(marker.exists())
        self.assertFalse(target.exists())
        self.assertTrue(stage.exists())

    def test_tree_swap_rollback_clears_journal_for_preexisting_invalid_family(
        self,
    ) -> None:
        stage = self._stage()
        desired = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
        desired["defaultForCapability"] = True
        (stage / "manifest.json").write_text(json.dumps(desired), encoding="utf-8")
        target = self.dossier_root / "hard" / "acme-pay"
        target.mkdir(parents=True)
        old = {**desired, "defaultForCapability": False}
        (target / "manifest.json").write_text(json.dumps(old), encoding="utf-8")
        (target / "instructions.md").write_text("old", encoding="utf-8")
        sibling = self.dossier_root / "hard" / "beta-pay"
        sibling.mkdir(parents=True)
        (sibling / "manifest.json").write_text(
            json.dumps({**old, "id": "beta-pay"}), encoding="utf-8"
        )

        result = self._run_killed_tree_swap("after-old", stage, target)
        self.assertEqual(result.returncode, 91, result.stderr)
        ok, msg = dossiers_page._recover_pending_default_transaction()

        self.assertTrue(ok, msg)
        self.assertFalse(
            json.loads((target / "manifest.json").read_text())["defaultForCapability"]
        )
        journal = (
            self.repo_root
            / "data"
            / "backoffice"
            / "staging"
            / "dossiers"
            / "_pending-default-transaction.json"
        )
        self.assertFalse(journal.exists())

    def test_stage_is_outside_live_pool_and_publishes_both_files_together(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        self.assertNotIn(self.dossier_root.resolve(), stage.resolve().parents)
        self.assertEqual(dossiers_io._walk_all_dossiers(), [])

        ok, msg = dossiers_io._commit_curated_dossier_stage(
            stage, "hard", "acme-pay", force=False
        )

        self.assertTrue(ok, msg)
        target = self.dossier_root / "hard" / "acme-pay"
        self.assertTrue((target / "manifest.json").exists())
        self.assertTrue((target / "instructions.md").exists())

    def test_transaction_root_link_is_rejected_before_stage_allocation(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        outside = self.repo_root / "outside-staging"
        outside.mkdir()
        staging = self.repo_root / "data" / "backoffice" / "staging"
        staging.parent.mkdir(parents=True)
        try:
            staging.symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"symlink/junction creation unavailable: {exc}")

        ok, msg = dossiers_io._allocate_curated_dossier_stage("acme-pay")

        self.assertFalse(ok)
        self.assertIn("länk/junction", msg)
        self.assertEqual(list(outside.iterdir()), [])

    def test_curated_stage_rejects_unexpected_files(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        (stage / "unexpected.txt").write_text("no", encoding="utf-8")

        ok, msg = dossiers_io._commit_curated_dossier_stage(
            stage, "hard", "acme-pay", force=False
        )

        self.assertFalse(ok)
        self.assertIn("oväntade", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-pay").exists())

    def test_lock_timeout_stage_can_be_cleaned_by_service_owner(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        with mock.patch.object(
            dossiers_io,
            "repo_mutation_lock",
            side_effect=dossiers_io.RepoMutationLockTimeout("busy"),
        ):
            ok, _msg = dossiers_io._commit_curated_dossier_stage(
                stage, "hard", "acme-pay", force=False
            )
        self.assertFalse(ok)
        cleanup_ok, cleanup_msg = dossiers_io._cleanup_curated_dossier_stage(stage)
        self.assertTrue(cleanup_ok, cleanup_msg)
        self.assertFalse(stage.exists())

    def test_invalid_class_never_cleans_unverified_arbitrary_path(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        outside = self.repo_root / "do-not-delete"
        outside.mkdir()
        (outside / "sentinel").write_text("keep", encoding="utf-8")

        ok, _msg = dossiers_io._commit_curated_dossier_stage(
            outside, "invalid", "acme-pay", force=False
        )

        self.assertFalse(ok)
        self.assertTrue((outside / "sentinel").exists())

    def test_pool_change_after_projection_blocks_curated_commit(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        candidate = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
        candidate["defaultForCapability"] = True
        (stage / "manifest.json").write_text(json.dumps(candidate), encoding="utf-8")

        def add_competing_default(*_args: object, **_kwargs: object) -> list[str]:
            sibling = self.dossier_root / "hard" / "other-pay" / "manifest.json"
            sibling.parent.mkdir(parents=True)
            sibling.write_text(
                json.dumps(
                    {
                        **candidate,
                        "id": "other-pay",
                        "defaultForCapability": True,
                    }
                ),
                encoding="utf-8",
            )
            return []

        with mock.patch.object(
            dossiers_io,
            "_default_invariant_errors_after_change",
            side_effect=add_competing_default,
        ):
            ok, msg = dossiers_io._commit_curated_dossier_stage(
                stage, "hard", "acme-pay", force=False
            )

        self.assertFalse(ok)
        self.assertIn("Dossier-poolen ändrades", msg)
        self.assertFalse((self.dossier_root / "hard" / "acme-pay").exists())

    def test_stage_change_during_target_backup_blocks_curated_commit(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        target = self.dossier_root / "hard" / "acme-pay"
        target.mkdir(parents=True)
        old_manifest = (stage / "manifest.json").read_bytes()
        (target / "manifest.json").write_bytes(old_manifest)
        (target / "instructions.md").write_text("old", encoding="utf-8")
        old_target = (target / "manifest.json").read_bytes()

        def mutate_stage(*_args: object, **_kwargs: object) -> Path:
            (stage / "manifest.json").write_text('{"id":"evil"}', encoding="utf-8")
            return self.repo_root / "backup.zip"

        with mock.patch.object(dossiers_io, "backup_tree", side_effect=mutate_stage):
            ok, msg = dossiers_io._commit_curated_dossier_stage(
                stage, "hard", "acme-pay", force=True
            )

        self.assertFalse(ok)
        self.assertIn("stage ändrades före commit", msg)
        self.assertEqual((target / "manifest.json").read_bytes(), old_target)

    def test_force_preserves_existing_non_owned_tree_byte_exactly(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        candidate_manifest = (stage / "manifest.json").read_bytes()
        candidate_instructions = (stage / "instructions.md").read_bytes()
        target = self.dossier_root / "hard" / "acme-pay"
        target.mkdir(parents=True)
        (target / "manifest.json").write_bytes(candidate_manifest)
        (target / "instructions.md").write_bytes(b"old instructions\r\n")
        component_bytes = b"export const value = '\\x00';\r\n"
        unknown_bytes = bytes(range(256))
        (target / "components").mkdir()
        (target / "components" / "widget.tsx").write_bytes(component_bytes)
        (target / "notes.bin").write_bytes(unknown_bytes)
        (target / "assets" / "empty").mkdir(parents=True)

        ok, msg = dossiers_io._commit_curated_dossier_stage(
            stage, "hard", "acme-pay", force=True
        )

        self.assertTrue(ok, msg)
        self.assertEqual((target / "manifest.json").read_bytes(), candidate_manifest)
        self.assertEqual(
            (target / "instructions.md").read_bytes(), candidate_instructions
        )
        self.assertEqual(
            (target / "components" / "widget.tsx").read_bytes(), component_bytes
        )
        self.assertEqual((target / "notes.bin").read_bytes(), unknown_bytes)
        self.assertTrue((target / "assets" / "empty").is_dir())

    def test_force_preserved_tree_is_restored_when_stage_rename_fails(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        target = self.dossier_root / "hard" / "acme-pay"
        target.mkdir(parents=True)
        (target / "manifest.json").write_bytes((stage / "manifest.json").read_bytes())
        (target / "instructions.md").write_bytes(b"old instructions\r\n")
        (target / "components").mkdir()
        (target / "components" / "widget.tsx").write_bytes(b"old component\x00\r\n")
        (target / "unknown.bin").write_bytes(bytes(range(256)))
        (target / "assets" / "empty").mkdir(parents=True)
        before, snapshot_error = dossiers_io._tree_byte_snapshot(target)
        self.assertIsNone(snapshot_error)
        self.assertIsNotNone(before)
        original_rename = Path.rename

        def reject_stage_rename(path: Path, destination: Path) -> Path:
            if ".curate-stage-" in path.name:
                raise OSError("simulated stage rename failure")
            return original_rename(path, destination)

        with mock.patch.object(Path, "rename", reject_stage_rename):
            ok, msg = dossiers_io._commit_curated_dossier_stage(
                stage, "hard", "acme-pay", force=True
            )

        self.assertFalse(ok)
        self.assertIn("simulated stage rename failure", msg)
        after, snapshot_error = dossiers_io._tree_byte_snapshot(target)
        self.assertIsNone(snapshot_error)
        self.assertEqual(after, before)

    def test_class_root_link_is_rejected_before_publication(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        outside = self.repo_root / "outside-hard"
        outside.mkdir()
        class_root = self.dossier_root / "hard"
        class_root.parent.mkdir(parents=True, exist_ok=True)
        try:
            class_root.symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"symlink/junction creation unavailable: {exc}")

        ok, msg = dossiers_io._commit_curated_dossier_stage(
            stage, "hard", "acme-pay", force=False
        )

        self.assertFalse(ok)
        self.assertIn("länk/junction", msg)
        self.assertFalse((outside / "acme-pay").exists())

    def test_parent_class_link_blocks_existing_manifest_writer(self) -> None:
        outside = self.repo_root / "outside-hard"
        manifest_path = outside / "acme-pay" / "manifest.json"
        manifest_path.parent.mkdir(parents=True)
        manifest = {
            "id": "acme-pay",
            "label": "Acme Payments",
            "capability": "payments",
            "codeFidelity": "rewritable",
            "complexity": "simple",
            "summary": "A payments building block used by link guard tests.",
            "lastVerified": "2026-08-11",
            "providers": ["acme"],
            "mock": "seed",
        }
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        original = manifest_path.read_bytes()
        class_root = self.dossier_root / "hard"
        class_root.parent.mkdir(parents=True, exist_ok=True)
        try:
            class_root.symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"symlink/junction creation unavailable: {exc}")

        ok, msg = dossiers_page._save_raw_manifest(
            class_root / "acme-pay" / "manifest.json",
            {**manifest, "label": "Should not write"},
            dossier_class="hard",
        )

        self.assertFalse(ok)
        self.assertIn("länk/junction", msg)
        self.assertEqual(manifest_path.read_bytes(), original)

    def test_parent_class_link_blocks_skeleton_creation(self) -> None:
        outside = self.repo_root / "outside-hard"
        outside.mkdir()
        class_root = self.dossier_root / "hard"
        class_root.parent.mkdir(parents=True, exist_ok=True)
        try:
            class_root.symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"symlink/junction creation unavailable: {exc}")

        ok, msg = dossiers_page._create_dossier_skeleton(
            "hard",
            "acme-pay",
            label="Acme Payments",
            capability="payments",
            summary="A payments building block used by link guard tests.",
            providers=["acme"],
            mock="seed",
        )

        self.assertFalse(ok)
        self.assertIn("länk/junction", msg)
        self.assertFalse((outside / "acme-pay").exists())

    def test_keyboard_interrupt_after_stage_rename_restores_old_target(self) -> None:
        from backoffice.pages.dossiers_lib import io as dossiers_io

        stage = self._stage()
        target = self.dossier_root / "hard" / "acme-pay"
        target.mkdir(parents=True)
        (target / "manifest.json").write_bytes((stage / "manifest.json").read_bytes())
        (target / "instructions.md").write_text("old", encoding="utf-8")
        old_instructions = (target / "instructions.md").read_bytes()
        original_rename = Path.rename

        def rename_then_interrupt(path: Path, destination: Path) -> Path:
            result = original_rename(path, destination)
            if ".curate-stage-" in path.name:
                raise KeyboardInterrupt()
            return result

        with mock.patch.object(Path, "rename", rename_then_interrupt):
            with self.assertRaises(KeyboardInterrupt):
                dossiers_io._commit_curated_dossier_stage(
                    stage, "hard", "acme-pay", force=True
                )

        self.assertEqual((target / "instructions.md").read_bytes(), old_instructions)


if __name__ == "__main__":
    unittest.main()
